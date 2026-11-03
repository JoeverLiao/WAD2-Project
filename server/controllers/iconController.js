import { classifyFoodIcons } from '../services/iconClassifier.js'

// Icon and colour for each food name the client shows.
// Always answers 200 with whatever could be classified; the client falls back for the rest.
const classifyIcons = async (req, res) => {
  const input = req.body?.names
  if (!Array.isArray(input) || input.length === 0 || input.length > 50 || !input.every((n) => typeof n === 'string')) {
    return res.status(400).json({ error: 'Send between 1 and 50 food names.' })
  }
  try {
    return res.json(await classifyFoodIcons(input))
  } catch (error) {
    console.error('Classifying food icons failed:', error)
    return res.json({ items: [], aiStatus: 'failed' })
  }
}

export default {
  classifyIcons,
}
