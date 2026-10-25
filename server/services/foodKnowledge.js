// What we know about common groceries, so the same product always gets the SAME name no matter
// the brand, size or shop ("Meiji Fresh Milk 1L" and "FARMHOUSE MILK 2L" are both "Milk"), and
// so we can suggest where it is kept. Used only to pre-fill the review form: the user can change
// every value before saving.
//
// Each entry: [canonical name, words that identify it, where it is usually kept].
// Entries are checked IN ORDER and the first match wins, so specific entries (Soy Milk, Peanut
// Butter, Orange Juice) must come before general ones (Milk, Butter, Orange).

/** @type {Array<[string, string, 'fridge'|'freezer'|'pantry']>} */
const FOODS = [
  // Frozen
  ['Ice Cream', 'ice cream,gelato,popsicle', 'freezer'],

  // Drinks that contain other food words must come before those foods
  ['Orange Juice', 'orange juice', 'fridge'],
  ['Apple Juice', 'apple juice', 'fridge'],
  ['Juice', 'juice,smoothie', 'fridge'],
  ['Soy Milk', 'soy milk,soya milk,soymilk,soy bean milk', 'fridge'],
  ['Oat Milk', 'oat milk', 'fridge'],
  ['Almond Milk', 'almond milk', 'fridge'],
  ['Milk', 'milk,fresh milk,full cream,low fat milk,skim milk', 'fridge'],

  // Dairy and eggs
  ['Yoghurt', 'yoghurt,yogurt', 'fridge'],
  ['Cream Cheese', 'cream cheese', 'fridge'],
  ['Cheese', 'cheese,mozzarella,cheddar,parmesan', 'fridge'],
  ['Peanut Butter', 'peanut butter', 'pantry'],
  ['Butter', 'butter,margarine', 'fridge'],
  ['Cream', 'cream,creamer', 'fridge'],
  ['Eggs', 'egg,eggs', 'fridge'],

  // Meat and fish
  ['Chicken Breast', 'chicken breast', 'fridge'],
  ['Chicken Thigh', 'chicken thigh', 'fridge'],
  ['Chicken Wings', 'chicken wing,chicken wings,wings', 'fridge'],
  ['Chicken', 'chicken,drumstick,drumsticks', 'fridge'],
  ['Minced Meat', 'mince,minced,minced meat,ground beef', 'fridge'],
  ['Steak', 'steak', 'fridge'],
  ['Beef', 'beef', 'fridge'],
  ['Pork', 'pork', 'fridge'],
  ['Lamb', 'lamb,mutton', 'fridge'],
  ['Bacon', 'bacon', 'fridge'],
  ['Ham', 'ham', 'fridge'],
  ['Sausage', 'sausage,sausages,luncheon meat,hotdog,hot dog', 'fridge'],
  ['Salmon', 'salmon', 'fridge'],
  ['Tuna', 'tuna', 'fridge'],
  ['Prawn', 'prawn,prawns,shrimp,shrimps', 'fridge'],
  ['Squid', 'squid', 'fridge'],
  ['Crab', 'crab', 'fridge'],
  ['Fish', 'fish,seabass,cod,barramundi,tilapia', 'fridge'],

  // Vegetables
  ['Spinach', 'spinach', 'fridge'],
  ['Lettuce', 'lettuce,salad,romaine', 'fridge'],
  ['Cabbage', 'cabbage', 'fridge'],
  ['Broccoli', 'broccoli', 'fridge'],
  ['Cauliflower', 'cauliflower', 'fridge'],
  ['Celery', 'celery', 'fridge'],
  ['Cucumber', 'cucumber', 'fridge'],
  ['Tomato', 'tomato,tomatoes,cherry tomato,cherry tomatoes', 'fridge'],
  ['Carrot', 'carrot,carrots', 'fridge'],
  ['Capsicum', 'capsicum,bell pepper', 'fridge'],
  ['Chilli', 'chilli,chili,chillies', 'fridge'],
  ['Mushroom', 'mushroom,mushrooms', 'fridge'],
  ['Corn', 'corn,sweet corn', 'fridge'],
  ['Zucchini', 'zucchini,courgette', 'fridge'],
  ['Eggplant', 'eggplant,brinjal,aubergine', 'fridge'],
  ['Beans', 'beans,green beans,long beans', 'fridge'],
  ['Bok Choy', 'bok choy,pak choi,xiao bai cai', 'fridge'],
  ['Kangkong', 'kangkong,water spinach', 'fridge'],
  ['Kailan', 'kailan,gai lan', 'fridge'],
  ['Beansprouts', 'beansprout,beansprouts,bean sprouts', 'fridge'],
  ['Sweet Potato', 'sweet potato,sweet potatoes,yam', 'pantry'],
  ['Potato', 'potato,potatoes', 'pantry'],
  ['Onion', 'onion,onions', 'pantry'],
  ['Garlic', 'garlic', 'pantry'],
  ['Ginger', 'ginger', 'pantry'],
  ['Pumpkin', 'pumpkin', 'pantry'],

  // Fruit
  ['Avocado', 'avocado,avocados', 'pantry'],
  ['Banana', 'banana,bananas', 'pantry'],
  ['Apple', 'apple,apples', 'fridge'],
  ['Pear', 'pear,pears', 'fridge'],
  ['Orange', 'orange,oranges,navel', 'fridge'],
  ['Lime', 'lime,limes', 'fridge'],
  ['Lemon', 'lemon,lemons', 'fridge'],
  ['Grapefruit', 'grapefruit', 'fridge'],
  ['Grapes', 'grape,grapes', 'fridge'],
  ['Strawberry', 'strawberry,strawberries', 'fridge'],
  ['Blueberry', 'blueberry,blueberries', 'fridge'],
  ['Kiwi', 'kiwi,kiwifruit', 'fridge'],
  ['Watermelon', 'watermelon', 'fridge'],
  ['Melon', 'melon,rockmelon,honeydew', 'fridge'],
  ['Papaya', 'papaya', 'fridge'],
  ['Pineapple', 'pineapple', 'fridge'],
  ['Mango', 'mango,mangoes', 'fridge'],
  ['Peach', 'peach,peaches', 'fridge'],
  ['Plum', 'plum,plums', 'fridge'],

  // Chilled ready foods
  ['Tofu', 'tofu,tauhu,beancurd', 'fridge'],
  ['Tempeh', 'tempeh', 'fridge'],
  ['Kimchi', 'kimchi', 'fridge'],
  ['Hummus', 'hummus', 'fridge'],
  ['Sandwich', 'sandwich', 'fridge'],
  ['Sushi', 'sushi', 'fridge'],

  // Bakery
  ['Bread', 'bread,loaf,toast,baguette', 'pantry'],
  ['Bun', 'bun,buns,roll,rolls', 'pantry'],
  ['Bagel', 'bagel,bagels', 'pantry'],
  ['Croissant', 'croissant,croissants', 'pantry'],
  ['Muffin', 'muffin,muffins', 'pantry'],
  ['Cake', 'cake,cakes', 'pantry'],
  ['Donut', 'donut,donuts,doughnut,doughnuts', 'pantry'],

  // Pantry
  ['Rice', 'rice', 'pantry'],
  ['Pasta', 'pasta,spaghetti,macaroni,penne', 'pantry'],
  ['Noodles', 'noodle,noodles,vermicelli,bee hoon,mee', 'pantry'],
  ['Oats', 'oats,oatmeal', 'pantry'],
  ['Cereal', 'cereal,granola', 'pantry'],
  ['Flour', 'flour', 'pantry'],
  ['Sugar', 'sugar', 'pantry'],
  ['Salt', 'salt', 'pantry'],
  ['Soy Sauce', 'soy sauce,soya sauce', 'pantry'],
  ['Ketchup', 'ketchup', 'pantry'],
  ['Mayonnaise', 'mayonnaise,mayo', 'pantry'],
  ['Olive Oil', 'olive oil', 'pantry'],
  ['Cooking Oil', 'cooking oil,vegetable oil,sunflower oil,canola oil', 'pantry'],
  ['Honey', 'honey', 'pantry'],
  ['Jam', 'jam', 'pantry'],
  ['Sauce', 'sauce', 'pantry'],
  ['Canned Food', 'canned,tinned,baked beans,sardine,sardines', 'pantry'],
  ['Biscuits', 'biscuit,biscuits,cookie,cookies,cracker,crackers', 'pantry'],
  ['Chips', 'chips,crisps', 'pantry'],
  ['Chocolate', 'chocolate', 'pantry'],
  ['Nuts', 'nuts,almond,almonds,peanut,peanuts,cashew,cashews', 'pantry'],
  ['Coffee', 'coffee', 'pantry'],
  ['Tea', 'tea', 'pantry'],
  ['Water', 'water', 'pantry'],
  ['Soda', 'soda,cola,coke,sprite', 'pantry'],
  ['Beer', 'beer', 'pantry'],
  ['Wine', 'wine', 'pantry'],
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

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const wordsRx = (words) => new RegExp(`(?:^|[^a-z])(?:${words.map(escapeRegex).join('|')})(?:[^a-z]|$)`, 'i')

const compiledFoods = FOODS.map(([canonicalName, aliases, storage]) => ({
  canonicalName,
  storage,
  rx: wordsRx(aliases.split(',')),
}))
const nonFoodWordsRx = wordsRx(NON_FOOD_WORDS)
const nonFoodStemsRx = new RegExp(NON_FOOD_STEMS.map(escapeRegex).join('|'), 'i')

/**
 * @param {string} name product name as printed on the receipt
 * @returns {{ likelyFood: boolean|null, storage: 'fridge'|'freezer'|'pantry', canonicalName: string|null }}
 *   likelyFood: true = recognised food, false = recognised non-food, null = unknown.
 *   canonicalName is the one standard name for a recognised food (otherwise null).
 */
export function classifyItem(name) {
  const text = ` ${String(name).toLowerCase()} `
  if (nonFoodWordsRx.test(text) || nonFoodStemsRx.test(text)) {
    return { likelyFood: false, storage: 'pantry', canonicalName: null }
  }
  const frozen = /(?:^|[^a-z])frozen(?:[^a-z]|$)/.test(text)
  for (const food of compiledFoods) {
    if (food.rx.test(text)) {
      return { likelyFood: true, storage: frozen ? 'freezer' : food.storage, canonicalName: food.canonicalName }
    }
  }
  return { likelyFood: null, storage: frozen ? 'freezer' : 'pantry', canonicalName: null }
}
