
import { Router } from 'express'
import freshnessController from '../controllers/freshnessController.js'

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

router.get(
  '/recipes/:id',
  freshnessController.getRecipeDetails
)

export default router
