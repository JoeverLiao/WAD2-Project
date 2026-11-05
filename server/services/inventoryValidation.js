// Checks the items a user confirmed on the review form, before anything is saved.
// The browser also validates (so the user gets instant feedback), but the server never trusts it:
// every rule here runs again on every request.
import { ALL_ICONS, CATEGORY_IDS, DIETS, ZONE_IDS, ZONES } from './storageGuide.js'

export const STORAGE_OPTIONS = ['fridge', 'freezer', 'pantry']
export const MAX_ITEMS = 100

const LIMITS = {
  nameMax: 100,
  unitMax: 20,
  quantityMax: 9999,
  priceMax: 100000,
  weightMax: 1000,
  earliestYear: 2000,
  expiryYearsAhead: 10,
}

const DATE_FORMAT = /^(\d{4})-(\d{2})-(\d{2})$/

function isBlank(value) {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '')
}

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())) return Number(value.trim())
  return NaN
}

// True when n has at most `places` digits after the decimal point (tolerating float noise).
function fitsDecimals(n, places) {
  const scaled = n * 10 ** places
  return Math.abs(scaled - Math.round(scaled)) < 1e-6
}

/** 'YYYY-MM-DD' -> { iso, date } for a real calendar day, otherwise null. */
function parseDay(value) {
  if (typeof value !== 'string') return null
  const m = value.trim().match(DATE_FORMAT)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  // Noon UTC is the same calendar day everywhere from UTC-12 to UTC+11, so the day never shifts.
  const date = new Date(Date.UTC(y, mo - 1, d, 12))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null
  return { iso: value.trim(), date }
}

