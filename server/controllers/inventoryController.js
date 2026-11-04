import FoodEvent from '../models/foodEventModel.js'
import mongoose from 'mongoose'
import InventoryItem from '../models/inventoryItemModel.js'
import FoodListing from '../models/foodListingModel.js'
import RescueRequest from '../models/rescueRequestModel.js'
import RescuePhoto from '../models/rescuePhotoModel.js'
import { completeItems } from '../services/inventoryService.js'
import { classifyItem } from '../services/foodKnowledge.js'
import { ZONE_IDS } from '../services/storageGuide.js'
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

function activitySnapshot(item, action, quantity, fraction = 1) {
  const hasCount = Number.isFinite(item.quantity) && item.quantity > 0
  return {
    user: item.user, inventoryItem: item._id, name: item.name, action,
    quantity,
    unit: hasCount ? item.unit || 'pieces' : 'kg', category: item.category || 'Other',
    weightKg: (Number(item.weightKg) || 0) * fraction,
    valueSgd: (Number(item.purchasePrice) || 0) * fraction,
    location: item.storage === 'pantry' ? item.pantryName || 'Pantry' : item.fridgeName || 'Main fridge',
    source: 'Inventory activity',
  }
}

async function recordPartialActivity(req, res, next) {
  try {
    const amount = req.body.amount
    if (!['consumed', 'discarded'].includes(req.body.activity) || typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Enter a valid activity and amount.' })
    }
    const updated = await mongoose.connection.transaction(async session => {
      const item = await InventoryItem.findOne({ _id: req.params.id, user: req.userId }).session(session)
      if (!item) return null
      const hasCount = Number.isFinite(item.quantity) && item.quantity > 0
      const totalAmount = hasCount ? item.quantity : Number(item.weightKg)
      if (!Number.isFinite(totalAmount) || totalAmount <= 0 || amount >= totalAmount) return null
      const fraction = amount / totalAmount
      await FoodEvent.create([activitySnapshot(item, req.body.activity, amount, fraction)], { session })
      if (hasCount) item.quantity -= amount
      if (item.weightKg != null) item.weightKg *= 1 - fraction
      if (item.purchasePrice != null) item.purchasePrice *= 1 - fraction
      await item.save({ session })
      return item
    })
    if (!updated) return res.status(409).json({ error: 'The food amount has changed. Reload and try again.' })
    res.json({ item: updated })
  } catch (error) { next(error) }
}

