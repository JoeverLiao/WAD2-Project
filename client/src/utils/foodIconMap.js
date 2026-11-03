// Decides which icon from the library (foodIcons.js) a food uses. This is the only place that
// makes that choice, so the same food shows the same icon on every page.
//
// For a food item the order is:
//   1. its name  - so "Milk" is always the milk carton, whoever added it
//   2. its stored icon (the emoji saved with the item) - for names the list below does not know
//   3. its category
//   4. the default icon
import { DEFAULT_FOOD_ICON, FOOD_ICONS } from './foodIcons.js'

// Name keywords, checked in order: dishes and drinks come before their ingredients, so
// "apple juice" is juice and "banana bread" is bread. Words match whole words only, so
// "pineapple" is not an apple and "veggie" is not an egg. A trailing "s" or "es" also matches.
const NAME_KEYWORDS = [
  ['juice', ['juice', 'smoothie', 'lemonade']],
  ['softDrink', ['soda', 'cola', 'soft drink', 'bubble tea', 'milk tea', 'cocktail']],
  ['coffee', ['coffee', 'latte', 'espresso', 'cappuccino']],
  ['tea', ['tea', 'matcha']],
  ['beer', ['beer', 'ale', 'lager']],
  ['wine', ['wine', 'champagne', 'prosecco']],
  ['water', ['water', 'sparkling water']],
  ['iceCream', ['ice cream', 'gelato', 'sorbet', 'ice lolly', 'popsicle']],
  ['butter', ['butter', 'margarine', 'ghee']],
  ['yoghurt', ['yoghurt', 'yogurt', 'kefir', 'pudding']],
  ['cheese', ['cheese', 'cheddar', 'mozzarella', 'parmesan', 'feta', 'brie', 'halloumi', 'paneer']],
  ['milk', ['milk', 'cream', 'buttermilk']],
  ['honey', ['honey', 'syrup', 'maple syrup']],
  ['jar', ['sauce', 'ketchup', 'mayo', 'mayonnaise', 'pesto', 'jam', 'salsa', 'dressing', 'mustard', 'paste', 'pickle', 'kimchi', 'spread', 'nutella']],
  ['bottle', ['oil', 'olive oil', 'vinegar']],
  ['salt', ['salt', 'spice', 'black pepper', 'seasoning', 'cinnamon', 'paprika', 'cumin']],
  ['soup', ['soup', 'stew', 'curry', 'broth', 'stock']],
  ['salad', ['salad', 'coleslaw']],
  ['sandwich', ['sandwich', 'wrap', 'burrito', 'kebab', 'sub', 'taco']],
  ['pizza', ['pizza']],
  ['burger', ['burger', 'hamburger', 'cheeseburger']],
  ['dumpling', ['dumpling', 'gyoza', 'bao', 'wonton', 'spring roll']],
  ['sushi', ['sushi', 'sashimi', 'onigiri']],
  ['noodles', ['noodle', 'ramen', 'pasta', 'spaghetti', 'macaroni', 'udon', 'lasagne', 'lasagna', 'penne', 'fusilli']],
  ['rice', ['rice', 'risotto']],
  ['cereal', ['cereal', 'oat', 'oatmeal', 'porridge', 'granola', 'muesli', 'cornflakes']],
  ['croissant', ['croissant']],
  ['baguette', ['baguette']],
  ['bagel', ['bagel', 'pretzel']],
  ['pancake', ['pancake', 'waffle', 'crepe']],
  ['cake', ['cake', 'cupcake', 'muffin', 'pie', 'tart', 'donut', 'doughnut', 'brownie', 'pastry', 'danish']],
  ['cookie', ['cookie', 'biscuit']],
  ['bread', ['bread', 'loaf', 'toast', 'sourdough', 'bun', 'roti', 'naan', 'tortilla', 'pita']],
  ['chocolate', ['chocolate', 'cocoa']],
  ['candy', ['candy', 'sweets', 'gummy', 'gummies', 'lolly', 'lollies', 'marshmallow', 'jelly']],
  ['snack', ['chips', 'crisps', 'popcorn', 'cracker', 'snack', 'pretzels']],
  ['nut', ['nut', 'peanut', 'almond', 'cashew', 'walnut', 'pistachio', 'hazelnut', 'chestnut', 'pecan']],
  ['tofu', ['tofu', 'tempeh']],
  ['beans', ['bean', 'lentil', 'chickpea', 'edamame', 'hummus']],
  ['grain', ['flour', 'grain', 'quinoa', 'barley', 'wheat', 'couscous', 'semolina']],
  ['ice', ['ice', 'frozen']],
  ['can', ['canned', 'tinned']],
  ['sausage', ['sausage', 'hot dog', 'hotdog', 'frankfurter', 'chorizo', 'salami', 'pepperoni']],
  ['bacon', ['bacon', 'ham', 'prosciutto']],
  ['drumstick', ['chicken', 'drumstick', 'wing', 'turkey', 'duck', 'poultry', 'nugget']],
  ['steak', ['beef', 'steak', 'pork', 'lamb', 'mince', 'meat', 'mutton', 'veal', 'meatball']],
  ['shrimp', ['shrimp', 'prawn', 'lobster']],
  ['crab', ['crab']],
  ['octopus', ['squid', 'octopus', 'calamari']],
  ['shell', ['oyster', 'clam', 'mussel', 'scallop', 'shellfish']],
  ['fish', ['fish', 'salmon', 'tuna', 'cod', 'sardine', 'mackerel', 'tilapia', 'anchovy', 'anchovies', 'trout', 'seafood']],
  ['sweetPotato', ['sweet potato', 'yam']],
  ['eggplant', ['eggplant', 'aubergine', 'brinjal']],
  ['leafy', ['veggie', 'vegetable', 'lettuce', 'spinach', 'kale', 'cabbage', 'bok choy', 'pak choi', 'herb', 'basil', 'parsley', 'coriander', 'cilantro', 'mint', 'celery', 'asparagus', 'greens', 'rocket', 'arugula', 'sprout', 'leaves', 'leaf']],
  ['egg', ['egg']],
  ['pineapple', ['pineapple']],
  ['watermelon', ['watermelon']],
  ['melon', ['melon', 'honeydew', 'cantaloupe']],
  ['apple', ['apple']],
  ['pear', ['pear']],
  ['orange', ['orange', 'mandarin', 'clementine', 'tangerine', 'satsuma', 'grapefruit']],
  ['lemon', ['lemon', 'lime']],
  ['banana', ['banana', 'plantain']],
  ['grapes', ['grape', 'raisin']],
  ['strawberry', ['strawberry', 'strawberries', 'raspberry', 'raspberries']],
  ['blueberry', ['blueberry', 'blueberries', 'blackberry', 'blackberries', 'berry', 'berries']],
  ['cherry', ['cherry', 'cherries']],
  ['peach', ['peach', 'apricot', 'nectarine', 'plum']],
  ['mango', ['mango', 'papaya']],
  ['coconut', ['coconut']],
  ['kiwi', ['kiwi']],
  ['avocado', ['avocado']],
  ['broccoli', ['broccoli', 'cauliflower']],
  ['carrot', ['carrot']],
  ['cucumber', ['cucumber', 'zucchini', 'courgette']],
  ['corn', ['corn', 'sweetcorn']],
  ['tomato', ['tomato']],
  ['pepper', ['pepper', 'capsicum', 'bell pepper']],
  ['chilli', ['chilli', 'chillies', 'chili', 'chilies', 'jalapeno']],
  ['mushroom', ['mushroom', 'shiitake', 'enoki']],
  ['potato', ['potato']],
  ['onion', ['onion', 'shallot', 'leek', 'scallion', 'spring onion']],
  ['garlic', ['garlic', 'ginger']],
  ['pumpkin', ['pumpkin', 'squash']],
]

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const NAME_PATTERNS = NAME_KEYWORDS.map(([id, words]) => [
  id,
  new RegExp(`(?:^|[^a-z])(?:${words.map(escape).join('|')})(?:s|es)?(?![a-z])`),
])

