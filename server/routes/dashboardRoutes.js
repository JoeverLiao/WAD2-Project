import { Router } from 'express'
import auth from '../middleware/auth.js'
import dashboardController from '../controllers/dashboardController.js'

const router = Router()

router.get('/', auth.authenticate, dashboardController.getDashboard)

export default router

