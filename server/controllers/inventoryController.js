import mongoose from 'mongoose'
import InventoryItem from '../models/inventoryItemModel.js'
//Thahesh
// // ============================================================
// INVENTORY API CONTROLLER
// ============================================================
// These functions run after inventoryRoutes.js has authenticated the user.
// The authentication middleware puts the logged-in user's MongoDB ID in
// `req.userId`. Every database query below is scoped to that ID.
//
// That owner filter is essential: without it, one user might be able to
// view, edit or delete another user's food by guessing an item ID.
// ============================================================

// Fields the frontend is allowed to create or update.
// We deliberately do not accept `user`, `_id`, `createdAt` or `updatedAt`
// from the request body, because the client must not control those fields.
const editableFields = [
  'name',
  'quantity',
  'unit',
  'storage',
  'storageZone',
  'fridgeName',
  'pantryName',
  'purchasedAt',
  'expiresAt',
  'purchasePrice',
]

// Copy only allowed fields from the request body.
// This prevents unexpected fields from being written to the database.
function pickEditableFields(body = {}) {
  const picked = {}

  for (const field of editableFields) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      picked[field] = body[field]
    }
  }

  return picked
}

// Validate fields shared by create and update requests.
// Returning a message lets each endpoint send a clear HTTP 400 response.
function validateItemFields(fields, { creating = false } = {}) {
  for (const key of ['fridgeName', 'pantryName']) {
    if (!Object.prototype.hasOwnProperty.call(fields, key)) continue
    if (typeof fields[key] !== 'string' || !fields[key].trim() || fields[key].trim().length > 60) {
      return 'Storage name must be between 1 and 60 characters.'
    }
    fields[key] = fields[key].trim()
  }
  if (creating || Object.prototype.hasOwnProperty.call(fields, 'name')) {
    if (typeof fields.name !== 'string' || !fields.name.trim()) {
      return 'Name is required and must be text.'
    }
    if (fields.name.trim().length > 120) {
      return 'Name must be 120 characters or fewer.'
    }
  }

  if (Object.prototype.hasOwnProperty.call(fields, 'quantity')) {
    const quantity = Number(fields.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return 'Quantity must be a number greater than zero.'
    }
    fields.quantity = quantity
  } else if (creating) {
    fields.quantity = 1
  }

  if (Object.prototype.hasOwnProperty.call(fields, 'unit')) {
    if (typeof fields.unit !== 'string' || fields.unit.trim().length > 40) {
      return 'Unit must be text with at most 40 characters.'
    }
    fields.unit = fields.unit.trim() || 'pieces'
  } else if (creating) {
    fields.unit = 'pieces'
  }

  if (Object.prototype.hasOwnProperty.call(fields, 'storage')) {
    if (!['fridge', 'freezer', 'pantry'].includes(fields.storage)) {
      return 'Storage must be fridge, freezer or pantry.'
    }
  } else if (creating) {
    fields.storage = 'fridge'
  }

  if (Object.prototype.hasOwnProperty.call(fields, 'storageZone')) {
    const validZones = [
      'upper-shelf', 'middle-shelf', 'lower-shelf', 'door', 'door-lower',
      'crisper', 'freezer-main', 'dry-storage',
    ]
    if (!validZones.includes(fields.storageZone)) {
      return 'Storage zone is not valid.'
    }
  } else if (creating) {
    // Pick a sensible zone when the client does not send one.
    fields.storageZone = fields.storage === 'freezer'
      ? 'freezer-main'
      : fields.storage === 'pantry'
        ? 'dry-storage'
        : 'middle-shelf'
  }

  // Make sure the zone matches the main storage location. This prevents
  // e.g. saving a pantry item in the fridge's crisper drawer.
  const resultingStorage = fields.storage
  const resultingZone = fields.storageZone
  if (resultingStorage && resultingZone) {
    if (resultingStorage === 'freezer' && resultingZone !== 'freezer-main') {
      return 'Freezer items must use the freezer-main zone.'
    }
    if (resultingStorage === 'pantry' && resultingZone !== 'dry-storage') {
      return 'Pantry items must use the dry-storage zone.'
    }
    if (resultingStorage === 'fridge' && ['freezer-main', 'dry-storage'].includes(resultingZone)) {
      return 'Fridge items must use a fridge shelf, door or crisper zone.'
    }
  }

  // Optional date fields accept either a valid date or null/empty string.
  for (const field of ['purchasedAt', 'expiresAt']) {
    if (Object.prototype.hasOwnProperty.call(fields, field)) {
      if (fields[field] === '' || fields[field] === null) {
        fields[field] = null
      } else {
        const parsedDate = new Date(fields[field])
        if (Number.isNaN(parsedDate.getTime())) {
          return `${field} must be a valid date or empty.`
        }
        fields[field] = parsedDate
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(fields, 'purchasePrice')) {
    if (fields.purchasePrice === '' || fields.purchasePrice === null) {
      fields.purchasePrice = null
    } else {
      const price = Number(fields.purchasePrice)
      if (!Number.isFinite(price) || price < 0) {
        return 'Purchase price must be zero or greater.'
      }
      fields.purchasePrice = price
    }
  }

  return null
}

// Validate the route parameter before passing it to Mongoose.
function validItemId(id) {
  return mongoose.Types.ObjectId.isValid(id)
}

// GET /api/inventory
// Return only the signed-in user's food items.
async function listItems(req, res, next) {
  try {
    const items = await InventoryItem.find({ user: req.userId })
      .sort({ createdAt: -1 })
      .lean()

    // The Vue page accepts { items: [...] } as its response shape.
    res.json({ items })
  } catch (error) {
    next(error)
  }
}

// POST /api/inventory
// Create a new item owned by the signed-in user.
async function createItem(req, res, next) {
  try {
    const fields = pickEditableFields(req.body)
    const validationError = validateItemFields(fields, { creating: true })

    if (validationError) {
      return res.status(400).json({ error: validationError })
    }

    // Always set owner from the authenticated token, never from the body.
    const item = await InventoryItem.create({
      ...fields,
      name: fields.name.trim(),
      user: req.userId,
    })

    res.status(201).json({ item })
  } catch (error) {
    next(error)
  }
}

// GET /api/inventory/:id
// Return one item only if it belongs to the current user.
async function getItem(req, res, next) {
  try {
    if (!validItemId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid inventory item ID.' })
    }

    const item = await InventoryItem.findOne({
      _id: req.params.id,
      user: req.userId,
    })

    if (!item) {
      return res.status(404).json({ error: 'Inventory item not found.' })
    }

    res.json({ item })
  } catch (error) {
    next(error)
  }
}

// PATCH /api/inventory/:id
// Update only the fields the frontend is allowed to change.
async function updateItem(req, res, next) {
  try {
    if (!validItemId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid inventory item ID.' })
    }

    const fields = pickEditableFields(req.body)
    if (Object.keys(fields).length === 0) {
      return res.status(400).json({ error: 'No editable fields were provided.' })
    }

    // Read the current item first so validation can consider unchanged fields.
    const existingItem = await InventoryItem.findOne({
      _id: req.params.id,
      user: req.userId,
    })

    if (!existingItem) {
      return res.status(404).json({ error: 'Inventory item not found.' })
    }

    // Validate the combined result (new fields plus existing values), especially
    // so moving an item to freezer/pantry also sets a compatible storage zone.
    const combined = {
      name: existingItem.name,
      quantity: existingItem.quantity,
      unit: existingItem.unit,
      storage: existingItem.storage,
      storageZone: existingItem.storageZone,
      ...fields,
    }

    // If the user changes the main storage but omits the zone, select the
    // appropriate default zone for the new location.
    if (Object.prototype.hasOwnProperty.call(fields, 'storage') &&
        !Object.prototype.hasOwnProperty.call(fields, 'storageZone')) {
      combined.storageZone = combined.storage === 'freezer'
        ? 'freezer-main'
        : combined.storage === 'pantry'
          ? 'dry-storage'
          : 'middle-shelf'
      fields.storageZone = combined.storageZone
    }

    // Repair the legacy fridge-only default when no explicit zone was requested.
    if (!Object.prototype.hasOwnProperty.call(fields, 'storageZone')) {
      const validZones = combined.storage === 'pantry' ? ['dry-storage'] : combined.storage === 'freezer'
        ? ['freezer-main'] : ['upper-shelf', 'middle-shelf', 'lower-shelf', 'door', 'door-lower', 'crisper']
      if (!validZones.includes(combined.storageZone)) {
        combined.storageZone = combined.storage === 'fridge' ? 'middle-shelf' : validZones[0]
        fields.storageZone = combined.storageZone
      }
    }
    const validationError = validateItemFields(combined)
    if (validationError) {
      return res.status(400).json({ error: validationError })
    }

    // Copy normalized/validated fields back into the actual update object.
    for (const field of Object.keys(fields)) {
      if (Object.prototype.hasOwnProperty.call(combined, field)) {
        fields[field] = combined[field]
      }
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'name')) {
      fields.name = fields.name.trim()
    }

    const item = await InventoryItem.findOneAndUpdate(
      { _id: req.params.id, user: req.userId },
      { $set: fields },
      { new: true, runValidators: true },
    )

    res.json({ item })
  } catch (error) {
    next(error)
  }
}

// DELETE /api/inventory/:id
// Delete an item only if it belongs to the signed-in user.
async function deleteItem(req, res, next) {
  try {
    if (!validItemId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid inventory item ID.' })
    }

    const item = await InventoryItem.findOneAndDelete({
      _id: req.params.id,
      user: req.userId,
    })

    if (!item) {
      return res.status(404).json({ error: 'Inventory item not found.' })
    }

    res.json({ message: 'Inventory item deleted successfully.' })
  } catch (error) {
    next(error)
  }
}

// Export all handlers for inventoryRoutes.js to use.
export default {
  listItems,
  createItem,
  getItem,
  updateItem,
  deleteItem,
}
