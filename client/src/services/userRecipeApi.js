
const BASE = '/api/user-recipes'

function headers() {
  const token =
    localStorage.getItem('token') ||
    localStorage.getItem('authToken') ||
    localStorage.getItem('fullcircle-token')

  return {
    'Content-Type': 'application/json',
    ...(token
      ? { Authorization: `Bearer ${token}` }
      : {}),
  }
}

async function request(path = '', options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      ...headers(),
      ...options.headers,
    },
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(
      data.error ||
      `Request failed (${response.status})`
    )
  }

  return data
}

function recipePayload(recipe) {
  return {
    recipeId: String(recipe.id ?? recipe.idMeal),
    name: recipe.name ?? recipe.strMeal,
    image: recipe.image ?? recipe.strMealThumb ?? '',
    ingredients: recipe.ingredients ?? [],
    dietaryTags: recipe.dietaryTags ?? [],
  }
}

export async function getUserRecipes() {
  const data = await request()
  return data.recipes
}

export async function saveUserRecipe(recipe) {
  return request('/save', {
    method: 'POST',
    body: JSON.stringify(recipePayload(recipe)),
  })
}

export async function unsaveUserRecipe(recipeId) {
  return request(
    `/${encodeURIComponent(recipeId)}/save`,
    { method: 'DELETE' }
  )
}

export async function markUserRecipeCooked(recipe) {
  return request('/cooked', {
    method: 'POST',
    body: JSON.stringify(recipePayload(recipe)),
  })
}