// Every emoji the app stores for an item (inventoryOptions.js CATEGORIES) has a library icon.
const EMOJI_ICONS = {
  '🥛': 'milk', '🍼': 'milk', '🧀': 'cheese', '🧈': 'butter', '🥣': 'cereal',
  '🥚': 'egg', '🍳': 'egg',
  '🥩': 'steak', '🍗': 'drumstick', '🍖': 'drumstick', '🥓': 'bacon', '🌭': 'sausage',
  '🐟': 'fish', '🐠': 'fish', '🦐': 'shrimp', '🦞': 'shrimp', '🦀': 'crab', '🦑': 'octopus', '🐙': 'octopus', '🦪': 'shell', '🍣': 'sushi',
  '🥪': 'sandwich', '🌯': 'sandwich', '🥙': 'sandwich', '🍱': 'box', '🥗': 'salad', '🍕': 'pizza', '🍔': 'burger',
  '🍜': 'noodles', '🍝': 'noodles', '🍲': 'soup', '🍛': 'soup', '🥟': 'dumpling',
  '🫘': 'beans', '🌱': 'leafy', '🥜': 'nut', '🌰': 'nut',
  '🥬': 'leafy', '🥦': 'broccoli', '🥕': 'carrot', '🥒': 'cucumber', '🌽': 'corn', '🍅': 'tomato', '🍆': 'eggplant',
  '🫑': 'pepper', '🌶': 'chilli', '🍄': 'mushroom',
  '🥔': 'potato', '🧅': 'onion', '🧄': 'garlic', '🍠': 'sweetPotato', '🎃': 'pumpkin',
  '🍎': 'apple', '🍏': 'apple', '🍐': 'pear', '🍊': 'orange', '🍋': 'lemon', '🍌': 'banana', '🍉': 'watermelon', '🍇': 'grapes',
  '🍓': 'strawberry', '🫐': 'blueberry', '🍈': 'melon', '🍒': 'cherry', '🍑': 'peach', '🥭': 'mango', '🍍': 'pineapple', '🥥': 'coconut', '🥝': 'kiwi',
  '🍞': 'bread', '🥐': 'croissant', '🥖': 'baguette', '🥯': 'bagel', '🥨': 'bagel', '🧇': 'pancake', '🥞': 'pancake',
  '🍰': 'cake', '🎂': 'cake', '🧁': 'cake', '🥧': 'cake', '🍩': 'cake', '🍪': 'cookie',
  '🧃': 'juice', '🥤': 'softDrink', '🧋': 'softDrink', '🍹': 'softDrink', '🍺': 'beer', '🍷': 'wine', '🍾': 'wine',
  '☕': 'coffee', '🍵': 'tea', '💧': 'water', '🍶': 'bottle', '🫒': 'bottle',
  '🧂': 'salt', '🫙': 'jar', '🍯': 'honey', '🥄': 'jar',
  '🍚': 'rice', '🌾': 'grain',
  '🍫': 'chocolate', '🍿': 'snack', '🍘': 'snack', '🍬': 'candy', '🍭': 'candy',
  '🥫': 'can', '🧊': 'ice', '❄': 'ice', '🍦': 'iceCream', '🍨': 'iceCream', '🍧': 'iceCream',
  '📦': 'box', '🧴': 'box', '🧻': 'box', '🧽': 'box', '🐾': 'box', '🍽': 'box', '❓': 'box',
}

