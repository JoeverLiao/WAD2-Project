import { readFile, writeFile } from 'node:fs/promises'
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'

const CREDENTIALS_PATH = '../data/credentials.json'

let cache = null
let cacheTime = 0
const CACHE_TTL = 1000

async function readAll() {
  const now = Date.now()
  if (cache && now - cacheTime < CACHE_TTL) return cache
  const raw = await readFile(CREDENTIALS_PATH, 'utf8')
  cache = JSON.parse(raw)
  cacheTime = now
  return cache
}

async function writeAll(data) {
  await writeFile(CREDENTIALS_PATH, JSON.stringify(data, null, 2))
  cache = data
  cacheTime = Date.now()
}

export function generateId() {
  return crypto.randomUUID()
}

export async function findUserByEmail(email) {
  const users = await readAll()
  return users.find((u) => u.email === email.toLowerCase().trim())
}

export async function findUserById(id) {
  const users = await readAll()
  return users.find((u) => u.id === id)
}

export async function createUser({ username, email, password }) {
  const users = await readAll()
  const user = {
    id: generateId(),
    username: username.trim(),
    email: email.toLowerCase().trim(),
    password: bcrypt.hashSync(password, 12),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  users.push(user)
  await writeAll(users)
  return user
}

export async function updateUser(id, updates) {
  const users = await readAll()
  const idx = users.reduce((found, u, i) => (u.id === id) ? i : found, -1)
  if (idx === -1) return null
  users[idx] = { ...users[idx], ...updates, updatedAt: new Date().toISOString() }
  await writeAll(users)
  return users[idx]
}

export function toPublicJSON(user) {
  return { id: user.id, username: user.username, email: user.email }
}

export function verifyPassword(password, stored) {
  return bcrypt.compareSync(password, stored)
}
