import { Router } from 'express'
import inventoryController from '../controllers/inventoryController.js'

const router = Router()

router.get('/', inventoryController.listItems)
router.post('/', inventoryController.createItem)
router.get('/:id', inventoryController.getItem)
router.patch('/:id', inventoryController.updateItem)
router.delete('/:id', inventoryController.deleteItem)

export default router
