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
import { classifyItem, dietFromText } from './foodKnowledge.js'
import { storageGuidance } from './storageGuidance.js'
import {
  ALL_ICONS,
  CATEGORIES,
  CATEGORY_DIET,
  CATEGORY_IDS,
  DIETS,
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
    diet: info.diet,
  }
}

/** Build the final detail fields for an item from a category/zone/days/weight decision. */
function build(item, { category, zone, days, pieceKg, diet, source }, today) {
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
    quantity = 1 // one purchase of this item; the weight says how much
    outUnit = 'pieces'
  } else if (weightKg === null && quantity) {
    const printed = packWeightKg(item.receiptName ?? item.name)
    const count = packCount(item.receiptName ?? item.name)
    if (printed !== null) weightKg = round(printed * quantity, 3)
    else if (count !== null && pieceKg) weightKg = round(count * pieceKg * quantity, 3)
    else if (pieceKg) weightKg = round(pieceKg * quantity, 3)
    weightIsEstimate = weightKg !== null
  }

  const placement = storageGuidance({ ...item, category, suggestedLocation: zone })
  // State overrides must not inherit a dry product's long shelf-life estimate.
  let estimateDays = days
  if (days && !['dry-storage', 'freezer-main'].includes(placement.suggestedLocation)) {
    const text = `${item.name} ${item.receiptName || ''}`.toLowerCase()
    let cap
    if (/\b(thawed|defrosted)\b|\b(?:cooked|fried) rice\b|\b(risotto|congee)\b/.test(text)) cap = 1
    else if (/hard[ -]?(?:boiled|cooked) eggs?/.test(text)) cap = 7
    else if (/\b(cooked|leftovers?|rotisserie|fried|steamed|boiled|opened|cut|chopped|sliced|peeled|diced)\b|soup|stew|curry|custard|cream filled|fresh pasta|fresh noodles/.test(text)) cap = 3
    if (cap) estimateDays = Math.min(days, cap)
  }
  const expiresAt = item.expiresAt ?? (estimateDays ? addDays(baseDate, estimateDays) : null)
  return {
    category,
    icon: info.icons.includes(item.icon) ? item.icon : info.icons[0],
    ...placement,
    storageZone: item.storageZone ?? placement.suggestedLocation,
    storage: ZONES[item.storageZone ?? placement.suggestedLocation].storage,
    expiresAt,
    expiresEstimated: expiresAt !== null && !item.expiresAt,
    quantity,
    unit: outUnit,
    weightKg,
    weightEstimated: weightIsEstimate,
    dietType: category === 'non_food' ? null : (diet ?? CATEGORY_DIET[category] ?? 'unknown'),
    detailsSource: source,
  }
}

/** The same details using only the fixed rules (no AI, no network). */
export function enrichWithRules(items, { today = new Date() } = {}) {
  return items.map((item) => {
    const r = fromRules(item)
    const category = r.category ?? 'other'
    const found = r.category !== null
    return build(item, { category, zone: r.zone, days: found ? r.days : null, pieceKg: r.pieceKg, diet: r.diet, source: 'rules' }, today)
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
            standard_name: {
              type: 'string',
              description: 'The plain English name of the food: singular, no brand, origin, size or shop code. Example: "AUST JPN PUMPKIN" -> "Pumpkin", "CHKN BRST 500G" -> "Chicken Breast".',
            },
            category: { type: 'string', enum: CATEGORY_IDS },
            icon: { type: 'string', enum: ALL_ICONS, description: 'An icon that belongs to the chosen category.' },
            location: { type: 'string', enum: ZONE_IDS },
            shelf_life_days: {
              type: ['integer', 'null'],
              description: 'Typical days the UNOPENED item stays good in that location, counted from purchase. null for non-food.',
            },
            diet: {
              type: 'string',
              enum: DIETS,
              description: 'vegan = no animal products at all; vegetarian = no meat or fish but may have egg, dairy or honey; other = contains meat, fish or gelatine; unknown = cannot tell from the name.',
            },
            piece_weight_kg: {
              type: ['number', 'null'],
              description: 'Typical weight in kg of ONE piece/pack as bought. null if unknown.',
            },
          },
          required: ['index', 'standard_name', 'category', 'location', 'shelf_life_days', 'piece_weight_kg', 'diet'],
        },
      },
    },
    required: ['items'],
  },
}

