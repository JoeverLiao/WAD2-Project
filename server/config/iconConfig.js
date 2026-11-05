// Server settings for food icon classification, read from the environment (server/config.env;
import { fileURLToPath } from 'node:url'

const number = (value, fallback) => {
  const parsed = Number(value)
  return value !== undefined && value !== '' && Number.isFinite(parsed) ? parsed : fallback
}

export function iconConfig(env = process.env) {
  return {
    // Icons use their own key, separate from ANTHROPIC_API_KEY (used by other features).
    apiKey: env.ICON_AI_API_KEY || '',
    model: env.ICON_AI_MODEL || env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
    maxTokens: number(env.ICON_AI_MAX_TOKENS, 8000),
    // low suits a quick classification; raise it if answers look careless.
    effort: env.ICON_AI_EFFORT || 'low',
    timeoutMs: number(env.ICON_AI_TIMEOUT_MS, 30000),
    // On a safety refusal, let the API retry on a suitable model ("default" fallbacks).
    // Set to "false" for models or platforms that do not support server-side fallbacks.
    refusalFallback: env.ICON_AI_REFUSAL_FALLBACK !== 'false',
    maxNamesPerRequest: number(env.ICON_AI_MAX_NAMES, 50),
    cacheSize: number(env.ICON_AI_CACHE_SIZE, 2000),
    manifestPath:
      env.ICON_MANIFEST_PATH ||
      fileURLToPath(new URL('../../client/src/icons/manifest.json', import.meta.url)),
  }
}
