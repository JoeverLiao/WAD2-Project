import { fileURLToPath } from 'node:url'

import {
  test,
  expect,
  futureDay,
  uniqueName,
  json,
  id,
  inventoryItems,
  openManual,
  openField,
  setField,
  fillRow,
  saveRows,
  startAnotherEntry,
  openSavedStorage,
} from './helpers/scanning-helpers.js'

const receiptPath = fileURLToPath(
  new URL('./fixtures/receipt.jpg', import.meta.url),
)

test.use({ reducedMotion: 'reduce' })

test('manually add food, save it and find it in the fridge', async ({
  page,
  context,
  member,
}) => {
  await openManual(page)

  await fillRow(page.getByTestId('item-row'), {
    name: uniqueName('manual batch'),
  })

  const result = await saveRows(page, context)
  const food = result.items[0]

  await expect(page.getByTestId('saved-message'))
    .toContainText('Saved 1 item')

  const shelves = await openSavedStorage(page, 'fridge')

  await expect(
    shelves.locator('.food-card').filter({
      hasText: food.name,
    }),
  ).toBeVisible()
})

test('manual entry explains missing required fields', async ({
  page,
  context,
  member,
}) => {
  await openManual(page)
  await page.getByTestId('save').click()

  await expect(page.getByTestId('problem-summary')).toBeVisible()
  await expect(page.getByTestId('saved-message')).toHaveCount(0)

  expect(await inventoryItems(context)).toHaveLength(0)
})

test('uploaded receipt photo can be previewed and cleared', async ({
  page,
  member,
}) => {
  await page.goto('/scanning')

  await page.getByTestId('receipt-file-input')
    .setInputFiles(receiptPath)

  await expect(page.getByAltText('Receipt preview')).toBeVisible()

  await expect(page.getByRole('button', {
    name: 'Scan receipt',
    exact: true,
  })).toBeEnabled()

  await page.getByRole('button', {
    name: 'Clear',
    exact: true,
  }).click()

  await expect(page.getByAltText('Receipt preview')).toHaveCount(0)

  await expect(page.getByRole('button', {
    name: 'Scan receipt',
    exact: true,
  })).toBeDisabled()
})

test('scan the supplied receipt, correct one row, save and find it in the fridge', async ({
  page,
  context,
  member,
}) => {
  test.setTimeout(300_000)

  await page.goto('/scanning')

  await page.getByTestId('receipt-file-input')
    .setInputFiles(receiptPath)

  const scanned = page.waitForResponse(response =>
    new URL(response.url()).pathname === '/api/scanning/receipts' &&
    response.request().method() === 'POST',
    { timeout: 240_000 },
  )

  await page.getByRole('button', {
    name: 'Scan receipt',
    exact: true,
  }).click()

  const data = await json(await scanned)

  // Check actual receipt content without requiring identical OCR output.
  expect(data.rawText).toMatch(/apple|banana|orange/i)
  expect(Array.isArray(data.parsed?.items)).toBe(true)
  expect(data.parsed.items.length).toBeGreaterThan(0)

  await expect(page.getByRole('heading', {
    name: 'Check your items',
    exact: true,
  })).toBeVisible()

  const rows = page.getByTestId('item-row')
  await expect(rows.first()).toBeVisible()

  // Save one corrected item instead of relying on every OCR row being perfect.
  for (let index = 1; index < await rows.count(); index++) {
    await rows.nth(index).getByTestId('include').uncheck()
  }

  await page.getByTestId('purchased-at').fill(futureDay(0))

  await fillRow(rows.first(), {
    name: uniqueName('receipt batch'),
  })

  const result = await saveRows(page, context)
  const food = result.items[0]

  const shelves = await openSavedStorage(page, 'fridge')

  await expect(
    shelves.locator('.food-card').filter({
      hasText: food.name,
    }),
  ).toBeVisible()
})

test('unsupported file types are rejected before scanning', async ({
  page,
  context,
  member,
}) => {
  await page.goto('/scanning')

  await page.getByTestId('receipt-file-input').setInputFiles({
    name: 'unsupported.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('This is not a receipt image.'),
  })

  await expect(page.getByRole('alert')).toContainText(
    'Please upload a JPG, PNG or WEBP image.',
  )

  await expect(page.getByRole('button', {
    name: 'Scan receipt',
    exact: true,
  })).toBeDisabled()

  await expect(page.getByAltText('Receipt preview')).toHaveCount(0)
  expect(await inventoryItems(context)).toHaveLength(0)
})

