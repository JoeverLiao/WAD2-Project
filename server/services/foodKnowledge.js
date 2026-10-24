// What we know about common groceries: where they are usually kept and how long they last.
// Used only to PRE-FILL the review form. The user can change every value before saving.
//
// Each entry: [words that identify the food, storage, typical days until it should be used].
// shelfDays is for the unopened product kept as described; it is an estimate, not a label date.
// Entries are checked in order, so more specific ones (e.g. "frozen") come first.

const FOOD_RULES = [
  // Frozen things first, so "frozen chicken" is not treated as fresh chicken.
  [['frozen', 'ice cream', 'gelato', 'popsicle'], 'freezer', 90],

  // Dairy and eggs
  [['milk', 'soy milk', 'soya milk', 'oat milk', 'almond milk'], 'fridge', 7],
  [['yoghurt', 'yogurt', 'yakult'], 'fridge', 14],
  [['cheese', 'mozzarella', 'cheddar', 'parmesan'], 'fridge', 30],
  [['butter', 'margarine'], 'fridge', 60],
  [['cream', 'creamer'], 'fridge', 10],
  [['egg', 'eggs'], 'fridge', 28],

  // Meat, poultry, seafood
  [['chicken', 'drumstick', 'wings'], 'fridge', 2],
  [['beef', 'steak', 'mince', 'minced', 'pork', 'lamb', 'mutton', 'bacon', 'ham'], 'fridge', 3],
  [['sausage', 'sausages', 'hotdog', 'hot dog', 'luncheon'], 'fridge', 7],
  [['fish', 'salmon', 'tuna', 'prawn', 'prawns', 'shrimp', 'squid', 'crab', 'seabass', 'cod'], 'fridge', 2],

  // Fresh produce kept cold
  [['spinach', 'lettuce', 'kangkong', 'kailan', 'xiao bai cai', 'bok choy', 'pak choi', 'cabbage', 'broccoli', 'cauliflower', 'celery', 'cucumber', 'salad'], 'fridge', 5],
  [['tomato', 'tomatoes', 'carrot', 'carrots', 'capsicum', 'pepper', 'chilli', 'mushroom', 'mushrooms', 'beansprout', 'sprouts', 'corn', 'zucchini', 'eggplant', 'brinjal', 'beans'], 'fridge', 7],
  [['apple', 'apples', 'pear', 'pears', 'orange', 'oranges', 'navel', 'lime', 'lemon', 'lemons', 'grapes', 'grape', 'strawberry', 'strawberries', 'blueberry', 'blueberries', 'kiwi', 'melon', 'watermelon', 'papaya', 'pineapple', 'mango', 'peach', 'plum'], 'fridge', 10],
  [['avocado', 'avocados'], 'pantry', 4],
  [['banana', 'bananas'], 'pantry', 5],
  [['potato', 'potatoes', 'onion', 'onions', 'garlic', 'ginger', 'pumpkin', 'sweet potato', 'yam'], 'pantry', 21],

  // Ready to eat and chilled
  [['tofu', 'tauhu', 'beancurd', 'tempeh'], 'fridge', 5],
  [['kimchi', 'hummus', 'dip', 'sandwich', 'wrap', 'sushi', 'salad'], 'fridge', 3],
  [['juice', 'smoothie'], 'fridge', 7],
  [['dough', 'pastry', 'noodles fresh', 'fresh noodles', 'kway teow', 'hokkien'], 'fridge', 5],

  // Bakery
  [['bread', 'loaf', 'bun', 'buns', 'bagel', 'croissant', 'toast', 'baguette', 'roll', 'rolls', 'muffin', 'pita'], 'pantry', 5],
  [['cake', 'donut', 'doughnut', 'pastry', 'pie', 'tart'], 'pantry', 3],

  // Pantry staples
  [['rice', 'pasta', 'spaghetti', 'macaroni', 'noodle', 'noodles', 'vermicelli', 'bee hoon', 'mee', 'oats', 'oatmeal', 'cereal', 'granola', 'flour', 'sugar', 'salt', 'quinoa', 'couscous'], 'pantry', 365],
  [['can', 'canned', 'tin', 'sardine', 'sardines', 'baked beans', 'soup'], 'pantry', 540],
  [['sauce', 'ketchup', 'mayonnaise', 'mayo', 'mustard', 'vinegar', 'soy sauce', 'oil', 'honey', 'jam', 'peanut butter', 'spread', 'seasoning', 'spice', 'curry', 'paste'], 'pantry', 365],
  [['biscuit', 'biscuits', 'cookie', 'cookies', 'cracker', 'crackers', 'chips', 'crisps', 'snack', 'chocolate', 'candy', 'sweets', 'nuts', 'almond', 'almonds', 'peanut', 'peanuts', 'popcorn', 'seaweed'], 'pantry', 180],
  [['coffee', 'tea', 'cocoa', 'milo', 'ovaltine'], 'pantry', 365],
  [['water', 'soda', 'cola', 'coke', 'sprite', 'drink', 'beer', 'wine', 'juice box'], 'pantry', 365],
]

// Things people buy on the same receipt that are not food. They are listed in the review form
// but start unticked, so they are not added to the food inventory by accident.
const NON_FOOD_WORDS = [
  'bag', 'bags', 'carrier', 'detergent', 'soap', 'shampoo', 'conditioner', 'toothpaste', 'toothbrush',
  'tissue', 'tissues', 'toilet', 'paper towel', 'napkin', 'napkins', 'wipes', 'diaper', 'diapers',
  'battery', 'batteries', 'bulb', 'candle', 'lighter', 'razor', 'deodorant', 'lotion', 'sunscreen',
  'dishwash', 'dishwashing', 'cleaner', 'bleach', 'sponge', 'foil', 'cling', 'ziploc', 'zip lock',
  'garbage', 'trash', 'finish', 'quantum', 'tylenol', 'panadol', 'paracetamol', 'ibuprofen', 'vitamin',
  'plaster', 'bandage', 'mask', 'cigarette', 'cigarettes', 'newspaper', 'magazine', 'gift card', 'topup', 'top-up',
]

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const toRegex = (words) => new RegExp(`(?:^|[^a-z])(?:${words.map(escapeRegex).join('|')})(?:[^a-z]|$)`, 'i')

const compiledFood = FOOD_RULES.map(([words, storage, shelfDays]) => ({
  rx: toRegex(words),
  storage,
  shelfDays,
  label: words[0],
}))
const nonFoodRx = toRegex(NON_FOOD_WORDS)

/**
 * @param {string} name product name as printed on the receipt
 * @returns {{ known: boolean, likelyFood: boolean|null, storage: string, shelfDays: number|null, label: string|null }}
 *   likelyFood: true = recognised food, false = recognised non-food, null = unknown
 */
export function classifyItem(name) {
  const text = ` ${String(name).toLowerCase()} `
  if (nonFoodRx.test(text)) {
    return { known: true, likelyFood: false, storage: 'pantry', shelfDays: null, label: null }
  }
  for (const rule of compiledFood) {
    if (rule.rx.test(text)) {
      return { known: true, likelyFood: true, storage: rule.storage, shelfDays: rule.shelfDays, label: rule.label }
    }
  }
  return { known: false, likelyFood: null, storage: 'pantry', shelfDays: null, label: null }
}
