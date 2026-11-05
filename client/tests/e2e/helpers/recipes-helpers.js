import {
  test,
  expect,
  seedFood,
  json,
} from './inventory-helpers.js'

export { test, expect, seedFood, json }

// Wait for a specific application API response.
export function waitForRecipeResponse(page, path, method = 'GET') {
  return page.waitForResponse(response =>
    new URL(response.url()).pathname === path &&
    response.request().method() === method,
    { timeout: 120_000 },
  )
}

export async function expectSuccessfulResponse(promise, message) {
  const response = await promise
  expect(response.ok(), message).toBeTruthy()
  return response
}

export async function openRecipes(page) {
  const inventoryLoaded = waitForRecipeResponse(
    page,
    '/api/inventory',
  )

  const historyLoaded = waitForRecipeResponse(
    page,
    '/api/user-recipes',
  )

  await page.goto('/freshness-recipes')

  const inventoryResponse = await expectSuccessfulResponse(
    inventoryLoaded,
    'Loading inventory failed',
  )

  const historyResponse = await expectSuccessfulResponse(
    historyLoaded,
    'Loading recipe history failed',
  )

  const inventory = await inventoryResponse.json()
  await historyResponse.finished()

  await expect(
    page.getByRole('tab', { name: 'For You', exact: true }),
  ).toHaveAttribute('aria-selected', 'true')

  // Wait for inventory to reach the frontend before opening the chooser.
  if (inventory.items.some(item =>
    !item.expiresAt || new Date(item.expiresAt) > new Date()
  )) {
    await expect(
      page.getByRole('button', { name: /Choose ingredients/ }),
    ).toBeEnabled()
  }
}

export async function openIngredientChooser(page) {
  await page.getByRole('button', {
    name: /Choose ingredients/,
  }).click()

  const dialog = page.getByRole('dialog', {
    name: 'Choose your ingredients',
    exact: true,
  })

  await expect(dialog).toBeVisible()
  return dialog
}

export function ingredientChoice(dialog, name) {
  return dialog.locator('.modal-choice').filter({
    hasText: name,
  })
}

export function recipeCard(page, title) {
  return page.locator('.recipe-card').filter({
    has: page.getByRole('heading', {
      name: title,
      exact: true,
    }),
  })
}

export async function openExplore(page) {
  await openRecipes(page)

  const loaded = waitForRecipeResponse(
    page,
    '/api/freshness/recipes/explore',
  )

  await page.getByRole('tab', {
    name: 'Explore',
    exact: true,
  }).click()

  await expectSuccessfulResponse(
    loaded,
    'Loading Explore recipes failed',
  )

  await expect(page.locator('.recipe-card').first()).toBeVisible({
    timeout: 120_000,
  })
}

export async function firstRecipeTitle(page) {
  return (
    await page.locator('.recipe-card').first().locator('h3').innerText()
  ).trim()
}

export async function openHistoryTab(page, type) {
  const tab = page.getByRole('tab', {
    name: type === 'saved' ? /^Saved/ : /^Cooked Before/,
  })

  // Prevent clicking before the saved/cooked history reaches the frontend.
  await expect(tab).toHaveText(
    type === 'saved'
      ? /^\s*Saved\s*\([1-9]\d*\)\s*$/
      : /^\s*Cooked Before\s*\([1-9]\d*\)\s*$/,
  )

  await tab.click()
  await expect(tab).toHaveAttribute('aria-selected', 'true')
}

export async function waitForResultCount(page) {
  const countLabel = page.locator('.results-line > span').first()

  await expect(countLabel).toHaveText(/^\s*\d+ recipes found\s*$/)

  const text = await countLabel.innerText()
  return Number(text.match(/\d+/)[0])
}