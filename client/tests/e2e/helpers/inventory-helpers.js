import {
  test as base,
  expect,
  accountDetails,
  signIn,
  seedFood as originalSeedFood,
  json,
  id,
} from './helpers.js'

export { expect, json, id }

const createdFoods = new WeakMap()

export const test = base.extend({
  member: async ({ context }, use, testInfo) => {
    const member = await signIn(context, accountDetails())
    const foods = []
    createdFoods.set(context, foods)

    try {
      await use(member)
    } finally {
      const failures = []

      for (const foodId of foods) {
        try {
          const response = await context.request.delete(
            `/api/inventory/${foodId}`,
          )

          // Fully consumed, discarded or removed items already return 404.
          if (![200, 204, 404].includes(response.status())) {
            failures.push(`${foodId}: HTTP ${response.status()}`)
          }
        } catch (error) {
          failures.push(`${foodId}: ${error.message}`)
        }
      }

      createdFoods.delete(context)

      if (failures.length) {
        await testInfo.attach('inventory-cleanup-notes', {
          body: failures.join('\n'),
          contentType: 'text/plain',
        })
      }
    }
  },
})

export async function seedFood(context, overrides = {}) {
  const food = await originalSeedFood(context, overrides)
  createdFoods.get(context)?.push(id(food))
  return food
}

export function foodCard(compartment, name) {
  return compartment.locator('.food-card').filter({
    hasText: name,
  })
}

export async function getFood(context, food) {
  const result = await json(
    await context.request.get(`/api/inventory/${id(food)}`),
  )

  return result.item
}

export async function foodActivities(context, name) {
  const result = await json(
    await context.request.get('/api/analytics/history'),
  )

  return result.events.filter(event => event.name === name)
}

export function waitForFoodChange(page, food, method = 'PATCH') {
  return page.waitForResponse(response =>
    new URL(response.url()).pathname ===
      `/api/inventory/${id(food)}` &&
    response.request().method() === method
  )
}

export async function openEditForm(page, compartment, food) {
  await foodCard(compartment, food.name).getByRole('button', {
    name: 'Edit food',
    exact: true,
  }).click()

  const editor = page.getByRole('dialog', {
    name: 'Edit Food Item',
    exact: true,
  })

  await expect(editor).toBeVisible()
  return editor
}

export async function saveEdit(page, editor, food) {
  const changed = waitForFoodChange(page, food)

  await editor.getByRole('button', {
    name: 'Save Changes',
    exact: true,
  }).click()

  await json(await changed)
  await expect(editor).not.toBeVisible()
}

export async function openAmountDialog(page, compartment, food, action) {
  await foodCard(compartment, food.name).getByRole('button', {
    name: action === 'consume' ? 'Consume' : 'Discard',
    exact: true,
  }).click()

  const prompt = page.getByRole('dialog').filter({
    has: page.locator('#app-dialog-input'),
  })

  await expect(prompt).toBeVisible()
  return prompt
}

export async function changeAmount(
  page,
  compartment,
  food,
  action,
  amount,
) {
  const prompt = await openAmountDialog(
    page,
    compartment,
    food,
    action,
  )

  await prompt.locator('#app-dialog-input').fill(String(amount))

  const method = amount === food.quantity ? 'DELETE' : 'PATCH'

  if (action === 'discard') {
    // Discard has a second confirmation after the amount prompt.
    await prompt.getByRole('button', {
      name: 'Continue',
      exact: true,
    }).click()

    const confirmation = page.getByRole('alertdialog', {
      name: /^Discard /,
    })

    await expect(confirmation).toBeVisible()

    const changed = waitForFoodChange(page, food, method)

    await confirmation.getByRole('button', {
      name: 'Discard',
      exact: true,
    }).click()

    await json(await changed)
    await expect(confirmation).not.toBeVisible()
  } else {
    const changed = waitForFoodChange(page, food, method)

    await prompt.getByRole('button', {
      name: 'Consume',
      exact: true,
    }).click()

    await json(await changed)
  }

  await expect(prompt).not.toBeVisible()
}

export async function openPantry(page) {
  await page.goto('/fridge')

  await page.getByRole('navigation', {
    name: 'Storage slideshow',
  }).getByRole('button', {
    name: 'Pantry',
    exact: true,
  }).click()

  await page.getByRole('button', {
    name: /^Pantry shelf 1,/,
  }).click()

  const pantry = page.getByRole('dialog', {
    name: 'Pantry',
    exact: true,
  })

  await expect(pantry).toBeVisible()
  return pantry
}