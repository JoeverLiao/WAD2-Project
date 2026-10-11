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

export function signToken(user) {
  return jwt.sign({ userId: user.id }, JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  })
}

export function authenticate(req, res, next) {
  const cookies = parseCookies(req.headers?.cookie)
  const token = cookies.token
  if (!token) return res.status(401).json({ error: 'Authentication required' })

  try {
    const payload = jwt.verify(token, JWT_SECRET)
    req.userId = payload.userId
    next()
  } catch {
    res.clearCookie('token')
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}
