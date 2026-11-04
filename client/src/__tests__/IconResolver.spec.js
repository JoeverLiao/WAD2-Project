import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import manifest from '../icons/manifest.json'
import { iconConfig } from '../icons/config.js'
import {
  flushIconRequests,
  foodIconState,
  resetIconResolver,
  resolveFoodIcon,
} from '../icons/iconResolver.js'

const RED = manifest.palette.red.toUpperCase()
const YELLOW = manifest.palette.yellow.toUpperCase()
const FALLBACK = { icon: manifest.fallbackIcon, color: iconConfig.fallbackColor }

// Mock backend: answers each name from the table, or leaves it out.
const TABLE = { apple: { icon: 'fruit', color: RED }, banana: { icon: 'banana', color: YELLOW } }
const mockBackend = () =>
  vi.fn(async (names) => names.filter((name) => TABLE[name]).map((name) => ({ input: name, ...TABLE[name] })))

// An in-memory localStorage, so these tests do not depend on the test environment's storage.
function memoryStorage() {
  const data = new Map()
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    clear: () => data.clear(),
  }
}

let request
beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
  request = mockBackend()
  resetIconResolver({ request })
})
afterEach(() => {
  resetIconResolver()
  vi.unstubAllGlobals()
})

describe('resolveFoodIcon', () => {
  it('asks the backend and returns the validated answer', async () => {
    const pending = resolveFoodIcon('Banana')
    expect(foodIconState('banana')).toEqual({ loading: true })
    await flushIconRequests()

    expect(await pending).toEqual({ icon: 'banana', color: YELLOW, source: 'ai' })
    expect(foodIconState('banana')).toEqual({ loading: false, icon: 'banana', color: YELLOW })
  })

  it('never asks twice for the same normalised name', async () => {
    resolveFoodIcon('apple')
    await flushIconRequests()
    expect(await resolveFoodIcon('  APPLE ')).toEqual({ icon: 'fruit', color: RED, source: 'cache' })
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('shares one in-flight request between callers and batches different names', async () => {
    const a = resolveFoodIcon('apple')
    const b = resolveFoodIcon('Apple')
    const c = resolveFoodIcon('banana')
    expect(a).toBe(b)
    await flushIconRequests()
    await Promise.all([a, b, c])

    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith(['apple', 'banana'])
  })

  it('keeps answers in localStorage across page loads', async () => {
    resolveFoodIcon('apple')
    await flushIconRequests()
    expect(JSON.parse(localStorage.getItem(iconConfig.cacheKey))).toEqual({ apple: { icon: 'fruit', color: RED } })

    const nextVisit = mockBackend()
    resetIconResolver({ request: nextVisit, clearStorage: false })
    expect(await resolveFoodIcon('apple')).toEqual({ icon: 'fruit', color: RED, source: 'cache' })
    expect(nextVisit).not.toHaveBeenCalled()
  })

  it('ignores saved answers that no longer match the manifest', async () => {
    localStorage.setItem(iconConfig.cacheKey, JSON.stringify({ apple: { icon: 'removed-icon', color: RED } }))
    resetIconResolver({ request, clearStorage: false })
    resolveFoodIcon('apple')
    await flushIconRequests()
    expect(request).toHaveBeenCalledWith(['apple'])
  })

  it('falls back to the generic icon for a name the backend could not classify', async () => {
    const pending = resolveFoodIcon('mystery item')
    await flushIconRequests()
    expect(await pending).toEqual({ ...FALLBACK, source: 'fallback' })
    expect(foodIconState('mystery item')).toEqual({ loading: false, ...FALLBACK })
  })

  it('falls back for invalid answers and does not save them', async () => {
    resetIconResolver({
      request: async () => [
        { input: 'apple', icon: 'not-an-icon', color: RED },
        { input: 'banana', icon: 'banana', color: 'yellow' },
      ],
    })
    const results = [resolveFoodIcon('apple'), resolveFoodIcon('banana')]
    await flushIconRequests()

    for (const result of await Promise.all(results)) expect(result).toEqual({ ...FALLBACK, source: 'fallback' })
    expect(localStorage.getItem(iconConfig.cacheKey)).toBe('{}')
  })

  it('falls back without crashing when the backend errors', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    resetIconResolver({ request: vi.fn().mockRejectedValue(new Error('offline')) })
    const pending = resolveFoodIcon('apple')
    await flushIconRequests()
    expect(await pending).toEqual({ ...FALLBACK, source: 'fallback' })
  })

  it('returns the fallback straight away for an empty name', async () => {
    expect(await resolveFoodIcon('   ')).toEqual({ ...FALLBACK, source: 'fallback' })
    expect(request).not.toHaveBeenCalled()
  })
})
