import { openShelves, futureDay } from './helpers/helpers.js'

import {
  test,
  expect,
  json,
  id,
  seedFood,
  foodCard,
  getFood,
  foodActivities,
  waitForFoodChange,
  openEditForm,
  saveEdit,
  openAmountDialog,
  changeAmount,
  openPantry,
} from './helpers/inventory-helpers.js'

test.use({ reducedMotion: 'reduce' })

test('edit name, quantity and expiry and retain changes after reload', async ({
  page,
  context,
  member,
}) => {
  const food = await seedFood(context)
  const name = `${food.name} edited`
  const expiry = futureDay(5)

  let shelves = await openShelves(page)
  const editor = await openEditForm(page, shelves, food)

  await editor.locator('#food-name').fill(name)
  await editor.locator('#food-quantity').fill('6')
  await editor.locator('#food-expiry').fill(expiry)

  await saveEdit(page, editor, food)

  const saved = await getFood(context, food)

  expect(saved.name).toBe(name)
  expect(saved.quantity).toBe(6)
  expect(saved.expiresAt.slice(0, 10)).toBe(expiry)

  shelves = await openShelves(page)

  const card = foodCard(shelves, name)
  await expect(card).toBeVisible()
  await expect(card.locator('.quantity')).toContainText('6')

  const reopened = await openEditForm(page, shelves, saved)

  await expect(reopened.locator('#food-expiry')).toHaveValue(expiry)

  await reopened.getByRole('button', {
    name: 'Cancel',
    exact: true,
  }).click()
})

test('cancel an edit without changing stored food', async ({
  page,
  context,
  member,
}) => {
  const food = await seedFood(context)
  const shelves = await openShelves(page)
  const editor = await openEditForm(page, shelves, food)

  await editor.locator('#food-name').fill('Unsaved replacement name')
  await editor.locator('#food-quantity').fill('99')

  await editor.getByRole('button', {
    name: 'Cancel',
    exact: true,
  }).click()

  await expect(editor).not.toBeVisible()

  const saved = await getFood(context, food)
  expect(saved.name).toBe(food.name)
  expect(saved.quantity).toBe(4)

  const reopenedShelves = await openShelves(page)
  await expect(foodCard(reopenedShelves, food.name)).toBeVisible()
  await expect(
    foodCard(reopenedShelves, 'Unsaved replacement name'),
  ).toHaveCount(0)
})

// Test partial and full consumption/discard separately.
for (const action of ['consume', 'discard']) {
  for (const amount of [1, 4]) {
    const size = amount === 4 ? 'all' : 'part of'

    test(`${action} ${size} a food item and record the correct activity`, async ({
      page,
      context,
      member,
    }) => {
      const food = await seedFood(context)
      const shelves = await openShelves(page)

      await changeAmount(page, shelves, food, action, amount)

      const remaining = 4 - amount

      if (remaining === 0) {
        const response = await context.request.get(
          `/api/inventory/${id(food)}`,
        )

        expect(response.status()).toBe(404)
        await expect(foodCard(shelves, food.name)).toHaveCount(0)
      } else {
        const saved = await getFood(context, food)

        expect(saved.quantity).toBe(remaining)
        expect(saved.weightKg).toBeCloseTo(0.75)
        expect(saved.purchasePrice).toBeCloseTo(3)

        await expect(
          foodCard(shelves, food.name).locator('.quantity'),
        ).toContainText(String(remaining))
      }

      const activities = await foodActivities(context, food.name)

      expect(activities).toHaveLength(1)
      expect(activities[0].action).toBe(
        action === 'consume' ? 'consumed' : 'discarded',
      )
      expect(activities[0].quantity).toBe(amount)
      expect(activities[0].weightKg).toBeCloseTo(amount / 4)
      expect(activities[0].valueSgd).toBeCloseTo(amount)

      await page.goto('/analytics')

      const row = page.getByRole('region', {
        name: 'Food activity table',
      }).locator('tbody tr').filter({
        hasText: food.name,
      })

      await expect(row).toContainText(
        action === 'consume' ? 'Consumed' : 'Discarded',
      )

      await expect(row).toContainText(
        `${(amount / 4).toFixed(2)} kg`,
      )

      await page.reload()
      await expect(row).toBeVisible()
    })
  }
}

