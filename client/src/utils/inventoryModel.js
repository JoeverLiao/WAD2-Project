// Shared inventory shape, storage locations and display labels.
export function toDateInputValue(value) {
  if (!value) return ''

  // MongoDB dates often arrive as ISO strings. Taking the first ten
  // characters avoids changing the calendar day due to time zones.
  return String(value).slice(0, 10)
}

export function normaliseItem(apiItem) {
  const id = String(apiItem._id || apiItem.id)
  return {
    ...apiItem,
    // MongoDB uses _id; our existing Vue template uses id.
    id,
    // Date inputs need YYYY-MM-DD rather than a full ISO timestamp.
    expiresAt: toDateInputValue(apiItem.expiresAt),
    purchasedAt: toDateInputValue(apiItem.purchasedAt),
    // Keep storageZone available even for older records that lack it.
    storageZone: compatibleZone(apiItem.storage, apiItem.storageZone),
    // Keep the storage guide fields in a predictable shape for warnings.
    suggestedLocation: apiItem.suggestedLocation || '',
    allowedLocations: Array.isArray(apiItem.allowedLocations) ? apiItem.allowedLocations : [],
    locationReason: apiItem.locationReason || '',
    dietType: apiItem.dietType || '',
    // Quantity is optional in the inventory model (for weight-only items).
    quantity: apiItem.quantity ?? '',
    weightKg: apiItem.weightKg ?? '',
  }
}

export function defaultZoneFor(storage) {
  if (storage === 'freezer') return 'freezer-main'
  if (storage === 'pantry') return 'dry-storage'
  return 'middle-shelf'
}

export function storageForZone(zone) {
  if (zone === 'freezer-main') return 'freezer'
  if (zone === 'dry-storage') return 'pantry'
  if (
    ['upper-shelf', 'middle-shelf', 'lower-shelf', 'door', 'door-lower', 'crisper'].includes(zone)
  )
    return 'fridge'
  return ''
}

export function compatibleZone(storage, zone) {
  if (storage === 'pantry' || storage === 'freezer') return defaultZoneFor(storage)
  return ['upper-shelf', 'middle-shelf', 'lower-shelf', 'door', 'door-lower', 'crisper'].includes(
    zone,
  )
    ? zone
    : 'middle-shelf'
}

export function prepareItemForApi(formData) {
  const storageZone = formData.storageZone || defaultZoneFor(formData.storage)
  return {
    name: formData.name,
    quantity:
      formData.quantity === '' || formData.quantity == null ? null : Number(formData.quantity),
    weightKg:
      formData.weightKg === '' || formData.weightKg == null ? null : Number(formData.weightKg),
    unit: formData.unit,
    storage: storageForZone(storageZone) || formData.storage,
    storageZone,
    expiresAt: formData.expiresAt || null,
    // This form does not currently ask for a purchase date or price.
    // Do not invent values for those optional fields.
  }
}

export function itemStorageName(item) {
  return item.storage === 'pantry' ? 'Pantry' : 'Fridge'
}

export function amountLabel(item) {
  const quantity = Number(item.quantity)
  if (Number.isFinite(quantity) && quantity > 0) return `${item.quantity} ${item.unit || 'items'}`
  const weight = Number(item.weightKg)
  if (Number.isFinite(weight) && weight > 0) return `${item.weightKg} kg`
  return 'Quantity not recorded'
}

export function dietTypeLabel(dietType) {
  return (
    {
      vegan: 'Vegan',
      vegetarian: 'Vegetarian',
      other: 'Contains meat or fish',
      unknown: 'Check the label',
    }[dietType] || ''
  )
}

export function expiryBadge(item) {
  const days = expiryDays(item)
  if (days === null || days > 3) return null
  return days < 0 ? 'Expired' : 'Expiring soon'
}

export function expiryDays(item) {
  if (!item.expiresAt) return null
  const expiry = new Date(`${item.expiresAt}T00:00:00`)
  if (Number.isNaN(expiry.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((expiry.getTime() - today.getTime()) / 86400000)
}

export function expiryLabel(item) {
  const days = expiryDays(item)
  if (days === null) return 'No expiry date'
  if (days < 0) return `Expired ${Math.abs(days)} day(s) ago`
  if (days === 0) return 'Expires today'
  if (days === 1) return 'Expires tomorrow'
  return `Expires in ${days} days`
}

export function locationLabel(item) {
  if (item.storage === 'pantry') return 'Pantry'
  if (item.storage === 'freezer') return 'Freezer'
  const names = {
    'upper-shelf': 'Shelves',
    'middle-shelf': 'Shelves',
    'lower-shelf': 'Shelves',
    door: 'Upper door shelf',
    'door-lower': 'Lower door shelf',
    crisper: 'Crisper drawer',
  }
  return names[item.storageZone] || 'Main fridge'
}
