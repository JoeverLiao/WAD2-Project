import { afterEach, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { storageGuidance, withStorageGuidance } from '../services/storageGuidance.js'
import { completeItems, standardName } from '../services/inventoryService.js'
import { enrichWithRules } from '../services/itemEnrichment.js'
import { CATEGORIES, ZONE_IDS } from '../services/storageGuide.js'
import InventoryItem from '../models/inventoryItemModel.js'
import inventoryController from '../controllers/inventoryController.js'

afterEach(() => mock.restoreAll())

const cases = [
  ['Eggs', ['middle-shelf'], ['door', 'door-lower', 'freezer-main', 'dry-storage']],
  ['Hard boiled eggs', ['middle-shelf'], ['door', 'freezer-main']],
  ['Egg whites', ['middle-shelf', 'freezer-main'], ['door', 'dry-storage']],
  ['Chicken breast', ['middle-shelf', 'freezer-main'], ['door', 'door-lower', 'crisper', 'dry-storage']],
  ['Frozen chicken breast', ['freezer-main'], ['middle-shelf', 'door', 'dry-storage']],
  ['Thawed chicken', ['middle-shelf'], ['freezer-main', 'dry-storage']],
  ['Cooked chicken', ['middle-shelf', 'freezer-main'], ['door', 'dry-storage']],
  ['Pork', ['middle-shelf', 'freezer-main'], ['crisper', 'dry-storage']],
  ['Beef mince', ['middle-shelf', 'freezer-main'], ['door', 'dry-storage']],
  ['Salmon', ['middle-shelf', 'freezer-main'], ['door-lower', 'crisper']],
  ['Live mussels', ['middle-shelf'], ['freezer-main', 'dry-storage']],
  ['Milk', ['middle-shelf', 'freezer-main'], ['door', 'door-lower', 'dry-storage']],
  ['Unopened UHT milk', ['dry-storage'], ['middle-shelf', 'door']],
  ['Opened UHT milk', ['middle-shelf'], ['door', 'dry-storage']],
  ['Fresh coconut milk', ['middle-shelf'], ['dry-storage']],
  ['Opened coconut milk powder', ['dry-storage'], ['door']],
  ['Powdered eggs', ['dry-storage'], ['door']],
  ['Opened honey', ['dry-storage'], []],
  ['Milk powder', ['dry-storage'], ['door']],
  ['Yoghurt', ['middle-shelf'], ['door-lower', 'dry-storage']],
  ['Cream cheese', ['middle-shelf'], ['door', 'dry-storage']],
  ['Cream filled pastry', ['middle-shelf'], ['dry-storage']],
  ['Custard tart', ['middle-shelf'], ['dry-storage']],
  ['Bread', ['dry-storage', 'freezer-main'], ['door']],
  ['Fresh pasta', ['middle-shelf', 'freezer-main'], ['dry-storage']],
  ['Dry pasta', ['dry-storage'], ['door']],
  ['Cooked rice', ['middle-shelf', 'freezer-main'], ['dry-storage']],
  ['Egg fried rice', ['middle-shelf', 'freezer-main'], ['dry-storage']],
  ['Chicken noodle soup', ['middle-shelf', 'freezer-main'], ['dry-storage']],
  ['Chicken salad', ['middle-shelf'], ['freezer-main', 'dry-storage']],
  ['Canned tuna', ['dry-storage'], ['door']],
  ['Opened canned tuna', ['middle-shelf'], ['dry-storage']],
  ['Canned ham keep refrigerated', ['middle-shelf'], ['dry-storage']],
  ['Potatoes', ['dry-storage'], ['middle-shelf', 'crisper']],
  ['Peeled potatoes', ['middle-shelf', 'crisper'], ['dry-storage']],
  ['Onions', ['dry-storage'], ['crisper']],
  ['Cut onions', ['middle-shelf'], ['dry-storage']],
  ['Carrots', ['crisper', 'middle-shelf', 'freezer-main'], ['door']],
  ['Fresh spinach', ['crisper', 'middle-shelf'], ['dry-storage']],
  ['Cut watermelon', ['crisper', 'middle-shelf'], ['dry-storage']],
  ['Whole watermelon', ['dry-storage', 'crisper'], ['door']],
  ['Unripe mango', ['dry-storage'], ['crisper']],
  ['Ripe mango', ['crisper', 'middle-shelf'], ['door']],
  ['Fresh basil', ['dry-storage'], ['crisper']],
  ['Fresh coriander', ['crisper', 'middle-shelf'], ['dry-storage']],
  ['Dried thyme', ['dry-storage'], ['crisper']],
  ['Frozen peas', ['freezer-main'], ['crisper', 'dry-storage']],
  ['Tofu', ['middle-shelf', 'freezer-main'], ['door', 'dry-storage']],
  ['Walnuts', ['dry-storage', 'middle-shelf', 'freezer-main'], ['door']],
  ['Opened salsa', ['middle-shelf', 'door', 'door-lower'], ['dry-storage']],
  ['Fresh smoothie', ['middle-shelf', 'door-lower'], ['dry-storage']],
  ['Rice', ['dry-storage'], ['door']],
  ['Lentils', ['dry-storage'], ['door']],
  ['Quinoa', ['dry-storage'], ['crisper']],
  ['Cumin', ['dry-storage'], ['crisper']],
  ['Zorblax', ['middle-shelf', 'door', 'dry-storage'], []],
]
for (const [name, accepted, rejected] of cases) {
  test(`storage placement: ${name}`, () => {
    const guidance = storageGuidance({ name })
    for (const zone of accepted) assert.ok(guidance.allowedLocations.includes(zone), `${name}: should allow ${zone}`)
    for (const zone of rejected) assert.ok(!guidance.allowedLocations.includes(zone), `${name}: should reject ${zone}`)
    assert.ok(guidance.allowedLocations.includes(guidance.suggestedLocation))
    assert.ok(guidance.allowedLocations.every(zone => ZONE_IDS.includes(zone)))
    assert.ok(guidance.locationReason.length > 10)
  })
}

test('all categories have usable placement defaults with unified shelf aliases', () => {
  for (const category of Object.keys(CATEGORIES)) {
    const guidance = storageGuidance({ name: 'Unspecified item', category })
    assert.ok(guidance.allowedLocations.includes(guidance.suggestedLocation), category)
    if (guidance.allowedLocations.includes('middle-shelf')) {
      assert.ok(guidance.allowedLocations.includes('upper-shelf'), category)
      assert.ok(guidance.allowedLocations.includes('lower-shelf'), category)
    }
  }
})

test('storage-significant names survive receipt standardisation and confirmation', () => {
  for (const name of ['Cooked rice', 'Frozen chicken', 'Opened UHT milk', 'Cut melon', 'Chicken noodle soup']) {
    assert.equal(standardName(name), name)
    const enriched = enrichWithRules([{ name, quantity: 1 }])[0]
    const saved = completeItems([{ ...enriched, name }])[0]
    assert.deepEqual(saved.allowedLocations, enriched.allowedLocations)
    assert.equal(saved.suggestedLocation, enriched.suggestedLocation)
  }
})

test('cooked rice does not inherit the dry-rice estimate and manual dates remain unchanged', () => {
  const items = enrichWithRules([
    { name: 'Cooked rice', quantity: 1, purchasedAt: '2026-11-05' },
    { name: 'Cooked rice', quantity: 1, purchasedAt: '2026-11-05', expiresAt: '2026-11-05' },
    { name: 'Hard boiled eggs', quantity: 1, purchasedAt: '2026-11-05' },
  ])
  assert.equal(items[0].expiresAt, '2026-11-06')
  assert.equal(items[1].expiresAt, '2026-11-05')
  assert.equal(items[2].expiresAt, '2026-11-12')
})

test('refreshing old guidance preserves placement, dates, quantities and ignored preferences', () => {
  const original = { name: 'Chicken', category: 'meat', storage: 'freezer', storageZone: 'freezer-main',
    suggestedLocation: 'lower-shelf', allowedLocations: ['lower-shelf'], quantity: 2,
    weightKg: 1, expiresAt: '2026-11-01', purchasePrice: 9, storageGuidanceIgnored: true }
  const refreshed = withStorageGuidance(original)
  assert.ok(refreshed.allowedLocations.includes('freezer-main'))
  for (const field of ['storage', 'storageZone', 'quantity', 'weightKg', 'expiresAt', 'purchasePrice', 'storageGuidanceIgnored']) {
    assert.equal(refreshed[field], original[field], field)
  }
})

test('inventory reads refresh legacy guidance without database writes', async () => {
  mock.method(InventoryItem, 'find', () => ({ sort: () => ({ lean: async () => [
    { name: 'Eggs', storage: 'fridge', storageZone: 'door-lower', allowedLocations: ['door'] },
    { name: 'Chicken', storage: 'freezer', storageZone: 'freezer-main', allowedLocations: ['lower-shelf'] },
  ] }) }))
  let response
  await inventoryController.listItems({ userId: 'owner' }, { json: value => { response = value.items } }, error => { throw error })
  assert.ok(!response[0].allowedLocations.includes('door-lower'))
  assert.ok(response[1].allowedLocations.includes('freezer-main'))
})
