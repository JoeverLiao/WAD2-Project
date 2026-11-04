import mongoose from 'mongoose'

// Joevan: extend for savings and impact calculations.
const foodEventSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    inventoryItem: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem' },
    action: { type: String, enum: ['consumed', 'discarded', 'shared', 'rescued'], required: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    category: { type: String, default: 'Other', maxlength: 100 },
    unit: { type: String, default: 'pieces', maxlength: 40 },
    weightKg: { type: Number, min: 0, default: 0 },
    valueSgd: { type: Number, min: 0, default: 0 },
    location: { type: String, default: 'My kitchen', maxlength: 100 },
    source: { type: String, default: 'Manual entry', maxlength: 100 },
    quantity: { type: Number, min: 0, required: true },
    occurredAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
)

export default mongoose.model('FoodEvent', foodEventSchema, 'food_events')
