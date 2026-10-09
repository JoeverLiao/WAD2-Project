import { Router } from 'express'
import * as controller from '../controllers/rescue.js'

const router = Router()

router.get('/', controller.listListings)
router.post('/', controller.createListing)
router.get('/:id', controller.getListing)
router.patch('/:id', controller.updateListing)
router.delete('/:id', controller.deleteListing)
router.post('/:id/claim', controller.claimListing)
router.delete('/:id/claim', controller.unclaimListing)

export default router