test('images exceeding 8 MB are rejected before scanning', async ({
  page,
  context,
  member,
}) => {
  await page.goto('/scanning')

  // This buffer tests size validation only and is never sent to OCR.
  await page.getByTestId('receipt-file-input').setInputFiles({
    name: 'oversized.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.alloc(8 * 1024 * 1024 + 1),
  })

  await expect(page.getByRole('alert')).toContainText(
    'Image is too large. Maximum size is 8 MB.',
  )

  await expect(page.getByRole('button', {
    name: 'Scan receipt',
    exact: true,
  })).toBeDisabled()

  expect(await inventoryItems(context)).toHaveLength(0)
})

test('add another manual row and save multiple items with correct details', async ({
  page,
  context,
  member,
}) => {
  await openManual(page)

  const first = await fillRow(page.getByTestId('item-row'), {
    quantity: 2,
    weightKg: 0.5,
    purchasePrice: 3,
  })

  await page.getByTestId('add-row').click()
  await expect(page.getByTestId('item-row')).toHaveCount(2)

  // Adding another row must preserve the first row.
  await expect(
    page.getByTestId('item-row').first().getByTestId('name'),
  ).toHaveValue(first.name)

  const second = await fillRow(
    page.getByTestId('item-row').nth(1),
    {
      quantity: 3,
      weightKg: 0.75,
      purchasePrice: 4,
    },
  )

  const result = await saveRows(page, context, 2)

  await expect(page.getByTestId('saved-message'))
    .toContainText('Saved 2 items')

  for (const expected of [first, second]) {
    const food = result.items.find(item => item.name === expected.name)

    expect(food).toBeDefined()
    expect(food.quantity).toBe(expected.quantity)
    expect(food.weightKg).toBeCloseTo(expected.weightKg)
    expect(food.purchasePrice).toBeCloseTo(expected.purchasePrice)
    expect(food.unit).toBe('pieces')
    expect(food.storage).toBe('fridge')
    expect(food.storageZone).toBe('middle-shelf')
    expect(food.category).toBe('fruit')
    expect(food.dietType).toBe('vegan')
    expect(food.expiresAt.slice(0, 10)).toBe(expected.expiresAt)
  }

  expect(await inventoryItems(context)).toHaveLength(2)

  const shelves = await openSavedStorage(page, 'fridge')

  for (const expected of [first, second]) {
    await expect(
      shelves.locator('.food-card').filter({
        hasText: expected.name,
      }),
    ).toBeVisible()
  }
})

test('an unchecked incomplete row is not validated or saved', async ({
  page,
  context,
  member,
}) => {
  await openManual(page)

  const included = await fillRow(page.getByTestId('item-row'))

  await page.getByTestId('add-row').click()

  const excluded = page.getByTestId('item-row').nth(1)

  // Leave this row incomplete and exclude it.
  await excluded.getByTestId('include').uncheck()

  const result = await saveRows(page, context)

  expect(result.items[0].name).toBe(included.name)

  const items = await inventoryItems(context)
  expect(items).toHaveLength(1)
  expect(items[0].name).toBe(included.name)
})

test('removing a review row excludes it from the save', async ({
  page,
  context,
  member,
}) => {
  await openManual(page)

  const kept = await fillRow(page.getByTestId('item-row'))

  await page.getByTestId('add-row').click()

  const removed = await fillRow(
    page.getByTestId('item-row').nth(1),
  )

  await page.getByTestId('item-row').nth(1)
    .getByTestId('remove').click()

  await expect(page.getByTestId('item-row')).toHaveCount(1)

  await saveRows(page, context)

  const items = await inventoryItems(context)

  expect(items).toHaveLength(1)
  expect(items[0].name).toBe(kept.name)
  expect(items.some(item => item.name === removed.name)).toBe(false)
})

