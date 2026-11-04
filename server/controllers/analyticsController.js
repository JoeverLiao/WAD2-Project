import mongoose from 'mongoose'
import FoodEvent from '../models/foodEventModel.js'

export function validateEvent(body) {
  const fields = {}
  for (const key of ['name', 'unit', 'location', 'category', 'source']) {
    const value = body[key] ?? ({ category: 'Other', source: 'Manual entry' }[key])
    const max = key === 'unit' ? 40 : 100
    if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new Error('Enter a valid ' + key + '.')
    fields[key] = value.trim()
  }
  if (!['consumed', 'discarded', 'shared', 'rescued'].includes(body.action)) throw new Error('Choose a valid activity.')
  fields.action = body.action
  for (const key of ['quantity', 'weightKg', 'valueSgd']) {
    if (typeof body[key] !== 'number' || !Number.isFinite(body[key]) || body[key] < 0) throw new Error('Enter a valid non-negative ' + key + '.')
    fields[key] = body[key]
  }
  const date = new Date(body.occurredAt)
  if (!body.occurredAt || Number.isNaN(date.getTime()) || date > new Date()) throw new Error('Choose a valid date that is not in the future.')
  fields.occurredAt = date
  return fields
}

async function getHistory(req, res, next) {
  try {
    const events = await FoodEvent.find({ user: req.userId }).sort({ occurredAt: 1 }).lean()
    res.json({ events: events.map(event => ({
      ...event, name: event.name || 'Food activity', weightKg: event.weightKg || 0,
      valueSgd: event.valueSgd || 0, unit: event.unit || 'pieces', location: event.location || 'My kitchen',
    })) })
  } catch (error) { next(error) }
}

async function saveEvent(req, res, next) {
  let fields
  try { fields = validateEvent(req.body) }
  catch (error) { return res.status(400).json({ error: error.message }) }
  try {
    if (req.params.id) {
      if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid activity ID.' })
      const event = await FoodEvent.findOneAndUpdate({ _id: req.params.id, user: req.userId }, { $set: fields }, { new: true, runValidators: true })
      if (!event) return res.status(404).json({ error: 'Activity not found.' })
      return res.json({ event })
    }
    const event = await FoodEvent.create({ ...fields, user: req.userId })
    res.status(201).json({ event })
  } catch (error) { next(error) }
}

export default { getAnalytics: getHistory, getHistory, createEvent: saveEvent, updateEvent: saveEvent }
