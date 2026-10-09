import mongoose from 'mongoose'

// Joevan: extend for savings and impact calculations.
const foodEventSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    inventoryItem: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem' },
    action: { type: String, enum: ['consumed', 'discarded', 'shared', 'rescued'], required: true },
    quantity: { type: Number, min: 0, required: true },
    occurredAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
)

export default mongoose.model('FoodEvent', foodEventSchema, 'food_events')
