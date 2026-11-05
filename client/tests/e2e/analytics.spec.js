import {
  test,
  expect,
  json,
  uniqueName,
  daysAgo,
  money,
  seedActivity,
  openAnalytics,
  activityRows,
  activityRow,
  openActivityEditor,
  saveActivityEditor,
  metric,
} from './headers/analytics-helpers.js'

// Avoid chart animations affecting position assertions.
test.use({ reducedMotion: 'reduce' })

test('edit food activity and retain the corrected value after reload', async ({
  page,
  context,
  member,
}) => {
  const event = await seedActivity(context)

  await openAnalytics(page)
  await expect(activityRow(page, event.name)).toContainText('Discarded')

  const { editor, record } = await openActivityEditor(page, event.name)

  await record.getByLabel('Total value (SGD)', {
    exact: true,
  }).fill('4.50')

  await saveActivityEditor(page, editor, event._id)

  await openAnalytics(page)
  await expect(activityRow(page, event.name)).toContainText('4.50')
})

test('cancelling an edit preserves the original value', async ({
  page,
  context,
  member,
}) => {
  const event = await seedActivity(context, { valueSgd: 3 })

  await openAnalytics(page)

  const { editor, record } = await openActivityEditor(page, event.name)

  await record.getByLabel('Total value (SGD)', {
    exact: true,
  }).fill('99.99')

  await editor.getByRole('button', {
    name: 'Cancel',
    exact: true,
  }).click()

  await expect(editor).not.toBeVisible()
  await openAnalytics(page)

  const row = activityRow(page, event.name)
  await expect(row).toContainText(money(3))
  await expect(row).not.toContainText('99.99')
})

// Each field is tested separately so failures identify the invalid input.
const invalidFields = [
  { label: 'Quantity', field: 'quantity' },
  { label: 'Weight (kg)', field: 'weightKg' },
  { label: 'Total value (SGD)', field: 'valueSgd' },
]

for (const field of invalidFields) {
  test(`negative ${field.label.toLowerCase()} cannot be saved`, async ({
    page,
    context,
    member,
  }) => {
    const event = await seedActivity(context)

    await openAnalytics(page)

    const { editor, record } = await openActivityEditor(page, event.name)
    const input = record.getByLabel(field.label, { exact: true })

    await input.fill('-1')

    await editor.getByRole('button', {
      name: 'Save changes',
      exact: true,
    }).click()

    // Validation blocks saving, so the editor stays open.
    await expect(editor).toBeVisible()

    // Verify the validation message shown to the user.
    await expect(
      record.getByText('Please enter 0 or more.', { exact: true }),
    ).toBeVisible()

    // Cancel instead of waiting for a save request.
    await editor.getByRole('button', {
      name: 'Cancel',
      exact: true,
    }).click()

    await expect(editor).not.toBeVisible()

    // The original stored value must remain unchanged.
    const history = await json(
      await context.request.get('/api/analytics/history'),
    )

    const unchanged = history.events.find(item => item._id === event._id)

    expect(unchanged).toBeDefined()
    expect(unchanged[field.field]).toBe(event[field.field])
  })
}

test('date presets include only activity within the selected period', async ({
  page,
  context,
  member,
}) => {
  const recent = await seedActivity(context, {
    occurredAt: `${daysAgo(2)}T12:00:00+08:00`,
  })

  const earlier = await seedActivity(context, {
    occurredAt: `${daysAgo(10)}T12:00:00+08:00`,
  })

  const oldest = await seedActivity(context, {
    occurredAt: `${daysAgo(35)}T12:00:00+08:00`,
  })

  await openAnalytics(page)

  const presets = page.getByRole('group', { name: 'Date presets' })

  await presets.getByRole('button', {
    name: 'Last 7 days',
    exact: true,
  }).click()

  await expect(activityRow(page, recent.name)).toBeVisible()
  await expect(activityRow(page, earlier.name)).toHaveCount(0)
  await expect(activityRow(page, oldest.name)).toHaveCount(0)

  await presets.getByRole('button', {
    name: 'Last 14 days',
    exact: true,
  }).click()

  await expect(activityRow(page, recent.name)).toBeVisible()
  await expect(activityRow(page, earlier.name)).toBeVisible()
  await expect(activityRow(page, oldest.name)).toHaveCount(0)

  await presets.getByRole('button', {
    name: 'All dates',
    exact: true,
  }).click()

  await expect(activityRow(page, oldest.name)).toBeVisible()
  await expect(activityRows(page)).toHaveCount(3)
})

test('changing the date slider filters activity and reset restores it', async ({
  page,
  context,
  member,
}) => {
  const recent = await seedActivity(context, {
    occurredAt: `${daysAgo(1)}T12:00:00+08:00`,
  })

  const older = await seedActivity(context, {
    occurredAt: `${daysAgo(10)}T12:00:00+08:00`,
  })

  await openAnalytics(page)
  await expect(activityRow(page, older.name)).toBeVisible()

  const startDate = page.getByRole('slider', {
    name: 'Start date',
    exact: true,
  })

  // The app keeps a minimum two-day range.
  await startDate.focus()
  await startDate.press('End')

  await expect(activityRow(page, recent.name)).toBeVisible()
  await expect(activityRow(page, older.name)).toHaveCount(0)

  const reset = page.getByRole('button', {
    name: 'Reset zoom',
    exact: true,
  })

  await expect(reset).toBeEnabled()
  await reset.click()

  await expect(activityRow(page, older.name)).toBeVisible()
  await expect(reset).toBeDisabled()
})

