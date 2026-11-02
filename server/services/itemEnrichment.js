// Adds the "smart" details to each item: category, icon, suggested location, estimated use-by date
// and estimated weight.
//
// How it works (two layers, so the result is both precise and explainable):
//  1. RULES (storageGuide.js + foodKnowledge.js): fixed, research-based storage rules. Any food the
//     table knows gets its category, location and shelf life from here. This always runs.
//  2. AI (Claude): only asked about items the rules do not know, or whose weight is unknown. Its
//     answers are CHECKED against the rules before use: the category must be one of ours, the
//     location must be one allowed for that category, the shelf life is capped, the weight is
//     range-checked. If the AI is not configured, times out or answers badly, the rules alone are
//     used, so scanning never fails because of the AI.
//
// Only item NAMES are sent to the AI: never prices, dates, the user's id or email.
import { classifyItem } from './foodKnowledge.js'
import {
  ALL_ICONS,
  CATEGORIES,
  CATEGORY_IDS,
  packCount,
  packWeightKg,
  shelfDays,
  ZONE_IDS,
  ZONES,
} from './storageGuide.js'

const AI_TIMEOUT_MS = 20000
const MAX_AI_ITEMS = 60
const KG_PER = { kg: 1, g: 0.001, lb: 0.45359237, lbs: 0.45359237, oz: 0.028349523 }

const round = (n, places) => Math.round(n * 10 ** places) / 10 ** places

function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + days))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function localIso(today) {
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}

/** Fill in everything the rules can say about one item. Missing knowledge stays null. */
function fromRules(item) {
  const text = `${item.name} ${item.receiptName ?? ''}`
  const info = classifyItem(text)
  return {
    known: info.canonicalName !== null,
    likelyFood: info.likelyFood,
    category: info.category,
    zone: info.zone,
    days: info.days,
    pieceKg: info.pieceKg,
    frozen: info.frozen,
  }
}

/** Build the final detail fields for an item from a category/zone/days/weight decision. */
function build(item, { category, zone, days, pieceKg, source }, today) {
  const info = CATEGORIES[category]
  const baseDate = item.purchasedAt ?? localIso(today)

  // Quantity and weight. Weighed goods ("0.358 kg") have a weight and no piece count.
  const unit = typeof item.unit === 'string' ? item.unit.toLowerCase() : null
  let quantity = item.quantity ?? null
  let weightKg = item.weightKg ?? null
  let outUnit = item.unit ?? 'pieces'
  let weightIsEstimate = false
  if (weightKg === null && unit && KG_PER[unit] && quantity) {
    // Bought by weight: the receipt gives the weight itself, so it is not an estimate.
    weightKg = round(quantity * KG_PER[unit], 3)
    quantity = null
    outUnit = 'kg'
  } else if (weightKg === null && quantity) {
    const printed = packWeightKg(item.receiptName ?? item.name)
    const count = packCount(item.receiptName ?? item.name)
    if (printed !== null) weightKg = round(printed * quantity, 3)
    else if (count !== null && pieceKg) weightKg = round(count * pieceKg * quantity, 3)
    else if (pieceKg) weightKg = round(pieceKg * quantity, 3)
    weightIsEstimate = weightKg !== null
  }

  const expiresAt = item.expiresAt ?? (days ? addDays(baseDate, days) : null)
  return {
    category,
    icon: info.icons.includes(item.icon) ? item.icon : info.icons[0],
    suggestedLocation: zone,
    allowedLocations: info.allowed.includes(zone) ? info.allowed : [zone, ...info.allowed],
    locationReason: zone === 'freezer-main' && category !== 'frozen' ? CATEGORIES.frozen.reason : info.reason,
    storageZone: item.storageZone ?? zone,
    storage: ZONES[item.storageZone ?? zone].storage,
    expiresAt,
    expiresEstimated: expiresAt !== null && !item.expiresAt,
    quantity,
    unit: outUnit,
    weightKg,
    weightEstimated: weightIsEstimate,
    detailsSource: source,
  }
}

/** The same details using only the fixed rules (no AI, no network). */
export function enrichWithRules(items, { today = new Date() } = {}) {
  return items.map((item) => {
    const r = fromRules(item)
    const category = r.category ?? 'other'
    const found = r.category !== null
    return build(item, { category, zone: r.zone, days: found ? r.days : null, pieceKg: r.pieceKg, source: 'rules' }, today)
  })
}

// ----- the AI layer ---------------------------------------------------------------------------

const TOOL = {
  name: 'record_item_details',
  description: 'Record storage details for each grocery item.',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            index: { type: 'integer', description: 'The index of the item in the input list.' },
            category: { type: 'string', enum: CATEGORY_IDS },
            icon: { type: 'string', enum: ALL_ICONS, description: 'An icon that belongs to the chosen category.' },
            location: { type: 'string', enum: ZONE_IDS },
            shelf_life_days: {
              type: ['integer', 'null'],
              description: 'Typical days the UNOPENED item stays good in that location, counted from purchase. null for non-food.',
            },
            piece_weight_kg: {
              type: ['number', 'null'],
              description: 'Typical weight in kg of ONE piece/pack as bought. null if unknown.',
            },
          },
          required: ['index', 'category', 'location', 'shelf_life_days', 'piece_weight_kg'],
        },
      },
    },
    required: ['items'],
  },
}

