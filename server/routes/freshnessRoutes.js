import { Router } from 'express'
import freshnessController from '../controllers/freshnessController.js'

const router = Router()

router.get('/', freshnessController.getFreshness)
router.get('/recipes', freshnessController.getRecipes)

export default router