const invalidAmounts = [
  {
    name: 'zero quantity',
    overrides: { quantity: 0 },
    message: 'Quantity must be more than 0.',
  },
  {
    name: 'negative quantity',
    overrides: { quantity: -1 },
    message: 'Quantity must be more than 0.',
  },
  {
    name: 'zero weight',
    overrides: { weightKg: 0 },
    message: 'Weight must be more than 0.',
  },
  {
    name: 'negative weight',
    overrides: { weightKg: -1 },
    message: 'Weight must be more than 0.',
  },
  {
    name: 'negative price',
    overrides: { purchasePrice: -1 },
    message: 'Price cannot be negative.',
  },
]

for (const scenario of invalidAmounts) {
  test(`${scenario.name} prevents saving`, async ({
    page,
    context,
    member,
  }) => {
    await openManual(page)

    const row = page.getByTestId('item-row')
    await fillRow(row, scenario.overrides)

    await page.getByTestId('save').click()

    await expect(page.getByTestId('problem-summary')).toBeVisible()

    await expect(row.getByText(
      scenario.message,
      { exact: true },
    )).toBeVisible()

    await expect(page.getByTestId('saved-message')).toHaveCount(0)
    expect(await inventoryItems(context)).toHaveLength(0)
  })
}

test('a purchase date several days in the future prevents saving', async ({
  page,
  context,
  member,
}) => {
  await openManual(page)

  await fillRow(page.getByTestId('item-row'), {
    expiresAt: futureDay(5),
  })

  // The current validator tolerates tomorrow, so use three days ahead.
  await page.getByTestId('purchased-at').fill(futureDay(3))

  await page.getByTestId('save').click()

  await expect(page.getByText(
    'Purchase date cannot be in the future.',
    { exact: true },
  )).toBeVisible()

  await expect(page.getByTestId('saved-message')).toHaveCount(0)
  expect(await inventoryItems(context)).toHaveLength(0)
})

test('expiry before the purchase date prevents saving', async ({
  page,
  context,
  member,
}) => {
  await openManual(page)

  const row = page.getByTestId('item-row')

  await fillRow(row, {
    expiresAt: futureDay(-1),
  })

  await page.getByTestId('purchased-at').fill(futureDay(0))
  await page.getByTestId('save').click()

  await expect(row.getByText(
    'Expiry date cannot be before the purchase date.',
    { exact: true },
  )).toBeVisible()

  await expect(page.getByTestId('saved-message')).toHaveCount(0)
  expect(await inventoryItems(context)).toHaveLength(0)
})

test('saving the same batch merges quantity, weight and price', async ({
  page,
  context,
  member,
}) => {
  await openManual(page)

  const data = await fillRow(page.getByTestId('item-row'), {
    name: uniqueName('merge batch'),
    quantity: 2,
    weightKg: 0.5,
    purchasePrice: 3,
  })

  const first = await saveRows(page, context)
  expect(first.added).toBe(1)

  const originalId = id(first.items[0])

  await startAnotherEntry(page)

  await fillRow(page.getByTestId('item-row'), {
    ...data,
    name: first.items[0].name,
    quantity: 3,
    weightKg: 0.75,
    purchasePrice: 4,
  })

  const second = await saveRows(page, context)

  expect(second.added).toBe(0)
  expect(second.merged).toBe(1)
  expect(id(second.items[0])).toBe(originalId)

  await expect(page.getByTestId('merged-message')).toBeVisible()

  const items = await inventoryItems(context)

  expect(items).toHaveLength(1)
  expect(id(items[0])).toBe(originalId)
  expect(items[0].quantity).toBe(5)
  expect(items[0].weightKg).toBeCloseTo(1.25)
  expect(items[0].purchasePrice).toBeCloseTo(7)
})

const storageCases = [
  {
    name: 'pantry',
    zone: 'dry-storage',
    category: 'pantry_staples',
  },
  {
    name: 'freezer',
    zone: 'freezer-main',
    category: 'frozen',
  },
]

for (const storage of storageCases) {
  test(`save food to the ${storage.name} and find it there`, async ({
    page,
    context,
    member,
  }) => {
    await openManual(page)

    await fillRow(page.getByTestId('item-row'), {
      storageZone: storage.zone,
      category: storage.category,
    })

    const result = await saveRows(page, context)
    const food = result.items[0]

    expect(food.storage).toBe(storage.name)
    expect(food.storageZone).toBe(storage.zone)

    const compartment = await openSavedStorage(page, storage.name)

    await expect(
      compartment.locator('.food-card').filter({
        hasText: food.name,
      }),
    ).toBeVisible()
  })
}

