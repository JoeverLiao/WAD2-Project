import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import * as controller from '../controllers/dashboard.js'

const router = Router()

router.get('/', authenticate, controller.getDashboard)

export default router