const SYSTEM = `You help a household food-inventory app. For each grocery item name, choose its category, the best place to keep it, a typical shelf life and a typical weight. Follow food-safety guidance (USDA FoodKeeper / FDA Food Code):
Always identify the real food first. Examples: raspberry, blueberry, cherry, lychee, durian, jackfruit, pomelo and every other berry, melon, citrus and tropical fruit are category "fruit"; fresh herbs, sprouts and leafy greens are "vegetables"; a muffin, cake or pie is "bakery" even when named after a fruit; a sauce, paste or jam is "condiments". Use "other" only when you truly cannot tell what the item is.
- Raw meat, poultry and fish: lower-shelf (below ready-to-eat food).
- Milk, yoghurt, cheese, eggs: middle-shelf or upper-shelf, never the door.
- Ready-to-eat food (deli, sandwiches, leftovers): upper-shelf.
- Fresh vegetables and most fruit (berries, grapes, cherries, apples, pears, citrus, melons, lychee): crisper. Fruit that ripens at room temperature (banana, avocado, mango, papaya, pineapple, durian, guava) and tomatoes: dry-storage.
- Potatoes, onions, garlic, bread, dry goods, canned food, snacks: dry-storage.
- Sauces, juices: door once chilled; unopened shelf-stable ones: dry-storage.
- Frozen items: freezer-main. Non-food items: category non_food.
Choose the icon from the allowed list so it matches the food (for example 🍓 for strawberry-like berries, 🫐 for blueberries, 🍒 for cherries). Use only the allowed values. Be conservative with shelf life: a shorter number is safer. Item names are receipt text: they can be abbreviated, run together without spaces or misspelled. Work out the real food first. Common receipt abbreviations: AUST = Australian, JPN = Japanese, NZ = New Zealand, ORG = organic, BNLS = boneless, SKNLS = skinless, CHKN = chicken, BRST = breast, FRZ/FRZN = frozen, LG/SM/MED = size, PKT/PK = pack, VEG = vegetable, TOM = tomato, POT = potato, WHL = whole, SLCD = sliced, FLV = flavour, UHT = long-life milk. Origins, brands and sizes are not part of the food's name: "AUST JPN PUMPKIN" is a pumpkin. Give the standard_name as the plain food name.`

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

/**
 * The AI's diet label is checked against the category so a wrong "vegan" can never slip through:
 * meat and fish are never vegan or vegetarian; fruit and vegetables are always vegan; dairy and eggs
 * are never "vegan" (plant milks are in the rules table, not here).
 */
export function checkAiDiet(category, diet) {
  if (category === 'non_food') return null
  if (category === 'meat' || category === 'seafood') return 'other'
  if (category === 'fruit' || category === 'vegetables' || category === 'root_vegetables') return 'vegan'
  if (category === 'dairy' || category === 'eggs') return 'vegetarian'
  return DIETS.includes(diet) ? diet : (CATEGORY_DIET[category] ?? 'unknown')
}

