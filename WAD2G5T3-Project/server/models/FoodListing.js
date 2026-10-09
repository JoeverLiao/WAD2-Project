import mongoose from 'mongoose'

// Gabriele: extend with map coordinates and pickup details.
const foodListingSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    inventoryItem: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem' },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    status: { type: String, enum: ['available', 'claimed', 'collected'], default: 'available' },
    claimedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
)

export default mongoose.model('FoodListing', foodListingSchema, 'food_listings')
