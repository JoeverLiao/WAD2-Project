
const BASE_URL = 'https://www.themealdb.com/api/json/v1/1'

const cache = new Map()
const CACHE_DURATION = 24 * 60 * 60 * 1000

async function mealDbRequest(endpoint, params = {}) {
  const url = new URL(`${BASE_URL}/${endpoint}`)

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, String(value))
  })

  const cacheKey = url.toString()
  const cached = cache.get(cacheKey)

  if (cached && Date.now() - cached.time < CACHE_DURATION) {
    return cached.data
  }

  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000),
  })

  if (!response.ok) {
    throw new Error(`TheMealDB returned HTTP ${response.status}`)
  }

  const data = await response.json()

  cache.set(cacheKey, {
    data,
    time: Date.now(),
  })

  return data
}

function normaliseIngredient(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractIngredients(meal) {
  const ingredients = []

  for (let i = 1; i <= 20; i++) {
    const name = meal[`strIngredient${i}`]?.trim()
    const amount = meal[`strMeasure${i}`]?.trim() || ''

    if (name) {
      ingredients.push({
        name,
        amount,
      })
    }
  }

  return ingredients
}

function transformRecipe(meal, inventoryIngredients = []) {
  const ingredients = extractIngredients(meal)

  const available = new Set(
    inventoryIngredients.map(normaliseIngredient)
  )

  const usedIngredients = ingredients
    .filter(item => available.has(normaliseIngredient(item.name)))
    .map(item => ({
      name: item.name,
      amount: item.amount,
    }))

  const missedIngredients = ingredients
    .filter(item => !available.has(normaliseIngredient(item.name)))
    .map(item => ({
      name: item.name,
      amount: item.amount,
    }))

  const matchPercentage = ingredients.length
    ? Math.round((usedIngredients.length / ingredients.length) * 100)
    : 0

  return {
    id: meal.idMeal,
    title: meal.strMeal,
    name: meal.strMeal,
    image: meal.strMealThumb,
    category: meal.strCategory || '',
    area: meal.strArea || '',
    instructions: meal.strInstructions || '',
    sourceUrl: meal.strSource || '',
    youtubeUrl: meal.strYoutube || '',
    ingredients,
    usedIngredients,
    missedIngredients,
    usedIngredientCount: usedIngredients.length,
    missedIngredientCount: missedIngredients.length,
    matchPercentage,
    readyInMinutes: null,
  }
}

async function getFreshness(req, res) {
  res.json({
    message: 'Freshness timeline integration pending',
  })
}

async function getRecipes(req, res) {
  try {
    const ingredients = [
      ...new Set(
        String(req.query.ingredients || '')
          .split(',')
          .map(normaliseIngredient)
          .filter(Boolean)
      ),
    ].slice(0, 5)

    if (!ingredients.length) {
      return res.json([])
    }

    console.log('Searching TheMealDB for:', ingredients)

    // Free TheMealDB supports one ingredient per search.
    const searchResults = await Promise.allSettled(
      ingredients.map(ingredient =>
        mealDbRequest('filter.php', {
          i: ingredient.replace(/\s+/g, '_'),
        })
      )
    )

    const mealIds = new Set()

    for (const result of searchResults) {
      if (result.status === 'fulfilled') {
        for (const meal of result.value.meals || []) {
          mealIds.add(meal.idMeal)
        }
      } else {
        console.error('Ingredient search failed:', result.reason)
      }
    }

    if (!mealIds.size) {
      const allFailed = searchResults.every(
        result => result.status === 'rejected'
      )

      if (allFailed) {
        throw new Error('All TheMealDB searches failed')
      }

      return res.json([])
    }

    // Limit detail requests to avoid excessive API traffic.
    const selectedIds = [...mealIds].slice(0, 12)

    const detailResults = await Promise.allSettled(
      selectedIds.map(id =>
        mealDbRequest('lookup.php', { i: id })
      )
    )

    const recipes = []

    for (const result of detailResults) {
      if (result.status === 'fulfilled') {
        const meal = result.value.meals?.[0]

        if (meal) {
          recipes.push(transformRecipe(meal, ingredients))
        }
      } else {
        console.error('Recipe lookup failed:', result.reason)
      }
    }

    if (!recipes.length) {
      throw new Error('Could not retrieve recipe details')
    }

    recipes.sort(
      (a, b) =>
        b.matchPercentage - a.matchPercentage ||
        a.missedIngredientCount - b.missedIngredientCount
    )

    console.log('Recipes returned:', recipes.length)

    return res.json(recipes)
  } catch (error) {
    console.error('Recipe search error:', error)

    return res.status(502).json({
      message: 'Unable to fetch recipes',
      error: error.message,
    })
  }
}

async function getRecipeDetails(req, res) {
  try {
    const id = String(req.params.id)

    if (!/^\d+$/.test(id)) {
      return res.status(400).json({
        message: 'Invalid recipe ID',
      })
    }

    const data = await mealDbRequest('lookup.php', { i: id })
    const meal = data.meals?.[0]

    if (!meal) {
      return res.status(404).json({
        message: 'Recipe not found',
      })
    }

    return res.json(transformRecipe(meal))
  } catch (error) {
    console.error('Recipe details error:', error)

    return res.status(502).json({
      message: 'Unable to fetch recipe details',
      error: error.message,
    })
  }
}

export default {
  getFreshness,
  getRecipes,
  getRecipeDetails,
}