test('add an activity through the editor and retain it after reload', async ({
  page,
  context,
  member,
}) => {
  // An existing row provides a stable way to open that day's editor.
  const existing = await seedActivity(context)
  const name = uniqueName('manually added activity')

  await openAnalytics(page)

  const { editor } = await openActivityEditor(page, existing.name)

  await editor.getByRole('button', {
    name: 'Add record',
    exact: true,
  }).click()

  const record = editor.locator('.editor-record').last()

  await record.getByLabel('Food name', { exact: true }).fill(name)
  const actionSelect = record.locator('select[name="action"]')

  await expect(actionSelect).toBeVisible()
  await expect(actionSelect).toBeEnabled()
  await actionSelect.selectOption('consumed')
  await expect(actionSelect).toHaveValue('consumed')
  await record.getByLabel('Quantity', { exact: true }).fill('2')
  await record.getByLabel('Unit', { exact: true }).fill('pieces')
  await record.getByLabel('Weight (kg)', { exact: true }).fill('0.25')
  await record.getByLabel('Total value (SGD)', { exact: true }).fill('2.50')
  await record.getByLabel('Location', { exact: true }).fill('Pantry')

  const created = page.waitForResponse(response =>
    new URL(response.url()).pathname === '/api/analytics/events' &&
    response.request().method() === 'POST'
  )

  await editor.getByRole('button', {
    name: 'Save changes',
    exact: true,
  }).click()

  const response = await created
  expect(response.status()).toBe(201)
  await expect(editor).not.toBeVisible()

  await openAnalytics(page)

  const row = activityRow(page, name)
  await expect(row).toContainText('Consumed')
  await expect(row).toContainText('2 pieces')
  await expect(row).toContainText('0.25 kg')
  await expect(row).toContainText(money(2.5))
  await expect(row).toContainText('Pantry')
})

test('changing discarded activity to consumed updates its label and totals', async ({
  page,
  context,
  member,
}) => {
  const event = await seedActivity(context, {
    weightKg: 0.5,
    valueSgd: 3,
  })

  await openAnalytics(page)

  await expect(metric(page, 'Food discarded'))
    .toHaveAttribute('aria-label', '0.50 kg')

  const { editor, record } = await openActivityEditor(page, event.name)

  const actionSelect = record.locator('select[name="action"]')

  await expect(actionSelect).toBeVisible()
  await expect(actionSelect).toBeEnabled()
  await actionSelect.selectOption('consumed')
  await expect(actionSelect).toHaveValue('consumed')

  await saveActivityEditor(page, editor, event._id)
  await openAnalytics(page)

  await expect(activityRow(page, event.name)).toContainText('Consumed')

  await expect(metric(page, 'Food discarded'))
    .toHaveAttribute('aria-label', '0.00 kg')

  await expect(metric(page, 'Food kept from waste'))
    .toHaveAttribute('aria-label', '0.50 kg')

  await expect(metric(page, 'Food value preserved'))
    .toHaveAttribute('aria-label', money(3))
})

test('selecting a wasted food filters its activity and can be cleared', async ({
  page,
  context,
  member,
}) => {
  const selectedName = uniqueName('selected food')

  await seedActivity(context, {
    name: selectedName,
    action: 'discarded',
  })

  await seedActivity(context, {
    name: selectedName,
    action: 'consumed',
  })

  const other = await seedActivity(context)

  await openAnalytics(page)
  await expect(activityRows(page)).toHaveCount(3)

  await page.locator('.ranking-row').filter({
    hasText: selectedName,
  }).click()

  // Filtering a food shows all its actions, including consumption.
  await expect(activityRows(page)).toHaveCount(2)
  await expect(activityRow(page, selectedName)).toHaveCount(2)
  await expect(activityRow(page, other.name)).toHaveCount(0)

  await page.getByRole('button', {
    name: 'Clear food filter',
    exact: true,
  }).click()

  await expect(activityRows(page)).toHaveCount(3)
  await expect(activityRow(page, other.name)).toBeVisible()
})

