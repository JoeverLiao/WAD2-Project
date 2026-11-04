export function canonicalName(value) {
  const name = String(value).toLowerCase().trim()

  const aliases = {
    eggs: 'egg',
    tomatoes: 'tomato',
    potatoes: 'potato',
    carrots: 'carrot',
    onions: 'onion',
    mushrooms: 'mushroom',
    'chicken breast': 'chicken',
    'white rice': 'rice',
    'brown rice': 'rice',
    'fresh milk': 'milk',
  }

  return aliases[name] ?? name
}

export function daysUntil(value) {
  if (!value) return null

  const datePart = String(value).slice(0, 10)
  const date = new Date(`${datePart}T12:00:00`)

  if (Number.isNaN(date.getTime())) return null

  const today = new Date()
  today.setHours(12, 0, 0, 0)

  return Math.round((date - today) / 86400000)
}

export function normalizeRecipe(raw) {
  const ingredients = Array.isArray(raw.ingredients)
    ? raw.ingredients
        .map(item =>
          typeof item === 'string'
            ? item
            : item.name ?? item.ingredient ?? ''
        )
        .filter(Boolean)
    : []

  return {
    ...raw,
    id: String(raw.id ?? raw.idMeal ?? ''),
    name: raw.name ?? raw.strMeal ?? 'Recipe',
    image: raw.image ?? raw.strMealThumb ?? '',
    ingredients,
    prepTime: Number(raw.prepTime) || null,
    dietaryTags: Array.isArray(raw.dietaryTags)
      ? raw.dietaryTags
      : [],
  }
}

function normaliseIngredient(value) {
  return canonicalName(value)
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function matchesIngredient(recipeIngredient, ownedIngredient) {
  const a = normaliseIngredient(recipeIngredient)
  const b = normaliseIngredient(ownedIngredient)

  if (!a || !b) return false

  return (
    a === b ||
    a.startsWith(`${b} `) ||
    a.endsWith(` ${b}`) ||
    a.includes(` ${b} `) ||
    b.startsWith(`${a} `)
  )
}

export function analyseRecipes(recipes, inventory) {
  return recipes.map(recipe => {
    const matched = []
    const missing = []
    const urgentIds = new Set()

    for (const ingredient of recipe.ingredients) {
      const found = inventory.find(item =>
        matchesIngredient(ingredient, item.name)
      )

      if (found) {
        matched.push(ingredient)

        if (found.days !== null && found.days <= 3) {
          urgentIds.add(found.localId || found._id || found.id || found.name)
        }
      } else {
        missing.push(ingredient)
      }
    }

    const percentage = recipe.ingredients.length
      ? Math.round(
          matched.length / recipe.ingredients.length * 100
        )
      : 0

    return {
      ...recipe,
      matched,
      missing,
      percentage,
      rescueScore: Math.round(
        percentage * 0.7 +
        Math.min(urgentIds.size, 3) * 10
      ),
    }
  })
}