test('unchecking every row disables saving', async ({
  page,
  context,
  member,
}) => {
  await openManual(page)
  await page.getByTestId('add-row').click()

  const rows = page.getByTestId('item-row')
  await expect(rows).toHaveCount(2)

  for (let index = 0; index < await rows.count(); index++) {
    await rows.nth(index).getByTestId('include').uncheck()
  }

  await expect(page.getByTestId('save')).toBeDisabled()

  await expect(page.getByTestId('count'))
    .toContainText('0 of 2 items will be saved')

  expect(await inventoryItems(context)).toHaveLength(0)
})

test('correcting missing fields allows a successful save', async ({
  page,
  context,
  member,
}) => {
  await openManual(page)

  await page.getByTestId('save').click()
  await expect(page.getByTestId('problem-summary')).toBeVisible()

  // fillRow checks whether each field is already open.
  await fillRow(page.getByTestId('item-row'))

  const result = await saveRows(page, context)
  expect(result.items).toHaveLength(1)

  await expect(page.getByTestId('saved-message'))
    .toContainText('Saved 1 item')
})

test('Add more items resets the form and allows another save', async ({
  page,
  context,
  member,
}) => {
  await openManual(page)

  await fillRow(page.getByTestId('item-row'))
  const first = await saveRows(page, context)

  await startAnotherEntry(page)

  const row = page.getByTestId('item-row')

  await openField(row, 'name')
  await expect(row.getByTestId('name')).toHaveValue('')

  await fillRow(row)
  const second = await saveRows(page, context)

  expect(id(second.items[0])).not.toBe(id(first.items[0]))
  expect(await inventoryItems(context)).toHaveLength(2)
})

test('View Items navigates to the fridge and reveals the saved food', async ({
  page,
  context,
  member,
}) => {
  await openManual(page)

  await fillRow(page.getByTestId('item-row'))

  const result = await saveRows(page, context)
  const food = result.items[0]

  await page.getByRole('link', {
    name: 'View Items',
    exact: true,
  }).click()

  await expect(page).toHaveURL(url =>
    url.pathname === '/fridge' &&
    url.searchParams.getAll('highlight').includes(id(food))
  )

  // View Items reveals the food preview rather than opening its card modal.
  await expect(
    page.locator(`[data-food-id="${id(food)}"]`),
  ).toBeVisible()
})

test('suggestions populate editable fields without saving automatically', async ({
  page,
  context,
  member,
}) => {
  test.setTimeout(180_000)

  await openManual(page)

  const row = page.getByTestId('item-row')

  await setField(row, 'name', 'name', 'Apple')

  const suggested = page.waitForResponse(response =>
    new URL(response.url()).pathname === '/api/scanning/suggest' &&
    response.request().method() === 'POST',
    { timeout: 120_000 },
  )

  await page.getByTestId('suggest').click()

  const response = await suggested
  expect(response.ok(), 'Requesting suggestions failed').toBeTruthy()

  const data = await response.json()
  expect(data.items).toHaveLength(1)

  // Wait for the frontend to finish applying the suggestions.
  await expect(page.getByTestId('suggest')).toBeEnabled()
  await expect(page.getByTestId('suggest-message')).toBeVisible()

  await openField(row, 'category')

  await expect(row.getByTestId('category'))
    .toHaveValue(data.items[0].category)

  await openField(row, 'storageZone')
  await expect(row.getByTestId('zone')).toHaveValue(/\S+/)

  // Suggestions must not save inventory before confirmation.
  expect(await inventoryItems(context)).toHaveLength(0)
  await expect(page.getByTestId('saved-message')).toHaveCount(0)

  // Suggested fields must remain editable.
  await fillRow(row, {
    name: uniqueName('suggested batch'),
    category: 'other',
  })

  await openField(row, 'category')
  await expect(row.getByTestId('category')).toHaveValue('other')

  const result = await saveRows(page, context)
  expect(result.items[0].category).toBe('other')
})