export async function getAIRecommendations(
  candidates,
  signal
) {
  const token =
    localStorage.getItem('token') ||
    localStorage.getItem('authToken') ||
    localStorage.getItem('fullcircle-token')

  const response = await fetch(
    '/api/recipe-recommendations',
    {
      method: 'POST',
      credentials: 'include',
      signal,

      headers: {
        'Content-Type': 'application/json',
        ...(token
          ? { Authorization: `Bearer ${token}` }
          : {}),
      },

      body: JSON.stringify({
        candidates: candidates.map(recipe => ({
          id: recipe.id,
          name: recipe.name,
          ingredients: recipe.ingredients,
        })),
      }),
    }
  )

  const data = await response.json()

  if (!response.ok) {
    throw new Error(
      data.error || 'Recommendations unavailable.'
    )
  }

  return data
}