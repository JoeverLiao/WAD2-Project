// Tests for the smart details (category, icon, suggested location, use-by estimate, weight).
// No network: the AI is replaced by a stand-in. Run:  node --test --test-force-exit tests/enrichment.test.js
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { checkAiAnswer, enrichItems, enrichWithRules } from '../services/itemEnrichment.js'
import { ALL_ICONS, CATEGORIES, CATEGORY_IDS, ZONE_IDS } from '../services/storageGuide.js'

const today = new Date('2026-11-01T10:00:00+08:00')
const aiAnswers = (items) => async () => ({
  ok: true,
  json: async () => ({ content: [{ type: 'tool_use', name: 'record_item_details', input: { items } }] }),
})

test('the storage rules are consistent', () => {
  for (const [id, c] of Object.entries(CATEGORIES)) {
    assert.ok(c.allowed.includes(c.zone), `${id}: default zone must be allowed`)
    assert.ok(c.allowed.every((z) => ZONE_IDS.includes(z)), `${id}: unknown zone`)
    assert.ok(c.icons.length >= 1)
    assert.ok(c.reason.length > 10)
  }
  assert.ok(ALL_ICONS.length >= CATEGORY_IDS.length - 3)
})

test('the zones and categories match the ones the client form offers', () => {
  const client = readFileSync(new URL('../../client/src/utils/inventoryOptions.js', import.meta.url), 'utf8')
  for (const id of [...ZONE_IDS, ...CATEGORY_IDS]) assert.ok(client.includes(`'${id}'`), `client is missing ${id}`)
  for (const icon of ALL_ICONS) assert.ok(client.includes(icon), `client is missing ${icon}`)
})

test('food-safety placement: raw meat low, dairy never in the door, potatoes not in the fridge', () => {
  const [chicken, milk, eggs, potato, bread, banana, juice] = enrichWithRules(
    ['Chicken Breast', 'Milk', 'Eggs', 'Potato', 'Bread', 'Banana', 'Orange Juice'].map((name) => ({ name, quantity: 1 })),
    { today },
  )
  assert.equal(chicken.suggestedLocation, 'lower-shelf')
  assert.deepEqual(chicken.allowedLocations, ['lower-shelf'])
  assert.equal(milk.suggestedLocation, 'middle-shelf')
  assert.ok(!milk.allowedLocations.includes('door'))
  assert.ok(!eggs.allowedLocations.includes('door'))
  assert.equal(potato.suggestedLocation, 'dry-storage')
  assert.equal(bread.suggestedLocation, 'dry-storage')
  assert.equal(banana.suggestedLocation, 'dry-storage')
  assert.equal(juice.suggestedLocation, 'door')
})

test('frozen food goes to the freezer with the freezer storage time', () => {
  const [item] = enrichWithRules([{ name: 'Frozen Chicken Breast', quantity: 1, purchasedAt: '2026-10-01' }])
  assert.equal(item.suggestedLocation, 'freezer-main')
  assert.equal(item.storage, 'freezer')
  assert.equal(item.expiresAt, '2027-01-29')
})

test('use-by estimate counts from the purchase date; weight comes from the pack or the piece', () => {
  const [milk, eggs, banana, steak] = enrichWithRules(
    [
      { name: 'Milk', receiptName: 'Fresh Milk 1L', quantity: 2, purchasedAt: '2026-10-30' },
      { name: 'Eggs', receiptName: 'Eggs Large 10s', quantity: 1 },
      { name: 'Banana', quantity: 6 },
      { name: 'Steak', receiptName: 'Ribeye Steak 500g', quantity: 2 },
    ],
    { today },
  )
  assert.equal(milk.expiresAt, '2026-11-06') // 7 days after 30 Oct
  assert.equal(milk.expiresEstimated, true)
  assert.equal(milk.weightKg, 2) // two 1 L cartons
  assert.equal(eggs.weightKg, 0.6) // ten eggs of 60 g
  assert.equal(banana.weightKg, 0.72)
  assert.equal(steak.weightKg, 1) // two 500 g packs
  assert.equal(milk.weightEstimated, true)
})

