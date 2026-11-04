import {Router} from 'express'
import auth from '../middleware/auth.js'
import communication from '../controllers/rescueCommunicationController.js'
import controller from '../controllers/rescueController.js'
import upload from '../middleware/rescueUpload.js'
import rescueError from '../middleware/rescueError.js'
const router=Router()
router.use(auth.authenticate)
// Specific paths must precede /:id.
router.get('/messages/unread-count',communication.unreadCount)
router.post('/requests/:requestId/messages/read',communication.markRead)
router.get('/mine',controller.myListings)
router.get('/requests',controller.listRequests)
router.get('/requests/:requestId/messages',communication.listMessages)
router.post('/requests/:requestId/messages',communication.sendMessage)
router.post('/requests/:requestId/pickup-proposal',communication.proposePickup)
router.post('/requests/:requestId/pickup-proposal/accept',communication.acceptProposal)
router.post('/requests/:requestId/pickup-proposal/decline',communication.declineProposal)
router.post('/requests/:requestId/pickup-proposal/withdraw',communication.withdrawProposal)
router.post('/requests/:requestId/accept',controller.acceptRequest)
router.post('/requests/:requestId/decline',controller.declineRequest)
router.post('/requests/:requestId/cancel',controller.cancelRequest)
router.get('/',controller.listListings)
router.post('/',controller.createListing)
router.get('/:id/photo',controller.getPhoto)
router.put('/:id/photo',upload,controller.uploadPhoto)
router.delete('/:id/photo',controller.deletePhoto)
router.post('/:id/collect',controller.collectListing)
router.post('/:id/claim',controller.claimListing)
router.delete('/:id/claim',controller.unclaimListing)
router.get('/:id',controller.getListing)
router.patch('/:id',controller.updateListing)
router.delete('/:id',controller.deleteListing)
router.use(rescueError)
export default router
