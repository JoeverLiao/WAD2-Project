// The fixed colour palette for food icons. An icon keeps its shape but is filled with ONE of these
// colours: the food's own natural colour, so a green apple and a red apple share the apple shape but
// not its colour. The colours come from the library's own artwork so every icon stays in the Figma style.
// A copy of this palette is in server/services/iconClassifier.js for the AI to choose from.
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

export const isFoodColour = (id) => Object.hasOwn(FOOD_COLOURS, id)

// FALLBACK ONLY: the AI chooses each food's colour (foodIconClassifier.js). These words are used
// while it has not answered, or when it cannot (no key, offline).
// Named varieties are checked before plain colour words, so "red onion" is purple, not red,
// and "pink lady apple" is red. Without either, the icon keeps its own library colour.
const VARIETIES = [
  ['purple', ['red onion', 'red cabbage', 'plum', 'blackberry', 'blackberries']],
  ['wine', ['beetroot', 'beet']],
  ['green', ['granny smith', 'lime', 'spring onion', 'scallion', 'leek', 'zucchini', 'courgette', 'edamame', 'pea', 'okra', 'matcha']],
  ['red', ['fuji', 'gala', 'honeycrisp', 'pink lady', 'cranberry', 'cranberries', 'raspberry', 'raspberries', 'tuna', 'lobster']],
  ['coral', ['salmon']],
  ['pink', ['grapefruit', 'dragon fruit', 'dragonfruit', 'pork']],
  ['orange', ['orange juice', 'cantaloupe', 'papaya', 'apricot', 'persimmon', 'butternut']],
  ['cream', ['blue cheese', 'cauliflower', 'cod', 'daikon']],
  ['tan', ['ginger', 'wholemeal', 'whole wheat', 'wholegrain']],
  ['darkBrown', ['dark chocolate', 'raisin', 'prune', 'soy sauce']],
  ['charcoal', ['squid ink', 'nori', 'seaweed']],
]
const COLOUR_WORDS = [
  ['red', ['red']],
  ['green', ['green']],
  ['yellow', ['yellow', 'golden']],
  ['purple', ['purple', 'violet']],
  ['pink', ['pink']],
  ['cream', ['white']],
  ['brown', ['brown']],
  ['charcoal', ['black']],
  ['blue', ['blue']],
]

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const toPatterns = (list) =>
  list.map(([id, words]) => [id, new RegExp(`(?:^|[^a-z])(?:${words.map(escape).join('|')})(?:s|es)?(?![a-z])`)])
const VARIETY_PATTERNS = toPatterns(VARIETIES)
const COLOUR_PATTERNS = toPatterns(COLOUR_WORDS)

/** The palette colour a food name asks for ("green apple" -> green), or null when it names none. */
export function foodColourForName(name = '') {
  const value = String(name ?? '').toLowerCase()
  if (!value.trim()) return null
  const match = ([, pattern]) => pattern.test(value)
  return VARIETY_PATTERNS.find(match)?.[0] ?? COLOUR_PATTERNS.find(match)?.[0] ?? null
}
