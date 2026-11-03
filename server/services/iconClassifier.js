// Picks the icon and colour for each food name. The app's own keyword list is only a fallback for
// when this cannot answer.
//
// The AI (Claude) may only CHOOSE from fixed lists: an icon from the app's icon library and a colour
// from the icon palette. It never draws anything. Every answer is checked against those lists before
// it is returned; an icon or colour outside them is dropped and the app uses its own fallback.
// If the AI is not configured, times out or answers badly, nothing is returned and the app keeps
// showing its built-in icons, so an icon never disappears because of the AI.
//
// Only food NAMES are sent to the AI: never quantities, dates, the user's id or email.
import { CATEGORY_IDS } from './storageGuide.js'

const AI_TIMEOUT_MS = 15000
const MAX_NAMES = 50
const MAX_CACHE = 2000

// Copies of the client's library ids (client/src/utils/foodIcons.js) and palette
// (client/src/utils/foodColours.js). A server test checks that they still match.
export const FOOD_ICON_IDS = [
  'apple', 'pear', 'orange', 'lemon', 'banana', 'grapes', 'strawberry', 'blueberry', 'cherry', 'peach',
  'mango', 'pineapple', 'watermelon', 'melon', 'coconut', 'kiwi', 'avocado',
  'leafy', 'broccoli', 'carrot', 'cucumber', 'corn', 'tomato', 'eggplant', 'pepper', 'chilli', 'mushroom',
  'potato', 'sweetPotato', 'onion', 'garlic', 'pumpkin',
  'steak', 'drumstick', 'bacon', 'sausage', 'fish', 'shrimp', 'crab', 'octopus', 'shell', 'sushi',
  'milk', 'cheese', 'butter', 'yoghurt', 'iceCream', 'egg',
  'bread', 'croissant', 'baguette', 'bagel', 'pancake', 'rice', 'noodles', 'cereal', 'grain',
  'juice', 'bottle', 'softDrink', 'coffee', 'tea', 'beer', 'wine', 'water',
  'jar', 'honey', 'salt', 'can', 'beans', 'tofu', 'nut', 'chocolate', 'cookie', 'candy', 'snack', 'cake',
  'sandwich', 'pizza', 'burger', 'salad', 'soup', 'dumpling', 'ice', 'box',
]

export const FOOD_COLOURS = {
  red: '#F48678',
  deepRed: '#F2665A',
  coral: '#FFAA8A',
  peach: '#FFB8A0',
  pink: '#F4A6C0',
  orange: '#FFB35C',
  amber: '#FFC15C',
  yellow: '#FFD66B',
  paleYellow: '#FFE9A0',
  cream: '#F7F1DE',
  white: '#FFFFFF',
  lime: '#C8DB72',
  green: '#91D985',
  darkGreen: '#6FB46A',
  lavender: '#B9A0E0',
  purple: '#A88BD8',
  wine: '#C46B8A',
  blue: '#8FA8E8',
  aqua: '#9ADCEB',
  tan: '#E8B877',
  brown: '#C9A27E',
  darkBrown: '#A9785A',
  charcoal: '#7A7480',
}
const COLOUR_IDS = Object.keys(FOOD_COLOURS)

const TOOL = {
  name: 'record_food_icons',
  description: 'Record the icon and natural colour chosen for each food name.',
  input_schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            index: { type: 'integer', description: 'The index of the food in the input list.' },
            name: { type: 'string', description: 'The plain food name, e.g. "Green apple".' },
            category: { type: 'string', enum: CATEGORY_IDS },
            icon: { type: 'string', enum: FOOD_ICON_IDS, description: 'The library icon closest to this food.' },
            colour: { type: 'string', enum: COLOUR_IDS, description: 'The food\'s own natural colour.' },
          },
          required: ['index', 'name', 'category', 'icon', 'colour'],
        },
      },
    },
    required: ['items'],
  },
}

const SYSTEM = `You choose icons for a household food-inventory app. For each food name, identify the real food, then:
- icon: the closest icon from the allowed list. Prefer the specific food (lychee -> cherry, durian -> pineapple, bok choy -> leafy, dragon fruit -> peach). Dishes use the dish icon (laksa -> soup). Use "box" only when you cannot tell what the item is.
- colour: the colour of the food itself as people see it, not its packaging. A green apple is lime or green, a red apple is red, a purple sweet potato is purple, a lime is green, salmon is coral, dark chocolate is darkBrown. For a drink, use the colour people associate with it: cola is red, orange juice is orange, coffee is brown. Use only the allowed values.
- category: the food's category from the allowed list.
Item names may be abbreviated or misspelled receipt text.`

const cache = new Map()
export const normaliseName = (name) => String(name ?? '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 100)

/** Check one AI answer against the fixed lists. Returns null when the icon or colour is not allowed. */
export function checkIconAnswer(answer, inputName) {
  if (!FOOD_ICON_IDS.includes(answer?.icon) || !COLOUR_IDS.includes(answer?.colour)) return null
  const name = typeof answer.name === 'string' && answer.name.trim() ? answer.name.trim().slice(0, 100) : inputName
  return {
    name,
    category: CATEGORY_IDS.includes(answer.category) ? answer.category : 'other',
    icon: answer.icon,
    colour: answer.colour,
    hex: FOOD_COLOURS[answer.colour],
  }
}

async function askAi(names, { fetchImpl, apiKey, model }) {
  const response = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: TOOL.name },
      messages: [{ role: 'user', content: `Food names:\n${names.map((name, i) => `${i}. ${name}`).join('\n')}` }],
    }),
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`AI request failed (${response.status})`)
  const data = await response.json()
  const block = (data.content ?? []).find((b) => b.type === 'tool_use' && b.name === TOOL.name)
  return Array.isArray(block?.input?.items) ? block.input.items : []
}

/**
 * The icon and colour for each food name, as { input, name, category, icon, colour, hex }.
 * Names the AI could not classify are left out; the app then uses its own fallback for them.
 * @param {string[]} names
 * @param {{ fetchImpl?: typeof fetch, apiKey?: string, model?: string }} [options]
 * @returns {Promise<{ items: object[], aiStatus: 'used'|'not_needed'|'not_configured'|'failed' }>}
 */
export async function classifyFoodIcons(names, options = {}) {
  const {
    fetchImpl = globalThis.fetch,
    apiKey = process.env.ANTHROPIC_API_KEY,
    model = process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5',
  } = options

  const wanted = [...new Set(names.map(normaliseName).filter(Boolean))].slice(0, MAX_NAMES)
  const unknown = wanted.filter((name) => !cache.has(name))
  let aiStatus = unknown.length === 0 ? 'not_needed' : apiKey ? 'failed' : 'not_configured'

  if (unknown.length && apiKey && typeof fetchImpl === 'function') {
    try {
      const answers = await askAi(unknown, { fetchImpl, apiKey, model })
      for (const answer of answers) {
        const input = unknown[answer?.index]
        const checked = input && checkIconAnswer(answer, input)
        if (!checked) continue
        if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value)
        cache.set(input, checked)
        aiStatus = 'used'
      }
    } catch (error) {
      console.error('AI icon colours unavailable, the app will use its built-in icons:', error.message)
    }
  }

  const items = wanted.filter((name) => cache.has(name)).map((input) => ({ input, ...cache.get(input) }))
  return { items, aiStatus }
}

/** For tests: forget earlier answers. */
export const clearIconCache = () => cache.clear()
