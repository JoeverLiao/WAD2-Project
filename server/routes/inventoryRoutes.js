import { Router } from 'express'
import inventoryController from '../controllers/inventoryController.js'
import auth from '../middleware/auth.js'

// A Router groups all endpoints under /api/inventory.
const router = Router()

// Protect EVERY inventory endpoint. The middleware validates the login token
// and sets req.userId before a controller is allowed to access the database.
router.get('/', auth.authenticate, inventoryController.listItems)
router.post('/', auth.authenticate, inventoryController.createItem)
router.get('/:id', auth.authenticate, inventoryController.getItem)
router.patch('/:id', auth.authenticate, inventoryController.updateItem)
router.delete('/:id', auth.authenticate, inventoryController.deleteItem)

export default router
