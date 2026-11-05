import {
  test,
  expect,
  seedFood,
  waitForRecipeResponse,
  expectSuccessfulResponse,
  openRecipes,
  openIngredientChooser,
  ingredientChoice,
  recipeCard,
  openExplore,
  firstRecipeTitle,
  openHistoryTab,
  waitForResultCount,
} from './helpers/recipes-helpers.js'

test.use({ reducedMotion: 'reduce' })

// Real recipe providers and AI requests may take longer than local UI actions.
test.setTimeout(300_000)

test('ingredient chooser applies a selection and reset removes it', async ({
  page,
  context,
  member,
}) => {
  const food = await seedFood(context)

  await openRecipes(page)
  const dialog = await openIngredientChooser(page)

  await dialog.locator('.modal-toolbar').getByRole('button', {
    name: 'Clear',
    exact: true,
  }).click()

  const choice = ingredientChoice(dialog, food.name)
  await expect(choice).toBeVisible()

  await choice.click()
  await expect(choice).toHaveAttribute('aria-pressed', 'true')

  await dialog.getByRole('button', {
    name: 'Find recipes →',
    exact: true,
  }).click()

  await expect(dialog).not.toBeVisible()
  await expect(page.locator('.selection-strip')).toContainText(food.name)

  await page.locator('.selection-strip').getByRole('button', {
    name: 'Reset',
    exact: true,
  }).click()

  await expect(page.locator('.selection-strip')).toHaveCount(0)
})

test('search ingredients and clear the search', async ({
  page,
  context,
  member,
}) => {
  const first = await seedFood(context)
  const second = await seedFood(context)

  await openRecipes(page)
  const dialog = await openIngredientChooser(page)

  const search = dialog.getByRole('textbox', {
    name: 'Search ingredients',
    exact: true,
  })

  await search.fill(first.name)

  await expect(ingredientChoice(dialog, first.name)).toBeVisible()
  await expect(ingredientChoice(dialog, second.name)).toHaveCount(0)

  await search.fill('No matching ingredient exists here')
  await expect(dialog.locator('.modal-choice')).toHaveCount(0)

  await search.fill('')

  await expect(ingredientChoice(dialog, first.name)).toBeVisible()
  await expect(ingredientChoice(dialog, second.name)).toBeVisible()

  await dialog.getByRole('button', {
    name: 'Cancel',
    exact: true,
  }).click()
})

test('cancelling ingredient changes preserves the applied selection', async ({
  page,
  context,
  member,
}) => {
  const first = await seedFood(context)
  const second = await seedFood(context)

  await openRecipes(page)
  let dialog = await openIngredientChooser(page)

  await dialog.locator('.modal-toolbar').getByRole('button', {
    name: 'Clear',
    exact: true,
  }).click()

  await ingredientChoice(dialog, first.name).click()

  await dialog.getByRole('button', {
    name: 'Find recipes →',
    exact: true,
  }).click()

  await expect(page.locator('.selection-strip')).toContainText(first.name)
  await expect(page.locator('.selection-strip'))
    .not.toContainText(second.name)

  dialog = await openIngredientChooser(page)

  await ingredientChoice(dialog, first.name).click()
  await ingredientChoice(dialog, second.name).click()

  await dialog.getByRole('button', {
    name: 'Cancel',
    exact: true,
  }).click()

  await expect(dialog).not.toBeVisible()
  await expect(page.locator('.selection-strip')).toContainText(first.name)
  await expect(page.locator('.selection-strip'))
    .not.toContainText(second.name)
})

test('select all and clear update ingredient states and counts', async ({
  page,
  context,
  member,
}) => {
  await seedFood(context)
  await seedFood(context)

  await openRecipes(page)
  const dialog = await openIngredientChooser(page)
  const toolbar = dialog.locator('.modal-toolbar')

  await expect(dialog.locator('.modal-choice')).toHaveCount(2)

  await toolbar.getByRole('button', {
    name: 'Clear',
    exact: true,
  }).click()

  await expect(toolbar.locator('strong')).toHaveText('0 selected')
  await expect(
    dialog.locator('.modal-choice[aria-pressed="true"]'),
  ).toHaveCount(0)

  await toolbar.getByRole('button', {
    name: 'Select all',
    exact: true,
  }).click()

  await expect(toolbar.locator('strong')).toHaveText('2 selected')
  await expect(
    dialog.locator('.modal-choice[aria-pressed="true"]'),
  ).toHaveCount(2)

  await dialog.getByRole('button', {
    name: 'Cancel',
    exact: true,
  }).click()
})

test('expired food is excluded from ingredient selection', async ({
  page,
  context,
  member,
}) => {
  const fresh = await seedFood(context)
  const expired = await seedFood(context, {
    expiresAt: '2000-01-01T00:00:00.000Z',
  })

  await openRecipes(page)
  const dialog = await openIngredientChooser(page)

  await expect(ingredientChoice(dialog, fresh.name)).toBeVisible()
  await expect(ingredientChoice(dialog, expired.name)).toHaveCount(0)

  await dialog.getByRole('button', {
    name: 'Cancel',
    exact: true,
  }).click()
})

