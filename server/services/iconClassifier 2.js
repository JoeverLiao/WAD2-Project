// Asks Claude which icon and colour fit each food name. Claude's only job is to CHOOSE from the
// icon manifest (client/src/icons/manifest.json); it never draws anything.
//
// The prompt and the JSON schema of the answer are built from the manifest, so adding an icon
// to the manifest is enough for Claude to start using it. Every answer is checked against the
// manifest; anything else is dropped and the client shows its fallback icon for that name.
// Only food NAMES are sent: never quantities, dates, the user's id or email.
import { readFileSync } from 'node:fs'
import Anthropic from '@anthropic-ai/sdk'
import { iconConfig } from '../config/iconConfig.js'
import {
  buildOutputSchema,
  buildSystemPrompt,
  normaliseFoodName,
  validateIconResult,
} from '../../client/src/icons/iconRules.js'

const cache = new Map() // normalised name -> { icon, color }
let loaded = null // { path, manifest, system, schema }
let client = null

function loadManifest(path) {
  if (loaded?.path !== path) {
    const manifest = JSON.parse(readFileSync(path, 'utf8'))
    loaded = { path, manifest, system: buildSystemPrompt(manifest), schema: buildOutputSchema(manifest) }
  }
  return loaded
}

function defaultClient(apiKey) {
  client ??= new Anthropic({ apiKey })
  return client
}

async function askClaude(names, { anthropic, config, system, schema }) {
  const params = {
    model: config.model,
    max_tokens: config.maxTokens,
    system,
    output_config: { effort: config.effort, format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content: names.map((name, i) => `${i}. ${name}`).join('\n') }],
  }
  const options = { timeout: config.timeoutMs }
  const response = config.refusalFallback
    ? await anthropic.beta.messages.create(
        { ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' },
        options,
      )
    : await anthropic.messages.create(params, options)

  if (response.stop_reason !== 'end_turn') {
    throw new Error(`Claude stopped early (${response.stop_reason})`)
  }
  const text = response.content.find((block) => block.type === 'text')?.text
  const items = JSON.parse(text ?? '{}').items
  return Array.isArray(items) ? items : []
}

/**
 * The icon and colour for each food name, as { items: [{ input, icon, color }], aiStatus }.
 * Names Claude could not classify are left out; the client uses its fallback icon for them.
 * @param {string[]} names
 * @param {{ anthropic?: object, env?: object }} [options] anthropic and env are for tests.
 */
export async function classifyFoodIcons(names, options = {}) {
  const config = iconConfig(options.env)
  const { manifest, system, schema } = loadManifest(config.manifestPath)

  const wanted = [...new Set(names.map(normaliseFoodName).filter(Boolean))].slice(
    0,
    config.maxNamesPerRequest,
  )
  const unknown = wanted.filter((name) => !cache.has(name))
  let aiStatus = unknown.length === 0 ? 'not_needed' : config.apiKey || options.anthropic ? 'failed' : 'not_configured'

  if (aiStatus === 'failed') {
    try {
      const anthropic = options.anthropic ?? defaultClient(config.apiKey)
      const answers = await askClaude(unknown, { anthropic, config, system, schema })
      for (const answer of answers) {
        const name = Number.isInteger(answer?.index) ? unknown[answer.index] : undefined
        const checked = name && validateIconResult(answer, manifest)
        if (!checked) continue
        if (cache.size >= config.cacheSize) cache.delete(cache.keys().next().value)
        cache.set(name, checked)
        aiStatus = 'used'
      }
    } catch (error) {
      // Message only: the full error can include request details.
      console.error('Food icon classification failed, the client will show fallback icons:', error.message)
    }
  }

  const items = wanted.filter((name) => cache.has(name)).map((input) => ({ input, ...cache.get(input) }))
  return { items, aiStatus }
}

/** For tests: forget cached answers and the loaded manifest. */
export function resetIconClassifier() {
  cache.clear()
  loaded = null
  client = null
}
