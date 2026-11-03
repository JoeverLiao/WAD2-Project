import mongoose from 'mongoose'
const { Schema } = mongoose
const pointSchema = new Schema({
  type:{type:String,enum:['Point'],default:'Point',required:true},
  coordinates:{type:[Number],required:true,validate:{validator:c => c.length===2 && c.every(Number.isFinite) && c[0]>=-180 && c[0]<=180 && c[1]>=-90 && c[1]<=90,message:'Invalid [longitude, latitude].'}},
},{_id:false})
const schema = new Schema({
  user:{type:Schema.Types.ObjectId,ref:'User',required:true,index:true},
  inventoryItem:{type:Schema.Types.ObjectId,ref:'InventoryItem',immutable:true},
  // Unique only while the listing is active; unset when withdrawn/collected.
  activeInventoryItem:{type:Schema.Types.ObjectId,select:false},
  inventorySnapshotUpdatedAt:{type:Date,select:false},
  title:{type:String,required:true,trim:true,maxlength:120},
  description:{type:String,default:'',maxlength:1000},
  category:{type:String,enum:['produce','bakery','dairy','pantry','cooked','other'],default:'other'},
  quantity:{type:Number,required:true,min:0.001,max:1_000_000},
  unit:{type:String,required:true,maxlength:40},
  expiresAt:{type:Date,required:true},
  location:{type:pointSchema,required:true},
  pickupLabel:{type:String,required:true,maxlength:160},
  pickupInstructions:{type:String,default:'',maxlength:500},
  pickupStart:{type:Date,required:true}, pickupEnd:{type:Date,required:true},
  status:{type:String,enum:['available','claimed','collected','withdrawn'],default:'available',index:true},
  claimedBy:{type:Schema.Types.ObjectId,ref:'User'},
  acceptedRequest:{type:Schema.Types.ObjectId,ref:'RescueRequest'},
  collectedAt:Date, inventoryRemovedAt:Date,
  hasPhoto:{type:Boolean,default:false},
  // Every request mutation writes here to serialize races with acceptance/withdrawal.
  revision:{type:Number,default:0,select:false},
},{timestamps:true})
schema.index({location:'2dsphere'})
schema.index({activeInventoryItem:1},{unique:true,partialFilterExpression:{activeInventoryItem:{$type:'objectId'}}})
schema.index({user:1,createdAt:-1})
schema.index({status:1,expiresAt:1})
export default mongoose.models.FoodListing || mongoose.model('FoodListing',schema,'food_listings')
