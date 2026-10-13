import express from 'express'
import mongoose from 'mongoose'
import { checkDatabase } from './config/database.js'
import authRoutes from './routes/auth.js'
import dashboardRoutes from './routes/dashboard.js'
import scanningRoutes from './routes/scanning.js'
import inventoryRoutes from './routes/inventory.js'
import freshnessRoutes from './routes/freshness.js'
import rescueRoutes from './routes/rescue.js'
import analyticsRoutes from './routes/analytics.js'

function isDatabaseUnavailable(error) {
  return (
    mongoose.connection.readyState !== 1 ||
    ['MongooseServerSelectionError', 'MongoNetworkError', 'MongoNotConnectedError'].includes(
      error.name,
    )
  )
}

export function createApp({ databaseHealth = checkDatabase } = {}) {
  const app = express()
  app.disable('x-powered-by')
  app.use(express.json({ limit: '1mb' }))

  app.get('/api/health', async (_req, res) => {
    try {
      await databaseHealth()
      res.json({ status: 'ok', database: 'connected' })
    } catch {
      res.status(503).json({ status: 'unavailable', database: 'disconnected' })
    }
  })

  app.use('/api/auth', authRoutes)
  app.use('/api/dashboard', dashboardRoutes)
  app.use('/api/scanning', scanningRoutes)
  app.use('/api/inventory', inventoryRoutes)
  app.use('/api/freshness', freshnessRoutes)
  app.use('/api/rescue', rescueRoutes)
  app.use('/api/analytics', analyticsRoutes)

  app.use((_req, res) => res.status(404).json({ error: 'Route not found' }))

  // Express requires all four arguments to recognize error middleware.
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error)
    if (error.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Invalid JSON body' })
    }
    if (error.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request body too large' })
    }
    // Detailed diagnostics stay in the server log only (never the body, headers or cookies).
    console.error(`[${req.method} ${req.originalUrl}] ${error.name}: ${error.message}`)
    if (error.stack) console.error(error.stack)
    if (isDatabaseUnavailable(error)) {
      return res.status(503).json({ error: 'Service temporarily unavailable' })
    }
    res.status(500).json({ error: 'Internal server error' })
  })

  return app
}