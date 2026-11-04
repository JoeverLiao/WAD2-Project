// Client settings for food icons. Each value can be overridden with a VITE_ variable
// in client/.env (see client/.env.example).
const env = import.meta.env ?? {}

const number = (value, fallback) => {
  const parsed = Number(value)
  return value !== undefined && value !== '' && Number.isFinite(parsed) ? parsed : fallback
}

export const iconConfig = Object.freeze({
  // Backend endpoint that asks Claude. The API key lives on the server only.
  endpoint: env.VITE_ICON_ENDPOINT || '/api/icons/classify',
  // Colour used with the fallback icon when Claude cannot answer.
  fallbackColor: env.VITE_ICON_FALLBACK_COLOR || '#D9D4C7',
  // localStorage key for answers. Change it to make every browser ask again.
  cacheKey: env.VITE_ICON_CACHE_KEY || 'fullCircle.foodIcons.v2',
  // Set to "false" to keep answers in memory only.
  persistCache: env.VITE_ICON_PERSIST_CACHE !== 'false',
  // Most answers kept; the oldest are dropped first.
  maxCacheEntries: number(env.VITE_ICON_CACHE_MAX_ENTRIES, 2000),
  // Names requested within this window are sent in one request, at most batchSize per request.
  batchDelayMs: number(env.VITE_ICON_BATCH_DELAY_MS, 60),
  batchSize: number(env.VITE_ICON_BATCH_SIZE, 50),
})
