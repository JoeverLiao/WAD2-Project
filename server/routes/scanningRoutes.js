
import { Router } from 'express'
import auth from '../middleware/auth.js'
import upload from '../middleware/upload.js'
import scanningController from '../controllers/scanningController.js'

const router = Router()

router.post('/receipts', auth.authenticate, upload.receiptUpload, scanningController.scanReceipt)
router.post('/products', scanningController.scanProduct)
router.post('/confirm', auth.authenticate, scanningController.confirmItems)

export default router
