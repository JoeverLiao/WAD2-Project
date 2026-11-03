// Tests for choosing a food's icon and colour. No network: the AI is replaced by a stand-in.
// Run:  node --test --test-force-exit tests/iconClassifier.test.js
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { beforeEach, test } from 'node:test'
import {
  checkIconAnswer,
  classifyFoodIcons,
  clearIconCache,
  FOOD_COLOURS,
  FOOD_ICON_IDS,
} from '../services/iconClassifier.js'

// A stand-in for the AI that always gives these answers and counts how often it was asked.
const aiAnswers = (items) => {
  const fake = async () => {
    fake.calls++
    return {
      ok: true,
      json: async () => ({ content: [{ type: 'tool_use', name: 'record_food_icons', input: { items } }] }),
    }
  }
  fake.calls = 0
  return fake
}

beforeEach(() => clearIconCache())

test('the icon ids and palette match the client library', () => {
  const icons = readFileSync(new URL('../../client/src/utils/foodIcons.js', import.meta.url), 'utf8')
  const clientIds = [...icons.matchAll(/^ {2}(\w+): \{$/gm)].map((m) => m[1])
  assert.deepEqual([...clientIds].sort(), [...FOOD_ICON_IDS].sort())
  const colours = readFileSync(new URL('../../client/src/utils/foodColours.js', import.meta.url), 'utf8')
  for (const [id, hex] of Object.entries(FOOD_COLOURS)) assert.ok(colours.includes(`${id}: '${hex}'`), `client is missing colour ${id}`)
})

test('returns structured JSON with the palette hex for each food', async () => {
  const fetchImpl = aiAnswers([
    { index: 0, name: 'Dragon fruit', category: 'fruit', icon: 'peach', colour: 'pink' },
    { index: 1, name: 'Green apple', category: 'fruit', icon: 'apple', colour: 'lime' },
  ])
  const { items, aiStatus } = await classifyFoodIcons(['Dragon Fruit', 'green apple'], { fetchImpl, apiKey: 'k' })
  assert.equal(aiStatus, 'used')
  assert.deepEqual(items, [
    { input: 'dragon fruit', name: 'Dragon fruit', category: 'fruit', icon: 'peach', colour: 'pink', hex: FOOD_COLOURS.pink },
    { input: 'green apple', name: 'Green apple', category: 'fruit', icon: 'apple', colour: 'lime', hex: FOOD_COLOURS.lime },
  ])
})

test('drops answers with an icon or colour outside the library', () => {
  assert.equal(checkIconAnswer({ icon: 'unicorn', colour: 'red' }, 'x'), null)
  assert.equal(checkIconAnswer({ icon: 'apple', colour: '#123456' }, 'x'), null)
  assert.equal(checkIconAnswer({ icon: 'apple', colour: 'red', category: 'made-up' }, 'x').category, 'other')
})

test('asks the AI only once per food name', async () => {
  const fetchImpl = aiAnswers([{ index: 0, name: 'Lychee', category: 'fruit', icon: 'cherry', colour: 'pink' }])
  await classifyFoodIcons(['Lychee'], { fetchImpl, apiKey: 'k' })
  const again = await classifyFoodIcons(['  LYCHEE '], { fetchImpl, apiKey: 'k' })
  assert.equal(fetchImpl.calls, 1)
  assert.equal(again.aiStatus, 'not_needed')
  assert.equal(again.items[0].icon, 'cherry')
})

test('never fails: no key, a server error or a timeout just returns nothing', async () => {
  assert.deepEqual(await classifyFoodIcons(['Lychee'], { apiKey: '' }), { items: [], aiStatus: 'not_configured' })
  const down = async () => ({ ok: false, status: 529, json: async () => ({}) })
  assert.deepEqual(await classifyFoodIcons(['Lychee'], { fetchImpl: down, apiKey: 'k' }), { items: [], aiStatus: 'failed' })
  const offline = async () => { throw new Error('network down') }
  assert.deepEqual(await classifyFoodIcons(['Lychee'], { fetchImpl: offline, apiKey: 'k' }), { items: [], aiStatus: 'failed' })
})
