import {
  test,
  expect,
  seedFood,
  createListing,
  listingData,
  uniqueName,
  signIn,
  ALICE,
  json,
  id,
} from './helpers/helpers.js'

import {
  getImpactTotals,
  money,
  dashboardMetric,
} from './helpers/dashboard-helpers.js'

test.use({ reducedMotion: 'reduce' })

test('dashboard shows inventory in the expiry list and embedded fridge', async ({
  page,
  context,
  member,
}) => {
  const food = await seedFood(context)

  await page.goto('/dashboard')

  await expect(
    page.getByRole('heading', { level: 1 }),
  ).toContainText('Good food, well kept.')

  // Check the dashboard table directly.
  const expiryRow = page.locator('.expiry-table tbody tr').filter({
    hasText: food.name,
  })

  await expect(expiryRow).toBeVisible()

  // Open the embedded fridge.
  await page.getByRole('button', {
    name: 'Open refrigerator door',
    exact: true,
  }).click()

  await page.locator('.shelf-compartment').click()

  const shelves = page.getByRole('dialog', {
    name: 'Shelves',
    exact: true,
  })

  await expect(
    shelves.locator('.food-card').filter({
      hasText: food.name,
    }),
  ).toBeVisible()

  // Close the modal before checking the dashboard again.
  await shelves.getByRole('button', {
    name: 'Close compartment',
    exact: true,
  }).click()

  await expect(shelves).not.toBeVisible()

  await page.goto('/dashboard')

  const inventoryLoaded = page.waitForResponse(response =>
    new URL(response.url()).pathname === '/api/inventory' &&
    response.request().method() === 'GET'
  )

  await page.reload()

  const response = await inventoryLoaded
  expect(response.ok(), 'Reloading inventory failed').toBeTruthy()

  const data = await response.json()
  const savedFood = data.items.find(item =>
    String(item._id || item.id) === String(food._id || food.id)
  )

  expect(
    savedFood,
    'The saved food should remain in inventory after reload',
  ).toBeDefined()

  // This targets the dashboard table, not anything inside the fridge modal.
  const savedRow = page.locator('.expiry-table tbody tr').filter({
    hasText: savedFood.name,
  })

  await expect(savedRow).toBeVisible()
  await expect(savedRow.locator('td').nth(2))
    .toHaveText(String(savedFood.quantity))
})

test('dashboard badge updates when Alice sends unread messages', async ({
  page,
  context,
  browser,
  baseURL,
  member,
}) => {
  test.setTimeout(150_000)

  const { listing } = await createListing(
    context,
    listingData(uniqueName('dashboard messages')),
  )

  const aliceContext = await browser.newContext({
    baseURL,
    timezoneId: 'Asia/Singapore',
  })

  try {
    await signIn(aliceContext, ALICE)

    const { request } = await json(
      await aliceContext.request.post(
        `/api/rescue/${id(listing)}/claim`,
        {
          data: {
            pickupStart: listing.pickupStart,
            pickupEnd: listing.pickupEnd,
            message: '',
          },
        },
      ),
      201,
    )

    // Capture the dashboard's initial count before sending new messages.
    const initialCountResponse = page.waitForResponse(response =>
      new URL(response.url()).pathname ===
        '/api/rescue/messages/unread-count' &&
      response.request().method() === 'GET'
    )

    await page.goto('/dashboard')

    const initialResponse = await initialCountResponse
    expect(initialResponse.ok()).toBeTruthy()

    const initialData = await initialResponse.json()
    const initialCount = initialData.count

    const messageLink = page.locator('.neighbour-message-link')
    const badge = messageLink.locator('.message-count')

    await expect(messageLink).toBeVisible()

    if (initialCount === 0) {
      await expect(badge).toHaveCount(0)
    } else {
      await expect(badge).toHaveAttribute(
        'aria-label',
        `${initialCount} unread messages`,
      )
    }

    const messageIds = []

    // Two messages in ONE conversation should increase the badge by two.
    for (let index = 0; index < 2; index++) {
      const result = await json(
        await aliceContext.request.post(
          `/api/rescue/requests/${id(request)}/messages`,
          {
            data: {
              text: `Dashboard notification test ${index + 1}`,
              clientMessageId:
                `dashboard-${Date.now()}-${index}`,
            },
          },
        ),
        201,
      )

      messageIds.push(id(result.message))
    }

    const expectedCount = initialCount + 2

    // The dashboard polls every 30 seconds. No manual reload is used here.
    await expect(badge).toHaveAttribute(
      'aria-label',
      `${expectedCount} unread messages`,
      { timeout: 45_000 },
    )

    await expect(badge).toHaveText(
      expectedCount > 99 ? '99+' : String(expectedCount),
    )

    // Mark only this test's messages as read.
    await json(
      await context.request.post(
        `/api/rescue/requests/${id(request)}/messages/read`,
        {
          data: { messageIds },
        },
      ),
    )

    await page.reload()

    if (initialCount === 0) {
      await expect(badge).toHaveCount(0)
    } else {
      await expect(badge).toHaveAttribute(
        'aria-label',
        `${initialCount} unread messages`,
      )
    }
  } finally {
    await aliceContext.close()
  }
})

