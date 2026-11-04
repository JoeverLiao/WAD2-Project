// The places and categories offered on the item forms. They must match the server's storage rules
// (server/services/storageGuide.js): a server test checks that they do. The Smart Fridge page can reuse them.

// Where an item is kept. storage = fridge, freezer or pantry.
export const ZONES = [
  { value: 'upper-shelf', label: 'Upper shelf', icon: '⬆️', storage: 'fridge' },
  { value: 'middle-shelf', label: 'Middle shelf', icon: '➡️', storage: 'fridge' },
  { value: 'lower-shelf', label: 'Lower shelf', icon: '⬇️', storage: 'fridge' },
  { value: 'door', label: 'Fridge door', icon: '🚪', storage: 'fridge' },
  { value: 'door-lower', label: 'Lower door shelf', icon: '🚪', storage: 'fridge' },
  { value: 'crisper', label: 'Crisper drawer', icon: '🥬', storage: 'fridge' },
  { value: 'freezer-main', label: 'Freezer', icon: '❄️', storage: 'freezer' },
  { value: 'dry-storage', label: 'Pantry / dry storage', icon: '🗄️', storage: 'pantry' },
]

// Food categories, each with a few fixed icons to choose from.
export const CATEGORIES = [
  { value: 'dairy', label: 'Dairy', icons: ['🥛', '🧀', '🧈', '🍼', '🥣'] },
  { value: 'eggs', label: 'Eggs', icons: ['🥚', '🍳'] },
  { value: 'meat', label: 'Meat & poultry', icons: ['🥩', '🍗', '🥓', '🍖', '🌭'] },
  { value: 'seafood', label: 'Fish & seafood', icons: ['🐟', '🦐', '🦑', '🦀', '🦞', '🐙', '🍣', '🦪', '🐠'] },
  { value: 'ready_to_eat', label: 'Ready-to-eat & deli', icons: ['🥪', '🍱', '🥗', '🍕', '🌯', '🥙', '🍔', '🍜', '🍲', '🥟', '🍛', '🍝'] },
  { value: 'plant_protein', label: 'Tofu & plant protein', icons: ['🫘', '🌱', '🥜'] },
  { value: 'vegetables', label: 'Vegetables', icons: ['🥬', '🥦', '🥕', '🥒', '🌽', '🍅', '🍆', '🫑', '🌶️', '🍄', '🥗'] },
  { value: 'root_vegetables', label: 'Potatoes, onions & garlic', icons: ['🥔', '🧅', '🧄', '🍠', '🎃'] },
  { value: 'fruit', label: 'Fruit', icons: ['🍎', '🍏', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝'] },
  { value: 'bakery', label: 'Bread & bakery', icons: ['🍞', '🥐', '🥖', '🥯', '🥨', '🧇', '🥞', '🍰', '🎂', '🧁', '🥧', '🍩', '🍪'] },
  { value: 'beverages', label: 'Drinks', icons: ['🧃', '🥤', '🍺', '🍷', '☕', '🍵', '🧋', '💧', '🍶', '🍾', '🍹'] },
  { value: 'condiments', label: 'Sauces & spreads', icons: ['🧂', '🫙', '🍯', '🍶', '🥄'] },
  { value: 'pantry_staples', label: 'Dry goods', icons: ['🍚', '🍝', '🍜', '🥣', '🌾', '🫒', '☕', '🍵'] },
  { value: 'snacks', label: 'Snacks & sweets', icons: ['🍫', '🍪', '🥜', '🍿', '🍬', '🍭', '🥨', '🍘', '🌰'] },
  { value: 'canned', label: 'Canned food', icons: ['🥫'] },
  { value: 'frozen', label: 'Frozen food', icons: ['🧊', '🍦', '🍨', '🍧', '❄️'] },
  { value: 'non_food', label: 'Not food', icons: ['📦', '🧴', '🧻', '🧽', '🐾'] },
  { value: 'other', label: 'Other / unknown', icons: ['📦', '🍽️', '❓'] },
]

export const ZONE_VALUES = ZONES.map((z) => z.value)
export const CATEGORY_VALUES = CATEGORIES.map((c) => c.value)

export const zoneByValue = (value) => ZONES.find((z) => z.value === value) ?? null
export const categoryByValue = (value) => CATEGORIES.find((c) => c.value === value) ?? null

// Diet labels shown as a big badge on every item. Meaning:
//  vegan = no animal products; vegetarian = no meat or fish (may have egg, dairy, honey);
//  other = contains meat or fish; unknown = cannot tell from the name, check the pack.
export const DIETS = [
  { value: 'vegan', label: 'Vegan', icon: '🌱', description: 'No animal products' },
  { value: 'vegetarian', label: 'Vegetarian', icon: '🥚', description: 'No meat or fish; may contain egg, dairy or honey' },
  { value: 'other', label: 'Contains meat or fish', icon: '🍖', description: 'Contains meat, fish or gelatine' },
  { value: 'unknown', label: 'Check the label', icon: '❓', description: 'We cannot tell from the name' },
]
export const DIET_VALUES = DIETS.map((d) => d.value)
export const dietByValue = (value) => DIETS.find((d) => d.value === value) ?? null