test('empty inventory shows guidance and disables ingredient selection', async ({
  page,
  member,
}) => {
  await openRecipes(page)

  await expect(
    page.getByRole('button', { name: /Choose ingredients/ }),
  ).toBeDisabled()

  await expect(page.getByRole('heading', {
    name: 'Your kitchen is waiting!',
    exact: true,
  })).toBeVisible()

  await expect(page.locator('.recipe-card')).toHaveCount(0)
})

test('save a favourite, reload, and remove it from Saved', async ({
  page,
  member,
}) => {
  await openExplore(page)

  const title = await firstRecipeTitle(page)
  const card = recipeCard(page, title)

  const savedResponse = waitForRecipeResponse(
    page,
    '/api/user-recipes/save',
    'POST',
  )

  await card.getByRole('button', {
    name: 'Save recipe',
    exact: true,
  }).click()

  await expectSuccessfulResponse(savedResponse, 'Saving favourite failed')

  await expect(card.getByRole('button', {
    name: 'Unsave recipe',
    exact: true,
  })).toBeVisible()

  await openRecipes(page)
  await openHistoryTab(page, 'saved')

  const saved = recipeCard(page, title)
  await expect(saved).toBeVisible({ timeout: 120_000 })

  const removedResponse = page.waitForResponse(response =>
    /\/api\/user-recipes\/[^/]+\/save$/.test(
      new URL(response.url()).pathname,
    ) &&
    response.request().method() === 'DELETE'
  )

  await saved.getByRole('button', {
    name: 'Unsave recipe',
    exact: true,
  }).click()

  await expectSuccessfulResponse(
    removedResponse,
    'Removing favourite failed',
  )

  await expect(saved).toHaveCount(0)

  await openRecipes(page)

  await expect(
    page.getByRole('tab', { name: /^Saved/ }),
  ).toHaveText(/^\s*Saved\s*\(0\)\s*$/)
})

test('open a recipe detail page with ingredients and instructions', async ({
  page,
  member,
}) => {
  await openExplore(page)

  const title = await firstRecipeTitle(page)

  const detailsLoaded = page.waitForResponse(response =>
    /^\/api\/freshness\/recipes\/\d+$/.test(
      new URL(response.url()).pathname,
    ) &&
    response.request().method() === 'GET'
  )

  await recipeCard(page, title).getByRole('button', {
    name: /View recipe/,
  }).click()

  await expectSuccessfulResponse(
    detailsLoaded,
    'Loading recipe details failed',
  )

  await expect(page).toHaveURL(/\/freshness\/recipes\/\d+$/)

  await expect(
    page.getByRole('heading', { level: 1 }),
  ).toHaveText(title)

  await expect(
    page.locator('.ingredients-panel li').first(),
  ).toBeVisible()

  await expect(
    page.locator('.instructions-panel li').first(),
  ).toBeVisible()

  await page.getByRole('button', {
    name: /Back to Recipes/,
  }).click()

  // Check the page path while allowing its section hash.
  await expect(page).toHaveURL(url =>
    url.pathname === '/freshness-recipes'
  )
})

test('mark a recipe cooked, reload and cook it again', async ({
  page,
  member,
}) => {
  await openExplore(page)

  const title = await firstRecipeTitle(page)
  const card = recipeCard(page, title)

  const cookedResponse = waitForRecipeResponse(
    page,
    '/api/user-recipes/cooked',
    'POST',
  )

  await card.getByRole('button', {
    name: /Mark as Cooked/,
  }).click()

  await expectSuccessfulResponse(
    cookedResponse,
    'Recording cooked recipe failed',
  )

  await expect(card.locator('.recipe-cooked-action'))
    .toContainText('Cooked 1 time')

  await openRecipes(page)
  await openHistoryTab(page, 'cooked')

  const cooked = recipeCard(page, title)
  await expect(cooked).toBeVisible({ timeout: 120_000 })

  const cookedAgainResponse = waitForRecipeResponse(
    page,
    '/api/user-recipes/cooked',
    'POST',
  )

  await cooked.getByRole('button', {
    name: /Cook Again/,
  }).click()

  await expectSuccessfulResponse(
    cookedAgainResponse,
    'Recording another cook failed',
  )

  await expect(cooked.locator('.recipe-cooked-action'))
    .toContainText('Cooked 2 times')

  await openRecipes(page)
  await openHistoryTab(page, 'cooked')

  await expect(
    recipeCard(page, title).locator('.recipe-cooked-action'),
  ).toContainText('Cooked 2 times')
})

