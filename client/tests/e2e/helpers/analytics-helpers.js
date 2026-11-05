import {
  test as base,
  expect,
  accountDetails,
  signIn,
  json,
  uniqueName,
} from './helpers.js'

export { expect, json, uniqueName }

// Give each analytics test an isolated account.
export const test = base.extend({
  member: async ({ context }, use) => {
    const account = accountDetails()
    const member = await signIn(context, account)
    await use(member)
  },
})

export function daysAgo(amount = 1) {
  const singaporeTime = Date.now() + 8 * 60 * 60 * 1000
  return new Date(singaporeTime - amount * 86400000)
    .toISOString()
    .slice(0, 10)
}

export function money(value) {
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency: 'SGD',
  }).format(value)
}

export async function seedActivity(context, overrides = {}) {
  const result = await json(
    await context.request.post('/api/analytics/events', {
      data: {
        name: uniqueName('analytics'),
        action: 'discarded',
        quantity: 1,
        unit: 'pieces',
        weightKg: 0.5,
        valueSgd: 3,
        location: 'Fridge',
        category: 'Fruit',
        source: 'E2E setup',
        occurredAt: `${daysAgo(1)}T12:00:00+08:00`,
        ...overrides,
      },
    }),
    201,
  )

  return result.event
}

export async function openAnalytics(page) {
  const loaded = page.waitForResponse(response =>
    new URL(response.url()).pathname === '/api/analytics/history' &&
    response.request().method() === 'GET'
  )

  await page.goto('/analytics')

  const response = await loaded
  expect(response.ok(), 'Loading analytics history failed').toBeTruthy()
  await response.finished()

  await expect(
    page.getByRole('heading', {
      name: 'Food activity',
      exact: true,
    }),
  ).toBeVisible()
}

export function activityRows(page) {
  return page.getByRole('region', {
    name: 'Food activity table',
  }).locator('tbody tr')
}

export function activityRow(page, name) {
  return activityRows(page).filter({ hasText: name })
}

export async function openActivityEditor(page, name) {
  const row = activityRow(page, name)
  await expect(row).toBeVisible()
  await row.getByRole('button').click()

  const editor = page.getByRole('dialog', {
    name: /^Activity for/,
  })

  await expect(editor).toBeVisible()

  const records = editor.locator('.editor-record')
  await expect(records).not.toHaveCount(0)

  for (let index = 0; index < await records.count(); index++) {
    const record = records.nth(index)
    const value = await record.locator('input[name="name"]').inputValue()

    if (value === name) {
      return { editor, record }
    }
  }

  throw new Error(`Activity record not found in editor: ${name}`)
}

export async function saveActivityEditor(page, editor, eventId) {
  const saved = page.waitForResponse(response =>
    new URL(response.url()).pathname ===
      `/api/analytics/events/${eventId}` &&
    response.request().method() === 'PUT'
  )

  await editor.getByRole('button', {
    name: 'Save changes',
    exact: true,
  }).click()

  const response = await saved
  expect(response.ok(), 'Saving activity failed').toBeTruthy()
  await expect(editor).not.toBeVisible()
}

export function metric(page, label) {
  return page.locator('.metric-card').filter({
    has: page.getByRole('heading', {
      name: label,
      exact: true,
    }),
  }).locator('.metric-value')
}