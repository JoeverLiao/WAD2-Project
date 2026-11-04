import { Router } from 'express'
import auth from '../middleware/auth.js'
import iconController from '../controllers/iconController.js'

const router = Router()

router.post('/classify', auth.authenticate, iconController.classifyIcons)

export default router
