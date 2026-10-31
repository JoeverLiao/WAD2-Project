import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import DashboardView from '../views/account/DashboardView.vue'
import { useInventoryStore } from '../stores/inventory.js'
import { showConfirm, showPrompt } from '../utils/dialog.js'

vi.mock('../utils/dialog.js')

const food = { _id: 'apple-1', name: 'Apples', quantity: 3, unit: 'pieces', storage: 'fridge', storageZone: 'middle-shelf', expiresAt: '2026-11-05' }
let wrapper
let request
let pinia
beforeEach(() => {
  pinia = createPinia()
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  request = vi.fn(async (url, options) => ({ ok: true, json: async () => {
    if (url.startsWith('/api/freshness/recipes')) return []
    if (options?.method === 'DELETE') return {}
    if (options?.method === 'PATCH') return { item: { ...food, ...JSON.parse(options.body) } }
    if (options?.method === 'POST') return { item: { ...JSON.parse(options.body), _id: 'new-food' } }
    return { items: [food] }
  } }))
  vi.stubGlobal('fetch', request)
  showPrompt.mockResolvedValue('1')
  showConfirm.mockResolvedValue(true)
})
afterEach(() => {
  wrapper?.unmount()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
async function openShelf() {
  wrapper = mount(DashboardView, { attachTo: document.body, global: { plugins: [pinia], stubs: { RouterLink: { template: '<a><slot /></a>' } } } })
  await flushPromises()
  await wrapper.get('.fridge-door').trigger('click')
  await wrapper.get('[data-drop-zone="middle-shelf"]').trigger('click')
}

describe('Dashboard Smart Fridge', () => {
  it('loads inventory once and updates the dashboard when a portion is consumed', async () => {
    await openShelf()
    expect(wrapper.findAll('.storage-card')).toHaveLength(0)
    expect(wrapper.get('.food-card').text()).toContain('Apples')
    await wrapper.findAll('.food-quantity-actions button')[0].trigger('click')
    await flushPromises()
    expect(useInventoryStore(pinia).items[0].quantity).toBe(2)
    expect(wrapper.findAll('.expiry-table td')[2].text()).toBe('2')
    expect(wrapper.get('.food-card .quantity').text()).toBe('2 pieces')
    expect(request.mock.calls.filter(([url, options]) => url === '/api/inventory' && options?.method === 'GET')).toHaveLength(1)
    expect(food.quantity).toBe(3)
  })

  it('removes consumed food from the expiry list, count and shared inventory', async () => {
    showPrompt.mockResolvedValue('3')
    await openShelf()
    await wrapper.findAll('.food-quantity-actions button')[0].trigger('click')
    await flushPromises()
    expect(useInventoryStore(pinia).items).toHaveLength(0)
    expect(wrapper.get('.stamp-title').text()).toBe('0 items tracked.')
    expect(wrapper.get('.expiry-table').text()).not.toContain('Apples')
    expect(wrapper.find('.food-card').exists()).toBe(false)
  })

  it('hides the pantry, search and add-food controls in the dashboard fridge', async () => {
    await openShelf()
    expect(wrapper.find('.pantry-unit').exists()).toBe(false)
    expect(wrapper.find('#inventory-search').exists()).toBe(false)
    expect(wrapper.find('.toolbar').exists()).toBe(false)
    expect(wrapper.find('.modal-toolbar').exists()).toBe(false)
    expect(wrapper.get('.food-card').text()).toContain('Apples')
  })
})