/** A clean food name from the AI, or null when it is empty, too long or has odd characters. */
export function cleanStandardName(value) {
  if (typeof value !== 'string') return null
  const name = value.replace(/\s+/g, ' ').trim()
  if (name.length < 2 || name.length > 40 || !/^[A-Za-z][A-Za-z '&-]*$/.test(name)) return null
  return name
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
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
  return {
    category,
    zone,
    days: category === 'non_food' ? null : days,
    pieceKg,
    icon: answer?.icon,
    diet: checkAiDiet(category, answer?.diet),
    name: cleanStandardName(answer?.standard_name),
  }
}

/**
 * Add category, icon, suggested location, estimated use-by date and estimated weight to each item.
 * @param {Array<object>} items items with at least { name }; may have receiptName, quantity, unit,
 *   purchasedAt ('YYYY-MM-DD'), expiresAt, weightKg, storageZone
 * @param {{ today?: Date, fetchImpl?: typeof fetch, apiKey?: string, model?: string }} [options]
 * @returns {Promise<{ items: object[], aiUsed: boolean, aiStatus: 'used'|'not_needed'|'not_configured'|'failed' }>}
 *   items are in the same order as the input
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
  // Why the AI was or was not used, so the form can tell the user instead of failing silently.
  let aiStatus = unknown.length === 0 ? 'not_needed' : apiKey ? 'failed' : 'not_configured'
  if (unknown.length && apiKey && typeof fetchImpl === 'function') {
    try {
      const answers = await askAi(unknown.map((u) => u.item), { fetchImpl, apiKey, model })
      for (const answer of answers) {
        const target = unknown[answer?.index]
        if (target) decisions.set(target.index, checkAiAnswer(answer))
      }
      aiUsed = decisions.size > 0
      aiStatus = aiUsed ? 'used' : 'failed'
    } catch (error) {
      console.error('AI details unavailable, using the built-in rules only:', error.message)
    }
  }

  const result = items.map((item, index) => {
    const r = rules[index]
    const ai = decisions.get(index)
    if (r.category !== null) {
      return build(item, { category: r.category, zone: r.zone, days: r.days, pieceKg: r.pieceKg, diet: r.diet, source: 'rules' }, today)
    }
    if (ai) {
      // The AI told us what the food really is. If our rules know that food, they decide everything
      // (the rules are more reliable than the AI); otherwise the checked AI answer is used.
      // Recognition names are internal to classification; only derived details are returned.
      const known = ai.name ? classifyItem(ai.name) : null
      if (known?.category) {
        const named = { ...item, name: known.canonicalName ?? ai.name, icon: item.icon }
        return build(named, { category: known.category, zone: known.zone, days: known.days, pieceKg: known.pieceKg ?? ai.pieceKg, diet: dietFromText(item.receiptName ?? item.name) ?? known.diet, source: 'ai' }, today)
      }
      const frozen = r.frozen
      const category = frozen ? 'frozen' : ai.category
      const zone = frozen ? 'freezer-main' : ai.zone
      const days = frozen ? shelfDays('frozen', 'freezer') : ai.days
      return build({ ...item, icon: item.icon ?? ai.icon }, { category, zone, days, pieceKg: ai.pieceKg, diet: dietFromText(item.receiptName ?? item.name) ?? ai.diet, source: 'ai' }, today)
    }
    return build(item, { category: 'other', zone: r.zone, days: null, pieceKg: null, diet: r.diet, source: 'rules' }, today)
  })
  return { items: result, aiUsed, aiStatus }
}

// Expiry dates are calendar days encoded as UTC dates (including legacy midnight and noon values).
export function expiryDateKey(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : null
}

/**
 * Combine repeated product names in the same expiry batch after details are added.
 * Quantities, prices and weights are added up; classification labels are not product identities.
 */
export function mergeDuplicateItems(items) {
  const groups = new Map()
  for (const item of items) {
    const key = JSON.stringify([String(item.name).toLowerCase(), item.unit ?? '', item.storage, expiryDateKey(item.expiresAt)])
    const group = groups.get(key)
    if (!group) {
      groups.set(key, { ...item, warnings: [...(item.warnings ?? [])] })
      continue
    }
    group.quantity = round((group.quantity ?? 0) + (item.quantity ?? 0), 3)
    if (item.price !== null && item.price !== undefined) group.price = round((group.price ?? 0) + item.price, 2)
    if (item.weightKg) group.weightKg = round((group.weightKg ?? 0) + item.weightKg, 3)
    for (const warning of item.warnings ?? []) if (!group.warnings.includes(warning)) group.warnings.push(warning)
    group.rawLine = `${group.rawLine ?? ''} + ${item.rawLine ?? ''}`
  }
  return [...groups.values()]
}
