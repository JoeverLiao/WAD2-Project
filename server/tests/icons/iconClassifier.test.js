// Food icon classification with the Claude API mocked.
// Run from server/:  pnpm test:icons
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { classifyFoodIcons, resetIconClassifier } from '../../services/iconClassifier.js'

const manifest = JSON.parse(
  readFileSync(new URL('../../../client/src/icons/manifest.json', import.meta.url), 'utf8'),
)
const RED = manifest.palette.red.toUpperCase()
const YELLOW = manifest.palette.yellow.toUpperCase()
const env = { ANTHROPIC_API_KEY: 'test-key', ICON_AI_MODEL: 'claude-sonnet-5-5' }

// A fake Anthropic client whose answer is built by `answer(names)` from the numbered user message.
function fakeAnthropic(answer, { stop_reason = 'end_turn' } = {}) {
  const create = vi.fn(async (params) => {
    const names = params.messages[0].content.split('\n').map((line) => line.replace(/^\d+\. /, ''))
    return { stop_reason, content: [{ type: 'text', text: JSON.stringify({ items: answer(names) }) }] }
  })
  return { create, anthropic: { messages: { create }, beta: { messages: { create } } } }
}

const fruitAnswer = (names) =>
  names.map((name, index) =>
    name === 'banana' ? { index, icon: 'banana', color: YELLOW } : { index, icon: 'fruit', color: RED },
  )

beforeEach(() => resetIconClassifier())

describe('classifyFoodIcons', () => {
  it('sends a request built from the manifest and returns validated answers', async () => {
    const { create, anthropic } = fakeAnthropic(fruitAnswer)
    const result = await classifyFoodIcons(['Banana', ' apple '], { anthropic, env })

    expect(result).toEqual({
      aiStatus: 'used',
      items: [
        { input: 'banana', icon: 'banana', color: YELLOW },
        { input: 'apple', icon: 'fruit', color: RED },
      ],
    })
    const params = create.mock.calls[0][0]
    expect(params.model).toBe('claude-sonnet-5-5')
    expect(params.output_config.format.type).toBe('json_schema')
    expect(params.output_config.format.schema.properties.items.items.properties.icon.enum).toEqual(
      manifest.icons.map((icon) => icon.id),
    )
    expect(params.system).toContain('- banana: ')
    expect(params.messages[0].content).toBe('0. banana\n1. apple')
    expect(params.tool_choice).toBeUndefined()
  })

  it('asks Claude only once per name', async () => {
    const { create, anthropic } = fakeAnthropic(fruitAnswer)
    await classifyFoodIcons(['apple'], { anthropic, env })
    const again = await classifyFoodIcons(['APPLE', 'apple'], { anthropic, env })

    expect(create).toHaveBeenCalledTimes(1)
    expect(again).toEqual({ aiStatus: 'not_needed', items: [{ input: 'apple', icon: 'fruit', color: RED }] })
  })

  it('drops answers with an unknown icon, a bad colour or a colour outside the palette', async () => {
    const { anthropic } = fakeAnthropic(() => [
      { index: 0, icon: 'dragon', color: RED },
      { index: 1, icon: 'fruit', color: 'red' },
      { index: 2, icon: 'fruit', color: '#123456' },
      { index: 3, icon: 'egg', color: manifest.palette.cream.toLowerCase() },
    ])
    const result = await classifyFoodIcons(['a', 'b', 'c', 'egg'], { anthropic, env })

    expect(result.items).toEqual([{ input: 'egg', icon: 'egg', color: manifest.palette.cream.toUpperCase() }])
  })

  it('returns no items when the API errors, and asks again next time', async () => {
    const create = vi.fn().mockRejectedValue(new Error('overloaded'))
    const anthropic = { messages: { create }, beta: { messages: { create } } }
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(await classifyFoodIcons(['apple'], { anthropic, env })).toEqual({ items: [], aiStatus: 'failed' })
    await classifyFoodIcons(['apple'], { anthropic, env })
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('treats a refusal or a cut-off answer as a failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const stop_reason of ['refusal', 'max_tokens']) {
      resetIconClassifier()
      const { anthropic } = fakeAnthropic(fruitAnswer, { stop_reason })
      expect(await classifyFoodIcons(['apple'], { anthropic, env })).toEqual({ items: [], aiStatus: 'failed' })
    }
  })

  it('uses server-side refusal fallbacks unless turned off', async () => {
    const on = fakeAnthropic(fruitAnswer)
    await classifyFoodIcons(['apple'], { anthropic: on.anthropic, env })
    expect(on.create.mock.calls[0][0]).toMatchObject({
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    })

    resetIconClassifier()
    const off = fakeAnthropic(fruitAnswer)
    await classifyFoodIcons(['apple'], { anthropic: off.anthropic, env: { ...env, ICON_AI_REFUSAL_FALLBACK: 'false' } })
    expect(off.create.mock.calls[0][0].fallbacks).toBeUndefined()
  })

  it('does not call the API without a key', async () => {
    expect(await classifyFoodIcons(['apple'], { env: {} })).toEqual({ items: [], aiStatus: 'not_configured' })
  })
})
