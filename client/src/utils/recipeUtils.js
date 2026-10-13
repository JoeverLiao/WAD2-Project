
function normalizeIngredient(name) {
  return name.trim().toLowerCase()
}

export function matchRecipes(recipes, inventory) {
  const availableIngredients = new Set(
    inventory
      .filter(item => item.quantity > 0)
      .filter(item => item.daysRemaining === null || item.daysRemaining >= 0)
      .map(item => normalizeIngredient(item.name)),
  )

  return recipes.map(recipe => {
    const missingIngredients = recipe.ingredients.filter(
      ingredient =>
        !availableIngredients.has(normalizeIngredient(ingredient)),
    )

    const matchedIngredients = recipe.ingredients.filter(
      ingredient =>
        availableIngredients.has(normalizeIngredient(ingredient)),
    )

    return {
      ...recipe,
      matchedIngredients,
      missingIngredients,
    }
  }).sort((a, b) =>
    a.missingIngredients.length - b.missingIngredients.length,
  )
}

export function filterRecipes(recipes, filters) {
  return recipes.filter(recipe => {
    const matchesTime =
      !filters.maxTime || recipe.prepTime <= Number(filters.maxTime)

    const matchesDiet =
      !filters.diet ||
      recipe.dietaryTags.includes(filters.diet)

    const matchesIngredient =
      !filters.ingredient ||
      recipe.ingredients.some(ingredient =>
        normalizeIngredient(ingredient).includes(
          normalizeIngredient(filters.ingredient),
        ),
      )

    return matchesTime && matchesDiet && matchesIngredient
  })
}
