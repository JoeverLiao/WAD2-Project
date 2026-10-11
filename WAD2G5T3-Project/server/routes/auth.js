import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import * as controller from '../controllers/auth.js'

const router = Router()

router.post('/register', controller.register)
router.post('/login', controller.login)
router.post('/logout', controller.logout)
router.get('/me', authenticate, controller.getProfile)
router.patch('/me', authenticate, controller.updateProfile)

export default router
