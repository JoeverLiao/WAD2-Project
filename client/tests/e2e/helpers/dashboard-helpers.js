import { json } from './helpers.js'

// Read existing activity so Bob's previous records don't break totals checks.
export async function getImpactTotals(context) {
  const { events } = await json(
    await context.request.get('/api/analytics/history'),
  )

  const totals = {
    saved: 0,
    discarded: 0,
    value: 0,
    discardedValue: 0,
    community: 0,
  }

  for (const event of events) {
    if (event.action === 'discarded') {
      totals.discarded += event.weightKg
      totals.discardedValue += event.valueSgd
    } else {
      totals.saved += event.weightKg
      totals.value += event.valueSgd
    }

    if (event.action === 'shared' || event.action === 'rescued') {
      totals.community++
    }
  }

  return totals
}

export function money(value) {
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency: 'SGD',
  }).format(value)
}

export function dashboardMetric(page, label) {
  return page.locator('.impact-link .metric-card').filter({
    has: page.getByRole('heading', {
      name: label,
      exact: true,
    }),
  }).locator('.metric-value')
}