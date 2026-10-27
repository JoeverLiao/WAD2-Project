
const BASE = 'https://www.themealdb.com/api/json/v1/1'

// Cache API responses for 15 minutes to reduce requests.
const cache = new Map()
const CACHE_MS = 15 * 60 * 1000

async function mealDB(endpoint, params = {}) {
  const url = new URL(`${BASE}/${endpoint}`)

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  }

  const cacheKey = url.toString()
  const cached = cache.get(cacheKey)

  if (cached && Date.now() - cached.time < CACHE_MS) {
    return cached.data
  }

  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(12000),
  })

  if (!response.ok) {
    throw new Error(`TheMealDB HTTP ${response.status}`)
  }

  const data = await response.json()

  if (cache.size >= 100) {
    cache.delete(cache.keys().next().value)
  }

  cache.set(cacheKey, {
    time: Date.now(),
    data,
  })

  return data
}

// Read the 20 ingredient slots returned by TheMealDB.
function getIngredientDetails(meal) {
  const ingredients = []

  for (let i = 1; i <= 20; i++) {
    const name = String(meal[`strIngredient${i}`] || '').trim()
    const amount = String(meal[`strMeasure${i}`] || '').trim()

    if (name) {
      ingredients.push({ name, amount })
    }
  }

  return ingredients
}

// Convert TheMealDB recipes into the same format
// expected by the Full Circle Vue components.
function normalize(meal) {
  const ingredientDetails = getIngredientDetails(meal)

  const instructions = String(meal.strInstructions || '')
    .split(/\r?\n+/)
    .map(step => step.trim())
    .filter(Boolean)

  const dietaryTags = []

  if (meal.strCategory === 'Vegetarian') {
    dietaryTags.push('Vegetarian')
  }

  if (meal.strCategory === 'Vegan') {
    dietaryTags.push('Vegan')
    dietaryTags.push('Vegetarian')
  }

  return {
    id: String(meal.idMeal),
    name: meal.strMeal || '',
    image: meal.strMealThumb || '',
    category: meal.strCategory || '',
    area: meal.strArea || '',
    prepTime: null,
    servings: null,
    dietaryTags,
    ingredients: ingredientDetails.map(item => item.name),
    ingredientDetails,
    instructions,
    sourceUrl: meal.strSource || meal.strYoutube || '',
  }
}

// Some TheMealDB endpoints only return basic recipe information.
function normalizePreview(meal) {
  return {
    id: String(meal.idMeal),
    name: meal.strMeal || '',
    image: meal.strMealThumb || '',
    category: '',
    area: '',
    prepTime: null,
    servings: null,
    dietaryTags: [],
    ingredients: [],
    ingredientDetails: [],
    instructions: [],
    sourceUrl: '',
  }
}

function uniqueRecipes(recipes) {
  const seen = new Set()

  return recipes.filter(recipe => {
    if (!recipe?.id || seen.has(recipe.id)) return false
    seen.add(recipe.id)
    return true
  })
}

function normalizeIngredientName(name) {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
}

function ingredientMatches(recipeIngredient, inventoryIngredient) {
  const recipeName = normalizeIngredientName(recipeIngredient)
  const inventoryName = normalizeIngredientName(inventoryIngredient)

  if (!recipeName || !inventoryName) return false

  if (recipeName === inventoryName) return true

  // Allow basic singular/plural matching.
  const singular = name => {
    if (name.endsWith('ies')) return name.slice(0, -3) + 'y'
    if (name.endsWith('es')) return name.slice(0, -2)
    if (name.endsWith('s')) return name.slice(0, -1)
    return name
  }

  if (singular(recipeName) === singular(inventoryName)) {
    return true
  }

  // Handle descriptive ingredients such as "chicken breast"
  // versus an inventory entry named "chicken".
  return (
    recipeName.startsWith(`${inventoryName} `) ||
    inventoryName.startsWith(`${recipeName} `)
  )
}

function scoreRecipe(recipe, inventoryNames) {
  const recipeIngredients = recipe.ingredients || []

  const matchedIngredients = recipeIngredients.filter(ingredient =>
    inventoryNames.some(name => ingredientMatches(ingredient, name))
  )

  const missingIngredients = recipeIngredients.filter(ingredient =>
    !inventoryNames.some(name => ingredientMatches(ingredient, name))
  )

  const matchPercentage = recipeIngredients.length
    ? Math.round((matchedIngredients.length / recipeIngredients.length) * 100)
    : 0

  return {
    ...recipe,
    matchedIngredients,
    missingIngredients,
    matchPercentage,
  }
}

