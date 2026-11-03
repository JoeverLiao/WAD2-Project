// Decides the icon AND colour a food is drawn with. FoodIcon.vue asks this file; nothing else should.
//
// The AI decides: every food name is sent to the server's AI once (in a batch, in the background)
// and its answer is kept in this browser, so a food never changes once known. For a food the order is:
//   1. the AI's saved answer
//   2. the built-in rules, only while the AI has not answered or cannot (no key, offline):
//      foodIconMap.js for the icon, foodColours.js for the colour, otherwise the icon's own colour
// So an icon is always shown. The AI can only choose from the library icons and the palette;
// anything else it returns is ignored.
import { reactive } from 'vue'
import { FOOD_ICONS } from './foodIcons.js'
import { FOOD_COLOURS, foodColourForName, isFoodColour } from './foodColours.js'
import { isFoodIcon, resolveFoodIcon } from './foodIconMap.js'

const STORAGE_KEY = 'fullCircle.foodIconClassifications.v1'
const BATCH_DELAY_MS = 60
const MAX_BATCH = 50

export const normaliseFoodName = (name) => String(name ?? '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 100)
const isValid = (c) => isFoodIcon(c?.icon) && isFoodColour(c?.colour)

function loadSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    return Object.entries(saved).filter(([, c]) => isValid(c))
  } catch {
    return []
  }
}

const classifications = reactive(new Map(loadSaved()))

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(classifications)))
  } catch {
    // Storage full or blocked: the classifications still last until the page is closed.
  }
}

async function requestClassifications(names) {
  const response = await fetch('/api/icons/classify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ names }),
  })
  if (!response.ok) throw new Error(`Icon lookup failed (${response.status})`)
  return (await response.json()).items ?? []
}

// Off in unit tests, so component tests never make requests they did not expect.
let request = import.meta.env.MODE === 'test' ? null : requestClassifications
const asked = new Set()
const pending = new Set()
let timer = null

function lookUp(name) {
  if (!request || asked.has(name)) return
  asked.add(name)
  pending.add(name)
  timer ??= setTimeout(flush, BATCH_DELAY_MS)
}

async function flush() {
  timer = null
  const names = [...pending].slice(0, MAX_BATCH)
  names.forEach((name) => pending.delete(name))
  if (pending.size) timer = setTimeout(flush, BATCH_DELAY_MS)
  try {
    const items = await request(names)
    for (const item of items ?? []) {
      const key = normaliseFoodName(item?.input)
      if (!names.includes(key) || !isValid(item)) continue
      const { name, category, icon, colour } = item
      classifications.set(key, { name, category, icon, colour })
    }
    save()
  } catch (error) {
    // Names stay "asked" so a failing server is not asked again on every render.
    console.warn('Food icon colours unavailable, using the built-in icons:', error.message)
  }
}

/**
 * The icon id and fill colour for a food: anything with name, icon and category fields
 * (an inventory item, a receipt row, a listing), or just a name.
 * @returns {{ icon: string, color: string, source: 'saved'|'rules' }}
 */
export function classifyFood(food = {}) {
  const item = typeof food === 'string' ? { name: food } : (food ?? {})
  const key = normaliseFoodName(item.name)
  const saved = key ? classifications.get(key) : null
  if (saved) return { icon: saved.icon, color: FOOD_COLOURS[saved.colour], source: 'saved' }

  if (key) lookUp(key)
  const icon = resolveFoodIcon(item)
  const colour = foodColourForName(key)
  return { icon, color: colour ? FOOD_COLOURS[colour] : FOOD_ICONS[icon].color, source: 'rules' }
}

/** For tests: replace the server request (null turns lookups off) and forget everything. */
export function resetFoodIconClassifier({ lookup = null } = {}) {
  request = lookup
  classifications.clear()
  asked.clear()
  pending.clear()
  clearTimeout(timer)
  timer = null
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

/** For tests: send any waiting lookups now. */
export const flushFoodIconLookups = () => (timer ? (clearTimeout(timer), flush()) : Promise.resolve())
