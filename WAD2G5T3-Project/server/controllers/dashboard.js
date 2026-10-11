import InventoryItem from '../models/InventoryItem.js'

export async function getDashboard(req, res, next) {
  try {
    const today = new Date()
    today.setHours(23, 59, 59, 999)
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)

    let items = []
    try {
      items = await InventoryItem.find({}).lean()
    } catch {
      // No MongoDB available — return empty dashboard
    }

    const totalItems = items.reduce((sum, i) => sum + (i.quantity || 1), 0)
    const categories = [...new Set(items.map((i) => i.name.toLowerCase()))].length
    const itemsExpiringToday = items.filter(
      (i) => i.expiresAt && i.expiresAt >= startOfDay && i.expiresAt <= today,
    )
    const expiredItems = items.filter((i) => i.expiresAt && i.expiresAt < startOfDay)
    const urgentCount = itemsExpiringToday.length + expiredItems.length

    const byStorage = { fridge: 0, freezer: 0, pantry: 0 }
    items.forEach((i) => {
      if (byStorage[i.storage] !== undefined) byStorage[i.storage] += i.quantity || 1
    })

    res.json({
      totalItems,
      categories,
      urgentCount,
      storageBreakdown: byStorage,
      expiringToday: itemsExpiringToday.map((i) => ({
        _id: i._id,
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
        storage: i.storage,
        expiresAt: i.expiresAt,
      })),
      expired: expiredItems.map((i) => ({
        _id: i._id,
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
        storage: i.storage,
        expiresAt: i.expiresAt,
      })),
    })
  } catch (error) {
    next(error)
  }
}
