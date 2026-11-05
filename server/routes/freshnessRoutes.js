
import { Router } from 'express'
import freshnessController from '../controllers/freshnessController.js'
import { estimateTimes } from '../controllers/recipeTimeController.js'
import auth from '../middleware/auth.js'

const router = Router()

router.get(
  '/',
  freshnessController.getFreshness
)

router.get(
  '/recipes',
  freshnessController.getRecipes
)

router.get(
  '/recipes/explore',
  freshnessController.exploreRecipes
)

router.post(
  '/recipes/estimate-times',
  auth.authenticate,
  estimateTimes
)

router.get(
  '/recipes/:id',
  freshnessController.getRecipeDetails
)

export default router
