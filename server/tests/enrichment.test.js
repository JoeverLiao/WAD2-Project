// Tests for the smart details (category, icon, suggested location, use-by estimate, weight).
// No network: the AI is replaced by a stand-in. Run:  node --test --test-force-exit tests/enrichment.test.js
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { checkAiAnswer, cleanStandardName, enrichItems, enrichWithRules, mergeDuplicateItems } from '../services/itemEnrichment.js'
import { parseReceiptText } from '../services/receiptParser.js'
import { ALL_ICONS, CATEGORIES, CATEGORY_IDS, DIET_LABELS, DIETS, ZONE_IDS } from '../services/storageGuide.js'

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
  for (const diet of DIETS) assert.ok(client.includes(`'${diet}'`) && client.includes(DIET_LABELS[diet]), `client is missing diet ${diet}`)
})

test('food-safety placement: raw meat in Shelves or Freezer, dairy never in the door, whole potatoes in Pantry', () => {
  const [chicken, milk, eggs, potato, bread, banana, juice] = enrichWithRules(
    ['Chicken Breast', 'Milk', 'Eggs', 'Potato', 'Bread', 'Banana', 'Orange Juice'].map((name) => ({ name, quantity: 1 })),
    { today },
  )
  assert.equal(chicken.suggestedLocation, 'middle-shelf')
  assert.ok(chicken.allowedLocations.includes('middle-shelf'))
  assert.ok(chicken.allowedLocations.includes('freezer-main'))
  assert.equal(milk.suggestedLocation, 'middle-shelf')
  assert.ok(!milk.allowedLocations.includes('door'))
  assert.ok(!eggs.allowedLocations.includes('door'))
  assert.equal(potato.suggestedLocation, 'dry-storage')
  assert.equal(bread.suggestedLocation, 'dry-storage')
  assert.equal(banana.suggestedLocation, 'dry-storage')
  assert.ok(juice.allowedLocations.includes(juice.suggestedLocation))
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

test('items bought by weight keep the weight (and count as one purchase)', () => {
  const [orange, lb] = enrichWithRules(
    [{ name: 'Orange', quantity: 0.358, unit: 'kg' }, { name: 'Apple', quantity: 2, unit: 'lb' }],
    { today },
  )
  assert.equal(orange.quantity, 1) // one purchase; the weight says how much
  assert.equal(orange.unit, 'pieces')
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
  assert.equal(items[1].suggestedLocation, 'middle-shelf')
  assert.equal(items[1].icon, '🧀')
  assert.equal(items[1].weightKg, 0.2)
})

test('AI answers are checked against the rules', () => {
  // dairy in the door is not allowed, a huge shelf life is capped, an unknown category becomes "other"
  const a = checkAiAnswer({ category: 'dairy', location: 'door', shelf_life_days: 999, piece_weight_kg: 0.2 })
  assert.equal(a.zone, 'middle-shelf')
  assert.equal(a.days, 20)
  assert.equal(checkAiAnswer({ category: 'spaceship', location: 'door' }).category, 'other')
  assert.equal(checkAiAnswer({ category: 'meat', location: 'door' }).zone, 'lower-shelf')
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

test('berries and other fruit are recognised by the rules, with the right place', () => {
  const names = ['Raspberry', 'RASPBERRIES 125G', 'Blackberries', 'Cherry', 'Lychee', 'Dragon Fruit', 'Mixed Berry Pack']
  for (const item of enrichWithRules(names.map((name) => ({ name, quantity: 1 })), { today })) {
    assert.equal(item.category, 'fruit')
    assert.equal(item.suggestedLocation, 'crisper')
  }
  const [durian, mango] = enrichWithRules([{ name: 'Durian', quantity: 1 }, { name: 'Mango', quantity: 1 }], { today })
  assert.equal(durian.suggestedLocation, 'dry-storage') // ripens at room temperature
  assert.equal(mango.suggestedLocation, 'dry-storage')
})

test('flavoured products are not mistaken for the fruit', () => {
  const [muffin, yoghurt, sauce, coconutMilk, cherryTomato] = enrichWithRules(
    ['Blueberry Muffin', 'Strawberry Yoghurt', 'Sweet Chilli Sauce', 'Coconut Milk', 'Cherry Tomato'].map((name) => ({ name, quantity: 1 })),
    { today },
  )
  assert.equal(muffin.category, 'bakery')
  assert.equal(yoghurt.category, 'dairy')
  assert.equal(sauce.category, 'condiments')
  assert.equal(coconutMilk.category, 'condiments')
  assert.equal(cherryTomato.category, 'vegetables')
})

test('there is a wide choice of icons for each category', () => {
  assert.ok(CATEGORIES.fruit.icons.length >= 15)
  assert.ok(CATEGORIES.dairy.icons.length >= 5)
  assert.ok(CATEGORIES.seafood.icons.length >= 8)
  assert.ok(ALL_ICONS.length >= 80)
})

test('the result says why the AI was or was not used', async () => {
  const known = await enrichItems([{ name: 'Milk', quantity: 1 }], { today, apiKey: '' })
  assert.equal(known.aiStatus, 'not_needed')
  const off = await enrichItems([{ name: 'Zorblax', quantity: 1 }], { today, apiKey: '' })
  assert.equal(off.aiStatus, 'not_configured')
  const log = console.error
  console.error = () => {}
  try {
    const bad = await enrichItems([{ name: 'Zorblax', quantity: 1 }], { today, apiKey: 'k', fetchImpl: async () => ({ ok: false, status: 401 }) })
    assert.equal(bad.aiStatus, 'failed')
  } finally {
    console.error = log
  }
  const ok = await enrichItems([{ name: 'Zorblax', quantity: 1 }], {
    today, apiKey: 'k', fetchImpl: aiAnswers([{ index: 0, category: 'fruit', icon: '🍓', location: 'crisper', shelf_life_days: 3, piece_weight_kg: 0.1 }]),
  })
  assert.equal(ok.aiStatus, 'used')
  assert.equal(ok.items[0].category, 'fruit')
})

test('diet labels: vegan, vegetarian, contains meat or fish, or "check the label"', () => {
  const diets = Object.fromEntries(
    enrichWithRules(
      ['Raspberry', 'Broccoli', 'Tofu', 'Soy Milk', 'Milk', 'Eggs', 'Cheese', 'Honey', 'Chicken Breast', 'Salmon', 'Bacon',
        'Ham', 'Rice', 'Pasta', 'Sandwich', 'Burrata', 'Petcollar', 'Vegan Chicken Nuggets', 'Chicken Noodle Soup', 'Veggie Burger'].map((name) => ({ name, quantity: 1 })),
      { today },
    ).map((item, i) => [i, item.dietType]),
  )
  const expected = ['vegan', 'vegan', 'vegan', 'vegan', 'vegetarian', 'vegetarian', 'vegetarian', 'vegetarian', 'other', 'other', 'other',
    'other', 'vegan', 'vegetarian', 'unknown', 'unknown', null, 'vegan', 'other', 'vegetarian']
  assert.deepEqual(Object.values(diets), expected)
})

test('a wrong "vegan" from the AI can never slip through', () => {
  assert.equal(checkAiAnswer({ category: 'meat', location: 'lower-shelf', diet: 'vegan' }).diet, 'other')
  assert.equal(checkAiAnswer({ category: 'seafood', location: 'lower-shelf', diet: 'vegetarian' }).diet, 'other')
  assert.equal(checkAiAnswer({ category: 'dairy', location: 'middle-shelf', diet: 'vegan' }).diet, 'vegetarian')
  assert.equal(checkAiAnswer({ category: 'fruit', location: 'crisper', diet: 'unknown' }).diet, 'vegan')
  assert.equal(checkAiAnswer({ category: 'snacks', location: 'dry-storage', diet: 'nonsense' }).diet, 'unknown')
  assert.equal(checkAiAnswer({ category: 'non_food', location: 'dry-storage', diet: 'vegan' }).diet, null)
})

test('the AI label is used for unknown foods but the name can overrule it', async () => {
  const fetchImpl = aiAnswers([
    { index: 0, category: 'condiments', location: 'dry-storage', shelf_life_days: 100, piece_weight_kg: 0.2, diet: 'vegan' },
    { index: 1, category: 'condiments', location: 'dry-storage', shelf_life_days: 100, piece_weight_kg: 0.2, diet: 'vegan' },
  ])
  const { items } = await enrichItems([{ name: 'Gochujang', quantity: 1 }, { name: 'Anchovy Gochujang', quantity: 1 }], { today, fetchImpl, apiKey: 'k' })
  assert.equal(items[0].dietType, 'vegan')
  assert.equal(items[1].dietType, 'other')
})

test('messy receipt names are recognised: run-together, abbreviated and misspelt', () => {
  const out = enrichWithRules(['AUSTJPNPUMPKIN', 'AUST JPN PUMPKIN', 'RASPBERY 125G', 'KENT PUMPKIN'].map((name) => ({ name, quantity: 1 })), { today })
  assert.deepEqual(out.map((i) => [i.category, i.dietType]), [
    ['root_vegetables', 'vegan'], ['root_vegetables', 'vegan'], ['fruit', 'vegan'], ['root_vegetables', 'vegan'],
  ])
})

test('AI recognition drives the rules without replacing the receipt product name', async () => {
  // "Zxq Brxlnut" is nothing we know, so the AI is asked; it says the food is a pumpkin.
  const fetchImpl = aiAnswers([{ index: 0, standard_name: 'pumpkin', category: 'other', location: 'door', shelf_life_days: 2, piece_weight_kg: 9, diet: 'unknown' }])
  const original = { name: 'Zxq Brxlnut', quantity: 1 }
  const { items } = await enrichItems([original], { today, fetchImpl, apiKey: 'k' })
  assert.ok(!Object.hasOwn(items[0], 'name'))
  assert.equal({ ...original, ...items[0] }.name, original.name)
  assert.equal(items[0].category, 'root_vegetables') // from our rules, not from the AI's "other"
  assert.equal(items[0].suggestedLocation, 'dry-storage')
  assert.equal(items[0].dietType, 'vegan')
  assert.equal(items[0].detailsSource, 'ai')
})

test('AI classification names are validated but do not overwrite an unknown product name', async () => {
  assert.equal(cleanStandardName('  dragon   fruit '), 'Dragon Fruit')
  assert.equal(cleanStandardName('<script>'), null)
  assert.equal(cleanStandardName('x'.repeat(50)), null)
  assert.equal(cleanStandardName(5), null)
  const fetchImpl = aiAnswers([{ index: 0, standard_name: 'Gochujang', category: 'condiments', location: 'dry-storage', shelf_life_days: 100, piece_weight_kg: 0.5, diet: 'vegan' }])
  const { items } = await enrichItems([{ name: 'GOCHUJNG 500G', quantity: 1 }], { today, fetchImpl, apiKey: 'k' })
  assert.ok(!Object.hasOwn(items[0], 'name'))
  assert.equal({ name: 'GOCHUJNG 500G', ...items[0] }.name, 'GOCHUJNG 500G')
  assert.equal(items[0].category, 'condiments')
  assert.equal(items[0].suggestedLocation, 'dry-storage')
})

test('receipt product variants survive parsing, enrichment and duplicate grouping', async () => {
  const parsed = parseReceiptText('1 Brown Rice 2.00\n1 White Rice 3.00\n1 Spaghetti 4.00\n1 Penne 5.00', { today })
  const { items: details, aiUsed } = await enrichItems(parsed.items, { today, apiKey: '' })
  const reviewed = mergeDuplicateItems(parsed.items.map((item, i) => ({ ...item, ...details[i] })))
  assert.equal(aiUsed, false)
  assert.deepEqual(reviewed.map(item => item.name), ['Brown Rice', 'White Rice', 'Spaghetti', 'Penne'])
  assert.deepEqual(reviewed.map(item => item.quantity), [1, 1, 1, 1])
  assert.deepEqual(reviewed.map(item => item.price), [2, 3, 4, 5])
  for (const item of reviewed) {
    assert.equal(item.category, 'pantry_staples')
    assert.ok(CATEGORIES.pantry_staples.icons.includes(item.icon))
    assert.equal(item.suggestedLocation, 'dry-storage')
    assert.ok(item.allowedLocations.includes('dry-storage'))
    assert.equal(item.storage, 'pantry')
  }
})

test('identical product names combine their quantities, prices and weights', () => {
  const merged = mergeDuplicateItems([
    { name: 'Pumpkin', unit: 'pieces', storage: 'pantry', quantity: 1, price: 2.5, weightKg: 1.5, warnings: ['a'], rawLine: 'x' },
    { name: 'pumpkin', unit: 'pieces', storage: 'pantry', quantity: 2, price: 5, weightKg: 3, warnings: ['a', 'b'], rawLine: 'y' },
  ])
  assert.equal(merged.length, 1)
  assert.deepEqual([merged[0].quantity, merged[0].price, merged[0].weightKg, merged[0].warnings], [3, 7.5, 4.5, ['a', 'b']])
})
