import mongoose from 'mongoose'
import {storeInitialMessage} from '../services/rescueCommunication.js'
import FoodListing from '../models/foodListingModel.js'
import RescueRequest from '../models/rescueRequestModel.js'
import RescuePhoto from '../models/rescuePhotoModel.js'
import InventoryItem from '../models/inventoryItemModel.js'
import {fail,has,id,objectBody,listingFields,validateListingWindow,requestFields,pagination,browseFilter} from '../services/rescueValidation.js'
import {compressRescueImage} from '../services/rescueImage.js'

const same = (a,b) => String(a)===String(b)
const tx = callback => mongoose.connection.transaction(callback)
const wrap = handler => async (req,res,next) => { try { await handler(req,res) } catch(error) { next(error) } }
const internalFields = {activeInventoryItem:0,inventorySnapshotUpdatedAt:0,revision:0}
const populateOwner = {path:'user',select:'name'}
function publicListing(document) {
  const value = document.toObject ? document.toObject() : {...document}
  for (const field of Object.keys(internalFields)) delete value[field]
  return value
}
async function ownedListing(listingId,userId,session) {
  const listing = await FoodListing.findOne({_id:listingId,user:userId}).select('+inventorySnapshotUpdatedAt').session(session)
  if (!listing) fail(404,'Listing not found or not owned by you.')
  return listing
}
async function touch(listing,session) {
  // All request writes participate in this write lock. Transactions retry write conflicts.
  const result = await FoodListing.updateOne({_id:listing._id,status:listing.status},{$inc:{revision:1}},{session})
  if (result.matchedCount!==1) fail(409,'Listing changed. Refresh and try again.')
}
function requireAvailable(listing) {
  if (listing.status!=='available') fail(409,'This listing is not available.')
  if (listing.expiresAt<=new Date() || listing.pickupEnd<=new Date()) fail(409,'This listing has expired or its pickup window has ended.')
}

