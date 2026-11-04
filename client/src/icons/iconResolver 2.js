// Resolves a food name to { icon, color } by asking the backend (which asks Claude), once per name.
//
// - Answers are cached per normalised name in memory and in localStorage, so a name is never sent
//   twice. Every cached or returned answer is validated against the manifest first.
// - Several requests for the same name while one is in flight share that one request.
// - Names requested close together are sent in one batch (see config.js).
// - If the request fails or an answer is invalid, the name gets the fallback icon and colour for the
//   rest of this page visit (not saved), so it is asked again on the next visit.
import { reactive } from 'vue'
import { iconConfig } from './config.js'
import { fallbackIconId, manifest } from './manifest.js'
import { normaliseFoodName, validateIconResult } from './iconRules.js'

const FALLBACK = Object.freeze({ icon: fallbackIconId, color: iconConfig.fallbackColor })

async function requestFromBackend(names) {
  const response = await fetch(iconConfig.endpoint, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ names }),
  })
  if (!response.ok) throw new Error(`Icon request failed (${response.status})`)
  return (await response.json()).items ?? []
}

function loadSaved() {
  if (!iconConfig.persistCache) return []
  try {
    const saved = JSON.parse(localStorage.getItem(iconConfig.cacheKey) ?? '{}')
    return Object.entries(saved)
      .map(([key, answer]) => [key, validateIconResult(answer, manifest)])
      .filter(([key, answer]) => key && answer)
  } catch {
    return []
  }
}

function save() {
  if (!iconConfig.persistCache) return
  try {
    localStorage.setItem(iconConfig.cacheKey, JSON.stringify(Object.fromEntries(answers)))
  } catch {
    // Storage full or blocked: answers still last in memory until the page is closed.
  }
}

// Unit tests of other components never make requests unless a test sets one up.
let request = import.meta.env?.MODE === 'test' ? null : requestFromBackend
const answers = reactive(new Map(loadSaved())) // name -> { icon, color }
const failed = reactive(new Set()) // names that got the fallback this visit
const inFlight = new Map() // name -> Promise
const queue = new Map() // name -> resolve function
let timer = null

function remember(key, answer) {
  answers.delete(key)
  answers.set(key, answer)
  while (answers.size > iconConfig.maxCacheEntries) answers.delete(answers.keys().next().value)
}

async function flush() {
  timer = null
  const batch = [...queue].slice(0, iconConfig.batchSize)
  batch.forEach(([key]) => queue.delete(key))
  if (queue.size) timer = setTimeout(flush, iconConfig.batchDelayMs)

  let items = []
  try {
    items = await request(batch.map(([key]) => key))
  } catch (error) {
    console.warn('Food icons unavailable, showing the fallback icon:', error.message)
  }

  const byName = new Map(
    (Array.isArray(items) ? items : []).map((item) => [normaliseFoodName(item?.input), item]),
  )
  for (const [key, resolve] of batch) {
    const answer = validateIconResult(byName.get(key), manifest)
    if (answer) {
      remember(key, answer)
      resolve({ ...answer, source: 'ai' })
    } else {
      failed.add(key)
      resolve({ ...FALLBACK, source: 'fallback' })
    }
    inFlight.delete(key)
  }
  save()
}

/**
 * The icon for a food name. Resolves to { icon, color, source } where source is
 * 'cache', 'ai' or 'fallback'. Never rejects.
 */
export function resolveFoodIcon(name) {
  const key = normaliseFoodName(name)
  const cached = key && answers.get(key)
  if (cached) return Promise.resolve({ ...cached, source: 'cache' })
  if (!key || !request || failed.has(key)) return Promise.resolve({ ...FALLBACK, source: 'fallback' })
  if (inFlight.has(key)) return inFlight.get(key)

  const promise = new Promise((resolve) => queue.set(key, resolve))
  inFlight.set(key, promise)
  timer ??= setTimeout(flush, iconConfig.batchDelayMs)
  return promise
}

/**
 * The current state for a food name, read reactively (for components):
 * { loading: true } while it is being resolved, otherwise { loading: false, icon, color }.
 * Call resolveFoodIcon first to start resolving.
 */
export function foodIconState(name) {
  const key = normaliseFoodName(name)
  const answer = key && answers.get(key)
  if (answer) return { loading: false, ...answer }
  if (!key || !request || failed.has(key)) return { loading: false, ...FALLBACK }
  return { loading: true }
}

/** For tests: replace the backend request (null turns requests off) and forget everything. */
export function resetIconResolver({ request: next = null, clearStorage = true } = {}) {
  request = next
  answers.clear()
  failed.clear()
  inFlight.clear()
  queue.clear()
  clearTimeout(timer)
  timer = null
  if (clearStorage) {
    try {
      localStorage.removeItem(iconConfig.cacheKey)
    } catch {
      // ignore
    }
  } else {
    for (const [key, answer] of loadSaved()) answers.set(key, answer)
  }
}

/** For tests: send any waiting names now. */
export const flushIconRequests = () => (timer ? (clearTimeout(timer), flush()) : Promise.resolve())