// Fields the frontend is allowed to create or update.
// We deliberately do not accept `user`, `_id`, `createdAt` or `updatedAt`
// from the request body, because the client must not control those fields.
const editableFields = [
  'name',
  'quantity',
  'weightKg',
  'unit',
  'storage',
  'storageZone',
  'fridgeName',
  'pantryName',
  'storageGuidanceIgnored',
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

function hasTrackedAmount(item = {}) {
  return (Number.isFinite(item.quantity) && item.quantity > 0) ||
    (Number.isFinite(item.weightKg) && item.weightKg > 0)
}

// Validate fields shared by create and update requests.
// Returning a message lets each endpoint send a clear HTTP 400 response.
function validateItemFields(fields, { creating = false } = {}) {
  if (Object.prototype.hasOwnProperty.call(fields, 'storageGuidanceIgnored') &&
      typeof fields.storageGuidanceIgnored !== 'boolean') {
    return 'Storage guidance preference must be true or false.'
  }
  for (const key of ['fridgeName', 'pantryName']) {
    if (!Object.prototype.hasOwnProperty.call(fields, key)) continue
    if (fields[key] === null || fields[key] === '') {
      fields[key] = null
      continue
    }
    if (typeof fields[key] !== 'string' || fields[key].trim().length === 0 || fields[key].trim().length > 60) {
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
    if (fields.quantity == null || fields.quantity === '') {
      fields.quantity = null
    } else {
      const quantity = Number(fields.quantity)
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return 'Quantity must be a number greater than zero.'
      }
      fields.quantity = quantity
    }
  }

  if (Object.prototype.hasOwnProperty.call(fields, 'weightKg')) {
    if (fields.weightKg == null || fields.weightKg === '') {
      fields.weightKg = null
    } else {
      const weightKg = Number(fields.weightKg)
      if (!Number.isFinite(weightKg) || weightKg <= 0) {
        return 'Weight must be a number greater than zero.'
      }
      fields.weightKg = weightKg
    }
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
    if (!hasTrackedAmount(fields)) {
      return res.status(400).json({ error: 'Enter a quantity or weight greater than zero.' })
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

    if (req.body.activity) return recordPartialActivity(req, res, next)

    const fields = pickEditableFields(req.body)
    if (Object.keys(fields).length === 0) {
      return res.status(400).json({ error: 'No editable fields were provided.' })
    }
    const preferenceOnly = Object.keys(fields).length === 1 &&
      Object.prototype.hasOwnProperty.call(fields, 'storageGuidanceIgnored')

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
      weightKg: existingItem.weightKg,
      ...(existingItem.unit != null ? { unit: existingItem.unit } : {}),
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
    if (!preferenceOnly && !Object.prototype.hasOwnProperty.call(fields, 'storageZone')) {
      const validZones = combined.storage === 'pantry' ? ['dry-storage'] : combined.storage === 'freezer'
        ? ['freezer-main'] : ['upper-shelf', 'middle-shelf', 'lower-shelf', 'door', 'door-lower', 'crisper']
      if (!validZones.includes(combined.storageZone)) {
        combined.storageZone = combined.storage === 'fridge' ? 'middle-shelf' : validZones[0]
        fields.storageZone = combined.storageZone
      }
    }
    // Ignoring advice must not repair or require unrelated legacy item details.
    const validationError = validateItemFields(preferenceOnly ? fields : combined)
    if (validationError) {
      return res.status(400).json({ error: validationError })
    }
    if ((Object.prototype.hasOwnProperty.call(fields, 'quantity') ||
         Object.prototype.hasOwnProperty.call(fields, 'weightKg')) && !hasTrackedAmount(combined)) {
      return res.status(400).json({ error: 'An item must keep a quantity or weight greater than zero.' })
    }

    const locationChanged = combined.storage !== existingItem.storage || combined.storageZone !== existingItem.storageZone
    if (!preferenceOnly && locationChanged) {
      // Older inventory records may predate stored guidance. Use the same rules as receipts.
      let allowed = (existingItem.allowedLocations || []).filter(zone => ZONE_IDS.includes(zone))
      let suggested = ZONE_IDS.includes(existingItem.suggestedLocation) ? existingItem.suggestedLocation : null
      let reason = existingItem.locationReason
      if (!allowed.length && suggested) allowed = [suggested]
      if (!allowed.length && (existingItem.category || classifyItem(existingItem.name).category)) {
        const source = existingItem.toObject ? existingItem.toObject() : existingItem
        const guidance = completeItems([source])[0]
        allowed = guidance.allowedLocations
        suggested = guidance.suggestedLocation
        reason = guidance.locationReason
      }
      if (allowed.length) {
        fields.allowedLocations = allowed
        fields.suggestedLocation = suggested && allowed.includes(suggested) ? suggested : allowed[0]
        if (reason) fields.locationReason = reason
        // A previous dismissal does not suppress a new move out of a recommended place.
        if (allowed.includes(existingItem.storageZone) && !allowed.includes(combined.storageZone)) {
          fields.storageGuidanceIgnored = false
        }
      }
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
// Delete an item only if it belongs to the signed-in user. It will update the rescue listing to withdrawn
async function deleteItem(req, res, next) {
  try {
    if (!validItemId(req.params.id)) {
      return res.status(400).json({
        error: 'Invalid inventory item ID.',
      })
    }

    if (req.body?.activity && !['consumed', 'discarded'].includes(req.body.activity)) {
      return res.status(400).json({ error: 'Invalid food activity.' })
    }
    const deleted = await mongoose.connection.transaction(
      async (session) => {
        const item = await InventoryItem.findOne({
          _id: req.params.id,
          user: req.userId,
        }).session(session)

        if (!item) return false

        const listings = await FoodListing.find({
          inventoryItem: item._id,
          user: req.userId,
          status: { $in: ['available', 'claimed'] },
        })
          .select('_id')
          .session(session)

        const listingIds = listings.map((listing) => listing._id)

        if (listingIds.length) {
          // Updating the listings also coordinates with concurrent
          // rescue actions that write to the same documents.
          await FoodListing.updateMany(
            {
              _id: { $in: listingIds },
              user: req.userId,
              status: { $in: ['available', 'claimed'] },
            },
            {
              $set: {
                status: 'withdrawn',
                hasPhoto: false,
              },
              $unset: {
                activeInventoryItem: 1,
                acceptedRequest: 1,
                claimedBy: 1,
              },
              $inc: {
                revision: 1,
              },
            },
            { session },
          )

          await RescueRequest.updateMany(
            {
              listing: { $in: listingIds },
              status: { $in: ['pending', 'accepted'] },
            },
            {
              $set: {
                status: 'cancelled',
              },
              $unset: {
                pickupProposal: 1,
              },
            },
            { session },
          )

          await RescuePhoto.deleteMany(
            {
              listing: { $in: listingIds },
            },
            { session },
          )
        }

        if (req.body?.activity) {
          await FoodEvent.create([activitySnapshot(item, req.body.activity, item.quantity ?? item.weightKg ?? 1)], { session })
        }
        await item.deleteOne({ session })

        return true
      },
    )

    if (!deleted) {
      return res.status(404).json({
        error: 'Inventory item not found.',
      })
    }

    res.json({
      message:
        'Inventory item deleted. Any linked active listings were withdrawn and their requests cancelled.',
    })
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
