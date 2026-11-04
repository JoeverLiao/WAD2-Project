import {
  searchAddresses,
  reverseAddresses,
} from '../services/oneMapService.js'

import User from '../models/userModel.js'

async function search(req, res) {
  const query =
    typeof req.query.q === 'string'
      ? req.query.q.trim()
      : ''

  const page = Number(req.query.page ?? 1)

  if (query.length < 2 || query.length > 160) {
    return res.status(400).json({
      error: 'Enter a building, street or postal code using 2–160 characters.',
    })
  }

  if (!Number.isInteger(page) || page < 1 || page > 100) {
    return res.status(400).json({
      error: 'Invalid results page.',
    })
  }

  try {
    const result = await searchAddresses(query, page)
    res.json(result)
  } catch (error) {
    // Do not log the complete Axios error: it can contain credentials.
    console.error('OneMap search failed:', {
      status: error.response?.status,
      message: error.message,
    })

    if (error.response?.status === 429) {
      return res.status(429).json({
        error: 'Address search is busy. Please try again shortly.',
      })
    }

    res.status(502).json({
      error: 'Address search is temporarily unavailable. Please try again.',
    })
  }
}

async function reverse(req, res) {
  const latitude = Number(req.query.latitude)
  const longitude = Number(req.query.longitude)

  if (
    typeof req.query.latitude !== 'string' ||
    !req.query.latitude.trim() ||
    typeof req.query.longitude !== 'string' ||
    !req.query.longitude.trim() ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return res.status(400).json({
      error: 'Invalid location coordinates.',
    })
  }

  try {
    const addresses = await reverseAddresses(latitude, longitude)
    res.json({ addresses })
  } catch (error) {
    console.error('OneMap reverse lookup failed:', {
      status: error.response?.status,
      message: error.message,
    })

    res.status(error.response?.status === 429 ? 429 : 502).json({
      error: 'Could not find your address. Please search manually.',
    })
  }
}

async function getSavedLocation(req, res, next) {
  try {
    const user = await User.findById(req.userId)
      .select('pickupLocation')
      .lean()

    if (!user) {
      return res.status(404).json({
        error: 'User not found.',
      })
    }

    res.json({
      location: user.pickupLocation || null,
    })
  } catch (error) {
    next(error)
  }
}

export default { search, reverse, getSavedLocation }