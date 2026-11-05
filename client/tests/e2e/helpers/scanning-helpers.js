import {
  test as base,
  expect,
  accountDetails,
  signIn,
  futureDay,
  uniqueName,
  json,
  id,
} from './helpers.js'

export { expect, futureDay, uniqueName, json, id }

const savedFoods = new WeakMap()

export const test = base.extend({
  member: async ({ context }, use, testInfo) => {
    const member = await signIn(context, accountDetails())
    const foods = new Set()

    savedFoods.set(context, foods)

    try {
      await use(member)
    } finally {
      const failures = []

      for (const foodId of foods) {
        try {
          const response = await context.request.delete(
            `/api/inventory/${foodId}`,
          )

          if (![200, 204, 404].includes(response.status())) {
            failures.push(`${foodId}: HTTP ${response.status()}`)
          }
        } catch (error) {
          failures.push(`${foodId}: ${error.message}`)
        }
      }

      savedFoods.delete(context)

      if (failures.length) {
        await testInfo.attach('scanning-cleanup-notes', {
          body: failures.join('\n'),
          contentType: 'text/plain',
        })
      }
    }
  },
})

export async function inventoryItems(context) {
  const result = await json(
    await context.request.get('/api/inventory'),
  )

  return result.items
}

export async function openManual(page) {
  await page.goto('/scanning')
  await page.getByTestId('mode-manual').click()

  await expect(page.getByTestId('item-row')).toHaveCount(1)
  await page.getByTestId('purchased-at').fill(futureDay(0))
}

export async function openField(row, field) {
  const tile = row.getByTestId(`tile-${field}`)

  if (await tile.getAttribute('aria-expanded') !== 'true') {
    await tile.click()
  }
}

export async function setField(
  row,
  field,
  inputId,
  value,
  isSelect = false,
) {
  await openField(row, field)

  const input = row.getByTestId(inputId)

  if (isSelect) {
    await input.selectOption(String(value))
  } else {
    await input.fill(String(value))
  }
}

export async function fillRow(row, overrides = {}) {
  const data = {
    name: uniqueName('review batch'),
    quantity: 2,
    unit: 'pieces',
    expiresAt: futureDay(3),
    category: 'fruit',
    dietType: 'vegan',
    weightKg: 0.5,
    storageZone: 'middle-shelf',
    ...overrides,
  }

  await row.getByTestId('include').check()

  await setField(row, 'name', 'name', data.name)
  await setField(row, 'quantity', 'quantity', data.quantity)
  await setField(row, 'unit', 'unit', data.unit)
  await setField(row, 'expiresAt', 'expires', data.expiresAt)
  await setField(row, 'category', 'category', data.category, true)
  await setField(row, 'dietType', 'diet', data.dietType, true)
  await setField(row, 'weightKg', 'weight', data.weightKg)
  await setField(row, 'storageZone', 'zone', data.storageZone, true)

  if (data.purchasePrice !== undefined) {
    await setField(
      row,
      'purchasePrice',
      'price',
      data.purchasePrice,
    )
  }

  return data
}

export async function saveRows(page, context, expectedCount = 1) {
  const saved = page.waitForResponse(response =>
    new URL(response.url()).pathname === '/api/scanning/confirm' &&
    response.request().method() === 'POST'
  )

  await page.getByTestId('save').click()

  const result = await json(await saved, 201)

  // Track returned IDs, including existing IDs returned after a merge.
  for (const food of result.items || []) {
    savedFoods.get(context)?.add(id(food))
  }

  expect(result.saved).toBe(expectedCount)
  expect(result.items).toHaveLength(expectedCount)

  await expect(page.getByTestId('saved-message')).toBeVisible()

  return result
}

export async function startAnotherEntry(page) {
  await page.getByRole('button', {
    name: 'Add more items',
    exact: true,
  }).click()

  await expect(page.getByTestId('saved-message')).toHaveCount(0)
  await expect(page.getByTestId('item-row')).toHaveCount(1)
}

export async function openSavedStorage(page, storage) {
  await page.goto('/fridge')

  if (storage === 'pantry') {
    await page.getByRole('navigation', {
      name: 'Storage slideshow',
    }).getByRole('button', {
      name: 'Pantry',
      exact: true,
    }).click()

    await page.getByRole('button', {
      name: /^Pantry shelf 1,/,
    }).click()
  } else {
    await page.getByRole('button', {
      name: 'Open refrigerator door',
      exact: true,
    }).click()

    await page.locator(
      storage === 'freezer'
        ? '.freezer-compartment'
        : '.shelf-compartment',
    ).click()
  }

  const compartment = page.getByRole('dialog', {
    name: storage === 'pantry'
      ? 'Pantry'
      : storage === 'freezer'
        ? 'Freezer'
        : 'Shelves',
    exact: true,
  })

  await expect(compartment).toBeVisible()
  return compartment
}