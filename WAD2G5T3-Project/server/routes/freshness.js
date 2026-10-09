import { Router } from 'express'
import * as controller from '../controllers/freshness.js'

const router = Router()

router.get('/', controller.getFreshness)
router.get('/recipes', controller.getRecipes)

export default router