test('waste ranking can sort by cost, weight and frequency', async ({
  page,
  context,
  member,
}) => {
  const expensive = uniqueName('expensive food')
  const heavy = uniqueName('heavy food')
  const frequent = uniqueName('frequent food')

  await seedActivity(context, {
    name: expensive,
    valueSgd: 20,
    weightKg: 0.1,
  })

  await seedActivity(context, {
    name: heavy,
    valueSgd: 2,
    weightKg: 5,
  })

  await seedActivity(context, {
    name: frequent,
    valueSgd: 1,
    weightKg: 0.2,
  })

  await seedActivity(context, {
    name: frequent,
    valueSgd: 1,
    weightKg: 0.2,
  })

  await openAnalytics(page)

  const controls = page.getByRole('group', {
    name: 'Rank wasted foods by',
  })

  await controls.getByRole('button', {
    name: 'Cost',
    exact: true,
  }).click()

  await expect(page.locator('.ranking-row').first())
    .toContainText(expensive)

  await controls.getByRole('button', {
    name: 'Weight',
    exact: true,
  }).click()

  await expect(page.locator('.ranking-row').first())
    .toContainText(heavy)

  await controls.getByRole('button', {
    name: 'Frequency',
    exact: true,
  }).click()

  await expect(page.locator('.ranking-row').first())
    .toContainText(frequent)
})

test('a date range without activity shows empty results and zero totals', async ({
  page,
  context,
  member,
}) => {
  await seedActivity(context, {
    occurredAt: `${daysAgo(40)}T12:00:00+08:00`,
  })

  await openAnalytics(page)

  await page.getByRole('group', {
    name: 'Date presets',
  }).getByRole('button', {
    name: 'Last 7 days',
    exact: true,
  }).click()

  await expect(activityRows(page)).toHaveCount(0)

  await expect(page.locator('.waste-empty')).toContainText(
    'No discarded food recorded in these dates',
  )

  await expect(metric(page, 'Food kept from waste'))
    .toHaveAttribute('aria-label', '0.00 kg')

  await expect(metric(page, 'Food discarded'))
    .toHaveAttribute('aria-label', '0.00 kg')

  await expect(metric(page, 'Food value preserved'))
    .toHaveAttribute('aria-label', money(0))
})

test('an account with no activity shows the initial empty state', async ({
  page,
  member,
}) => {
  await openAnalytics(page)

  await expect(page.getByText(
    'No food activity yet. Consume or discard food in your fridge to start tracking your impact.',
    { exact: true },
  )).toBeVisible()

  await expect(activityRows(page)).toHaveCount(0)

  await expect(metric(page, 'Community activity'))
    .toHaveAttribute('aria-label', '0')
})

test('impact cards calculate known weights, values and community activity', async ({
  page,
  context,
  member,
}) => {
  await seedActivity(context, {
    action: 'consumed',
    weightKg: 1,
    valueSgd: 10,
  })

  await seedActivity(context, {
    action: 'shared',
    weightKg: 0.5,
    valueSgd: 4,
  })

  await seedActivity(context, {
    action: 'rescued',
    weightKg: 0.25,
    valueSgd: 2,
  })

  await seedActivity(context, {
    action: 'discarded',
    weightKg: 0.75,
    valueSgd: 6,
  })

  await openAnalytics(page)
  await expect(activityRows(page)).toHaveCount(4)

  await expect(metric(page, 'Food kept from waste'))
    .toHaveAttribute('aria-label', '1.75 kg')

  await expect(metric(page, 'Food discarded'))
    .toHaveAttribute('aria-label', '0.75 kg')

  await expect(metric(page, 'Food value preserved'))
    .toHaveAttribute('aria-label', money(16))

  await expect(metric(page, 'Community activity'))
    .toHaveAttribute('aria-label', '2')

  await expect(page.locator('.discarded-cost')).toHaveAttribute(
    'aria-label',
    `${money(6)} discarded food value`,
  )
})

test('chart plots both series and a date can open its activity editor', async ({
  page,
  context,
  member,
}) => {
  await seedActivity(context, {
    action: 'consumed',
    weightKg: 2,
  })

  await seedActivity(context, {
    action: 'discarded',
    weightKg: 1,
  })

  await openAnalytics(page)
  await expect(activityRows(page)).toHaveCount(2)

  const chart = page.locator('.impact-chart')

  await expect(chart).toBeVisible()
  await expect(chart.locator('polyline')).toHaveCount(2)

  const day = daysAgo(1)
  const dateLabel = new Intl.DateTimeFormat('en-SG', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${day}T12:00:00Z`))

  const keptPoint = chart.locator(
    `circle[role="button"][aria-label="Edit activity for ${dateLabel}"]`,
  )

  await expect(keptPoint).toHaveCount(1)

  const x = await keptPoint.getAttribute('cx')
  const discardedPoint = chart.locator(
    `circle:not([role])[cx="${x}"]`,
  )

  await expect(discardedPoint).toHaveCount(1)

  const keptY = Number(await keptPoint.getAttribute('cy'))
  const discardedY = Number(await discardedPoint.getAttribute('cy'))

  expect(Number.isFinite(keptY)).toBe(true)
  expect(Number.isFinite(discardedY)).toBe(true)

  // A larger weight appears higher on the chart, with a smaller SVG y value.
  expect(keptY).toBeLessThan(discardedY)

  await keptPoint.focus()
  await keptPoint.press('Enter')

  const editor = page.getByRole('dialog', {
    name: /^Activity for/,
  })

  await expect(editor).toBeVisible()
  await expect(editor.locator('.editor-record')).toHaveCount(2)

  await editor.getByRole('button', {
    name: 'Cancel',
    exact: true,
  }).click()

  await expect(editor).not.toBeVisible()
})