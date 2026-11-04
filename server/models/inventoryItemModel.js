import mongoose from 'mongoose'
import { ALL_ICONS, CATEGORY_IDS, DIETS, ZONE_IDS } from '../services/storageGuide.js'

// Shared by scanning, fridge, freshness, rescue, and analytics.
const inventoryItemSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    // Optional: things bought by weight have only weightKg.
    quantity: { type: Number, min: 0 },
    unit: { type: String, trim: true },
    // Estimated (AI / rules) or typed by the user; total weight of everything in this item.
    weightKg: { type: Number, min: 0 },
    storage: { type: String, enum: ['fridge', 'freezer', 'pantry'], required: true },
    // Optional named appliances; the shared inventory API preserves custom fridge/pantry choices.
    fridgeName: { type: String, trim: true, maxlength: 60 },
    pantryName: { type: String, trim: true, maxlength: 60 },
    // Smart Fridge placement. storageZone is where the item is NOW (the Smart Fridge page changes it
    // when the user moves the item). suggestedLocation is where it SHOULD be kept; allowedLocations
    // lists every zone that is acceptable, and locationReason says why. To warn about a bad placement:
    // warn when storageZone is not in allowedLocations.
    category: { type: String, enum: CATEGORY_IDS },
    icon: { type: String, enum: ALL_ICONS },
    // vegan | vegetarian | other (contains meat or fish) | unknown; absent for non-food.
    dietType: { type: String, enum: DIETS },
    suggestedLocation: { type: String, enum: ZONE_IDS },
    allowedLocations: { type: [String], enum: ZONE_IDS, default: undefined },
    locationReason: { type: String },
    storageGuidanceIgnored: { type: Boolean, default: false },
    storageZone: { type: String, enum: ZONE_IDS },
    purchasedAt: Date,
    expiresAt: Date,
    purchasePrice: { type: Number, min: 0 },
  },
  { timestamps: true },
)

export default mongoose.model('InventoryItem', inventoryItemSchema, 'inventory_items')
