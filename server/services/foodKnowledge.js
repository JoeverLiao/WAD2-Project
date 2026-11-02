// What we know about common groceries, so the same product always gets the SAME name no matter
// the brand, size or shop ("Meiji Fresh Milk 1L" and "FARMHOUSE MILK 2L" are both "Milk"), and so
// we know its category, where it is kept and how long it lasts (see storageGuide.js for the
// reasons behind each category). Used to pre-fill the forms: the user can change every value.
//
// Each entry: [standard name, words that identify it, category, optional overrides]
// Overrides: zone (a different place than the category default), days (storage days), kg (typical
// weight of ONE piece). Entries are checked IN ORDER and the first match wins, so specific entries
// (Soy Milk, Peanut Butter, Orange Juice) must come before general ones (Milk, Butter, Orange).
import { CATEGORIES, CATEGORY_DIET, shelfDays, ZONES } from './storageGuide.js'

/** @type {Array<[string|null, string, string, { zone?: string, days?: number, kg?: number }?]>} */
const FOODS = [
  // Sauces and spreads come first: "Sweet Chilli Sauce" is a sauce, not a chilli; "Coconut Milk" is not milk.
  ['Coconut Milk', 'coconut milk,coconut cream', 'condiments', { days: 365, kg: 0.4 }],
  ['Coconut Water', 'coconut water', 'beverages', { days: 180, kg: 1 }],
  ['Soy Sauce', 'soy sauce,soya sauce', 'condiments', { days: 365, kg: 0.5 }],
  ['Ketchup', 'ketchup', 'condiments', { days: 180, kg: 0.5 }],
  ['Mayonnaise', 'mayonnaise,mayo', 'condiments', { days: 60, kg: 0.4 }],
  ['Peanut Butter', 'peanut butter', 'condiments', { days: 180, kg: 0.34 }],
  ['Honey', 'honey', 'condiments', { days: 730, kg: 0.5 }],
  ['Jam', 'jam,marmalade', 'condiments', { days: 365, kg: 0.34 }],
  // Any other sauce keeps the name printed on the receipt.
  [null, 'sauce,dressing,vinegar,paste,spread,seasoning,marinade,syrup', 'condiments', { days: 180 }],

  // Flavoured products: "Blueberry Muffin" is a muffin and "Strawberry Yoghurt" is yoghurt, not fruit.
  [null, 'muffin,muffins,cake,cakes,pie,pies,tart,tarts,pastry,pastries,donut,donuts,doughnut,doughnuts', 'bakery', { days: 3 }],
  [null, 'cookie,cookies,biscuit,biscuits,cracker,crackers', 'snacks', { days: 90 }],
  [null, 'yoghurt,yogurt', 'dairy', { days: 14 }],

  // Frozen
  ['Ice Cream', 'ice cream,gelato,popsicle', 'frozen', { days: 90, kg: 0.5 }],

  // Drinks that contain other food words must come before those foods
  ['Orange Juice', 'orange juice', 'beverages', { zone: 'door', days: 7, kg: 1 }],
  ['Apple Juice', 'apple juice', 'beverages', { zone: 'door', days: 7, kg: 1 }],
  ['Juice', 'juice,smoothie', 'beverages', { zone: 'door', days: 7, kg: 1 }],
  ['Soy Milk', 'soy milk,soya milk,soymilk,soy bean milk', 'dairy', { days: 7, kg: 1 }],
  ['Oat Milk', 'oat milk', 'dairy', { days: 7, kg: 1 }],
  ['Almond Milk', 'almond milk', 'dairy', { days: 7, kg: 1 }],
  ['Milk', 'milk,fresh milk,full cream,low fat milk,skim milk', 'dairy', { days: 7, kg: 1 }],

  // Dairy and eggs
  ['Yoghurt', 'yoghurt,yogurt', 'dairy', { days: 14, kg: 0.15 }],
  ['Cream Cheese', 'cream cheese', 'dairy', { days: 14, kg: 0.2 }],
  ['Cheese', 'cheese,mozzarella,cheddar,parmesan', 'dairy', { days: 28, kg: 0.2 }],
  ['Butter', 'butter,margarine', 'dairy', { days: 30, kg: 0.25 }],
  ['Cream', 'cream,creamer', 'dairy', { days: 10, kg: 0.25 }],
  ['Eggs', 'egg,eggs', 'eggs', { days: 28, kg: 0.06 }],

  // Meat and fish (raw)
  ['Chicken Breast', 'chicken breast', 'meat', { days: 2, kg: 0.5 }],
  ['Chicken Thigh', 'chicken thigh', 'meat', { days: 2, kg: 0.5 }],
  ['Chicken Wings', 'chicken wing,chicken wings,wings', 'meat', { days: 2, kg: 0.5 }],
  ['Chicken', 'chicken,drumstick,drumsticks', 'meat', { days: 2, kg: 1 }],
  ['Minced Meat', 'mince,minced,minced meat,ground beef', 'meat', { days: 2, kg: 0.5 }],
  ['Steak', 'steak', 'meat', { days: 4, kg: 0.3 }],
  ['Beef', 'beef', 'meat', { days: 4, kg: 0.5 }],
  ['Pork', 'pork', 'meat', { days: 4, kg: 0.5 }],
  ['Lamb', 'lamb,mutton', 'meat', { days: 4, kg: 0.5 }],
  ['Bacon', 'bacon', 'meat', { days: 7, kg: 0.25 }],
  ['Sausage', 'sausage,sausages,hotdog,hot dog', 'meat', { days: 3, kg: 0.4 }],
  ['Ham', 'ham,luncheon meat', 'ready_to_eat', { days: 5, kg: 0.2 }],
  ['Turkey', 'turkey', 'meat', { days: 2, kg: 1 }],
  ['Duck', 'duck', 'meat', { days: 2, kg: 1.5 }],
  ['Mussels', 'mussel,mussels', 'seafood', { days: 2, kg: 0.5 }],
  ['Clams', 'clam,clams,cockles', 'seafood', { days: 2, kg: 0.5 }],
  ['Oysters', 'oyster,oysters', 'seafood', { days: 2, kg: 0.3 }],
  ['Scallops', 'scallop,scallops', 'seafood', { days: 2, kg: 0.2 }],
  ['Salmon', 'salmon', 'seafood', { days: 2, kg: 0.3 }],
  ['Tuna', 'tuna', 'seafood', { days: 2, kg: 0.3 }],
  ['Prawn', 'prawn,prawns,shrimp,shrimps', 'seafood', { days: 2, kg: 0.3 }],
  ['Squid', 'squid', 'seafood', { days: 2, kg: 0.3 }],
  ['Crab', 'crab', 'seafood', { days: 2, kg: 0.5 }],
  ['Fish', 'fish,seabass,cod,barramundi,tilapia', 'seafood', { days: 2, kg: 0.4 }],

  // Vegetables
  ['Spinach', 'spinach', 'vegetables', { days: 5, kg: 0.25 }],
  ['Lettuce', 'lettuce,salad,romaine', 'vegetables', { days: 7, kg: 0.3 }],
  ['Cabbage', 'cabbage', 'vegetables', { days: 14, kg: 1 }],
  ['Broccoli', 'broccoli', 'vegetables', { days: 5, kg: 0.35 }],
  ['Cauliflower', 'cauliflower', 'vegetables', { days: 7, kg: 0.6 }],
  ['Celery', 'celery', 'vegetables', { days: 14, kg: 0.4 }],
  ['Cucumber', 'cucumber', 'vegetables', { days: 7, kg: 0.3 }],
  ['Tomato', 'tomato,tomatoes,cherry tomato,cherry tomatoes', 'vegetables', { zone: 'dry-storage', days: 5, kg: 0.15 }],
  ['Carrot', 'carrot,carrots', 'vegetables', { days: 21, kg: 0.1 }],
  ['Capsicum', 'capsicum,bell pepper', 'vegetables', { days: 10, kg: 0.2 }],
  ['Chilli', 'chilli,chili,chillies', 'vegetables', { days: 10, kg: 0.01 }],
  ['Mushroom', 'mushroom,mushrooms', 'vegetables', { days: 5, kg: 0.2 }],
  ['Corn', 'corn,sweet corn', 'vegetables', { days: 4, kg: 0.3 }],
  ['Zucchini', 'zucchini,courgette', 'vegetables', { days: 5, kg: 0.25 }],
  ['Eggplant', 'eggplant,brinjal,aubergine', 'vegetables', { days: 5, kg: 0.3 }],
  ['Beans', 'beans,green beans,long beans', 'vegetables', { days: 5, kg: 0.25 }],
  ['Bok Choy', 'bok choy,pak choi,xiao bai cai', 'vegetables', { days: 5, kg: 0.3 }],
  ['Kangkong', 'kangkong,water spinach', 'vegetables', { days: 3, kg: 0.3 }],
  ['Kailan', 'kailan,gai lan', 'vegetables', { days: 5, kg: 0.3 }],
  ['Beansprouts', 'beansprout,beansprouts,bean sprouts', 'vegetables', { days: 3, kg: 0.25 }],
  ['Asparagus', 'asparagus', 'vegetables', { days: 4, kg: 0.25 }],
  ['Kale', 'kale', 'vegetables', { days: 7, kg: 0.25 }],
  ['Leek', 'leek,leeks', 'vegetables', { days: 14, kg: 0.2 }],
  ['Spring Onion', 'spring onion,scallion,scallions,green onion', 'vegetables', { days: 7, kg: 0.1 }],
  ['Coriander', 'coriander,cilantro', 'vegetables', { days: 5, kg: 0.05 }],
  ['Parsley', 'parsley', 'vegetables', { days: 7, kg: 0.05 }],
  ['Basil', 'basil', 'vegetables', { days: 5, kg: 0.03 }],
  ['Mint', 'mint', 'vegetables', { days: 7, kg: 0.03 }],
  ['Radish', 'radish,daikon', 'vegetables', { days: 10, kg: 0.15 }],
  ['Beetroot', 'beetroot,beet', 'vegetables', { days: 21, kg: 0.15 }],
  ['Turnip', 'turnip', 'vegetables', { days: 14, kg: 0.2 }],
  ['Lotus Root', 'lotus root', 'vegetables', { days: 10, kg: 0.4 }],
  ['Okra', 'okra,ladies finger,lady finger', 'vegetables', { days: 4, kg: 0.25 }],
  ['Peas', 'peas,snow peas,sugar snap,edamame', 'vegetables', { days: 5, kg: 0.25 }],
  ['Brussels Sprouts', 'brussels sprouts,brussel sprouts', 'vegetables', { days: 7, kg: 0.3 }],
  ['Bitter Gourd', 'bitter gourd,bitter melon', 'vegetables', { days: 5, kg: 0.3 }],
  ['Squash', 'squash', 'vegetables', { days: 10, kg: 0.5 }],
  ['Sweet Potato', 'sweet potato,sweet potatoes,yam', 'root_vegetables', { days: 21, kg: 0.3 }],
  ['Potato', 'potato,potatoes', 'root_vegetables', { days: 30, kg: 0.2 }],
  ['Onion', 'onion,onions', 'root_vegetables', { days: 30, kg: 0.15 }],
  ['Garlic', 'garlic', 'root_vegetables', { days: 60, kg: 0.05 }],
  ['Ginger', 'ginger', 'root_vegetables', { days: 21, kg: 0.1 }],
  ['Pumpkin', 'pumpkin', 'root_vegetables', { days: 60, kg: 1.5 }],

  // Fruit (tropical fruit ripens at room temperature)
  ['Avocado', 'avocado,avocados', 'fruit', { zone: 'dry-storage', days: 4, kg: 0.2 }],
  ['Banana', 'banana,bananas', 'fruit', { zone: 'dry-storage', days: 5, kg: 0.12 }],
  ['Apple', 'apple,apples', 'fruit', { days: 28, kg: 0.18 }],
  ['Pear', 'pear,pears', 'fruit', { days: 7, kg: 0.18 }],
  ['Orange', 'orange,oranges,navel', 'fruit', { days: 21, kg: 0.2 }],
  ['Lime', 'lime,limes', 'fruit', { days: 14, kg: 0.07 }],
  ['Lemon', 'lemon,lemons', 'fruit', { days: 21, kg: 0.1 }],
  ['Grapefruit', 'grapefruit', 'fruit', { days: 21, kg: 0.4 }],
  ['Grapes', 'grape,grapes', 'fruit', { days: 7, kg: 0.5 }],
  ['Strawberry', 'strawberry,strawberries', 'fruit', { days: 3, kg: 0.25 }],
  ['Blueberry', 'blueberry,blueberries', 'fruit', { days: 7, kg: 0.125 }],
  ['Kiwi', 'kiwi,kiwifruit', 'fruit', { days: 7, kg: 0.08 }],
  ['Watermelon', 'watermelon', 'fruit', { days: 7, kg: 3 }],
  ['Melon', 'melon,rockmelon,honeydew,cantaloupe', 'fruit', { days: 5, kg: 1.2 }],
  ['Papaya', 'papaya', 'fruit', { zone: 'dry-storage', days: 3, kg: 0.8 }],
  ['Pineapple', 'pineapple', 'fruit', { zone: 'dry-storage', days: 3, kg: 1.2 }],
  ['Mango', 'mango,mangoes', 'fruit', { zone: 'dry-storage', days: 5, kg: 0.35 }],
  ['Raspberry', 'raspberry,raspberries', 'fruit', { days: 3, kg: 0.125 }],
  ['Blackberry', 'blackberry,blackberries', 'fruit', { days: 3, kg: 0.125 }],
  ['Cranberry', 'cranberry,cranberries', 'fruit', { days: 14, kg: 0.25 }],
  ['Cherry', 'cherry,cherries', 'fruit', { days: 5, kg: 0.4 }],
  ['Fig', 'fig,figs', 'fruit', { days: 3, kg: 0.05 }],
  ['Dates', 'date,dates,medjool', 'fruit', { zone: 'dry-storage', days: 180, kg: 0.5 }],
  ['Pomegranate', 'pomegranate', 'fruit', { days: 21, kg: 0.4 }],
  ['Coconut', 'coconut,coconuts', 'fruit', { zone: 'dry-storage', days: 14, kg: 0.6 }],
  ['Lychee', 'lychee,lychees,litchi', 'fruit', { days: 5, kg: 0.5 }],
  ['Longan', 'longan', 'fruit', { days: 5, kg: 0.5 }],
  ['Rambutan', 'rambutan', 'fruit', { days: 5, kg: 0.5 }],
  ['Durian', 'durian', 'fruit', { zone: 'dry-storage', days: 3, kg: 1.5 }],
  ['Mangosteen', 'mangosteen', 'fruit', { days: 5, kg: 0.5 }],
  ['Dragon Fruit', 'dragon fruit,dragonfruit,pitaya', 'fruit', { days: 5, kg: 0.4 }],
  ['Jackfruit', 'jackfruit', 'fruit', { days: 4, kg: 1 }],
  ['Guava', 'guava', 'fruit', { zone: 'dry-storage', days: 4, kg: 0.2 }],
  ['Passionfruit', 'passionfruit,passion fruit', 'fruit', { days: 7, kg: 0.05 }],
  ['Persimmon', 'persimmon', 'fruit', { days: 7, kg: 0.2 }],
  ['Apricot', 'apricot,apricots', 'fruit', { days: 4, kg: 0.05 }],
  ['Nectarine', 'nectarine,nectarines', 'fruit', { days: 4, kg: 0.15 }],
  ['Mandarin', 'mandarin,mandarins,tangerine,tangerines,clementine,clementines', 'fruit', { days: 21, kg: 0.08 }],
  ['Pomelo', 'pomelo', 'fruit', { days: 21, kg: 1 }],
  ['Starfruit', 'starfruit,star fruit,carambola', 'fruit', { days: 5, kg: 0.15 }],
  ['Peach', 'peach,peaches', 'fruit', { days: 4, kg: 0.15 }],
  ['Plum', 'plum,plums', 'fruit', { days: 4, kg: 0.07 }],

  // Chilled ready foods
  ['Tofu', 'tofu,tauhu,beancurd', 'plant_protein', { days: 7, kg: 0.3 }],
  ['Tempeh', 'tempeh', 'plant_protein', { days: 10, kg: 0.2 }],
  ['Kimchi', 'kimchi', 'ready_to_eat', { days: 30, kg: 0.5 }],
  ['Hummus', 'hummus', 'ready_to_eat', { days: 7, kg: 0.2 }],
  ['Sandwich', 'sandwich', 'ready_to_eat', { days: 2, kg: 0.2 }],
  ['Sushi', 'sushi', 'ready_to_eat', { days: 1, kg: 0.3 }],

  // Bakery
  ['Bread', 'bread,loaf,toast,baguette', 'bakery', { days: 5, kg: 0.6 }],
  ['Bun', 'bun,buns,roll,rolls', 'bakery', { days: 4, kg: 0.06 }],
  ['Wrap', 'tortilla,tortillas,wrap,wraps,pita,naan,roti,prata', 'bakery', { days: 7, kg: 0.3 }],
  ['Bagel', 'bagel,bagels', 'bakery', { days: 5, kg: 0.1 }],
  ['Croissant', 'croissant,croissants', 'bakery', { days: 3, kg: 0.07 }],
  ['Muffin', 'muffin,muffins', 'bakery', { days: 3, kg: 0.1 }],
  ['Cake', 'cake,cakes', 'bakery', { days: 3, kg: 0.5 }],
  ['Donut', 'donut,donuts,doughnut,doughnuts', 'bakery', { days: 2, kg: 0.07 }],

  // Dry goods
  ['Rice', 'rice', 'pantry_staples', { days: 365, kg: 5 }],
  ['Pasta', 'pasta,spaghetti,macaroni,penne', 'pantry_staples', { days: 365, kg: 0.5 }],
  ['Noodles', 'noodle,noodles,vermicelli,bee hoon,mee', 'pantry_staples', { days: 365, kg: 0.4 }],
  ['Oats', 'oats,oatmeal', 'pantry_staples', { days: 365, kg: 0.5 }],
  ['Cereal', 'cereal,granola', 'pantry_staples', { days: 180, kg: 0.4 }],
  ['Flour', 'flour', 'pantry_staples', { days: 180, kg: 1 }],
  ['Sugar', 'sugar', 'pantry_staples', { days: 730, kg: 1 }],
  ['Salt', 'salt', 'pantry_staples', { days: 1825, kg: 0.5 }],
  ['Olive Oil', 'olive oil', 'pantry_staples', { days: 365, kg: 0.75 }],
  ['Cooking Oil', 'cooking oil,vegetable oil,sunflower oil,canola oil', 'pantry_staples', { days: 365, kg: 1 }],
  ['Coffee', 'coffee', 'pantry_staples', { days: 180, kg: 0.25 }],
  ['Tea', 'tea', 'pantry_staples', { days: 365, kg: 0.1 }],

  // Sauces and spreads

  // Snacks and drinks
  ['Biscuits', 'biscuit,biscuits,cookie,cookies,cracker,crackers', 'snacks', { days: 90, kg: 0.2 }],
  ['Chips', 'chips,crisps', 'snacks', { days: 60, kg: 0.15 }],
  ['Chocolate', 'chocolate', 'snacks', { days: 180, kg: 0.1 }],
  ['Nuts', 'nuts,almond,almonds,peanut,peanuts,cashew,cashews', 'snacks', { days: 90, kg: 0.2 }],
  ['Water', 'water', 'beverages', { days: 365, kg: 1.5 }],
  ['Soda', 'soda,cola,coke,sprite', 'beverages', { days: 180, kg: 0.33 }],
  ['Beer', 'beer', 'beverages', { days: 180, kg: 0.33 }],
  ['Wine', 'wine', 'beverages', { days: 365, kg: 0.75 }],

  // Words that still tell us the category when the exact food is not in the list above
  // (the receipt name is kept as it is).
  [null, 'berry,berries,fruit,fruits', 'fruit', { days: 5 }],
  [null, 'sprout,sprouts,greens,leaves,herb,herbs,leafy', 'vegetables', { days: 5 }],
]

