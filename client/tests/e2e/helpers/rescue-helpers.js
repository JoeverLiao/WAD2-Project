import { randomUUID } from 'node:crypto'

import {
  test as base,
  expect,
  signIn,
  ALICE,
  accountDetails,
  createListing,
  seedFood,
  listingData,
  uniqueName,
  futureDay,
  json,
  id,
  openConversation,
} from './helpers.js'

export {
  expect,
  createListing,
  seedFood,
  listingData,
  uniqueName,
  futureDay,
  json,
  id,
}

export function clientKey() {
  return `e2e-${randomUUID()}`
}

export function waitForEndpoint(page, path, method = 'POST') {
  return page.waitForResponse(response =>
    new URL(response.url()).pathname === path &&
    response.request().method() === method
  )
}

export async function expectSuccess(promise) {
  const response = await promise
  expect(response.ok(), `Request failed: ${response.url()}`).toBeTruthy()
  return response
}

export const test = base.extend({
  rescue: async ({ browser, baseURL, member }, use) => {
    const contexts = []

    async function newActor(account = accountDetails()) {
      const context = await browser.newContext({
        baseURL,
        timezoneId: 'Asia/Singapore',
        reducedMotion: 'reduce',
      })

      contexts.push(context)

      const accountInfo = await signIn(context, account)
      const page = await context.newPage()

      return { context, page, ...accountInfo }
    }

    try {
      const alice = await newActor(ALICE)

      // Give Alice a known search centre near the test listings.
      const setup = await createListing(
        alice.context,
        listingData(uniqueName('map setup')),
      )

      await json(
        await alice.context.request.delete(
          `/api/rescue/${id(setup.listing)}`,
        ),
      )

      await use({ alice, newActor })
    } finally {
      for (const context of contexts.reverse()) {
        await context.close()
      }
    }
  },
})

export async function claim(actor, listing, overrides = {}) {
  const result = await json(
    await actor.context.request.post(
      `/api/rescue/${id(listing)}/claim`,
      {
        data: {
          pickupStart: listing.pickupStart,
          pickupEnd: listing.pickupEnd,
          message: '',
          ...overrides,
        },
      },
    ),
    201,
  )

  return result.request
}

export async function setupPickup(context, alice, overrides = {}) {
  const food = await seedFood(context)

  const { listing } = await createListing(context, {
    ...listingData(food.name, id(food)),
    ...overrides,
  })

  const request = await claim(alice, listing)
  return { food, listing, request }
}

export async function listingState(context, listing) {
  const result = await json(
    await context.request.get(`/api/rescue/${id(listing)}`),
  )

  return result.listing
}

export async function requestState(context, listing, request) {
  const result = await json(
    await context.request.get('/api/rescue/requests', {
      params: {
        direction: 'received',
        listing: id(listing),
        limit: 50,
      },
    }),
  )

  const found = result.requests.find(item => id(item) === id(request))
  expect(found, 'Expected request was not returned').toBeDefined()
  return found
}

export async function requestAction(context, request, action) {
  return json(
    await context.request.post(
      `/api/rescue/requests/${id(request)}/${action}`,
    ),
  )
}

export async function assertInventory(context, food, quantity, weight) {
  const result = await json(
    await context.request.get(`/api/inventory/${id(food)}`),
  )

  expect(result.item.quantity).toBe(quantity)

  if (weight !== undefined) {
    expect(result.item.weightKg).toBeCloseTo(weight)
  }
}

export async function openThread(page, direction, foodName) {
  await page.bringToFront()
  return openConversation(page, direction, foodName)
}

export async function showNearby(actor, query) {
  const page = actor.page

  await page.bringToFront()
  await page.goto('/food-rescue')

  await page.getByLabel(
    'Maximum distance from the search centre',
  ).selectOption('25')

  const loaded = page.waitForResponse(response => {
    const url = new URL(response.url())

    return (
      url.pathname.replace(/\/$/, '') === '/api/rescue' &&
      url.searchParams.get('q') === query &&
      response.request().method() === 'GET'
    )
  })

  await page.getByRole('searchbox', {
    name: 'Search food names',
  }).fill(query)

  const response = await expectSuccess(loaded)
  const result = await response.json()
  const cards = page.locator('#explore-map .food-card')

  await expect(cards).toHaveCount(result.listings.length)

  for (const listing of result.listings) {
    await expect(cards.filter({ hasText: listing.title })).toBeVisible()
  }

  return cards
}

export async function openMyListing(page, title) {
  await page.goto('/food-rescue')
  await page.locator('.sharing-stat--listings').click()

  const dialog = page.getByRole('dialog', {
    name: /^My listings/,
  })

  await expect(dialog).toBeVisible()

  await dialog.getByRole('searchbox', {
    name: 'Search your listings',
  }).fill(title)

  const row = dialog.locator('tbody tr').filter({
    has: page.getByRole('heading', {
      name: title,
      exact: true,
    }),
  })

  await expect(row).toBeVisible()
  return { dialog, row }
}

export async function openListingEditor(page, title) {
  const { row } = await openMyListing(page, title)

  await row.getByRole('button', { name: /^Edit / }).click()

  const editor = page.getByRole('dialog', {
    name: 'Edit your listing',
    exact: true,
  })

  await expect(editor).toBeVisible()
  return editor
}

export async function sendMessage(actor, request, text) {
  const result = await json(
    await actor.context.request.post(
      `/api/rescue/requests/${id(request)}/messages`,
      {
        data: {
          text,
          clientMessageId: clientKey(),
        },
      },
    ),
    201,
  )

  return result.message
}

export function proposedWindow() {
  const day = futureDay(1)

  return {
    localStart: `${day}T10:00`,
    localEnd: `${day}T11:00`,
    pickupStart: new Date(`${day}T10:00:00+08:00`).toISOString(),
    pickupEnd: new Date(`${day}T11:00:00+08:00`).toISOString(),
  }
}