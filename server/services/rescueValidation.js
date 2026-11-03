// Pure validation: no database queries, no client-controlled MongoDB filters.
export class RescueError extends Error {
  constructor(status, message) { super(message); this.status = status }
}
export function fail(status, message) { throw new RescueError(status, message) }
export const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key)
export function objectBody(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, 'A JSON object is required.')
  return value
}
export function id(value, label = 'ID') {
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) fail(400, `Invalid ${label}.`)
  return value
}
export function text(value, name, max, required = true) {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) {
    fail(400, `${name} must be ${required ? 'non-empty ' : ''}text with at most ${max} characters.`)
  }
  return value.trim()
}
export function number(value, name, min, max) {
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') fail(400, `${name} must be a number.`)
  const result = Number(value)
  if (!Number.isFinite(result) || result < min || result > max) fail(400, `${name} must be between ${min} and ${max}.`)
  return result
}
export function date(value, name) {
  // Require a timezone so the server does not interpret a browser's local time differently.
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/.test(value)) {
    fail(400, `${name} must be an ISO datetime including a timezone.`)
  }
  const [year, month, day] = value.slice(0,10).split('-').map(Number)
  const monthLengths = [31, (year%4===0 && (year%100!==0 || year%400===0)) ? 29 : 28, 31,30,31,30,31,31,30,31,30,31]
  if (month<1 || month>12 || day<1 || day>monthLengths[month-1]) fail(400, `${name} is invalid.`)
  const result = new Date(value)
  if (!Number.isFinite(result.getTime())) fail(400, `${name} is invalid.`)
  return result
}
export function windowFields(body) {
  const pickupStart = date(body.pickupStart, 'pickupStart')
  const pickupEnd = date(body.pickupEnd, 'pickupEnd')
  if (pickupEnd <= pickupStart) fail(400, 'Pickup end must be after pickup start.')
  if (pickupEnd <= new Date()) fail(400, 'Pickup window must end in the future.')
  return { pickupStart, pickupEnd }
}
export function listingFields(body, creating = false) {
  objectBody(body)
  const fields = {}
  if (creating || has(body,'category')) {
    const category = body.category ?? 'other'
    if (!['produce','bakery','dairy','pantry','cooked','other'].includes(category)) fail(400,'Invalid food category.')
    fields.category = category
  }
  for (const [key, max, required] of [['title',120,true], ['description',1000,false], ['unit',40,true], ['pickupLabel',160,true], ['pickupInstructions',500,false]]) {
    if (creating && required || has(body,key)) fields[key] = text(body[key],key,max,required)
  }
  if (creating || has(body,'quantity')) fields.quantity = number(body.quantity,'quantity',0.001,1_000_000)
  if (creating || has(body,'expiresAt')) fields.expiresAt = date(body.expiresAt,'expiresAt')
  if (creating || has(body,'pickupStart') || has(body,'pickupEnd')) Object.assign(fields, windowFields(body))
  if (creating || has(body,'latitude') || has(body,'longitude')) {
    fields.location = { type:'Point', coordinates:[number(body.longitude,'longitude',-180,180), number(body.latitude,'latitude',-90,90)] }
  }
  return fields
}
export function validateListingWindow(listing) {
  if (new Date(listing.expiresAt) <= new Date()) fail(400, 'Expiry must be in the future.')
  if (new Date(listing.pickupEnd) <= new Date()) fail(400, 'Pickup window has ended.')
  if (new Date(listing.pickupStart) >= new Date(listing.pickupEnd)) fail(400, 'Invalid pickup window.')
  if (new Date(listing.pickupEnd) > new Date(listing.expiresAt)) fail(400, 'Pickup must end on or before expiry.')
}
export function requestFields(body, listing) {
  objectBody(body)
  const fields = { message: text(body.message ?? '', 'message',1000,false), ...windowFields(body) }
  if (fields.pickupEnd > new Date(listing.expiresAt)) fail(400,'Requested pickup must end on or before expiry.')
  return fields
}
export function pagination(query) {
  const page = number(query.page ?? 1,'page',1,10000)
  const limit = number(query.limit ?? 20,'limit',1,50)
  if (!Number.isInteger(page) || !Number.isInteger(limit)) fail(400,'Page and limit must be integers.')
  return { page, limit, skip:(page-1)*limit }
}
export function browseFilter(query) {
  const filter = { status:'available', expiresAt:{$gt:new Date()}, pickupEnd:{$gt:new Date()} }
  if (query.q !== undefined) {
    const q = text(query.q,'q',80,false)
    if (q) filter.title = { $regex:q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), $options:'i' }
  }
  if (query.category !== undefined) {
    if (!['produce','bakery','dairy','pantry','cooked','other'].includes(query.category)) fail(400,'Invalid food category.')
    if (query.category === 'other') filter.$or = [{category:'other'},{category:{$exists:false}}]
    else filter.category = query.category
  }
  if (query.pickupFrom !== undefined || query.pickupUntil !== undefined) {
    const from = date(query.pickupFrom,'pickupFrom'), until = date(query.pickupUntil,'pickupUntil')
    if (until <= from) fail(400,'Pickup filter end must be after its start.')
    filter.pickupStart = {$lt:until}
    filter.pickupEnd = {$gt:new Date(Math.max(Date.now(),from.getTime()))}
  }
  const nearby = query.latitude !== undefined || query.longitude !== undefined || query.radiusKm !== undefined
  const bounded = query.west !== undefined || query.east !== undefined || query.south !== undefined || query.north !== undefined
  if (nearby && bounded) fail(400,'Use nearby coordinates OR map bounds, not both.')
  let geoNear
  if (nearby) {
    geoNear = {
      near:{ type:'Point',coordinates:[number(query.longitude,'longitude',-180,180),number(query.latitude,'latitude',-90,90)] },
      distanceField:'distanceMeters', spherical:true,
      maxDistance:number(query.radiusKm ?? 5,'radiusKm',0.1,100)*1000,
      key:'location',
    }
  }
  if (bounded) {
    const west = number(query.west,'west',-180,180), east = number(query.east,'east',-180,180)
    const south = number(query.south,'south',-90,90), north = number(query.north,'north',-90,90)
    if (west >= east || south >= north) fail(400,'Invalid bounds; crossing the antimeridian is not supported.')
    filter.location = { $geoWithin:{ $box:[[west,south],[east,north]] } }
  }
  return {filter,geoNear}
}
