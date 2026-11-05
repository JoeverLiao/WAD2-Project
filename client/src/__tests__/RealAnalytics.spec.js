import { mockHttp } from './helpers/mockHttp.js'
import { afterEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AnalyticsView from '../views/analytics/AnalyticsView.vue'

vi.mock('../components/analytics/VegetableCompanions.vue', () => ({ default: { template: '<div />' } }))
let wrapper
afterEach(() => { wrapper?.unmount(); vi.unstubAllGlobals() })
it('starts empty and saves a real activity to the API', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))
  const date = new Date().toISOString().slice(0, 10)
  const event = { _id: 'saved-id', name: 'Milk', action: 'discarded', quantity: 1, unit: 'carton',
    weightKg: 1, valueSgd: 3, location: 'My kitchen', source: 'Manual entry', category: 'Other',
    occurredAt: date + 'T00:00:00.000Z' }
  const request = vi.fn(async (_url, options) => ({ data: options?.method === 'POST' ? { event } : { events: [] }, status: 200 }))
  mockHttp(request)
  HTMLDialogElement.prototype.showModal = vi.fn()
  HTMLDialogElement.prototype.close = vi.fn()
  wrapper = mount(AnalyticsView, { global: { stubs: { RouterLink: true, VegetableCompanions: true } } })
  await flushPromises()
  expect(wrapper.text()).toContain('No food activity yet')
  expect(wrapper.text()).not.toContain('fictional')
  await wrapper.get('circle[role="button"]').trigger('keydown', { key: 'Enter' })
  await flushPromises()
  await wrapper.get('dialog .btn-paper').trigger('click')
  await wrapper.get('[name="name"]').setValue('Milk')
  await wrapper.get('[name="action"]').setValue('discarded')
  await wrapper.get('[name="weightKg"]').setValue(1)
  await wrapper.get('[name="valueSgd"]').setValue(3)
  await wrapper.get('dialog form').trigger('submit')
  await flushPromises()
  expect(request).toHaveBeenCalledWith('/api/analytics/events', expect.objectContaining({ method: 'POST', withCredentials: true }))
  expect(wrapper.text()).toContain('Milk')
  expect(wrapper.text()).toContain('1.00 kg')
})