// Matches the category values in inventoryOptions.js.
const CATEGORY_ICONS = {
  dairy: 'milk',
  eggs: 'egg',
  meat: 'steak',
  seafood: 'fish',
  ready_to_eat: 'box',
  plant_protein: 'beans',
  vegetables: 'leafy',
  root_vegetables: 'potato',
  fruit: 'apple',
  bakery: 'bread',
  beverages: 'bottle',
  condiments: 'jar',
  pantry_staples: 'grain',
  snacks: 'snack',
  canned: 'can',
  frozen: 'ice',
  non_food: 'box',
  other: 'box',
}

/** The icon for a food name, or null when the name has no known food word in it. */
export function foodIconForName(name = '') {
  const value = String(name ?? '').toLowerCase()
  if (!value.trim()) return null
  return NAME_PATTERNS.find(([, pattern]) => pattern.test(value))?.[0] ?? null
}

/** The icon for a stored emoji (variation selectors ignored), or null. */
export function foodIconForEmoji(emoji = '') {
  return EMOJI_ICONS[String(emoji ?? '').replace(/️/g, '')] ?? null
}

/** The icon for a category value, or null. */
export function foodIconForCategory(category = '') {
  return CATEGORY_ICONS[category] ?? null
}

/**
 * The library icon id for a food. Accepts anything with name, icon and category fields
 * (an inventory item, a receipt row, a listing), or just a name.
 */
export function resolveFoodIcon(food = {}) {
  const { name, icon, category } = typeof food === 'string' ? { name: food } : (food ?? {})
  return foodIconForName(name) ?? foodIconForEmoji(icon) ?? foodIconForCategory(category) ?? DEFAULT_FOOD_ICON
}

/** Name-only lookup that always returns an icon id. */
export const foodIconFor = (name) => resolveFoodIcon({ name })

export const isFoodIcon = (id) => Object.hasOwn(FOOD_ICONS, id)