test('search recipe results, show no matches and clear filters', async ({
  page,
  member,
}) => {
  await openExplore(page)

  const title = await firstRecipeTitle(page)
  const search = page.getByRole('searchbox', {
    name: 'Search recipes',
    exact: true,
  })

  await search.fill(title)
  await expect(recipeCard(page, title)).toBeVisible()

  await search.fill('E2E-no-recipe-9f8a7b6c5d4e')

  await expect(page.locator('.recipe-card')).toHaveCount(0)

  await expect(page.getByRole('heading', {
    name: 'No recipes found yet.',
    exact: true,
  })).toBeVisible()

  await page.locator('.filter-bar').getByRole('button', {
    name: 'Clear',
    exact: true,
  }).click()

  await expect(search).toHaveValue('')
  await expect(page.locator('.recipe-card').first()).toBeVisible()
})

test('cooking-time filters show only matching estimated times', async ({
  page,
  member,
}) => {
  await openExplore(page)

  // Wait for any visible time-estimation placeholders to finish.
  await expect(
    page.getByText('⏱ Estimating...', { exact: true }),
  ).toHaveCount(0, { timeout: 120_000 })

  const filter = page.getByRole('combobox', {
    name: 'Filter estimated cooking time',
    exact: true,
  })

  for (const value of ['30', '45', '60', '60plus']) {
    await filter.selectOption(value)
    await expect(filter).toHaveValue(value)

    // Wait until the result count and displayed cards agree,
// and every displayed time satisfies the selected filter.
    await expect.poll(async () => {
      const text = await page.locator('.results-line > span')
        .first()
        .innerText()

      const countMatch = text.match(/(\d+) recipes found/)
      if (!countMatch) return false

      const expectedCount = Math.min(Number(countMatch[1]), 6)

      const tags = await page.locator(
        '.recipe-card .recipe-tags',
      ).allTextContents()

      if (tags.length !== expectedCount) return false

      return tags.every(text => {
        const match = text.match(/Estimated time:\s*(\d+)\s*min/)
        if (!match) return false

        const minutes = Number(match[1])

        return value === '60plus'
          ? minutes >= 60
          : minutes < Number(value)
      })
    }, {
      message: `Displayed recipes should match cooking-time filter ${value}`,
      timeout: 20_000,
    }).toBe(true)
  }

  await filter.selectOption('')
  await expect(page.locator('.recipe-card').first()).toBeVisible()
})

test('sort recipes alphabetically by name', async ({
  page,
  member,
}) => {
  await openExplore(page)

  const sort = page.getByRole('combobox', {
    name: 'Sort recipes',
    exact: true,
  })

  await sort.selectOption('name')
  await expect(sort).toHaveValue('name')

  const count = await waitForResultCount(page)
  const headings = page.locator('.recipe-card h3')

  await expect(headings).toHaveCount(Math.min(count, 6))

  // Retry while Vue finishes replacing/reordering the cards.
  await expect.poll(async () => {
    const titles = await headings.allTextContents()
    const names = titles.map(title => title.trim())

    if (names.length !== Math.min(count, 6)) return false

    const sorted = [...names].sort((a, b) => a.localeCompare(b))

    return names.every((name, index) => name === sorted[index])
  }, {
    message: 'Displayed recipes should be ordered alphabetically',
    timeout: 20_000,
  }).toBe(true)
})

test('pagination changes recipes and Previous restores the first page', async ({
  page,
  member,
}) => {
  await openExplore(page)

  const count = await waitForResultCount(page)

  test.skip(
    count <= 6,
    'The real provider returned too few recipes to exercise pagination.',
  )

  const firstPage = await page.locator('.recipe-card h3')
    .allTextContents()

  const pagination = page.locator('.pagination')
  const previous = pagination.getByRole('button', {
    name: /Previous/,
  })

  await expect(previous).toBeDisabled()

  await pagination.getByRole('button', {
    name: /Next/,
  }).click()

  await expect(pagination.locator('span'))
    .toHaveText(/^\s*2\s*\/\s*\d+\s*$/)

  await expect(page.locator('.recipe-card').first()).toBeVisible()

  await expect.poll(
    () => page.locator('.recipe-card h3').allTextContents(),
  ).not.toEqual(firstPage)

  await previous.click()

  await expect(pagination.locator('span'))
    .toHaveText(/^\s*1\s*\/\s*\d+\s*$/)

  await expect.poll(
    () => page.locator('.recipe-card h3').allTextContents(),
  ).toEqual(firstPage)
})

test('AI Picks loads recommendations or the supported ranking fallback', async ({
  page,
  context,
  member,
}) => {
  await seedFood(context, { name: 'Chicken' })
  await openRecipes(page)

  const recommendationsLoaded = waitForRecipeResponse(
    page,
    '/api/recipe-recommendations',
    'POST',
  )

  await page.getByRole('tab', {
    name: /AI Picks/,
  }).click()

  const response = await expectSuccessfulResponse(
    recommendationsLoaded,
    'Loading recommendations failed',
  )

  const data = await response.json()

  expect(Array.isArray(data.recommendations)).toBe(true)
  expect(data.recommendations.length).toBeGreaterThan(0)

  await expect(page.locator('.recipe-card').first()).toBeVisible({
    timeout: 120_000,
  })

  await expect(page.locator('.tab-intro')).toContainText(
    data.aiUsed
      ? 'AI-powered.'
      : 'Using smart recipe ranking.',
  )
})