function addDaysIso(today, days) {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * @param {unknown} input the `items` array from the request body
 * @param {{ today?: Date, requireComplete?: boolean }} [options] requireComplete: the purchase date, place,
 *   category, diet label, use-by date, quantity and weight must all be given (only price and unit are optional)
 * @returns {{
 *   items: Array<{ name: string, quantity?: number, weightKg?: number, unit?: string, storage: string,
 *                  storageZone?: string, category?: string, icon?: string, suggestedLocation?: string,
 *                  purchasedAt?: Date, expiresAt?: Date, purchasePrice?: number }>,
 *   errors: Array<{ index: number|null, field: string|null, message: string }>
 * }}
 */
export function validateInventoryItems(input, { today = new Date(), requireComplete = false } = {}) {
  const errors = []
  const items = []

  if (!Array.isArray(input) || input.length === 0) {
    return { items, errors: [{ index: null, field: null, message: 'Add at least one item to save.' }] }
  }
  if (input.length > MAX_ITEMS) {
    return { items, errors: [{ index: null, field: null, message: `You can save at most ${MAX_ITEMS} items at a time.` }] }
  }

  const latestPurchase = addDaysIso(today, 1) // a day of slack for time zones
  const latestExpiry = addDaysIso(new Date(today.getFullYear() + LIMITS.expiryYearsAhead, today.getMonth(), today.getDate()), 0)
  const earliest = `${LIMITS.earliestYear}-01-01`

  input.forEach((raw, index) => {
    const fail = (field, message) => errors.push({ index, field, message })
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      fail(null, 'This item is not valid.')
      return
    }
    const clean = {}

    // name
    const name = typeof raw.name === 'string' ? raw.name.replace(/\s+/g, ' ').trim() : ''
    if (!name) fail('name', 'Enter the item name.')
    else if (name.length > LIMITS.nameMax) fail('name', `Name must be ${LIMITS.nameMax} characters or fewer.`)
    else clean.name = name

    // quantity (required)
    const quantity = isBlank(raw.quantity) ? NaN : toNumber(raw.quantity)
    if (Number.isNaN(quantity)) fail('quantity', 'Enter a quantity, for example 2.')
    else if (quantity <= 0) fail('quantity', 'Quantity must be more than 0.')
    else if (quantity > LIMITS.quantityMax) fail('quantity', `Quantity must be ${LIMITS.quantityMax} or less.`)
    else if (!fitsDecimals(quantity, 3)) fail('quantity', 'Quantity can have at most 3 decimal places.')
    else clean.quantity = quantity

    // unit (optional)
    if (!isBlank(raw.unit)) {
      const unit = typeof raw.unit === 'string' ? raw.unit.trim() : ''
      if (!unit) fail('unit', 'Unit must be text, for example pieces or kg.')
      else if (unit.length > LIMITS.unitMax) fail('unit', `Unit must be ${LIMITS.unitMax} characters or fewer.`)
      else clean.unit = unit
    }

    // weight in kg (optional)
    if (!isBlank(raw.weightKg)) {
      const weight = toNumber(raw.weightKg)
      if (Number.isNaN(weight)) fail('weightKg', 'Enter the weight in kg, for example 0.5.')
      else if (weight <= 0) fail('weightKg', 'Weight must be more than 0.')
      else if (weight > LIMITS.weightMax) fail('weightKg', `Weight must be ${LIMITS.weightMax} kg or less.`)
      else if (!fitsDecimals(weight, 3)) fail('weightKg', 'Weight can have at most 3 decimal places.')
      else clean.weightKg = weight
    }

    // where it is kept: a place in the fridge/freezer/pantry (storageZone). `storage` follows from it.
    if (!isBlank(raw.storageZone)) {
      if (!ZONE_IDS.includes(raw.storageZone)) fail('storageZone', 'Choose where the item is kept.')
      else clean.storageZone = raw.storageZone
    }
    if (clean.storageZone) {
      if (!isBlank(raw.storage) && raw.storage !== ZONES[clean.storageZone].storage) {
        fail('storageZone', 'That place does not match fridge, freezer or pantry.')
      } else clean.storage = ZONES[clean.storageZone].storage
    } else if (!STORAGE_OPTIONS.includes(raw.storage)) fail('storage', 'Choose where the item is kept.')
    else clean.storage = raw.storage

    // smart details (optional here: the server fills in what is missing from its storage rules)
    if (!isBlank(raw.category)) {
      if (!CATEGORY_IDS.includes(raw.category)) fail('category', 'Choose a category from the list.')
      else clean.category = raw.category
    }
    if (!isBlank(raw.dietType)) {
      if (!DIETS.includes(raw.dietType)) fail('dietType', 'Choose vegan, vegetarian, contains meat or fish, or check the label.')
      else clean.dietType = raw.dietType
    }
    if (!isBlank(raw.icon)) {
      if (!ALL_ICONS.includes(raw.icon)) fail('icon', 'Choose an icon from the list.')
      else clean.icon = raw.icon
    }
    if (!isBlank(raw.suggestedLocation)) {
      if (!ZONE_IDS.includes(raw.suggestedLocation)) fail('suggestedLocation', 'Suggested location is not valid.')
      else clean.suggestedLocation = raw.suggestedLocation
    }

    // dates (optional)
    let purchased = null
    if (!isBlank(raw.purchasedAt)) {
      purchased = parseDay(raw.purchasedAt)
      if (!purchased) fail('purchasedAt', 'Enter a valid purchase date.')
      else if (purchased.iso < earliest) fail('purchasedAt', `Purchase date cannot be before ${LIMITS.earliestYear}.`)
      else if (purchased.iso > latestPurchase) fail('purchasedAt', 'Purchase date cannot be in the future.')
      else clean.purchasedAt = purchased.date
    }
    if (!isBlank(raw.expiresAt)) {
      const expires = parseDay(raw.expiresAt)
      if (!expires) fail('expiresAt', 'Enter a valid expiry date.')
      else if (expires.iso < earliest) fail('expiresAt', `Expiry date cannot be before ${LIMITS.earliestYear}.`)
      else if (expires.iso > latestExpiry) fail('expiresAt', 'Expiry date is too far in the future.')
      else if (purchased && clean.purchasedAt && expires.iso < purchased.iso) {
        fail('expiresAt', 'Expiry date cannot be before the purchase date.')
      } else clean.expiresAt = expires.date
    }

    // price (optional)
    if (!isBlank(raw.purchasePrice)) {
      const price = toNumber(raw.purchasePrice)
      if (Number.isNaN(price)) fail('purchasePrice', 'Enter the price as a number, for example 3.50.')
      else if (price < 0) fail('purchasePrice', 'Price cannot be negative.')
      else if (price > LIMITS.priceMax) fail('purchasePrice', 'Price is too high.')
      else if (!fitsDecimals(price, 2)) fail('purchasePrice', 'Price can have at most 2 decimal places.')
      else clean.purchasePrice = Math.round(price * 100) / 100
    }

    // Required details (used when saving to the inventory): nothing is stored half-filled.
    if (requireComplete) {
      if (isBlank(raw.purchasedAt)) fail('purchasedAt', 'Enter the purchase date.')
      if (isBlank(raw.weightKg)) fail('weightKg', 'Enter the weight in kg (an estimate is fine).')
      if (!clean.category && isBlank(raw.category)) fail('category', 'Choose a category.')
      if (!clean.storageZone && isBlank(raw.storageZone)) fail('storageZone', 'Choose where the item is kept.')
      if (isBlank(raw.dietType)) fail('dietType', 'Choose a diet label.')
      if (isBlank(raw.expiresAt)) fail('expiresAt', 'Enter a use-by date (an estimate is fine).')
    }

    items.push(clean)
  })

  return { items: errors.length ? [] : items, errors }
}
