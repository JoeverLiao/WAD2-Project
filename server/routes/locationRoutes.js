import { Router } from 'express'
import auth from '../middleware/auth.js'
import locationController from '../controllers/locationController.js'

const router = Router()

router.get(
  '/search',
  auth.authenticate,
  locationController.search,
)

router.get(
  '/reverse',
  auth.authenticate,
  locationController.reverse,
)

export default router