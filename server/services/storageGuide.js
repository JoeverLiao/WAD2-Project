// The storage rules used to suggest WHERE each food should be kept, how long it lasts and what it
// weighs. These are fixed, reviewable rules (not an AI's guess): the AI is only used for foods this
// table does not know, and its answers are always checked against these rules (itemEnrichment.js).
//
// Where the rules come from (general food-safety guidance, summarised):
//  - FDA Food Code, storage order: raw meat, poultry and fish go BELOW ready-to-eat food so that
//    raw juices cannot drip onto food that will not be cooked. In a home fridge: the lowest shelf.
//  - Refrigerators should run at or below about 4-5 degrees C, and the DOOR is the warmest, most
//    changeable spot (it warms every time it is opened), so milk and eggs belong on a shelf.
//  - Freezers should hold -18 degrees C or colder.
//  - USDA FoodKeeper / FSIS: approximate fridge, freezer and pantry storage times per food.
//  - Potatoes, onions and garlic keep best cool, dark and dry; cold turns potato starch into sugar.
//  - Bread goes stale fastest at fridge temperatures (starch retrogradation): room temperature or freezer.
//  - Bananas, avocados, mangoes, tomatoes and similar ripen at room temperature; chilling them
//    before they are ripe damages flavour and texture ("chill injury").
// Examples of sources: https://extension.illinois.edu/food-safety/refrigerator-storage ,
// https://livesmartohio.osu.edu/food/shumaker-68osu-edu/refrigerator-storage-what-goes-where
//
// IMPORTANT: storage days below are rounded, conservative values for UNOPENED food from the day
// of purchase. They are estimates; the user can always change the date on the form.

// The places in the Smart Fridge page (the names must match client/src/utils/inventoryOptions.js).
export const ZONES = {
  'upper-shelf': { storage: 'fridge', label: 'Upper shelf' },
  'middle-shelf': { storage: 'fridge', label: 'Middle shelf' },
  'lower-shelf': { storage: 'fridge', label: 'Lower shelf' },
  door: { storage: 'fridge', label: 'Fridge door' },
  'door-lower': { storage: 'fridge', label: 'Lower door shelf' },
  crisper: { storage: 'fridge', label: 'Crisper drawer' },
  'freezer-main': { storage: 'freezer', label: 'Freezer' },
  'dry-storage': { storage: 'pantry', label: 'Pantry / dry storage' },
}
export const ZONE_IDS = Object.keys(ZONES)

const FRIDGE_SHELVES = ['middle-shelf', 'upper-shelf']

