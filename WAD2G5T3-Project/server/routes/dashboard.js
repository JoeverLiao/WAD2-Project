import { Router } from 'express'
import * as controller from '../controllers/dashboard.js'

const router = Router()

router.get('/', controller.getDashboard)

export default router