const listListings = wrap(async (req,res) => {
  const {page,limit,skip} = pagination(req.query)
  const {filter,geoNear} = browseFilter(req.query)
  filter.user = { $ne: new mongoose.Types.ObjectId(req.userId) }
  let listings, total
  if (geoNear) {
    // $geoNear must be first; one facet returns a page and the matching count.
    const [result] = await FoodListing.aggregate([
      {$geoNear:{...geoNear,query:filter}},
      {$sort:{distanceMeters:1,_id:1}},
      {$facet:{listings:[{$skip:skip},{$limit:limit},{$project:internalFields}],count:[{$count:'total'}]}},
    ])
    listings = await FoodListing.populate(result.listings,populateOwner)
    total = result.count[0]?.total ?? 0
  } else {
    [listings,total] = await Promise.all([
      FoodListing.find(filter).sort({createdAt:-1,_id:-1}).skip(skip).limit(limit).populate(populateOwner).lean(),
      FoodListing.countDocuments(filter),
    ])
  }
  listings = listings.map(listing => ({...listing,isOwner:same(listing.user?._id || listing.user,req.userId)}))
  res.json({listings,page,limit,total,pages:Math.ceil(total/limit)})
})
const myListings = wrap(async (req,res) => {
  const {page,limit,skip} = pagination(req.query)
  const filter = {user:req.userId}
  if (req.query.status!==undefined) {
    if (!['available','claimed','collected','withdrawn'].includes(req.query.status)) fail(400,'Invalid listing status.')
    filter.status = req.query.status
  }
  const [listings,total] = await Promise.all([
    FoodListing.find(filter).sort({createdAt:-1,_id:-1}).skip(skip).limit(limit).lean(),FoodListing.countDocuments(filter),
  ])
  res.json({listings,page,limit,total,pages:Math.ceil(total/limit)})
})
const createListing = wrap(async (req,res) => {
  const fields = listingFields(req.body,true)
  validateListingWindow(fields)
  if (!Number.isInteger(fields.quantity) || fields.quantity < 1) {
    fail(400, 'Quantity must be a whole number greater than zero.')
  }
  const inventoryId = has(req.body,'inventoryItem') ? id(req.body.inventoryItem,'inventory item ID') : undefined
  const listing = await tx(async session => {
    const data = {...fields,user:req.userId}
    if (inventoryId) {
      const inventory = await InventoryItem.findOne({_id:inventoryId,user:req.userId}).session(session)
      if (!inventory) fail(404,'Inventory item not found or not owned by you.')
      // Whole-item rescue only. A listing must describe the entire linked record.
      if (!(inventory.quantity>0) || !inventory.unit?.trim()) fail(400,'Set a quantity and unit on this inventory item before sharing it.')
      if (
          !Number.isFinite(fields.quantity) ||
          fields.quantity <= 0 ||
          fields.quantity > inventory.quantity
        ) {
          fail(
            400,
            'Choose a quantity greater than zero and no greater than your inventory quantity.',
          )
        }

      if (fields.unit !== inventory.unit.trim()) {
        fail(400, 'The unit must match your inventory item.')
      }
      if (!inventory.updatedAt) fail(409,'Update this legacy inventory item before sharing it.')
      if (inventory.expiresAt && fields.expiresAt>inventory.expiresAt) fail(400,'Listing expiry cannot be later than inventory expiry.')
      data.inventoryItem = inventory._id
      data.activeInventoryItem = inventory._id
      data.inventorySnapshotUpdatedAt = inventory.updatedAt
    }
    const [created] = await FoodListing.create([data],{session})
    return created
  })
  res.status(201).json({listing:publicListing(listing)})
})
const getListing = wrap(async (req,res) => {
  id(req.params.id,'listing ID')
  const listing = await FoodListing.findById(req.params.id).populate(populateOwner).lean()
  if (!listing || (listing.status==='withdrawn' && !same(listing.user?._id,req.userId))) fail(404,'Listing not found.')
  res.json({listing:{...listing,isOwner:same(listing.user?._id || listing.user,req.userId)}})
})
const updateListing = wrap(async (req,res) => {
  id(req.params.id,'listing ID')
  const fields = listingFields(req.body)
  if (
    fields.quantity !== undefined &&
    (!Number.isInteger(fields.quantity) || fields.quantity < 1)
  ) {
    fail(400, 'Quantity must be a whole number greater than zero.')
  }
  if (!Object.keys(fields).length) fail(400,'No editable listing fields provided.')
  const listing = await tx(async session => {
    const existing = await ownedListing(req.params.id,req.userId,session)
    if (existing.status!=='available') fail(409,'Only available listings can be edited.')
    if (await RescueRequest.exists({listing:existing._id,status:{$in:['pending','accepted']}}).session(session)) fail(409,'Resolve active requests before changing the listing.')
    if (existing.inventoryItem && (has(fields,'quantity') || has(fields,'unit'))) fail(400,'Quantity and unit are fixed for linked listings. Withdraw and relist to change them.')
    if (existing.inventoryItem && has(fields,'expiresAt')) {
      const inventory = await InventoryItem.findOne({_id:existing.inventoryItem,user:req.userId}).session(session)
      if (!inventory) fail(409,'Linked inventory item is missing. Withdraw this listing.')
      if (inventory.expiresAt && fields.expiresAt>inventory.expiresAt) fail(400,'Listing expiry cannot be later than inventory expiry.')
    }
    validateListingWindow({...existing.toObject(),...fields})
    return FoodListing.findOneAndUpdate({_id:existing._id,status:'available'},{$set:fields,$inc:{revision:1}},{new:true,runValidators:true,session})
  })
  res.json({listing:publicListing(listing)})
})
const deleteListing = wrap(async (req,res) => {
  id(req.params.id,'listing ID')
  await tx(async session => {
    const listing = await ownedListing(req.params.id,req.userId,session)
    if (listing.status==='withdrawn') return
    if (listing.status!=='available') fail(409,'Cancel the accepted request before withdrawing. Collected listings are kept as history.')
    await FoodListing.updateOne({_id:listing._id},{$set:{status:'withdrawn',hasPhoto:false},$unset:{activeInventoryItem:1},$inc:{revision:1}},{session})
    await RescueRequest.updateMany({listing:listing._id,status:'pending'},{$set:{status:'declined'},$unset:{pickupProposal:1}},{session})
    await RescuePhoto.deleteOne({listing:listing._id},{session})
  })
  res.json({message:'Listing withdrawn. Inventory was not removed.'})
})
const claimListing = wrap(async (req,res) => {
  id(req.params.id,'listing ID')
  const request = await tx(async session => {
    const listing = await FoodListing.findById(req.params.id).session(session)
    if (!listing) fail(404,'Listing not found.')
    if (same(listing.user,req.userId)) fail(400,'You cannot request your own listing.')
    requireAvailable(listing)
    const fields = requestFields(req.body,listing)
    await touch(listing,session)
    let request = await RescueRequest.findOne({listing:listing._id,requester:req.userId}).session(session)
    if (request && ['pending','accepted','completed'].includes(request.status)) fail(409,'You already have an active or completed request.')
    if (request) {
      await storeInitialMessage(request,session)
      Object.assign(request,fields,{status:'pending',acceptedAt:undefined,completedAt:undefined,pickupProposal:undefined,submittedAt:new Date(),initialMessageStored:false})
      await request.save({session})
    } else {
      [request] = await RescueRequest.create([{...fields,listing:listing._id,owner:listing.user,requester:req.userId,submittedAt:new Date()}],{session})
    }
    await storeInitialMessage(request,session)
    await request.save({session})
    return request
  })
  res.status(201).json({request})
})
const listRequests = wrap(async (req,res) => {
  const {page,limit,skip} = pagination(req.query)
  const direction = req.query.direction ?? 'received'
  if (!['received','sent'].includes(direction)) fail(400,'Direction must be received or sent.')
  const filter = direction==='received' ? {owner:req.userId} : {requester:req.userId}
  if (req.query.listing!==undefined) filter.listing = id(req.query.listing,'listing ID')
  if (req.query.status!==undefined) {
    if (!['pending','accepted','declined','cancelled','completed'].includes(req.query.status)) fail(400,'Invalid request status.')
    filter.status = req.query.status
  }
  const [requests,total] = await Promise.all([
    RescueRequest.find(filter).sort({updatedAt:-1,_id:-1}).skip(skip).limit(limit)
      .populate('requester','name').populate('owner','name')
      .populate('listing','title quantity unit status hasPhoto pickupLabel pickupStart pickupEnd expiresAt location').lean(),
    RescueRequest.countDocuments(filter),
  ])
  res.json({requests,page,limit,total,pages:Math.ceil(total/limit)})
})
const acceptRequest = wrap(async (req,res) => {
  id(req.params.requestId,'request ID')
  const result = await tx(async session => {
    const request = await RescueRequest.findOne({_id:req.params.requestId,owner:req.userId}).session(session)
    if (!request) fail(404,'Request not found or not owned by you.')
    const listing = await ownedListing(String(request.listing),req.userId,session)
    if (request.status==='accepted' && same(listing.acceptedRequest,request._id) && listing.status==='claimed') return {request,listing:publicListing(listing)}
    requireAvailable(listing)
    if (request.status!=='pending') fail(409,'Only pending requests can be accepted.')
    if (request.pickupProposal) fail(409,'Resolve the proposed pickup-time change before accepting this request.')
    if (request.pickupEnd<=new Date() || request.pickupEnd>listing.expiresAt) fail(409,'Requested pickup time is no longer valid.')
    // Conditional write + transaction: only one requester can win, across all documents.
    const reserved = await FoodListing.findOneAndUpdate({_id:listing._id,status:'available'},{$set:{status:'claimed',claimedBy:request.requester,acceptedRequest:request._id},$inc:{revision:1}},{new:true,session})
    if (!reserved) fail(409,'Listing was already reserved.')
    request.status='accepted'; request.acceptedAt=new Date()
    await request.save({session})
    return {request,listing:publicListing(reserved)}
  })
  res.json(result)
})
async function cancelInTransaction(request,userId,session) {
  const listing = await FoodListing.findById(request.listing).session(session)
  if (!listing) fail(404,'Listing not found.')
  if (!same(request.requester,userId) && !same(listing.user,userId)) fail(404,'Request not found.')
  if (request.status==='cancelled') return request
  if (!['pending','accepted'].includes(request.status)) fail(409,'This request can no longer be cancelled.')
  if (request.status==='accepted') {
    const updated = await FoodListing.updateOne({_id:listing._id,status:'claimed',acceptedRequest:request._id},{$set:{status:'available'},$unset:{claimedBy:1,acceptedRequest:1},$inc:{revision:1}},{session})
    if (updated.matchedCount!==1) fail(409,'Reservation has changed.')
  } else await touch(listing,session)
  request.status='cancelled'; request.acceptedAt=undefined; request.pickupProposal=undefined
  await request.save({session})
  return request
}
const cancelRequest = wrap(async (req,res) => {
  id(req.params.requestId,'request ID')
  const request = await tx(async session => {
    const request = await RescueRequest.findOne({_id:req.params.requestId,$or:[{owner:req.userId},{requester:req.userId}]}).session(session)
    if (!request) fail(404,'Request not found.')
    return cancelInTransaction(request,req.userId,session)
  })
  res.json({request})
})
const unclaimListing = wrap(async (req,res) => {
  id(req.params.id,'listing ID')
  const request = await tx(async session => {
    const request = await RescueRequest.findOne({listing:req.params.id,requester:req.userId,status:{$in:['pending','accepted']}}).session(session)
    if (!request) fail(404,'No active request found.')
    return cancelInTransaction(request,req.userId,session)
  })
  res.json({request})
})
const declineRequest = wrap(async (req,res) => {
  id(req.params.requestId,'request ID')
  const request = await tx(async session => {
    const request = await RescueRequest.findOne({_id:req.params.requestId,owner:req.userId}).session(session)
    if (!request) fail(404,'Request not found or not owned by you.')
    if (request.status==='declined') return request
    if (request.status!=='pending') fail(409,'Only pending requests can be declined. Cancel an accepted request instead.')
    const listing = await ownedListing(String(request.listing),req.userId,session)
    await touch(listing,session)
    request.status='declined'; request.pickupProposal=undefined; await request.save({session})
    return request
  })
  res.json({request})
})
const collectListing = wrap(async (req,res) => {
  id(req.params.id,'listing ID')
  const result = await tx(async session => {
    const listing = await ownedListing(req.params.id,req.userId,session)
    if (listing.status==='collected') return {listing:publicListing(listing),alreadyCollected:true}
    if (listing.status!=='claimed' || !listing.acceptedRequest) fail(409,'Accept a request before confirming collection.')
    const request = await RescueRequest.findOne({_id:listing.acceptedRequest,listing:listing._id,status:'accepted'}).session(session)
    if (!request) fail(409,'Accepted request is inconsistent. Collection was not completed.')
    let inventoryRemoved=false, inventoryAlreadyMissing=false
    if (listing.inventoryItem) {
      if (!listing.inventorySnapshotUpdatedAt) {
        fail(
          409,
          'Legacy listing has no inventory snapshot. Cancel, withdraw and relist it.',
        )
      }

      const inventoryItem = await InventoryItem.findOne({
        _id: listing.inventoryItem,
        user: req.userId,
      }).session(session)

      if (!inventoryItem) {
        inventoryAlreadyMissing = true
      } else {
        if (
          inventoryItem.updatedAt?.getTime() !==
          new Date(listing.inventorySnapshotUpdatedAt).getTime()
        ) {
          fail(
            409,
            'Inventory changed after listing. Cancel the request, withdraw this listing and create a new one. Nothing was deducted.',
          )
        }

        const available = inventoryItem.quantity
        const shared = listing.quantity

        if (
          !Number.isFinite(available) ||
          !Number.isFinite(shared) ||
          shared <= 0 ||
          available < shared ||
          inventoryItem.unit?.trim() !== listing.unit?.trim()
        ) {
          fail(
            409,
            'Your inventory no longer contains enough food in the listed unit.',
          )
        }

        // Round to avoid floating-point results such as 0.30000000000000004.
        const remaining = Number((available - shared).toFixed(12))

        if (remaining === 0) {
          await inventoryItem.deleteOne({ session })
          inventoryRemoved = true
        } else {
          inventoryItem.quantity = remaining

          // Keep the total weight consistent with the remaining quantity.
          if (Number.isFinite(inventoryItem.weightKg)) {
            inventoryItem.weightKg *= remaining / available
          }

          await inventoryItem.save({ session })
        }
      }
    }
    const now=new Date()
    listing.status='collected'; listing.collectedAt=now
    if (inventoryRemoved) listing.inventoryRemovedAt=now
    await listing.save({session})
    // Explicit unset also works when the internal field was excluded from the query.
    await FoodListing.updateOne({_id:listing._id},{$unset:{activeInventoryItem:1}},{session})
    request.status='completed'; request.completedAt=now; await request.save({session})
    await RescueRequest.updateMany({listing:listing._id,status:'pending'},{$set:{status:'declined'},$unset:{pickupProposal:1}},{session})
    return {listing:publicListing(listing),inventoryRemoved,inventoryAlreadyMissing}
  })
  res.json(result)
})
const uploadPhoto = wrap(async (req,res) => {
  id(req.params.id,'listing ID')
  const permitted = await FoodListing.exists({_id:req.params.id,user:req.userId,status:'available'})
  if (!permitted) fail(404,'Editable listing not found or not owned by you.')
  if (!req.file) fail(400,'Upload a photo file.')
  const data=await compressRescueImage(req.file.buffer)
  await tx(async session => {
    const listing = await ownedListing(req.params.id,req.userId,session)
    if (listing.status!=='available') fail(409,'Only available listing photos can be changed.')
    if (await RescueRequest.exists({listing:listing._id,status:{$in:['pending','accepted']}}).session(session)) fail(409,'Resolve active requests before changing the photo.')
    await FoodListing.updateOne({_id:listing._id},{$set:{hasPhoto:true},$inc:{revision:1}},{session})
    await RescuePhoto.findOneAndUpdate({listing:listing._id},{$set:{data,contentType:'image/webp'}},{upsert:true,runValidators:true,session})
  })
  res.json({photoUrl:`/api/rescue/${req.params.id}/photo`,sizeBytes:data.length})
})
const getPhoto = wrap(async (req,res) => {
  id(req.params.id,'listing ID')
  const listing = await FoodListing.findById(req.params.id).select('status user').lean()
  if (!listing || listing.status==='withdrawn' && !same(listing.user,req.userId)) fail(404,'Photo not found.')
  const photo = await RescuePhoto.findOne({listing:req.params.id}).select('+data')
  if (!photo) fail(404,'Photo not found.')
  res.set({'Content-Type':'image/webp','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'})
  res.send(photo.data)
})
const deletePhoto = wrap(async (req,res) => {
  id(req.params.id,'listing ID')
  await tx(async session => {
    const listing = await ownedListing(req.params.id,req.userId,session)
    if (listing.status!=='available') fail(409,'Only available listing photos can be changed.')
    if (await RescueRequest.exists({listing:listing._id,status:{$in:['pending','accepted']}}).session(session)) fail(409,'Resolve active requests before changing the photo.')
    await FoodListing.updateOne({_id:listing._id},{$set:{hasPhoto:false},$inc:{revision:1}},{session})
    await RescuePhoto.deleteOne({listing:listing._id},{session})
  })
  res.json({message:'Photo removed.'})
})
export default {listListings,myListings,createListing,getListing,updateListing,deleteListing,claimListing,unclaimListing,listRequests,acceptRequest,declineRequest,cancelRequest,collectListing,uploadPhoto,getPhoto,deletePhoto}
