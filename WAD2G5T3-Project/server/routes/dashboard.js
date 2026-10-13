// import { Router } from 'express'
// import { authenticate } from '../middleware/auth.js'
// import * as controller from '../controllers/dashboard.js'

// const router = Router()

// router.get('/', authenticate, controller.getDashboard)

// export default router
// PLACEHOLDER CODE since MONGODB IS NOT CONNECTING
import express from 'express'
import { getDashboard } from '../controllers/dashboard.js'

const router = express.Router()

router.get('/', getDashboard) 

export default router

