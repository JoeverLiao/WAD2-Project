import { Router } from 'express'
import auth from '../middleware/auth.js'
import authController from '../controllers/authController.js'

const router = Router()

router.post('/register', authController.register)
router.post('/login', authController.login)
router.post('/logout', authController.logout)
router.get('/me', auth.authenticate, authController.getProfile)
router.patch('/me', auth.authenticate, authController.updateProfile)

export default router