test('cancel removal preserves food, then confirmed removal deletes it', async ({
  page,
  context,
  member,
}) => {
  const food = await seedFood(context)
  const shelves = await openShelves(page)
  const card = foodCard(shelves, food.name)

  await card.getByRole('button', {
    name: 'Remove food',
    exact: true,
  }).click()

  const confirmation = page.getByRole('alertdialog', {
    name: `Remove ${food.name}?`,
    exact: true,
  })

  await confirmation.getByRole('button', {
    name: 'Cancel',
    exact: true,
  }).click()

  await expect(confirmation).not.toBeVisible()
  await expect(card).toBeVisible()

  const unchanged = await getFood(context, food)
  expect(unchanged.quantity).toBe(4)

  await card.getByRole('button', {
    name: 'Remove food',
    exact: true,
  }).click()

  const removed = waitForFoodChange(page, food, 'DELETE')

  await confirmation.getByRole('button', {
    name: 'Remove',
    exact: true,
  }).click()

  await json(await removed)

  await expect(confirmation).not.toBeVisible()
  await expect(card).toHaveCount(0)

  expect(
    (await context.request.get(`/api/inventory/${id(food)}`)).status(),
  ).toBe(404)

  // Plain removal should not create a consumed/discarded record.
  expect(await foodActivities(context, food.name)).toHaveLength(0)

  const reopenedShelves = await openShelves(page)
  await expect(foodCard(reopenedShelves, food.name)).toHaveCount(0)
})

for (const action of ['consume', 'discard']) {
  test(`reject zero, negative and excessive ${action} amounts`, async ({
    page,
    context,
    member,
  }) => {
    const food = await seedFood(context)
    const shelves = await openShelves(page)

    const prompt = await openAmountDialog(
      page,
      shelves,
      food,
      action,
    )

    for (const amount of ['0', '-1', '5']) {
      await prompt.locator('#app-dialog-input').fill(amount)

      await prompt.getByRole('button', {
        name: action === 'consume' ? 'Consume' : 'Continue',
        exact: true,
      }).click()

      await expect(prompt).toBeVisible()

      await expect(prompt.getByRole('alert')).toContainText(
        'Please enter an amount greater than 0 and no more than 4',
      )
    }

    await prompt.getByRole('button', {
      name: 'Cancel',
      exact: true,
    }).click()

    await expect(prompt).not.toBeVisible()

    const unchanged = await getFood(context, food)

    expect(unchanged.quantity).toBe(4)
    expect(unchanged.weightKg).toBeCloseTo(1)
    expect(await foodActivities(context, food.name)).toHaveLength(0)
  })

  test(`cancel the ${action} amount prompt without changing inventory`, async ({
    page,
    context,
    member,
  }) => {
    const food = await seedFood(context)
    const shelves = await openShelves(page)

    const prompt = await openAmountDialog(
      page,
      shelves,
      food,
      action,
    )

    await prompt.locator('#app-dialog-input').fill('1')

    await prompt.getByRole('button', {
      name: 'Cancel',
      exact: true,
    }).click()

    await expect(prompt).not.toBeVisible()

    const unchanged = await getFood(context, food)

    expect(unchanged.quantity).toBe(4)
    expect(unchanged.weightKg).toBeCloseTo(1)
    expect(await foodActivities(context, food.name)).toHaveLength(0)
  })
}

