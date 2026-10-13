
export function getDaysRemaining(expiresAt, today = new Date()) {
  if (!expiresAt) return null

  const expiry = new Date(expiresAt)

  if (Number.isNaN(expiry.getTime())) return null

  // Compare calendar dates, not hours or minutes.
  const expiryDay = Date.UTC(
    expiry.getFullYear(),
    expiry.getMonth(),
    expiry.getDate(),
  )

  const currentDay = Date.UTC(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  )

  return Math.round((expiryDay - currentDay) / 86400000)
}

export function getExpiryStatus(daysRemaining) {
  if (daysRemaining === null) return 'unknown'
  if (daysRemaining < 0) return 'expired'
  if (daysRemaining <= 3) return 'eat-soon'

  return 'fresh'
}

export function getExpiryLabel(daysRemaining) {
  if (daysRemaining === null) return 'No expiry date'
  if (daysRemaining < 0) return 'Expired'
  if (daysRemaining === 0) return 'Expires today'
  if (daysRemaining === 1) return 'Expires tomorrow'

  return `${daysRemaining} days remaining`
}