const SYSTEM = `You help a household food-inventory app. For each grocery item name, choose its category, the best place to keep it, a typical shelf life and a typical weight. Follow food-safety guidance (USDA FoodKeeper / FDA Food Code):
- Raw meat, poultry and fish: lower-shelf (below ready-to-eat food).
- Milk, yoghurt, cheese, eggs: middle-shelf or upper-shelf, never the door.
- Ready-to-eat food (deli, sandwiches, leftovers): upper-shelf.
- Fresh vegetables and most fruit: crisper. Tropical fruit, tomatoes: dry-storage until ripe.
- Potatoes, onions, garlic, bread, dry goods, canned food, snacks: dry-storage.
- Sauces, juices: door once chilled; unopened shelf-stable ones: dry-storage.
- Frozen items: freezer-main. Non-food items: category non_food.
Use only the allowed values. Be conservative with shelf life: a shorter number is safer. Item names may be abbreviated or misspelled receipt text.`

async function askAi(unknownItems, { fetchImpl, apiKey, model }) {
  const response = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: TOOL.name },
      messages: [
        {
          role: 'user',
          content: `Item names:\n${unknownItems.map((item, i) => `${i}. ${item.receiptName ?? item.name}`).join('\n')}`,
        },
      ],
    }),
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`AI request failed (${response.status})`)
  const data = await response.json()
  const block = (data.content ?? []).find((b) => b.type === 'tool_use' && b.name === TOOL.name)
  return Array.isArray(block?.input?.items) ? block.input.items : []
}

/** Check one AI answer against the fixed rules. Anything outside the rules is replaced or dropped. */
export function checkAiAnswer(answer) {
  const category = CATEGORY_IDS.includes(answer?.category) ? answer.category : 'other'
  const info = CATEGORIES[category]
  // The location must be allowed for the category; otherwise the category's default is used.
  const zone = ZONE_IDS.includes(answer?.location) && info.allowed.includes(answer.location) ? answer.location : info.zone
  const storage = ZONES[zone].storage
  // Cap the AI's shelf life at twice the guideline for that category (and at one year).
  const guide = shelfDays(category, storage)
  const cap = Math.min(365, guide ? guide * 2 : 30)
  const raw = Number(answer?.shelf_life_days)
  const days = category === 'non_food' || !Number.isFinite(raw) || raw < 1 ? guide : Math.min(Math.round(raw), cap)
  const kg = Number(answer?.piece_weight_kg)
  const pieceKg = Number.isFinite(kg) && kg > 0 && kg <= 25 ? round(kg, 3) : null
  return { category, zone, days: category === 'non_food' ? null : days, pieceKg, icon: answer?.icon }
}

/**
 * Add category, icon, suggested location, estimated use-by date and estimated weight to each item.
 * @param {Array<object>} items items with at least { name }; may have receiptName, quantity, unit,
 *   purchasedAt ('YYYY-MM-DD'), expiresAt, weightKg, storageZone
 * @param {{ today?: Date, fetchImpl?: typeof fetch, apiKey?: string, model?: string }} [options]
 * @returns {Promise<{ items: object[], aiUsed: boolean }>} same order as the input
 */
export async function enrichItems(items, options = {}) {
  const {
    today = new Date(),
    fetchImpl = globalThis.fetch,
    apiKey = process.env.ANTHROPIC_API_KEY,
    model = process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5',
  } = options

  const rules = items.map(fromRules)
  // Ask the AI only about items the rules do not know (and that are not obviously non-food).
  const unknown = items
    .map((item, index) => ({ item, index }))
    .filter(({ index }) => rules[index].category === null)
    .slice(0, MAX_AI_ITEMS)

  const decisions = new Map()
  let aiUsed = false
  if (unknown.length && apiKey && typeof fetchImpl === 'function') {
    try {
      const answers = await askAi(unknown.map((u) => u.item), { fetchImpl, apiKey, model })
      for (const answer of answers) {
        const target = unknown[answer?.index]
        if (target) decisions.set(target.index, checkAiAnswer(answer))
      }
      aiUsed = decisions.size > 0
    } catch (error) {
      console.error('AI details unavailable, using the built-in rules only:', error.message)
    }
  }

  const result = items.map((item, index) => {
    const r = rules[index]
    const ai = decisions.get(index)
    if (r.category !== null) {
      return build(item, { category: r.category, zone: r.zone, days: r.days, pieceKg: r.pieceKg, source: 'rules' }, today)
    }
    if (ai) {
      const frozen = r.frozen
      const category = frozen ? 'frozen' : ai.category
      const zone = frozen ? 'freezer-main' : ai.zone
      const days = frozen ? shelfDays('frozen', 'freezer') : ai.days
      return build({ ...item, icon: item.icon ?? ai.icon }, { category, zone, days, pieceKg: ai.pieceKg, source: 'ai' }, today)
    }
    return build(item, { category: 'other', zone: r.zone, days: null, pieceKg: null, source: 'rules' }, today)
  })
  return { items: result, aiUsed }
}