// Things people buy on the same receipt that are not food. They are listed in the review form
// but start unticked, so they are not added to the food inventory by accident.
// WORDS match whole words only; STEMS match anywhere (OCR often glues words together: "PETCOLLAR").
const NON_FOOD_WORDS = [
  'pet', 'carrier bag', 'plastic bag', 'shopping bag', 'garbage bag', 'trash bag', 'bin bag', 'ziploc', 'zip lock',
  'soap', 'tissues', 'tissue', 'toilet', 'paper towel', 'napkins', 'wipes', 'diaper', 'diapers', 'batteries',
  'bulb', 'candle', 'lighter', 'razor', 'lotion', 'cleaner', 'bleach', 'sponge', 'foil', 'cling', 'finish',
  'dog food', 'cat food', 'cat litter', 'leash', 'toy', 'toys', 'vitamin', 'vitamins', 'plaster', 'mask',
  'cigarette', 'cigarettes', 'newspaper', 'magazine', 'gift card', 'topup', 'top-up', 'tylenol', 'panadol',
]
const NON_FOOD_STEMS = [
  'collar', 'shampoo', 'conditioner', 'toothpaste', 'toothbrush', 'detergent', 'dishwash', 'tissue', 'napkin',
  'battery', 'deodorant', 'sunscreen', 'cigarette', 'ziploc', 'paracetamol', 'ibuprofen', 'quantum',
]

