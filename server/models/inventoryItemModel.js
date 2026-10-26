import mongoose from 'mongoose'

// ============================================================
// INVENTORY ITEM MODEL
// ============================================================
// This file describes the shape of one food item in MongoDB.
// Mongoose uses this schema to validate data before saving it.
//
// IMPORTANT:
// - `user` connects each food item to the account that owns it.
// - `storage` is the main location: fridge, freezer or pantry.
// - `storageZone` is the more specific shelf/compartment.
// ============================================================

const inventoryItemSchema = new mongoose.Schema(
  {
    // Owner of this food item. The API sets this from the logged-in user;
    // clients are not allowed to choose or overwrite the owner themselves.
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // Food name displayed on the card. trim removes accidental outer spaces.
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    // Quantity must be zero or greater. The frontend requires a positive value.
    quantity: {
      type: Number,
      required: true,
      min: 0,
      default: 1,
    },

    // Examples: pieces, carton, packet, bag, bottle.
    unit: {
      type: String,
      trim: true,
      maxlength: 40,
      default: 'pieces',
    },

    // Broad storage location used by the app's shared inventory model.
    storage: {
      type: String,
      enum: ['fridge', 'freezer', 'pantry'],
      required: true,
      default: 'fridge',
    },

    // The exact area inside the main location. This field is required for
    // the crisper, shelves, door, freezer and pantry areas to persist.
    storageZone: {
      type: String,
      enum: [
        'upper-shelf',
        'middle-shelf',
        'lower-shelf',
        'door',
        'crisper',
        'freezer-main',
        'dry-storage',
      ],
      default: 'middle-shelf',
    },

    // Optional dates. Empty dates from the form are stored as null.
    purchasedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
    },

    // Optional price paid for this item. Not currently entered by this form.
    purchasePrice: {
      type: Number,
      min: 0,
      default: null,
    },
  },
  {
    // Mongoose automatically adds createdAt and updatedAt timestamps.
    timestamps: true,
  },
)

// Keep using the existing collection name so the app remains compatible
// with the rest of the project.
export default mongoose.model('InventoryItem', inventoryItemSchema, 'inventory_items')
