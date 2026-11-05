import InventoryItem from '../models/inventoryItemModel.js'

const getDashboard = async (req, res, next) => {
  try {
    const today = new Date()
    today.setHours(23, 59, 59, 999)
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)

    const threeDaysFromNow = new Date()
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3)
    threeDaysFromNow.setHours(23, 59, 59, 999)

    let items = []
    try {
      items = await InventoryItem.find({ user: req.userId }).lean()
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

    const storageTypes = ['fridge', 'freezer', 'pantry']
    const byStorage = {}
    storageTypes.forEach((type) => {
      const storageItems = items.filter((i) => i.storage === type)
      const expiringSoon = storageItems.filter(
        (i) => i.expiresAt && i.expiresAt <= threeDaysFromNow,
      )
      const healthyItems = storageItems.filter(
        (i) => !i.expiresAt || i.expiresAt > threeDaysFromNow,
      )

      byStorage[type] = {
        count: storageItems.reduce((sum, i) => sum + (i.quantity || 1), 0),
        itemCount: storageItems.length,
        items: storageItems.map((i) => ({
          _id: i._id,
          name: i.name,
          quantity: i.quantity,
          unit: i.unit,
          expiresAt: i.expiresAt,
        })),
        expiringSoon: expiringSoon.map((i) => ({
          _id: i._id,
          name: i.name,
          quantity: i.quantity,
          unit: i.unit,
          expiresAt: i.expiresAt,
        })),
        healthyCount: healthyItems.length,
      }
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

export default {
  getDashboard
}
