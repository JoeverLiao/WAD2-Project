import { Router } from 'express'
import analyticsController from '../controllers/analyticsController.js'

import auth from '../middleware/auth.js'

const router = Router()
router.use(auth.authenticate)

router.get('/', analyticsController.getAnalytics)
router.get('/history', analyticsController.getHistory)
router.post('/events', analyticsController.createEvent)

router.put('/events/:id', analyticsController.updateEvent)

export default router
