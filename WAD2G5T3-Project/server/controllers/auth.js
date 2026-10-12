import User from '../models/User.js'
import { signToken } from '../middleware/auth.js'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-not-for-production'

function parseCookies(header) {
  const cookies = {}
  if (!header) return cookies
  header.split(';').forEach((pair) => {
    const eq = pair.indexOf('=')
    if (eq !== -1) cookies[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim()
  })
  return cookies
}

export async function register(req, res, next) {
  try {
    if (!req.body) return res.status(400).json({ error: 'Request body is required' })
    const { username, email, password } = req.body
    if (!username?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' })
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' })
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() })
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' })
    }

    const user = new User({ name: username.trim(), email: email.toLowerCase().trim(), password })
    await user.save()

    const token = signToken(user)

    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    })

    res.status(201).json(user.toPublicJSON())
  } catch (error) {
    next(error)
  }
}

export async function login(req, res, next) {
  try {
    if (!req.body) return res.status(400).json({ error: 'Request body is required' })
    const { email, password } = req.body
    if (!email?.trim() || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() })
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const valid = await user.comparePassword(password)
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    user.loginStatus = true
    user.lastLogin = new Date()
    await user.save()

    const token = signToken(user)

    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    })

    res.json(user.toPublicJSON())
  } catch (error) {
    next(error)
  }
}

export async function logout(req, res, next) {
  try {
    const cookies = parseCookies(req.headers?.cookie)
    const token = cookies.token
    if (token) {
      try {
        const payload = jwt.verify(token, JWT_SECRET)
        if (payload.userId) {
          await User.findByIdAndUpdate(payload.userId, { loginStatus: false })
        }
      } catch {
        // Invalid token — still clear the cookie
      }
    }
    res.clearCookie('token', { path: '/' })
    res.json({ message: 'Logged out successfully' })
  } catch (error) {
    next(error)
  }
}

export async function getProfile(req, res, next) {
  try {
    const user = await User.findById(req.userId)
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json(user.toPublicJSON())
  } catch (error) {
    next(error)
  }
}

export async function updateProfile(req, res, next) {
  try {
    if (!req.body) return res.status(400).json({ error: 'Request body is required' })
    const updates = {}
    if (req.body.username?.trim()) updates.name = req.body.username.trim()
    if (req.body.email?.trim()) updates.email = req.body.email.trim()
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' })
    }

    const user = await User.findByIdAndUpdate(req.userId, updates, { new: true })
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json(user.toPublicJSON())
  } catch (error) {
    next(error)
  }
}