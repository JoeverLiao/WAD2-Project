
import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { receiptUpload } from '../middleware/upload.js'
import * as controller from '../controllers/scanning.js'

const router = Router()

router.post('/receipts', authenticate, receiptUpload, controller.scanReceipt)
router.post('/products', controller.scanProduct)
router.post('/confirm', controller.confirmItems)

export default router