test('items bought by weight keep the weight and have no piece count', () => {
  const [orange, lb] = enrichWithRules(
    [{ name: 'Orange', quantity: 0.358, unit: 'kg' }, { name: 'Apple', quantity: 2, unit: 'lb' }],
    { today },
  )
  assert.equal(orange.quantity, null)
  assert.equal(orange.weightKg, 0.358)
  assert.equal(orange.weightEstimated, false)
  assert.equal(lb.weightKg, 0.907)
})

test('non-food and unknown items get no invented use-by date', () => {
  const [collar, mystery] = enrichWithRules([{ name: 'Petcollar', quantity: 1 }, { name: 'Zorblax', quantity: 1 }], { today })
  assert.equal(collar.category, 'non_food')
  assert.equal(collar.expiresAt, null)
  assert.equal(mystery.category, 'other')
  assert.equal(mystery.expiresAt, null)
})

test('the AI is only asked about foods the rules do not know', async () => {
  let asked = null
  const fetchImpl = async (url, init) => {
    asked = JSON.parse(init.body)
    return aiAnswers([{ index: 0, category: 'dairy', icon: '🧀', location: 'upper-shelf', shelf_life_days: 14, piece_weight_kg: 0.2 }])()
  }
  const { items, aiUsed } = await enrichItems(
    [{ name: 'Milk', quantity: 1 }, { name: 'Burrata', quantity: 1 }],
    { today, fetchImpl, apiKey: 'test-key' },
  )
  assert.equal(aiUsed, true)
  assert.match(asked.messages[0].content, /0\. Burrata/)
  assert.ok(!asked.messages[0].content.includes('Milk'))
  assert.equal(items[0].detailsSource, 'rules')
  assert.equal(items[1].detailsSource, 'ai')
  assert.equal(items[1].suggestedLocation, 'upper-shelf')
  assert.equal(items[1].icon, '🧀')
  assert.equal(items[1].weightKg, 0.2)
})

test('AI answers are checked against the rules', () => {
  // dairy in the door is not allowed, a huge shelf life is capped, an unknown category becomes "other"
  const a = checkAiAnswer({ category: 'dairy', location: 'door', shelf_life_days: 999, piece_weight_kg: 0.2 })
  assert.equal(a.zone, 'middle-shelf')
  assert.equal(a.days, 20)
  assert.equal(checkAiAnswer({ category: 'spaceship', location: 'door' }).category, 'other')
  assert.equal(checkAiAnswer({ category: 'meat', location: 'upper-shelf' }).zone, 'lower-shelf')
  assert.equal(checkAiAnswer({ category: 'fruit', location: 'crisper', piece_weight_kg: 900 }).pieceKg, null)
  assert.equal(checkAiAnswer({ category: 'non_food', location: 'dry-storage', shelf_life_days: 5 }).days, null)
})

test('without an API key, or when the AI fails, the rules are still used and nothing throws', async () => {
  const items = [{ name: 'Burrata', quantity: 1 }]
  const none = await enrichItems(items, { today, apiKey: '' })
  assert.equal(none.aiUsed, false)
  assert.equal(none.items[0].category, 'other')

  const log = console.error
  console.error = () => {}
  try {
    const failing = await enrichItems(items, { today, apiKey: 'k', fetchImpl: async () => ({ ok: false, status: 500 }) })
    assert.equal(failing.aiUsed, false)
    assert.equal(failing.items[0].category, 'other')
    const garbage = await enrichItems(items, { today, apiKey: 'k', fetchImpl: aiAnswers([{ index: 7, category: 'x' }]) })
    assert.equal(garbage.aiUsed, false)
  } finally {
    console.error = log
  }
})