test('dashboard shows real recipe recommendations for inventory ingredients', async ({
  page,
  context,
  member,
}) => {
  test.setTimeout(180_000)

  // A recognised ingredient gives the real provider something to search for.
  await seedFood(context, { name: 'Chicken' })

  const recipesLoaded = page.waitForResponse(response => {
    const url = new URL(response.url())
    const ingredients = url.searchParams.get('ingredients') || ''

    return (
      url.pathname === '/api/freshness/recipes' &&
      response.request().method() === 'GET' &&
      ingredients.toLowerCase().includes('chicken')
    )
  }, { timeout: 120_000 })

  await page.goto('/dashboard')

  const response = await recipesLoaded
  expect(
    response.ok(),
    'The recipe recommendations request failed',
  ).toBeTruthy()

  const section = page.getByRole('region', {
    name: 'Try these recipes!',
    exact: true,
  })

  const cards = section.locator('.dashboard-recipe-card')

  await expect(cards.first()).toBeVisible({
    timeout: 120_000,
  })

  // The dashboard displays up to five recommendations.
  const count = await cards.count()
  expect(count).toBeGreaterThan(0)
  expect(count).toBeLessThanOrEqual(5)

  for (let index = 0; index < count; index++) {
    const card = cards.nth(index)

    await expect(card.locator('.recipe-name')).toContainText(/\S/)

    await expect(card).toHaveAttribute(
      'href',
      /\/freshness\/recipes\/[^/?#]+$/,
    )
  }

  // Verify a recommendation navigates to its recipe details.
  const destination = await cards.first().getAttribute('href')
  await cards.first().click()

  await expect(page).toHaveURL(
    new URL(destination, page.url()).href,
  )
})

test('dashboard displays analytics totals from recorded activity', async ({
  page,
  context,
  member,
}) => {
  const before = await getImpactTotals(context)

  const activities = [
    {
      action: 'consumed',
      weightKg: 1.25,
      valueSgd: 5,
    },
    {
      action: 'discarded',
      weightKg: 0.5,
      valueSgd: 2,
    },
  ]

  for (const activity of activities) {
    await json(
      await context.request.post('/api/analytics/events', {
        data: {
          name: uniqueName('dashboard activity'),
          quantity: 1,
          unit: 'pieces',
          location: 'Fridge',
          category: 'Fruit',
          source: 'E2E setup',
          occurredAt: new Date().toISOString(),
          ...activity,
        },
      }),
      201,
    )
  }

  await page.goto('/dashboard')

  await expect(
    dashboardMetric(page, 'Food kept from waste'),
  ).toHaveAttribute(
    'aria-label',
    `${(before.saved + 1.25).toFixed(2)} kg`,
  )

  await expect(
    dashboardMetric(page, 'Food discarded'),
  ).toHaveAttribute(
    'aria-label',
    `${(before.discarded + 0.5).toFixed(2)} kg`,
  )

  await expect(
    dashboardMetric(page, 'Food value preserved'),
  ).toHaveAttribute(
    'aria-label',
    money(before.value + 5),
  )

  await expect(
    dashboardMetric(page, 'Community activity'),
  ).toHaveAttribute(
    'aria-label',
    String(before.community),
  )

  await expect(
    page.locator('.impact-link .discarded-cost'),
  ).toHaveAttribute(
    'aria-label',
    `${money(before.discardedValue + 2)} discarded food value`,
  )

  // The dashboard analytics summary should link to the full analytics page.
  await expect(page.locator('.impact-link')).toHaveAttribute(
    'href',
    '/analytics#daily-food-impact',
  )
})