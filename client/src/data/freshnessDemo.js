
export const sampleInventory = [
  {
    _id: '1',
    name: 'Apple',
    quantity: 2,
    unit: 'pieces',
    storage: 'fridge',
    expiresAt: '2026-10-14',
  },
  {
    _id: '2',
    name: 'Kiwi',
    quantity: 6,
    unit: 'pieces',
    storage: 'fridge',
    expiresAt: '2026-10-15',
  },
  {
    _id: '3',
    name: 'Tofu',
    quantity: 1,
    unit: 'packet',
    storage: 'fridge',
    expiresAt: '2026-10-20',
  },
  {
    _id: '4',
    name: 'Banana',
    quantity: 3,
    unit: 'pieces',
    storage: 'pantry',
    expiresAt: '2026-10-17',
  },
]

export const sampleRecipes = [
  {
    id: 1,
    name: 'Fruit Salad',
    ingredients: ['Apple', 'Kiwi', 'Banana'],
    prepTime: 10,
    dietaryTags: ['Vegetarian', 'Vegan'],
  },
  {
    id: 2,
    name: 'Tofu Stir Fry',
    ingredients: ['Tofu', 'Garlic', 'Soy Sauce'],
    prepTime: 20,
    dietaryTags: ['Vegetarian', 'Vegan'],
  },
  {
    id: 3,
    name: 'Apple Smoothie',
    ingredients: ['Apple', 'Milk', 'Banana'],
    prepTime: 5,
    dietaryTags: ['Vegetarian'],
  },
]
