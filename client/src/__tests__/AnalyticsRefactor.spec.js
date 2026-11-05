import { mockHttp } from './helpers/mockHttp.js'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import AnalyticsView from '../views/analytics/AnalyticsView.vue'
import { foodActivityDay } from '../utils/foodActivityDates.js'

vi.mock('../components/analytics/VegetableCompanions.vue', () => ({
  default: { template: '<div />' },
}))
let wrapper
const event = {
  _id: 'saved',
  name: 'Milk',
  action: 'consumed',
  quantity: 1,
  unit: 'carton',
  weightKg: 1,
  valueSgd: 3,
  location: 'Fridge',
  category: 'Dairy',
  source: 'Inventory',
  occurredAt: '2026-11-04T17:30:00.000Z',
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-05T01:00:00Z'))
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }))
  HTMLDialogElement.prototype.showModal = vi.fn()
  HTMLDialogElement.prototype.close = vi.fn()
})
afterEach(() => {
  wrapper?.unmount()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
async function open() {
  wrapper = mount(AnalyticsView, { global: { stubs: { RouterLink: true } } })
  await flushPromises()
}

it('only renders the visible days when history spans years and preserves viewport changes', async () => {
  mockHttp(
    vi.fn(async () => ({
      data: {
        events: [{ ...event, _id: 'old', occurredAt: '2020-01-01T04:00:00Z' }, event],
      },
      status: 200,
    })),
  )
  await open()
  expect(Number(wrapper.get('[aria-label="Start date"]').element.value)).toBeGreaterThan(2000)
  expect(wrapper.findAll('.impact-chart circle').length).toBeLessThanOrEqual(66)
  await wrapper
    .findAll('.period-presets button')
    .find((button) => button.text() === 'Last 7 days')
    .trigger('click')
  expect(wrapper.findAll('.impact-chart circle').length).toBeLessThanOrEqual(20)
  expect(wrapper.findAll('tbody tr')).toHaveLength(1)
  const start = wrapper.get('[aria-label="Start date"]').element.value
  const todayPoint = wrapper.findAll('circle[role="button"]').at(-1)
  await todayPoint.trigger('keydown', { key: 'Enter' })
  await flushPromises()
  expect(wrapper.get('dialog [name="name"]').element.value).toBe('Milk')
  expect(wrapper.get('[aria-label="Start date"]').element.value).toBe(start)
})

it('edits after-midnight Singapore activity on the right date without rewriting its timestamp', async () => {
  const request = vi.fn(async (_url, options) => ({
    data:
      options?.method === 'PUT'
        ? { event: { ...event, ...JSON.parse(options.data) } }
        : { events: [event] },
    status: 200,
  }))
  mockHttp(request)
  await open()
  await wrapper.get('tbody .date-link').trigger('click')
  await flushPromises()
  expect(wrapper.get('dialog h2').text()).toContain('5 Nov 2026')
  await wrapper.get('dialog form').trigger('submit')
  await flushPromises()
  const update = request.mock.calls.find(([, options]) => options.method === 'PUT')
  expect(JSON.parse(update[1].data).occurredAt).toBe(event.occurredAt)
})

it('retries partially saved records without creating the successful ones twice', async () => {
  let posts = 0
  let fail = true
  const request = vi.fn(async (url, options) => {
    if (options.method === 'GET') return { data: { events: [] }, status: 200 }
    if (options.method === 'POST') {
      posts++
      if (fail && posts === 2) return { status: 500, data: { error: 'Try again' } }
    }
    return {
      data: {
        event: {
          ...JSON.parse(options.data),
          _id: url.split('/').at(-1) === 'events' ? `new-${posts}` : url.split('/').at(-1),
        },
      },
      status: 200,
    }
  })
  mockHttp(request)
  await open()
  await wrapper.findAll('circle[role="button"]').at(-1).trigger('keydown', { key: 'Enter' })
  await flushPromises()
  for (const name of ['Milk', 'Eggs']) {
    await wrapper.get('dialog .btn-paper').trigger('click')
    await wrapper.findAll('[name="name"]').at(-1).setValue(name)
  }
  await wrapper.get('dialog form').trigger('submit')
  await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toBe('Try again')
  fail = false
  await wrapper.get('dialog form').trigger('submit')
  await flushPromises()
  expect(posts).toBe(3)
  expect(request.mock.calls.filter(([, options]) => options.method === 'PUT')).toHaveLength(1)
  expect(wrapper.findAll('tbody tr')).toHaveLength(2)
  const saved = request.mock.calls.filter(([, options]) => options.method === 'POST').at(-1)
  expect(foodActivityDay(JSON.parse(saved[1].data).occurredAt)).toBe('2026-11-05')
})
