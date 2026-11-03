import mongoose from 'mongoose'
import Listing from '../models/foodListingModel.js'
import Request from '../models/rescueRequestModel.js'
import Message from '../models/rescueMessageModel.js'
import {fail,id,text,number,objectBody,windowFields} from '../services/rescueValidation.js'
import {storeInitialMessage} from '../services/rescueCommunication.js'
const same=(a,b)=>String(a)===String(b)
const wrap=fn=>async(req,res,next)=>{try{await fn(req,res)}catch(error){next(error)}}
const participant=(requestId,userId)=>({_id:requestId,$or:[{owner:userId},{requester:userId}]})
export function validateClientKey(value,name='clientMessageId') {
  if(typeof value!=='string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(value)) fail(400,`${name} must be an 8–80 character client-generated identifier.`)
  return value
}
export function validateProposalDecision(request,userId,proposalId) {
  if(!request.pickupProposal || !same(request.pickupProposal._id,proposalId)) fail(409,'This proposal has changed. Refresh before responding.')
  if(same(request.pickupProposal.proposedBy,userId)) fail(403,'Only the other participant can respond to this proposal.')
}
async function requestFor(req,session) {
  const request=await Request.findOne(participant(id(req.params.requestId,'request ID'),req.userId)).session(session)
  if(!request) fail(404,'Request not found.')
  return request
}
async function lockListing(request,session,{proposal=false}={}) {
  const listing=await Listing.findById(request.listing).session(session)
  if(!listing) fail(404,'Listing not found.')
  if(proposal && (request.status!=='pending' || listing.status!=='available' || listing.expiresAt<=new Date() || listing.pickupEnd<=new Date())) fail(409,'Pickup times can only be negotiated for a pending request on an available, unexpired listing.')
  const result=await Listing.updateOne({_id:listing._id,status:listing.status},{$inc:{revision:1}},{session})
  if(result.matchedCount!==1) fail(409,'Listing changed. Refresh and try again.')
  return listing
}
const listMessages=wrap(async(req,res)=>{
  const request=await requestFor(req,null)
  const limit=number(req.query.limit ?? 50,'limit',1,100)
  if(!Number.isInteger(limit)) fail(400,'Limit must be an integer.')
  const filter={request:request._id}
  if(req.query.after!==undefined)filter._id={$gt:id(req.query.after,'message cursor')}
  const records=await Message.find(filter).sort({_id:1}).limit(limit+1).select('-clientMessageId -__v').lean()
  const hasMore=records.length>limit,messages=records.slice(0,limit)
  // Old requests need no migration. Their initial message is returned separately.
  const initialMessage=!request.initialMessageStored && request.message?.trim()?{
    _id:`initial-${request._id}`,request:request._id,sender:request.requester,text:request.message,createdAt:request.submittedAt || request.createdAt,
  }:null
  res.json({messages,hasMore,nextCursor:messages.at(-1)?._id ?? req.query.after ?? null,initialMessage})
})
const sendMessage=wrap(async(req,res)=>{
  objectBody(req.body)
  const messageText=text(req.body.text,'text',1000),clientMessageId=validateClientKey(req.body.clientMessageId)
  const message=await mongoose.connection.transaction(async session=>{
    const request=await requestFor(req,session)
    // Check idempotency before terminal status, so a lost response can be recovered later.
    const existing=await Message.findOne({request:request._id,sender:req.userId,clientMessageId}).session(session)
    if(existing){if(existing.text!==messageText)fail(409,'This message key was already used for different text.');return existing}
    if(!['pending','accepted'].includes(request.status))fail(409,'This conversation is read-only because the request has ended.')
    await lockListing(request,session)
    await storeInitialMessage(request,session)
    const [created]=await Message.create([{request:request._id,sender:req.userId,text:messageText,clientMessageId}],{session})
    request.updatedAt=new Date();await request.save({session})
    return created
  })
  res.status(201).json({message})
})
const proposePickup=wrap(async(req,res)=>{
  objectBody(req.body)
  const fields=windowFields(req.body),clientProposalId=validateClientKey(req.body.clientProposalId,'clientProposalId')
  const request=await mongoose.connection.transaction(async session=>{
    const request=await requestFor(req,session)
    const listing=await lockListing(request,session,{proposal:true})
    if(fields.pickupEnd>listing.expiresAt)fail(400,'Proposed pickup must end on or before expiry.')
    if(request.pickupProposal){
      if(same(request.pickupProposal.proposedBy,req.userId) && request.pickupProposal.clientProposalId===clientProposalId){
        if(request.pickupProposal.pickupStart.getTime()!==fields.pickupStart.getTime() || request.pickupProposal.pickupEnd.getTime()!==fields.pickupEnd.getTime())fail(409,'This proposal key was already used for a different time.')
        return request
      }
      fail(409,'Resolve or withdraw the current time proposal before suggesting another.')
    }
    request.pickupProposal={...fields,proposedBy:req.userId,clientProposalId}
    await request.save({session});return request
  })
  res.status(201).json({request})
})
function decision(accept){return wrap(async(req,res)=>{
  objectBody(req.body);const proposalId=id(req.body.proposalId,'proposal ID')
  const request=await mongoose.connection.transaction(async session=>{
    const request=await requestFor(req,session)
    validateProposalDecision(request,req.userId,proposalId)
    const listing=await lockListing(request,session,{proposal:true})
    if(accept){
      if(request.pickupProposal.pickupEnd<=new Date() || request.pickupProposal.pickupEnd>listing.expiresAt)fail(409,'Proposed time is no longer valid.')
      request.pickupStart=request.pickupProposal.pickupStart;request.pickupEnd=request.pickupProposal.pickupEnd
    }
    request.pickupProposal=undefined;await request.save({session});return request
  })
  // Confirming a time never reserves food. The owner still explicitly accepts the request.
  res.json({request})
})}
const withdrawProposal=wrap(async(req,res)=>{
  objectBody(req.body);const proposalId=id(req.body.proposalId,'proposal ID')
  const request=await mongoose.connection.transaction(async session=>{
    const request=await requestFor(req,session)
    if(!request.pickupProposal || !same(request.pickupProposal._id,proposalId))fail(409,'Proposal has changed.')
    if(!same(request.pickupProposal.proposedBy,req.userId))fail(403,'Only the proposer can withdraw this suggestion.')
    // Allow cleanup even after time has passed or another requester reserved the food.
    await lockListing(request,session)
    request.pickupProposal=undefined;await request.save({session});return request
  })
  res.json({request})
})
export default {listMessages,sendMessage,proposePickup,acceptProposal:decision(true),declineProposal:decision(false),withdrawProposal}