// Foods whose usual diet differs from their category's default.
const DIET_BY_FOOD = {
  'Soy Milk': 'vegan', 'Oat Milk': 'vegan', 'Almond Milk': 'vegan', 'Coconut Milk': 'vegan', 'Coconut Water': 'vegan',
  'Ice Cream': 'vegetarian', Ham: 'other', Kimchi: 'unknown', Hummus: 'vegan', Sandwich: 'unknown', Sushi: 'unknown',
  Honey: 'vegetarian', Mayonnaise: 'vegetarian', Ketchup: 'vegan', 'Soy Sauce': 'vegan', 'Peanut Butter': 'vegan', Jam: 'vegan',
  Biscuits: 'vegetarian', Chocolate: 'vegetarian', Nuts: 'vegan', Pasta: 'vegetarian', Noodles: 'vegetarian',
  Cereal: 'vegetarian', Beer: 'unknown', Wine: 'unknown', Chips: 'unknown',
}

const VEGAN_WORDS = /\b(vegan|plant[- ]based|dairy[- ]free)\b/i
const VEGETARIAN_WORDS = /\b(vegetarian|veggie|meat[- ]free)\b/i
const MEAT_WORDS =
  /\b(beef|pork|chicken|turkey|duck|lamb|mutton|veal|bacon|ham|sausages?|salami|pepperoni|chorizo|fish|tuna|salmon|prawns?|shrimps?|crab|squid|anchov\w*|sardines?|gelatin\w*|lard|oyster|clams?|mussels?|meat)\b/i

