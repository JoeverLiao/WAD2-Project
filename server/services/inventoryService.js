// Writes confirmed items into a user's inventory. Used by both ways of adding food: scanned
// receipts and manual entry. It expects items that already passed validateInventoryItems().
import InventoryItem from '../models/inventoryItemModel.js'
import { classifyItem } from './foodKnowledge.js'

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
    group.quantity = Math.round((group.quantity + item.quantity) * 1000) / 1000
    if (item.purchasePrice !== undefined) {
      group.purchasePrice = Math.round(((group.purchasePrice ?? 0) + item.purchasePrice) * 100) / 100
    }
    group.purchasedAt ??= item.purchasedAt
    group.expiresAt ??= item.expiresAt
  }
  return [...groups.values()]
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
  const prepared = standardiseNames ? items.map((item) => ({ ...item, name: standardName(item.name) })) : items
  const operations = groupSameProducts(prepared).map((item) => {
    const inc = { quantity: item.quantity }
    if (item.purchasePrice !== undefined) inc.purchasePrice = item.purchasePrice
    const onInsert = { storageZone: item.storage === 'pantry' ? 'dry-storage' : item.storage === 'freezer' ? 'freezer-main' : 'middle-shelf' }
    if (item.purchasedAt) onInsert.purchasedAt = item.purchasedAt
    if (item.expiresAt) onInsert.expiresAt = item.expiresAt
    const update = { $inc: inc }
    if (Object.keys(onInsert).length) update.$setOnInsert = onInsert
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
