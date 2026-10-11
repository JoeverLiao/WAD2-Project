import { signToken } from '../middleware/auth.js'
import {
  findUserByEmail,
  findUserById,
  createUser,
  updateUser,
  toPublicJSON,
  verifyPassword,
} from '../config/jsonDb.js'

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

    const existing = await findUserByEmail(email)
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' })
    }

    const user = await createUser({ username, email, password })
    const token = signToken(user)

    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    })

    res.status(201).json(toPublicJSON(user))
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

    const user = await findUserByEmail(email)
    if (!user || !verifyPassword(password, user.password)) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const token = signToken(user)

    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    })

    res.json(toPublicJSON(user))
  } catch (error) {
    next(error)
  }
}

export function logout(_req, res) {
  res.clearCookie('token', { path: '/' })
  res.json({ message: 'Logged out successfully' })
}

export async function getProfile(req, res, next) {
  try {
    const user = await findUserById(req.userId)
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json(toPublicJSON(user))
  } catch (error) {
    next(error)
  }
}

export async function updateProfile(req, res, next) {
  try {
    if (!req.body) return res.status(400).json({ error: 'Request body is required' })
    const updates = {}
    if (req.body.username?.trim()) updates.username = req.body.username.trim()
    if (req.body.email?.trim()) updates.email = req.body.email.trim()
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' })
    }

    const user = await updateUser(req.userId, updates)
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json(toPublicJSON(user))
  } catch (error) {
    next(error)
  }
}
