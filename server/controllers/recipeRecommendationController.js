import InventoryItem from '../models/inventoryItemModel.js'
import UserRecipe from '../models/userRecipeModel.js'

import {
  recommendRecipes,
} from '../services/recipeRecommendationService.js'

export async function getRecommendations(req, res, next) {
  try {
    if (
      !Array.isArray(req.body?.candidates) ||
      req.body.candidates.length > 50
    ) {
      return res.status(400).json({
        error: 'Send at most 50 candidate recipes.',
      })
    }

    const candidates = req.body.candidates
      .filter(recipe =>
        recipe &&
        /^\d{1,30}$/.test(String(recipe.id)) &&
        typeof recipe.name === 'string' &&
        Array.isArray(recipe.ingredients)
      )
      .map(recipe => ({
        id: String(recipe.id),
        name: recipe.name.slice(0, 200),
        ingredients: recipe.ingredients
          .filter(item => typeof item === 'string')
          .slice(0, 50)
          .map(item => item.slice(0, 100)),
      }))

    const [history, inventory] = await Promise.all([
      UserRecipe.find({
        user: req.userId,
      }).lean(),

      InventoryItem.find({
        user: req.userId,
      })
        .select('name expiresAt')
        .lean(),
    ])

    const result = await recommendRecipes({
      candidates,
      history,
      inventory,
    })

    res.json(result)

  } catch (error) {
    next(error)
  }
}