import { afterEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AnalyticsView from '../views/analytics/AnalyticsView.vue'
import { mockHttp } from './helpers/mockHttp.js'

vi.mock('../components/analytics/VegetableCompanions.vue', () => ({ default: { template: '<div />' } }))
let wrapper
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('waits for three clicks, prevents overlapping seeds, and refreshes stored history', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))
  let complete
  const event = { _id: 'demo', name: 'Apples', action: 'consumed', quantity: 1, unit: 'piece', weightKg: 1, valueSgd: 2, category: 'Fruit', location: 'Fridge', source: 'Analytics demo', occurredAt: '2026-11-04T04:00:00Z' }
  let seeded = false
  const request = vi.fn(async (_url, options) => {
    if (options?.method === 'POST') return new Promise(resolve => { complete = () => { seeded = true; resolve({ data: { added: 50 }, status: 200 }) } })
    return { data: { events: seeded ? [event] : [] }, status: 200 }
  })
  mockHttp(request)
  wrapper = mount(AnalyticsView, { global: { stubs: { RouterLink: true } } })
  await flushPromises()
  const heart = wrapper.get('.stamp-trigger')
  await heart.trigger('click')
  await heart.trigger('click')
  expect(request.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0)
  await heart.trigger('click')
  await flushPromises()
  expect(request).toHaveBeenCalledWith('/api/analytics/demo', expect.objectContaining({ method: 'POST', withCredentials: true }))
  await heart.trigger('click'); await heart.trigger('click'); await heart.trigger('click')
  expect(request.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1)
  complete()
  await flushPromises()
  expect(wrapper.text()).toContain('Apples')
  expect(request.mock.calls.filter(([url]) => url === '/api/analytics/history')).toHaveLength(2)
})

it('does not combine clicks spaced more than two seconds apart and exposes API failures', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))
  let clock = 0
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  const request = vi.fn(async (_url, options) => {
    if (options?.method === 'POST') throw new Error('Your session has expired.')
    return { data: { events: [] }, status: 200 }
  })
  mockHttp(request)
  wrapper = mount(AnalyticsView, { global: { stubs: { RouterLink: true } } })
  await flushPromises()
  const heart = wrapper.get('.stamp-trigger')
  await heart.trigger('click'); clock = 2100
  await heart.trigger('click'); await heart.trigger('click')
  expect(request.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0)
  await heart.trigger('click'); await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain('Your session has expired.')
  expect(heart.attributes('aria-disabled')).toBe('false')
})
