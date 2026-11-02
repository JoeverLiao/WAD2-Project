// Writes confirmed items into a user's inventory. Used by both ways of adding food: scanned
// receipts and manual entry. It expects items that already passed validateInventoryItems().
import InventoryItem from '../models/inventoryItemModel.js'
import { classifyItem } from './foodKnowledge.js'
import { enrichWithRules } from './itemEnrichment.js'
import { ALL_ICONS, CATEGORIES, ZONES } from './storageGuide.js'

/** The standard name for a common food ("Full cream milk 1L" -> "Milk"); other names are kept. */
export function standardName(name) {
  return classifyItem(name).canonicalName ?? name
}

/**
 * Combine rows that are the same product (same name ignoring case, same unit, same storage):
 * quantities and prices are added up.
 */
export function groupSameProducts(items) {
  const groups = new Map()
  for (const item of items) {
    const key = `${item.name.toLowerCase()}|${item.unit ?? ''}|${item.storage}`
    const group = groups.get(key)
    if (!group) {
      groups.set(key, { ...item })
      continue
    }
    if (item.quantity !== undefined) {
      group.quantity = Math.round(((group.quantity ?? 0) + item.quantity) * 1000) / 1000
    }
    if (item.weightKg !== undefined) {
      group.weightKg = Math.round(((group.weightKg ?? 0) + item.weightKg) * 1000) / 1000
    }
    if (item.purchasePrice !== undefined) {
      group.purchasePrice = Math.round(((group.purchasePrice ?? 0) + item.purchasePrice) * 100) / 100
    }
    group.purchasedAt ??= item.purchasedAt
    group.expiresAt ??= item.expiresAt
  }
  return [...groups.values()]
}

/**
 * Make sure every item has what the Smart Fridge needs: a category, an icon, a suggested location,
 * the places that are acceptable and the reason, and a current place (storageZone). Whatever the
 * request already holds is kept when it is consistent; the rest comes from the fixed storage rules.
 */
export function completeItems(items) {
  const fromRules = enrichWithRules(items.map((item) => ({ ...item, expiresAt: undefined, purchasedAt: undefined })))
  return items.map((item, i) => {
    const rules = fromRules[i]
    const category = item.category ?? rules.category
    const info = CATEGORIES[category]
    // A suggested location is only kept when it is allowed for the category.
    const suggested =
      item.suggestedLocation && info.allowed.includes(item.suggestedLocation)
        ? item.suggestedLocation
        : item.category
          ? info.zone
          : rules.suggestedLocation
    const zone = item.storageZone ?? suggested
    return {
      ...item,
      category,
      // Any icon from the full list is allowed (the user may pick one from another category).
      icon: ALL_ICONS.includes(item.icon) ? item.icon : info.icons[0],
      suggestedLocation: suggested,
      allowedLocations: info.allowed.includes(suggested) ? info.allowed : [suggested, ...info.allowed],
      locationReason: info.reason,
      storageZone: zone,
      storage: ZONES[zone].storage,
    }
  })
}

/**
 * Add items to one user's inventory. An item that is already in stock (same name ignoring
 * upper/lower case, same unit, same storage) has its quantity increased instead of being added a
 * second time, and keeps its own dates. The price is optional: when it is missing nothing is
 * added to the stored price.
 *
 * @param {string} userId the logged-in user's id (from the login token, never from the request body)
 * @param {Array<object>} items validated items
 * @param {{ standardiseNames?: boolean }} [options] give common foods their standard name
 * @returns {Promise<{ saved: number, added: number, merged: number }>}
 */
export async function addItemsToInventory(userId, items, { standardiseNames = false } = {}) {
  const named = standardiseNames ? items.map((item) => ({ ...item, name: standardName(item.name) })) : items
  const prepared = completeItems(named)
  const operations = groupSameProducts(prepared).map((item) => {
    const inc = {}
    if (item.quantity !== undefined) inc.quantity = item.quantity
    if (item.weightKg !== undefined) inc.weightKg = item.weightKg
    if (item.purchasePrice !== undefined) inc.purchasePrice = item.purchasePrice
    // These are set only when the item is new: an item already in stock keeps its own details.
    const onInsert = {
      category: item.category,
      icon: item.icon,
      suggestedLocation: item.suggestedLocation,
      allowedLocations: item.allowedLocations,
      locationReason: item.locationReason,
      storageZone: item.storageZone,
    }
    if (item.purchasedAt) onInsert.purchasedAt = item.purchasedAt
    if (item.expiresAt) onInsert.expiresAt = item.expiresAt
    const update = { $setOnInsert: onInsert }
    if (Object.keys(inc).length) update.$inc = inc
    return {
      updateOne: {
        filter: { user: userId, name: item.name, unit: item.unit ?? null, storage: item.storage },
        update,
        upsert: true,
        collation: { locale: 'en', strength: 2 },
      },
    }
  })
  const result = await InventoryItem.bulkWrite(operations, { ordered: true })
  return { saved: operations.length, added: result.upsertedCount ?? 0, merged: result.matchedCount ?? 0 }
}
