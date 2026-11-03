import { Router } from 'express'
import auth from '../middleware/auth.js'
import userRecipeController from '../controllers/userRecipeController.js'

const router = Router()

router.use(auth.authenticate)

router.get('/', userRecipeController.list)

router.post('/save', userRecipeController.save)

router.post('/cooked', userRecipeController.cooked)

router.delete(
  '/:recipeId/save',
  userRecipeController.unsave
)

export default router