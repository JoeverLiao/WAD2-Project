import { Router } from 'express'
import * as controller from '../controllers/scanning.js'

const router = Router()

router.post('/receipts', controller.scanReceipt)
router.post('/products', controller.scanProduct)
router.post('/confirm', controller.confirmItems)

export default router
