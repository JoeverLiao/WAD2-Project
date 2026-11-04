import { photoUrl } from './rescueApi.js'

export const entityId = (value) =>
  String(value?._id || value || '')

export function dateTimeLabel(value) {
  const date = new Date(value)

  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('en-SG', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
      }).format(date)
    : 'Not set'
}

export const windowLabel = (start, end) =>
  `${dateTimeLabel(start)} – ${dateTimeLabel(end)}`

// Classification is derived; it does not change the saved request status.
export function isPastRequest(request, now = Date.now()) {
  if (!['pending', 'accepted'].includes(request.status)) {
    return true
  }

  const pickupEnd = Date.parse(request.pickupEnd)

  if (Number.isFinite(pickupEnd) && pickupEnd <= now) {
    return true
  }

  // An accepted pickup may still need collection confirmation.
  if (request.status === 'accepted') {
    return false
  }

  const listing = request.listing

  if (!listing || typeof listing !== 'object') {
    return true
  }

  const expiry = Date.parse(listing.expiresAt)
  const listingEnd = Date.parse(listing.pickupEnd)

  return (
    ['withdrawn', 'collected'].includes(listing.status) ||
    (Number.isFinite(expiry) && expiry <= now) ||
    (Number.isFinite(listingEnd) && listingEnd <= now)
  )
}

export function statusText(request, direction, now = Date.now()) {
  if (request.status === 'completed') return 'Collected'
  if (request.status === 'declined') return 'Request declined'
  if (request.status === 'cancelled') return 'Request cancelled'

  if (isPastRequest(request, now)) {
    if (request.status === 'accepted') return 'Pickup window ended'

    if (!request.listing || request.listing.status === 'withdrawn') {
      return 'Listing unavailable'
    }

    if (request.listing.status === 'collected') {
      return 'Listing collected'
    }

    return 'Expired'
  }

  if (request.status === 'accepted') return 'Pickup confirmed'
  if (request.pickupProposal) return 'New time proposed'

  return direction === 'sent'
    ? 'Awaiting reply'
    : 'Awaiting your reply'
}

// Person → food conversations
export function groupRequests(records, direction, now = Date.now()) {
  const groups = new Map()

  for (const raw of records) {
    const listing =
      raw.listing && typeof raw.listing === 'object'
        ? raw.listing
        : null

    const person =
      direction === 'received' ? raw.requester : raw.owner

    const personId = entityId(person) || `missing-${entityId(raw)}`
    const groupId = `${direction}-${personId}`

    if (!groups.has(groupId)) {
      groups.set(groupId, {
        id: groupId,
        direction,
        person: person?.name || 'Former user',
        requests: [],
      })
    }

    const differentTime = Boolean(
      listing &&
        (
          Date.parse(raw.pickupStart) < Date.parse(listing.pickupStart) ||
          Date.parse(raw.pickupEnd) > Date.parse(listing.pickupEnd)
        ),
    )

    groups.get(groupId).requests.push({
      id: entityId(raw),
      listingId: entityId(raw.listing),
      person: person?.name || 'Former user',
      food: listing?.title || 'Listing unavailable',
      quantity: listing
        ? `${listing.quantity} ${listing.unit}`
        : '',
      image: photoUrl(listing),
      preferredPickup: listing
        ? windowLabel(listing.pickupStart, listing.pickupEnd)
        : 'Unavailable',
      status: raw.status,
      raw,
      differentTime,
      past: isPastRequest(raw, now),
      requestedPickup: windowLabel(raw.pickupStart, raw.pickupEnd),
      preview: statusText(raw, direction, now),
    })
  }

  return [...groups.values()].sort((a, b) =>
    a.person.localeCompare(b.person),
  )
}

export function makeClientKey() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }

  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)

  return Array.from(
    bytes,
    (value) => value.toString(16).padStart(2, '0'),
  ).join('')
}