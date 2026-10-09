import { Router } from 'express'
import * as controller from '../controllers/auth.js'

const router = Router()

router.post('/register', controller.register)
router.post('/login', controller.login)
router.post('/logout', controller.logout)
router.get('/me', controller.getProfile)
router.patch('/me', controller.updateProfile)

export default router