// GET /api/freshness
async function getFreshness(req, res) {
  res.json({
    message: 'Freshness is calculated from inventory expiry dates.',
  })
}

// MY INGREDIENTS
// GET /api/freshness/recipes?ingredients=chicken,tomato,egg
async function getRecipes(req, res) {
  try {
    const names = [
      ...new Set(
        String(req.query.ingredients || '')
          .split(',')
          .map(name => name.trim().toLowerCase())
          .filter(Boolean)
      ),
    ].slice(0, 8)

    if (!names.length) {
      return res.json([])
    }

    // TheMealDB's free API filters by one ingredient at a time.
    // Search several ingredients and combine the results.
    const results = await Promise.allSettled(
      names.slice(0, 5).map(name =>
        mealDB('filter.php', { i: name.replace(/\s+/g, '_') })
      )
    )

    const previews = uniqueRecipes(
      results.flatMap(result => {
        if (result.status !== 'fulfilled') return []

        return (result.value.meals || []).map(normalizePreview)
      })
    )

    if (!previews.length) {
      const allFailed = results.every(result => result.status === 'rejected')

      if (allFailed) {
        throw new Error('All ingredient searches failed')
      }

      return res.json([])
    }

    // Retrieve complete ingredient lists so that we can
    // calculate real match percentages.
    const details = await Promise.allSettled(
      previews.slice(0, 24).map(recipe =>
        mealDB('lookup.php', { i: recipe.id })
      )
    )

    const recipes = details.flatMap(result => {
      if (result.status !== 'fulfilled') return []

      return (result.value.meals || []).map(normalize)
    })

    const ranked = recipes
      .map(recipe => scoreRecipe(recipe, names))
      .sort((a, b) => {
        const matchedDifference =
          b.matchedIngredients.length - a.matchedIngredients.length

        if (matchedDifference !== 0) return matchedDifference

        return b.matchPercentage - a.matchPercentage
      })
      .slice(0, 12)

    res.json(ranked)
  } catch (error) {
    console.error('TheMealDB ingredient search:', error)

    res.status(502).json({
      message: 'Unable to load recipe suggestions',
    })
  }
}

// EXPLORE RECIPES
// GET /api/freshness/recipes/explore?search=pasta
async function exploreRecipes(req, res) {
  try {
    const search = String(req.query.search || '')
      .trim()
      .slice(0, 80)

    let meals = []

    if (search) {
      const data = await mealDB('search.php', { s: search })
      meals = data.meals || []
    } else {
      // TheMealDB does not provide a general paginated search
      // on its free API. Use several popular search terms.
      const terms = ['chicken', 'pasta', 'rice', 'salad']

      const results = await Promise.allSettled(
        terms.map(term => mealDB('search.php', { s: term }))
      )

      if (results.every(result => result.status === 'rejected')) {
        throw new Error('All explore searches failed')
      }

      meals = results.flatMap(result =>
        result.status === 'fulfilled'
          ? result.value.meals || []
          : []
      )
    }

    const recipes = uniqueRecipes(meals.map(normalize))
      .slice(0, 24)

    res.json(recipes)
  } catch (error) {
    console.error('TheMealDB explore:', error)

    res.status(502).json({
      message: 'Unable to explore recipes',
    })
  }
}

// FULL RECIPE DETAILS
// GET /api/freshness/recipes/52772
async function getRecipeDetails(req, res) {
  try {
    if (!/^\d+$/.test(req.params.id)) {
      return res.status(400).json({
        message: 'Invalid recipe ID',
      })
    }

    const data = await mealDB('lookup.php', {
      i: req.params.id,
    })

    const meal = data.meals?.[0]

    if (!meal) {
      return res.status(404).json({
        message: 'Recipe not found',
      })
    }

    res.json(normalize(meal))
  } catch (error) {
    console.error('TheMealDB recipe details:', error)

    res.status(502).json({
      message: 'Unable to load recipe details',
    })
  }
}

export default {
  getFreshness,
  getRecipes,
  exploreRecipes,
  getRecipeDetails,
}
