import { Router } from 'express'
import auth from '../middleware/auth.js'

import {
  getRecommendations,
} from '../controllers/recipeRecommendationController.js'

const router = Router()

router.post(
  '/',
  auth.authenticate,
  getRecommendations
)

export default router