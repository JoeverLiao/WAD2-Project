// Rules for one row of the receipt review form. They are the same rules the server applies
// (server/services/inventoryValidation.js), so the user sees problems before saving. The server
// still checks everything again, because it cannot trust the browser.
import { CATEGORY_VALUES, DIET_VALUES, ZONE_VALUES } from './inventoryOptions.js'

export const STORAGE_OPTIONS = ['fridge', 'freezer', 'pantry']
export const UNIT_SUGGESTIONS = ['pieces', 'packet', 'bottle', 'can', 'loaf', 'g', 'kg', 'ml', 'L']
export const MAX_ITEMS = 100

const EARLIEST_YEAR = 2000
const EXPIRY_YEARS_AHEAD = 10

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === ''
}

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN
  const text = String(value).trim()
  return /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : NaN
}

function fitsDecimals(n, places) {
  const scaled = n * 10 ** places
  return Math.abs(scaled - Math.round(scaled)) < 1e-6
}

/** 'YYYY-MM-DD' for a real calendar day, otherwise null. */
export function parseDay(value) {
  const m = String(value ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(Date.UTC(y, mo - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null
  return m[0]
}

export function toIsoDay(date) {
  const p = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
}

/**
 * Check a purchase date on its own (it applies to every item on the receipt).
 * @returns {string|null} an error message, or null when fine or empty
 */
export function validatePurchaseDate(value, today = new Date(), { required = false } = {}) {
  if (isBlank(value)) return required ? 'Enter the purchase date.' : null
  const day = parseDay(value)
  if (!day) return 'Enter a valid purchase date.'
  if (day < `${EARLIEST_YEAR}-01-01`) return `Purchase date cannot be before ${EARLIEST_YEAR}.`
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  if (day > toIsoDay(tomorrow)) return 'Purchase date cannot be in the future.'
  return null
}

/**
 * @param {{ name: string, quantity: string|number, weightKg: string|number, unit: string, storage: string,
 *           storageZone: string, category: string,
 *           expiresAt: string, purchasePrice: string|number }} row
 * @param {{ purchasedAt?: string, today?: Date }} [context]
 * @returns {Record<string, string>} field name -> message (empty object when the row is valid)
 */
export function validateRow(row, { purchasedAt = '', today = new Date() } = {}) {
  const errors = {}

  const name = String(row.name ?? '').replace(/\s+/g, ' ').trim()
  if (!name) errors.name = 'Enter the item name.'
  else if (name.length > 100) errors.name = 'Name must be 100 characters or fewer.'

  const quantity = isBlank(row.quantity) ? NaN : toNumber(row.quantity)
  if (Number.isNaN(quantity)) errors.quantity = 'Enter a quantity, for example 2.'
  else if (quantity <= 0) errors.quantity = 'Quantity must be more than 0.'
  else if (quantity > 9999) errors.quantity = 'Quantity must be 9999 or less.'
  else if (!fitsDecimals(quantity, 3)) errors.quantity = 'Quantity can have at most 3 decimal places.'

  if (!isBlank(row.unit) && String(row.unit).trim().length > 20) {
    errors.unit = 'Unit must be 20 characters or fewer.'
  }

  if (!STORAGE_OPTIONS.includes(row.storage)) errors.storage = 'Choose fridge, freezer or pantry.'
  // Required: where it is kept, the category, the diet label and the use-by date (food only).
  // Price, unit and (with a weight) quantity stay optional.
  if (isBlank(row.storageZone)) errors.storageZone = 'Choose where the item is kept.'
  else if (!ZONE_VALUES.includes(row.storageZone)) errors.storageZone = 'Choose where the item is kept.'
  if (isBlank(row.category)) errors.category = 'Choose a category (or press "Suggest" to fill it in).'
  else if (!CATEGORY_VALUES.includes(row.category)) errors.category = 'Choose a category from the list.'
  if (isBlank(row.dietType)) errors.dietType = 'Choose a diet label.'
  else if (!DIET_VALUES.includes(row.dietType)) errors.dietType = 'Choose a diet label from the list.'

  if (isBlank(row.weightKg)) errors.weightKg = 'Enter the weight in kg (an estimate is fine).'
  else {
    const weight = toNumber(row.weightKg)
    if (Number.isNaN(weight)) errors.weightKg = 'Enter the weight in kg, for example 0.5.'
    else if (weight <= 0) errors.weightKg = 'Weight must be more than 0.'
    else if (weight > 1000) errors.weightKg = 'Weight must be 1000 kg or less.'
    else if (!fitsDecimals(weight, 3)) errors.weightKg = 'Weight can have at most 3 decimal places.'
  }

  if (isBlank(row.expiresAt)) {
    errors.expiresAt = 'Enter a use-by date (an estimate is fine).'
  } else {
    const day = parseDay(row.expiresAt)
    const limit = new Date(today.getFullYear() + EXPIRY_YEARS_AHEAD, today.getMonth(), today.getDate())
    if (!day) errors.expiresAt = 'Enter a valid expiry date.'
    else if (day < `${EARLIEST_YEAR}-01-01`) errors.expiresAt = `Expiry date cannot be before ${EARLIEST_YEAR}.`
    else if (day > toIsoDay(limit)) errors.expiresAt = 'Expiry date is too far in the future.'
    else if (parseDay(purchasedAt) && day < parseDay(purchasedAt)) {
      errors.expiresAt = 'Expiry date cannot be before the purchase date.'
    }
  }

  if (!isBlank(row.purchasePrice)) {
    const price = toNumber(row.purchasePrice)
    if (Number.isNaN(price)) errors.purchasePrice = 'Enter the price as a number, for example 3.50.'
    else if (price < 0) errors.purchasePrice = 'Price cannot be negative.'
    else if (price > 100000) errors.purchasePrice = 'Price is too high.'
    else if (!fitsDecimals(price, 2)) errors.purchasePrice = 'Price can have at most 2 decimal places.'
  }

  return errors
}

/** The JSON the server expects for one row. Call only after validateRow found no errors. */
export function toPayload(row, purchasedAt) {
  const payload = {
    name: String(row.name).replace(/\s+/g, ' ').trim(),
    storage: row.storage,
  }
  if (!isBlank(row.quantity)) payload.quantity = Number(row.quantity)
  if (!isBlank(row.weightKg)) payload.weightKg = Number(row.weightKg)
  if (!isBlank(row.storageZone)) payload.storageZone = row.storageZone
  if (!isBlank(row.category)) payload.category = row.category
  if (!isBlank(row.icon)) payload.icon = row.icon
  if (!isBlank(row.dietType)) payload.dietType = row.dietType
  if (!isBlank(row.suggestedLocation)) payload.suggestedLocation = row.suggestedLocation
  if (!isBlank(row.unit)) payload.unit = String(row.unit).trim()
  if (!isBlank(purchasedAt)) payload.purchasedAt = String(purchasedAt).trim()
  if (!isBlank(row.expiresAt)) payload.expiresAt = String(row.expiresAt).trim()
  if (!isBlank(row.purchasePrice)) payload.purchasePrice = Number(row.purchasePrice)
  return payload
}