/**
 * Diet label from words in the name: "Vegan Chicken Nuggets" is vegan (the pack says so), while
 * "Chicken Noodle Soup" contains meat. Returns null when the name says nothing either way.
 */
export function dietFromText(text) {
  const t = String(text ?? '')
  if (VEGAN_WORDS.test(t)) return 'vegan'
  if (VEGETARIAN_WORDS.test(t)) return 'vegetarian'
  if (MEAT_WORDS.test(t)) return 'other'
  return null
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const wordsRx = (words) => new RegExp(`(?:^|[^a-z])(?:${words.map(escapeRegex).join('|')})(?:[^a-z]|$)`, 'i')

const compiledFoods = FOODS.map(([canonicalName, aliases, category, overrides = {}]) => ({
  canonicalName,
  category,
  overrides,
  rx: wordsRx(aliases.split(',')),
}))
const nonFoodWordsRx = wordsRx(NON_FOOD_WORDS)
const nonFoodStemsRx = new RegExp(NON_FOOD_STEMS.map(escapeRegex).join('|'), 'i')

/**
 * @param {string} name product name as printed on the receipt
 * @returns {{
 *   likelyFood: boolean|null, storage: 'fridge'|'freezer'|'pantry', canonicalName: string|null,
 *   category: string|null, zone: string, days: number|null, pieceKg: number|null, frozen: boolean,
 *   diet: 'vegan'|'vegetarian'|'other'|'unknown'|null
 * }}
 *   likelyFood: true = recognised food, false = recognised non-food, null = unknown.
 *   canonicalName is the one standard name for a recognised food (otherwise null).
 *   zone is the suggested place in the fridge/freezer/pantry; days the usual storage time there.
 */
export function classifyItem(name) {
  const text = ` ${String(name).toLowerCase()} `
  if (nonFoodWordsRx.test(text) || nonFoodStemsRx.test(text)) {
    return { likelyFood: false, storage: 'pantry', canonicalName: null, category: 'non_food', zone: 'dry-storage', days: null, pieceKg: null, frozen: false, diet: null }
  }
  const frozen = /(?:^|[^a-z])frozen(?:[^a-z]|$)/.test(text)
  for (const food of compiledFoods) {
    if (!food.rx.test(text)) continue
    const info = CATEGORIES[food.category]
    // Frozen goods go to the freezer whatever the food, with the freezer storage time.
    const zone = frozen ? 'freezer-main' : (food.overrides.zone ?? info.zone)
    const storage = ZONES[zone].storage
    const days = frozen ? shelfDays(food.category, 'freezer') ?? 90 : (food.overrides.days ?? shelfDays(food.category, storage))
    return {
      likelyFood: true,
      storage,
      canonicalName: food.canonicalName,
      category: food.category,
      zone,
      days,
      pieceKg: food.overrides.kg ?? null,
      frozen,
      diet: dietFromText(text) ?? DIET_BY_FOOD[food.canonicalName] ?? CATEGORY_DIET[food.category] ?? 'unknown',
    }
  }
  return {
    likelyFood: null,
    storage: frozen ? 'freezer' : 'pantry',
    canonicalName: null,
    category: frozen ? 'frozen' : null,
    zone: frozen ? 'freezer-main' : 'dry-storage',
    days: frozen ? 90 : null,
    pieceKg: null,
    frozen,
    diet: dietFromText(text) ?? 'unknown',
  }
}
