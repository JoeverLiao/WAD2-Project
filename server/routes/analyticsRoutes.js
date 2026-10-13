import { Router } from 'express'
import analyticsController from '../controllers/analyticsController.js'

const router = Router()

router.get('/', analyticsController.getAnalytics)
router.get('/history', analyticsController.getHistory)
router.post('/events', analyticsController.createEvent)

export default router
