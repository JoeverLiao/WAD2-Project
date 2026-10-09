import { Router } from 'express'
import * as controller from '../controllers/inventory.js'

const router = Router()

router.get('/', controller.listItems)
router.post('/', controller.createItem)
router.get('/:id', controller.getItem)
router.patch('/:id', controller.updateItem)
router.delete('/:id', controller.deleteItem)

export default router
