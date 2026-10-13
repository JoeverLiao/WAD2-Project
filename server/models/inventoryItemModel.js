import mongoose from 'mongoose'

// Shared by scanning, fridge, freshness, rescue, and analytics.
const inventoryItemSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    quantity: { type: Number, min: 0, default: 1 },
    unit: { type: String, trim: true },
    storage: { type: String, enum: ['fridge', 'freezer', 'pantry'], required: true },
    purchasedAt: Date,
    expiresAt: Date,
    purchasePrice: { type: Number, min: 0 },
  },
  { timestamps: true },
)

export default mongoose.model('InventoryItem', inventoryItemSchema, 'inventory_items')