// id -> { label, icons (a few fixed choices), zone (default), allowed zones, days per storage type, reason }
export const CATEGORIES = {
  dairy: {
    label: 'Dairy',
    icons: ['🥛', '🧀', '🧈'],
    zone: 'middle-shelf',
    allowed: FRIDGE_SHELVES,
    days: { fridge: 10, freezer: 90 },
    reason: 'Dairy keeps best at a steady cold temperature. The door is the warmest, most variable spot, so use a middle or upper shelf.',
  },
  eggs: {
    label: 'Eggs',
    icons: ['🥚'],
    zone: 'middle-shelf',
    allowed: FRIDGE_SHELVES,
    days: { fridge: 28 },
    reason: 'Keep eggs in their carton on a shelf, not in the door, where the temperature swings every time it opens.',
  },
  meat: {
    label: 'Meat & poultry',
    icons: ['🥩', '🍗', '🥓'],
    zone: 'lower-shelf',
    allowed: ['lower-shelf'],
    days: { fridge: 3, freezer: 120 },
    reason: 'Raw meat and poultry go on the lowest shelf, sealed, so juices cannot drip onto ready-to-eat food (FDA Food Code storage order).',
  },
  seafood: {
    label: 'Fish & seafood',
    icons: ['🐟', '🦐', '🦑'],
    zone: 'lower-shelf',
    allowed: ['lower-shelf'],
    days: { fridge: 2, freezer: 120 },
    reason: 'Raw fish and seafood go on the lowest shelf, sealed, so juices cannot drip onto food that is eaten uncooked.',
  },
  ready_to_eat: {
    label: 'Ready-to-eat & deli',
    icons: ['🥪', '🍱', '🥗'],
    zone: 'upper-shelf',
    allowed: ['upper-shelf', 'middle-shelf'],
    days: { fridge: 4, freezer: 60 },
    reason: 'Food that is eaten without cooking goes on upper shelves, above raw meat, so it can never be contaminated by drips.',
  },
  plant_protein: {
    label: 'Tofu & plant protein',
    icons: ['🫘'],
    zone: 'middle-shelf',
    allowed: FRIDGE_SHELVES,
    days: { fridge: 7, freezer: 90 },
    reason: 'Tofu and tempeh are chilled foods: keep them on a shelf where the temperature is steady.',
  },
  vegetables: {
    label: 'Vegetables',
    icons: ['🥬', '🥦', '🥕'],
    zone: 'crisper',
    allowed: ['crisper', 'lower-shelf'],
    days: { fridge: 7, freezer: 240, pantry: 4 },
    reason: 'The crisper drawer has higher humidity, which slows wilting of fresh vegetables.',
  },
  root_vegetables: {
    label: 'Potatoes, onions & garlic',
    icons: ['🥔', '🧅', '🧄'],
    zone: 'dry-storage',
    allowed: ['dry-storage'],
    days: { pantry: 30 },
    reason: 'Potatoes, onions and garlic keep best cool, dark and dry. Cold turns potato starch into sugar, so do not refrigerate them.',
  },
  fruit: {
    label: 'Fruit',
    icons: ['🍎', '🍊', '🍇', '🍓'],
    zone: 'crisper',
    allowed: ['crisper', 'middle-shelf'],
    days: { fridge: 7, freezer: 240, pantry: 4 },
    reason: 'Ripe or cut fruit lasts longer chilled. Keep it apart from leafy vegetables, because some fruit gives off ethylene gas that makes greens spoil sooner.',
  },
  bakery: {
    label: 'Bread & bakery',
    icons: ['🍞', '🥐', '🍰'],
    zone: 'dry-storage',
    allowed: ['dry-storage', 'freezer-main'],
    days: { pantry: 4, freezer: 90 },
    reason: 'Bread goes stale fastest at fridge temperatures. Keep it at room temperature, or freeze it to keep it longer.',
  },
  beverages: {
    label: 'Drinks',
    icons: ['🧃', '🥤', '🍺'],
    zone: 'dry-storage',
    allowed: ['dry-storage', 'door'],
    days: { pantry: 180, fridge: 7 },
    reason: 'Unopened soft drinks, water and alcohol are shelf-stable. Chilled juice goes in the fridge door.',
  },
  condiments: {
    label: 'Sauces & spreads',
    icons: ['🧂', '🫙', '🍯'],
    zone: 'dry-storage',
    allowed: ['dry-storage', 'door'],
    days: { pantry: 180, fridge: 90 },
    reason: 'Salty, sour or sugary sauces cope with the door\'s changing temperature. Unopened jars are shelf-stable; refrigerate after opening.',
  },
  pantry_staples: {
    label: 'Dry goods',
    icons: ['🍚', '🍝', '🥣', '☕'],
    zone: 'dry-storage',
    allowed: ['dry-storage'],
    days: { pantry: 365 },
    reason: 'Dry foods keep best in a cool, dry cupboard away from heat, light and moisture.',
  },
  snacks: {
    label: 'Snacks & sweets',
    icons: ['🍫', '🍪', '🥜'],
    zone: 'dry-storage',
    allowed: ['dry-storage'],
    days: { pantry: 90 },
    reason: 'Snacks keep best in a cool, dry cupboard in a sealed pack.',
  },
  canned: {
    label: 'Canned food',
    icons: ['🥫'],
    zone: 'dry-storage',
    allowed: ['dry-storage'],
    days: { pantry: 365 },
    reason: 'Unopened cans are shelf-stable in a cool, dry cupboard.',
  },
  frozen: {
    label: 'Frozen food',
    icons: ['🧊', '🍦'],
    zone: 'freezer-main',
    allowed: ['freezer-main'],
    days: { freezer: 90 },
    reason: 'Frozen food belongs in the freezer, at -18 degrees C or colder.',
  },
  non_food: {
    label: 'Not food',
    icons: ['📦'],
    zone: 'dry-storage',
    allowed: ['dry-storage'],
    days: {},
    reason: 'This does not look like food, so it has no use-by date.',
  },
  other: {
    label: 'Other / unknown',
    icons: ['📦'],
    zone: 'dry-storage',
    allowed: ZONE_IDS,
    days: {},
    reason: 'We could not recognise this item, so please check where it should be kept.',
  },
}
export const CATEGORY_IDS = Object.keys(CATEGORIES)
export const ALL_ICONS = [...new Set(Object.values(CATEGORIES).flatMap((c) => c.icons))]

export function shelfDays(category, storage) {
  return CATEGORIES[category]?.days?.[storage] ?? null
}

// Typical weights, used when the receipt does not say. All in kg.
const PACK = /(\d+(?:\.\d+)?)\s*(kg|g|ml|l|litre|liter)\b/i
const COUNT_PACK = /\b(\d{1,3})\s?(?:s|pcs|pc|pack)\b/i

/** Weight in kg printed in the item name ("Chicken Breast 500g" -> 0.5, "Milk 1L" -> 1). */
export function packWeightKg(text) {
  const m = String(text ?? '').match(PACK)
  if (m) {
    const n = Number(m[1])
    const unit = m[2].toLowerCase()
    const kg = unit === 'kg' ? n : unit === 'g' || unit === 'ml' ? n / 1000 : n // litres ~ kg for drinks
    return kg > 0 && kg <= 50 ? Math.round(kg * 1000) / 1000 : null
  }
  return null
}

/** Number of pieces printed in the item name ("Eggs Large 10s" -> 10). */
export function packCount(text) {
  const m = String(text ?? '').match(COUNT_PACK)
  return m ? Number(m[1]) : null
}
