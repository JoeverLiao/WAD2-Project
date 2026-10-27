
// Demo data for Freshness & Recipes.
// All expiry dates update automatically relative to today.

function daysFromToday(days) {
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() + days)

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

// FEATURE 1: DEMO INVENTORY
export const sampleInventory = [
  {
    _id: 'demo-1',
    name: 'Eggs',
    quantity: 6,
    unit: 'pcs',
    storage: 'fridge',
    expiresAt: daysFromToday(2),
  },
  {
    _id: 'demo-2',
    name: 'Milk',
    quantity: 1,
    unit: 'L',
    storage: 'fridge',
    expiresAt: daysFromToday(1),
  },
  {
    _id: 'demo-3',
    name: 'Rice',
    quantity: 1,
    unit: 'kg',
    storage: 'pantry',
    expiresAt: daysFromToday(30),
  },
  {
    _id: 'demo-4',
    name: 'Tomato',
    quantity: 4,
    unit: 'pcs',
    storage: 'fridge',
    expiresAt: daysFromToday(3),
  },
  {
    _id: 'demo-5',
    name: 'Banana',
    quantity: 3,
    unit: 'pcs',
    storage: 'pantry',
    expiresAt: daysFromToday(2),
  },
  {
    _id: 'demo-6',
    name: 'Apple',
    quantity: 4,
    unit: 'pcs',
    storage: 'fridge',
    expiresAt: daysFromToday(7),
  },
  {
    _id: 'demo-7',
    name: 'Bread',
    quantity: 1,
    unit: 'loaf',
    storage: 'pantry',
    expiresAt: daysFromToday(4),
  },
  {
    _id: 'demo-8',
    name: 'Tofu',
    quantity: 1,
    unit: 'pack',
    storage: 'fridge',
    expiresAt: daysFromToday(2),
  },
  {
    _id: 'demo-9',
    name: 'Carrot',
    quantity: 3,
    unit: 'pcs',
    storage: 'fridge',
    expiresAt: daysFromToday(5),
  },
  {
    _id: 'demo-10',
    name: 'Lettuce',
    quantity: 1,
    unit: 'head',
    storage: 'fridge',
    expiresAt: daysFromToday(1),
  },
  {
    _id: 'demo-11',
    name: 'Cucumber',
    quantity: 2,
    unit: 'pcs',
    storage: 'fridge',
    expiresAt: daysFromToday(4),
  },
  {
    _id: 'demo-12',
    name: 'Soy Sauce',
    quantity: 1,
    unit: 'bottle',
    storage: 'pantry',
    expiresAt: daysFromToday(90),
  },
]

// FEATURE 2: DEMO RECIPES
// The ingredients field is used by recipeUtils.js
// to calculate available and missing ingredients.

export const sampleRecipes = [
  {
    id: 'demo-recipe-1',
    name: 'Tofu Stir Fry',
    prepTime: 20,
    dietaryTags: ['Vegetarian', 'Vegan'],
    ingredients: ['Tofu', 'Carrot', 'Soy Sauce', 'Rice'],
    image: '',
    instructions: [
      'Cook the rice according to the package instructions.',
      'Cut the tofu and carrots into small pieces.',
      'Heat a little oil in a pan.',
      'Stir-fry the tofu and carrots until cooked.',
      'Add soy sauce and serve with rice.',
    ],
  },
  {
    id: 'demo-recipe-2',
    name: 'Fruit Salad',
    prepTime: 10,
    dietaryTags: ['Vegetarian', 'Vegan'],
    ingredients: ['Apple', 'Banana'],
    image: '',
    instructions: [
      'Wash the apples.',
      'Cut the apples and bananas into bite-sized pieces.',
      'Combine in a bowl and serve.',
    ],
  },
  {
    id: 'demo-recipe-3',
    name: 'Egg Fried Rice',
    prepTime: 20,
    dietaryTags: ['Vegetarian'],
    ingredients: ['Eggs', 'Rice', 'Carrot', 'Soy Sauce'],
    image: '',
    instructions: [
      'Cook the rice and let it cool slightly.',
      'Beat the eggs in a bowl.',
      'Cook the eggs in a pan.',
      'Add the carrots and rice.',
      'Season with soy sauce and stir-fry.',
    ],
  },
  {
    id: 'demo-recipe-4',
    name: 'Fresh Garden Salad',
    prepTime: 10,
    dietaryTags: ['Vegetarian', 'Vegan'],
    ingredients: ['Lettuce', 'Cucumber', 'Tomato'],
    image: '',
    instructions: [
      'Wash all vegetables thoroughly.',
      'Slice the cucumber and tomatoes.',
      'Chop the lettuce.',
      'Combine everything in a bowl.',
    ],
  },
  {
    id: 'demo-recipe-5',
    name: 'Tomato Egg Toast',
    prepTime: 15,
    dietaryTags: ['Vegetarian'],
    ingredients: ['Bread', 'Eggs', 'Tomato'],
    image: '',
    instructions: [
      'Toast the bread.',
      'Slice the tomato.',
      'Cook the eggs to your preference.',
      'Place the eggs and tomato on the toast.',
    ],
  },
  {
    id: 'demo-recipe-6',
    name: 'Creamy Tomato Pasta',
    prepTime: 30,
    dietaryTags: ['Vegetarian'],
    ingredients: ['Tomato', 'Pasta', 'Cream', 'Garlic'],
    image: '',
    instructions: [
      'Cook pasta according to package instructions.',
      'Chop the tomatoes and garlic.',
      'Cook the garlic and tomatoes in a pan.',
      'Add cream and simmer.',
      'Mix with the cooked pasta.',
    ],
  },
  {
    id: 'demo-recipe-7',
    name: 'Banana Pancakes',
    prepTime: 20,
    dietaryTags: ['Vegetarian'],
    ingredients: ['Banana', 'Eggs', 'Flour', 'Milk'],
    image: '',
    instructions: [
      'Mash the banana.',
      'Mix with eggs, flour and milk.',
      'Heat a lightly oiled pan.',
      'Cook small portions of batter on both sides.',
    ],
  },
]
