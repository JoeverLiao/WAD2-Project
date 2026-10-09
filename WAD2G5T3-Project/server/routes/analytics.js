import { Router } from 'express'
import * as controller from '../controllers/analytics.js'

const router = Router()

router.get('/', controller.getAnalytics)
router.get('/history', controller.getHistory)
router.post('/events', controller.createEvent)

export default router