test('cancel the final discard confirmation without losing food', async ({
  page,
  context,
  member,
}) => {
  const food = await seedFood(context)
  const shelves = await openShelves(page)

  const prompt = await openAmountDialog(
    page,
    shelves,
    food,
    'discard',
  )

  await prompt.locator('#app-dialog-input').fill('1')

  await prompt.getByRole('button', {
    name: 'Continue',
    exact: true,
  }).click()

  const confirmation = page.getByRole('alertdialog', {
    name: /^Discard /,
  })

  await expect(confirmation).toBeVisible()

  await confirmation.getByRole('button', {
    name: 'Cancel',
    exact: true,
  }).click()

  await expect(confirmation).not.toBeVisible()

  const unchanged = await getFood(context, food)

  expect(unchanged.quantity).toBe(4)
  expect(unchanged.weightKg).toBeCloseTo(1)
  expect(await foodActivities(context, food.name)).toHaveLength(0)
})

test('move food to the pantry and back to fridge shelves', async ({
  page,
  context,
  member,
}) => {
  const food = await seedFood(context)
  let shelves = await openShelves(page)

  const moveSelect = foodCard(shelves, food.name).locator(
    '.food-storage-move select',
  )

  const moved = waitForFoodChange(page, food)

  await moveSelect.selectOption({
    label: 'Pantry',
  })

  await json(await moved)

  let saved = await getFood(context, food)

  expect(saved.storage).toBe('pantry')
  expect(saved.storageZone).toBe('dry-storage')
  expect(saved.quantity).toBe(4)

  const pantry = await openPantry(page)
  await expect(foodCard(pantry, food.name)).toBeVisible()

  // Use the edit form to move it back.
  const editor = await openEditForm(page, pantry, saved)

  await editor.locator('#food-storage').selectOption('fridge')
  await editor.locator('#food-zone').selectOption('middle-shelf')

  await saveEdit(page, editor, food)

  saved = await getFood(context, food)

  expect(saved.storage).toBe('fridge')
  expect(saved.storageZone).toBe('middle-shelf')

  shelves = await openShelves(page)
  await expect(foodCard(shelves, food.name)).toBeVisible()

  const reopenedPantry = await openPantry(page)
  await expect(foodCard(reopenedPantry, food.name)).toHaveCount(0)
})

test('search a compartment, show no matches and clear the search', async ({
  page,
  context,
  member,
}) => {
  const first = await seedFood(context)
  const second = await seedFood(context)

  const shelves = await openShelves(page)

  await expect(foodCard(shelves, first.name)).toBeVisible()
  await expect(foodCard(shelves, second.name)).toBeVisible()

  const search = shelves.locator(
    'input[aria-label="Search compartment food"]',
  )

  await search.fill(first.name)

  await expect(foodCard(shelves, first.name)).toBeVisible()
  await expect(foodCard(shelves, second.name)).toHaveCount(0)

  await search.fill('No matching food exists here')

  await expect(shelves.locator('.food-card')).toHaveCount(0)

  await expect(shelves.locator('.modal-empty')).toContainText(
    'No foods match this search',
  )

  await search.fill('')

  await expect(foodCard(shelves, first.name)).toBeVisible()
  await expect(foodCard(shelves, second.name)).toBeVisible()
})

test('an empty compartment shows its empty state', async ({
  page,
  member,
}) => {
  // This test's isolated account has no inventory.
  const shelves = await openShelves(page)

  await expect(shelves.locator('.food-card')).toHaveCount(0)

  await expect(shelves.locator('.modal-empty')).toContainText(
    'This compartment is empty',
  )
})

test('expired inventory appears in the expired-food panel', async ({
  page,
  context,
  member,
}) => {
  const food = await seedFood(context, {
    expiresAt: '2000-01-01T00:00:00.000Z',
  })

  await page.goto('/fridge')

  await page.locator('.expiry-dropdown > .expiry-button').click()

  const row = page.locator('.expiry-food-row').filter({
    hasText: food.name,
  })

  await expect(row).toBeVisible()
  await expect(row.locator('.expiry-label')).toContainText('Expired')
})