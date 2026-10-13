import { Router } from 'express'
import rescueController from '../controllers/rescueController.js'

const router = Router()

router.get('/', rescueController.listListings)
router.post('/', rescueController.createListing)
router.get('/:id', rescueController.getListing)
router.patch('/:id', rescueController.updateListing)
router.delete('/:id', rescueController.deleteListing)
router.post('/:id/claim', rescueController.claimListing)
router.delete('/:id/claim', rescueController.unclaimListing)

export default router
