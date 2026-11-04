import { classifyFoodIcons } from '../services/iconClassifier.js'
import { iconConfig } from '../config/iconConfig.js'

// Icon and colour for each food name the client shows.
// Always answers 200 with whatever could be classified; the client falls back for the rest.
const classifyIcons = async (req, res) => {
  const input = req.body?.names
  const max = iconConfig().maxNamesPerRequest
  if (!Array.isArray(input) || input.length === 0 || input.length > max || !input.every((n) => typeof n === 'string')) {
    return res.status(400).json({ error: `Send between 1 and ${max} food names.` })
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
