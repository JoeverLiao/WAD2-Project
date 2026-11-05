import { test as base, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'

export { expect }

// These are the test accounts.
export const BOB = { username: 'Bob', email: 'user1@gmail.com', password: '12341234' }
export const ALICE = { username: 'Alice', email: 'user2@gmail.com', password: '12341234' }

const generatedEmails = new Set()

export function accountDetails() {
  // Extra registrations use a numeric suffix, without reusing Bob/Alice's email.
  // A timestamp plus random digits avoids relying on user3/user4 being unused.
  let email
  do {
    const number = `${Date.now()}${Math.floor(Math.random() * 1_000_000).toString().padStart(6, '0')}`
    email = `user${number}@gmail.com`
  } while (generatedEmails.has(email))
  generatedEmails.add(email)
  return {
    username: `Tester ${randomUUID().slice(0, 8)}`,
    email,
    password: `Test-${randomUUID()}`,
  }
}

export function uniqueName(label) {
  return `E2E ${label} ${randomUUID().slice(0, 8)}`
}

export function futureDay(days = 3) {
  return new Date(Date.now() + 8 * 3600000 + days * 86400000).toISOString().slice(0, 10)
}

export function listingData(name, inventoryItem) {
  const day = futureDay(1)
  const data = {
    title: name, quantity: 2, unit: 'pieces', category: 'produce',
    description: 'Created by the automated E2E suite.',
    expiresAt: `${futureDay(3)}T23:59:00+08:00`,
    pickupStart: `${day}T12:00:00+08:00`,
    pickupEnd: `${day}T17:00:00+08:00`,
    pickupLabel: 'Singapore Management University, 81 Victoria Street',
    latitude: 1.2966, longitude: 103.8501,
  }
  if (inventoryItem) data.inventoryItem = inventoryItem
  return data
}

export async function json(response, expectedStatus = 200) {
  expect(response.status(), `Unexpected API status at ${response.url()}: ${await response.text()}`)
    .toBe(expectedStatus)
  return response.json()
}

export function id(item) {
  return String(typeof item === 'string' ? item : item._id || item.id)
}

// Cookie-based API login also signs in this browser context.
export async function signIn(context, account = BOB) {
  const login = await context.request.post('/api/auth/login', { data: account })
  if (login.status() === 200) return { ...account, user: await login.json() }
  await json(login, 401)
  const registration = await context.request.post('/api/auth/register', { data: account })
  if (registration.status() === 409) {
    // The email exists. Do not change or overwrite an existing user's password.
    const retry = await context.request.post('/api/auth/login', { data: account })
    expect(retry.status(), `${account.email} exists, but the supplied password did not work.`).toBe(200)
    return { ...account, user: await retry.json() }
  }
  return { ...account, user: await json(registration, 201) }
}

// Track only records created by this test. Never clear Bob/Alice's whole inventory.
const created = new WeakMap()
export function trackFood(context, item) {
  created.get(context)?.foods.add(id(item))
}
export function trackListing(context, item) {
  created.get(context)?.listings.add(id(item))
}

export async function createListing(context, data) {
  const result = await json(await context.request.post('/api/rescue', { data }), 201)
  trackListing(context, result.listing)
  return result
}

export async function seedFood(context, overrides = {}) {
  const data = {
    name: uniqueName('Apples'), quantity: 4, unit: 'pieces', weightKg: 1,
    storage: 'fridge', storageZone: 'middle-shelf', purchasePrice: 4,
    purchasedAt: new Date().toISOString(),
    expiresAt: `${futureDay(3)}T23:59:00+08:00`,
    ...overrides,
  }
  const result = await json(await context.request.post('/api/inventory', { data }), 201)
  trackFood(context, result.item)
  return result.item
}

export async function openShelves(page) {
  await page.goto('/fridge')
  await page.getByRole('button', { name: 'Open refrigerator door', exact: true }).click()
  await page.locator('.shelf-compartment').click()
  return page.getByRole('dialog', { name: 'Shelves', exact: true })
}

export async function openConversation(page, direction, foodName) {
  await page.goto('/food-rescue')
  await page.locator(`.sharing-stat--${direction}`).click()

  const dialog = page.getByRole('dialog', {
    name: 'Your sharing corner',
    exact: true,
  })

  await expect(dialog).toBeVisible()

  // Wait for requests to load before searching or expanding groups.
  await expect(dialog.locator('.sharing-inbox')).toHaveAttribute(
    'aria-busy',
    'false',
  )

  const directionButton = dialog.getByRole('button', {
    name: direction === 'received' ? /^Received/ : /^Sent/,
  })

  await expect(directionButton).toHaveAttribute('aria-pressed', 'true')

  const search = dialog.getByRole('searchbox', {
    name: 'Find food or a neighbour',
  })

  await expect(search).toBeEnabled()
  await search.fill(foodName)
  await expect(search).toHaveValue(foodName)

  // The unique food name should leave exactly one matching person group.
  const person = dialog.locator('.group-heading')
  await expect(person).toHaveCount(1)
  await expect(person).toBeEnabled()

  if (await person.getAttribute('aria-expanded') === 'false') {
    await person.click()
  }

  await expect(person).toHaveAttribute('aria-expanded', 'true')

  const conversation = dialog.locator('.request-person').filter({
    has: page.getByText(foodName, { exact: true }),
  })

  await expect(conversation).toHaveCount(1)
  await expect(conversation).toBeVisible()
  await conversation.click()

  return dialog

}

async function cleanUp(context, records, testInfo) {
  const warnings = []
  // Cancel only requests on this test's own listings, then withdraw those listings.
  for (const listingId of records.listings) {
    try {
      const response = await context.request.get(`/api/rescue/${listingId}`)
      if (response.status() === 404) continue
      const { listing } = await json(response)
      if (listing.status === 'collected') continue // Kept as history by the app.
      if (listing.status === 'claimed' && listing.acceptedRequest) {
        await json(await context.request.post(`/api/rescue/requests/${id(listing.acceptedRequest)}/cancel`))
      }
      await json(await context.request.delete(`/api/rescue/${listingId}`))
    } catch (error) { warnings.push(`Listing ${listingId}: ${error.message}`) }
  }
  for (const foodId of records.foods) {
    try {
      const response = await context.request.delete(`/api/inventory/${foodId}`)
      if (![200, 204, 404].includes(response.status())) warnings.push(`Inventory ${foodId}: HTTP ${response.status()}`)
    } catch (error) { warnings.push(`Inventory ${foodId}: ${error.message}`) }
  }
  if (warnings.length) await testInfo.attach('cleanup-notes', { body: warnings.join('\n'), contentType: 'text/plain' })
}

export const test = base.extend({
  member: async ({ context }, use, testInfo) => {
    const member = await signIn(context, BOB)
    const records = { foods: new Set(), listings: new Set() }
    created.set(context, records)
    try { await use(member) }
    finally {
      await cleanUp(context, records, testInfo)
      created.delete(context)
    }
  },
})


