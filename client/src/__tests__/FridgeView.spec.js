import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { flushPromises, mount } from '@vue/test-utils'
import FridgeView from '../views/fridge/FridgeView.vue'
import FoodDragActions from '../components/fridge/FoodDragActions.vue'
import { showConfirm, showPrompt } from '../utils/dialog.js'

vi.mock('../utils/dialog.js')

const food = { _id: 'apple-1', name: 'Apples', quantity: 3, unit: 'pieces', storage: 'fridge', storageZone: 'middle-shelf', expiresAt: '2026-11-05' }
let wrapper
let request
function transfer() {
  return { setData: vi.fn(), getData: () => food._id, setDragImage: vi.fn(), effectAllowed: '' }
}
async function openFridge() {
  wrapper = mount(FridgeView, { attachTo: document.body })
  await flushPromises()
  await wrapper.get('.fridge-door').trigger('click')
}
async function beginDrag() {
  await wrapper.get('.mini-food').trigger('dragstart', { dataTransfer: transfer(), clientX: 400, clientY: 300 })
  await flushPromises()
}

beforeEach(() => {
  request = vi.fn(async (_url, options) => ({ ok: true, json: async () => options?.method === 'DELETE' ? {} : [food] }))
  vi.stubGlobal('fetch', request)
  showPrompt.mockResolvedValue('3')
  showConfirm.mockResolvedValue(true)
})
afterEach(() => {
  wrapper?.unmount()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Fridge interactions', () => {
  it('opens and lights the fridge with the pantry always available below', async () => {
    await openFridge()
    expect(wrapper.get('.fridge-body').classes()).toContain('fridge-is-open')
    expect(wrapper.get('.fridge-door').attributes('aria-expanded')).toBe('true')
    expect(wrapper.find('.cold-air').exists()).toBe(true)
    expect(wrapper.get('.fridge-body').classes()).toContain('light-on')
    expect(wrapper.get('.pantry-unit').attributes('inert')).toBeUndefined()
    expect(wrapper.find('.carousel-nav').exists()).toBe(false)
    expect(document.querySelector('.food-action-dock')).toBeNull()
  })

  it('drags the door through the lighting threshold and snaps open or closed', async () => {
    await openFridge()
    await wrapper.get('.fridge-door').trigger('click')
    const door = wrapper.get('.fridge-door')
    door.element.setPointerCapture = vi.fn()
    door.element.hasPointerCapture = () => true
    door.element.releasePointerCapture = vi.fn()
    wrapper.get('.fridge-body').element.getBoundingClientRect = () => ({ width: 400 })
    const pointer = async (type, clientX) => {
      const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: 800 - clientX })
      Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true } })
      door.element.dispatchEvent(event)
      await flushPromises()
    }
    await pointer('pointerdown', 400)
    await pointer('pointermove', 370)
    expect(wrapper.get('.fridge-body').classes()).not.toContain('light-on')
    await pointer('pointermove', 300)
    expect(wrapper.get('.fridge-body').classes()).toContain('light-on')
    await pointer('pointermove', 120)
    await pointer('pointerup', 120)
    await door.trigger('click') // Browser click after drag must not close the door.
    expect(door.attributes('aria-expanded')).toBe('true')
    await pointer('pointerdown', 120)
    await pointer('pointermove', 490)
    await pointer('pointerup', 490)
    expect(wrapper.get('.fridge-body').classes()).not.toContain('light-on')
  })

  it('shows older pantry and freezer records in the correct compartments', async () => {
    request.mockResolvedValue({ ok: true, json: async () => ({ items: [
      { ...food, _id: 'pantry-old', storage: 'pantry' },
      { ...food, _id: 'freezer-old', storage: 'freezer' },
    ] }) })
    await openFridge()
    expect(wrapper.find('.pantry-foods .food-icon').exists()).toBe(true)
    expect(wrapper.find('.freezer-compartment .food-preview .food-icon').exists()).toBe(true)
  })

  it('shows highlighted food and fixed actions only during a drag, and cancels without saving', async () => {
    await openFridge()
    await beginDrag()
    expect(wrapper.get('.mini-food').classes()).toContain('food-being-dragged')
    expect(document.querySelector('.held-food')).not.toBeNull()
    expect(document.querySelector('.food-action-dock')).not.toBeNull()
    expect(wrapper.find('.modal-action-zones').exists()).toBe(false)
    await wrapper.get('.mini-food').trigger('dragend')
    await flushPromises()
    expect(document.querySelector('.held-food')).toBeNull()
    expect(request.mock.calls.filter(([, options]) => options.method !== 'GET')).toHaveLength(0)
  })

  it('consumes food and chews only after the API succeeds', async () => {
    await openFridge()
    await beginDrag()
    const target = document.querySelector('[data-food-action="consume"]')
    const event = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'dataTransfer', { value: transfer() })
    target.dispatchEvent(event)
    await flushPromises()
    expect(request).toHaveBeenCalledWith('/api/inventory/apple-1', expect.objectContaining({ method: 'DELETE' }))
    expect(document.querySelector('.consume-target.celebrating')).not.toBeNull()
    expect(wrapper.find('.mini-food').exists()).toBe(false)
  })

  it('does not discard food when confirmation is cancelled', async () => {
    showConfirm.mockResolvedValue(false)
    await openFridge()
    await beginDrag()
    const target = document.querySelector('[data-food-action="discard"]')
    const event = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'dataTransfer', { value: transfer() })
    target.dispatchEvent(event)
    await flushPromises()
    expect(request.mock.calls.filter(([, options]) => options.method === 'DELETE')).toHaveLength(0)
    expect(wrapper.find('.mini-food').exists()).toBe(true)
    expect(document.querySelector('.celebrating')).toBeNull()
  })

  it('rejects quantities outside the available amount before saving', async () => {
    await openFridge()
    await wrapper.get('[data-drop-zone="middle-shelf"]').trigger('click')
    showPrompt.mockClear()
    await wrapper.findAll('.food-quantity-actions button')[0].trigger('click')
    await flushPromises()
    const { validate } = showPrompt.mock.calls[0][0]
    for (const quantity of ['', '0', '-1', '4', 'abc']) expect(validate(quantity)).toContain('no more than 3')
    expect(validate('1.5')).toBe('')
  })

  it('keeps the food and shows the server error when consumption fails', async () => {
    await openFridge()
    await wrapper.get('[data-drop-zone="middle-shelf"]').trigger('click')
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    request.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ error: 'Inventory is temporarily unavailable' }) })
    const button = wrapper.findAll('.food-quantity-actions button')[0]
    await button.trigger('click')
    await flushPromises()
    expect(wrapper.get('.error-message').text()).toContain('Inventory is temporarily unavailable')
    expect(wrapper.find('.food-card').exists()).toBe(true)
    expect(document.querySelector('.celebrating')).toBeNull()
    errorLog.mockRestore()
  })

  it('animates a successful discard from a compartment popup', async () => {
    await openFridge()
    await wrapper.get('[data-drop-zone="middle-shelf"]').trigger('click')
    const card = wrapper.get('.food-card')
    await card.trigger('dragstart', { dataTransfer: transfer(), clientX: 400, clientY: 300 })
    await flushPromises()
    expect(card.classes()).toContain('food-is-held')
    const target = document.querySelector('[data-food-action="discard"]')
    expect(target.closest('.inventory-modal')).toBeNull()
    const event = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'dataTransfer', { value: transfer() })
    target.dispatchEvent(event)
    await flushPromises()
    expect(showConfirm).toHaveBeenCalled()
    expect(document.querySelector('.discard-target.celebrating')).not.toBeNull()
    expect(wrapper.find('.inventory-modal').exists()).toBe(false)
  })

  it('opens the mouth and bin lid when the dragged item approaches', async () => {
    wrapper = mount(FoodDragActions, { attachTo: document.body, props: { visible: true } })
    const face = document.querySelector('.consume-target')
    const bin = document.querySelector('.discard-target')
    face.getBoundingClientRect = () => ({ left: 100, right: 230, top: 500, bottom: 650 })
    bin.getBoundingClientRect = () => ({ left: 300, right: 430, top: 500, bottom: 650 })
    await wrapper.setProps({ position: { x: 160, y: 450 } })
    expect(face.classList.contains('approaching')).toBe(true)
    expect(bin.classList.contains('approaching')).toBe(false)
    await wrapper.setProps({ position: { x: 360, y: 450 } })
    expect(face.classList.contains('approaching')).toBe(false)
    expect(bin.classList.contains('approaching')).toBe(true)
  })

  it('keeps the action dock near the drag origin and inside the viewport', async () => {
    wrapper = mount(FoodDragActions, { attachTo: document.body, props: { visible: true, anchor: { x: 450, y: 300 } } })
    const dock = document.querySelector('.food-action-dock')
    expect(dock.style.top).toBe('365px')
    expect(dock.style.left).toBe('280px')
    await wrapper.setProps({ position: { x: 900, y: 600 } })
    expect(dock.style.left).toBe('280px')
    await wrapper.setProps({ anchor: { x: 2, y: 740 } })
    expect(dock.style.left).toBe('12px')
    expect(parseFloat(dock.style.top)).toBeLessThan(window.innerHeight - 170)
  })
})


describe('scrollable food previews', () => {
  it('renders every food and scrolls the hovered compartment in both directions', async () => {
    request.mockResolvedValue({ ok: true, json: async () => Array.from({ length: 8 }, (_, i) => ({ ...food, _id: `food-${i}`, name: `Apple ${i}`, storage: 'freezer', storageZone: 'freezer-main' })) })
    await openFridge()
    const freezer = wrapper.get('.freezer-compartment')
    expect(freezer.findAll('.mini-food')).toHaveLength(8)
    expect(freezer.find('.more-food').exists()).toBe(false)
    const row = freezer.get('.food-preview').element
    Object.defineProperties(row, { scrollWidth: { value: 700 }, clientWidth: { value: 200 } })
    await freezer.trigger('wheel', { deltaY: 120 })
    expect(row.scrollLeft).toBe(120)
    await freezer.trigger('wheel', { deltaY: -80 })
    expect(row.scrollLeft).toBe(40)
    await freezer.get('.mini-food').trigger('mouseenter')
    expect(document.querySelector('.fridge-food-tooltip').textContent).toBe('Apple 0')
    await freezer.get('.mini-food').trigger('mouseleave')
    expect(document.querySelector('.fridge-food-tooltip')).toBeNull()
  })
})


describe('single-portion actions', () => {
  it.each(['consume', 'discard'])('immediately %s a single item without quantity or confirmation dialogs', async (action) => {
    request.mockImplementation(async (_url, options) => ({ ok: true, json: async () => options?.method === 'DELETE' ? {} : [{ ...food, quantity: 1 }] }))
    showPrompt.mockClear()
    showConfirm.mockClear()
    await openFridge()
    expect(wrapper.find('.food-quantity-badge').exists()).toBe(false)
    await beginDrag()
    const target = document.querySelector(`[data-food-action="${action}"]`)
    const event = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'dataTransfer', { value: transfer() })
    target.dispatchEvent(event)
    await flushPromises()
    expect(showPrompt).not.toHaveBeenCalled()
    expect(showConfirm).not.toHaveBeenCalled()
    expect(request).toHaveBeenCalledWith('/api/inventory/apple-1', expect.objectContaining({ method: 'DELETE' }))
    expect(wrapper.find('.mini-food').exists()).toBe(false)
  })
})


describe('unified fridge interior', () => {
  it('shows foods from all legacy shelves together in the main area and its dialog', async () => {
    request.mockResolvedValue({ ok: true, json: async () => ['upper-shelf', 'middle-shelf', 'lower-shelf'].map((storageZone, i) => ({ ...food, _id: `shelf-${i}`, name: `Food ${i}`, storageZone })) })
    await openFridge()
    expect(wrapper.findAll('.shelf-compartment')).toHaveLength(1)
    const shelf = wrapper.get('.shelf-compartment')
    expect(shelf.findAll('.mini-food')).toHaveLength(3)
    expect(shelf.findAll('.food-quantity-badge').map(badge => badge.text())).toEqual(['×3', '×3', '×3'])
    expect(shelf.text()).toContain('Shelves')
    await shelf.trigger('click')
    expect(wrapper.findAll('.food-card')).toHaveLength(3)
  })
})


describe('independent door shelves', () => {
  it('opens only the items belonging to each door shelf', async () => {
    request.mockResolvedValue({ ok: true, json: async () => [
      { ...food, _id: 'upper', name: 'Milk', storageZone: 'door' },
      { ...food, _id: 'lower', name: 'Juice', storageZone: 'door-lower' },
    ] })
    await openFridge()
    expect(wrapper.get('.door-bin:not(.door-bin-small) .door-food').attributes('aria-label')).toBe('Milk')
    expect(wrapper.get('.door-bin-small .door-food').attributes('aria-label')).toBe('Juice')
    await wrapper.get('.door-bin-small').trigger('click')
    expect(wrapper.get('#compartment-title').text()).toBe('Lower door shelf')
    expect(wrapper.findAll('.food-card')).toHaveLength(1)
    expect(wrapper.get('.food-card').text()).toContain('Juice')
    await wrapper.get('.modal-close').trigger('click')
    await wrapper.get('.door-bin:not(.door-bin-small)').trigger('click')
    expect(wrapper.get('#compartment-title').text()).toBe('Upper door shelf')
    expect(wrapper.get('.food-card').text()).toContain('Milk')
  })
})


describe('drag placement hints', () => {
  it('names the hovered destination and clears the hint after dragging ends', async () => {
    await openFridge()
    await beginDrag()
    await wrapper.get('.shelf-compartment').trigger('dragover', { clientX: 300, clientY: 350 })
    expect(document.querySelector('.drag-placement-hint').textContent).toBe('Place at Shelves')
    await wrapper.get('.freezer-compartment').trigger('dragover', { clientX: 300, clientY: 200 })
    expect(document.querySelector('.drag-placement-hint').textContent).toBe('Place at Freezer')
    await wrapper.get('.mini-food').trigger('dragend')
    expect(document.querySelector('.drag-placement-hint')).toBeNull()
  })
})


describe('dashboard compartment links', () => {
  it.each([
    ['middle-shelf', 'Shelves'], ['freezer-main', 'Freezer'],
    ['crisper', 'Crisper drawer'], ['door', 'Upper door shelf'], ['door-lower', 'Lower door shelf'],
  ])('opens the selected %s location on the full fridge page', async (zone, title) => {
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/dashboard', name: 'dashboard', component: { template: '<div />' } },
      { path: '/fridge', name: 'fridge', component: FridgeView },
    ] })
    await router.push('/dashboard')
    wrapper = mount(FridgeView, { attachTo: document.body, props: { embedded: true, inventoryItems: [food] }, global: { plugins: [router] } })
    await wrapper.get('.fridge-door').trigger('click')
    await wrapper.get(`[data-drop-zone="${zone}"]`).trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('fridge')
    expect(router.currentRoute.value.query.location).toBe(zone)
    expect(wrapper.find('.inventory-modal').exists()).toBe(false)
    wrapper.unmount()
    wrapper = mount(FridgeView, { attachTo: document.body, global: { plugins: [router] } })
    await flushPromises()
    expect(wrapper.get('#compartment-title').text()).toBe(title)
    expect(wrapper.get('.modal-toolbar').text()).toContain('Add to this compartment')
    expect(wrapper.get('.fridge-door').attributes('aria-expanded')).toBe('true')
  })
})


describe('shifting food loader', () => {
  it('shows the animated egg only while the move is being saved', async () => {
    await openFridge()
    let completeMove
    request.mockImplementationOnce(() => new Promise(resolve => { completeMove = resolve }))
    await beginDrag()
    await wrapper.get('.freezer-compartment').trigger('drop', { dataTransfer: transfer() })
    expect(document.querySelector('.shifting-food-overlay').textContent).toContain('Shifting food')
    expect(document.querySelector('.shifting-egg')).not.toBeNull()
    completeMove({ ok: true, json: async () => ({ ...food, storage: 'freezer', storageZone: 'freezer-main' }) })
    await flushPromises()
    expect(document.querySelector('.shifting-food-overlay')).toBeNull()
    expect(wrapper.get('.freezer-compartment .mini-food').attributes('aria-label')).toBe('Apples')
  })
})


describe('food rectangle selection', () => {
  it('highlights food across locations and clears with Escape', async () => {
    request.mockResolvedValue({ ok: true, json: async () => [food, { ...food, _id: 'frozen', storage: 'freezer', storageZone: 'freezer-main' }] })
    await openFridge()
    const rect = (left, top, right, bottom) => ({ left, top, right, bottom, width: right - left, height: bottom - top })
    const stage = wrapper.get('.kitchen-stage')
    for (const element of stage.element.querySelectorAll('*')) element.getBoundingClientRect = () => rect(0, 0, 800, 800)
    wrapper.get('.freezer-compartment .mini-food').element.getBoundingClientRect = () => rect(100, 100, 150, 150)
    wrapper.get('.shelf-compartment .mini-food').element.getBoundingClientRect = () => rect(100, 250, 150, 300)
    stage.element.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 70, clientY: 70, bubbles: true }))
    document.dispatchEvent(new MouseEvent('pointermove', { clientX: 180, clientY: 330, bubbles: true }))
    await flushPromises()
    expect(wrapper.findAll('.food-selected')).toHaveLength(2)
    expect(document.querySelector('.food-selection-box')).not.toBeNull()
    document.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }))
    await flushPromises()
    expect(document.querySelector('.food-selection-box')).toBeNull()
    expect(wrapper.findAll('.food-selected')).toHaveLength(2)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(wrapper.findAll('.food-selected')).toHaveLength(0)
    expect(request.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(0)
  })
})


describe('selected food group actions', () => {
  async function selectGroup() {
    const foods = [food, { ...food, _id: 'pear-2', name: 'Pears', storageZone: 'crisper' }]
    request.mockImplementation(async (url, options) => ({ ok: true, json: async () => options?.method === 'PATCH'
      ? { ...foods.find(item => url.endsWith(item._id)), ...JSON.parse(options.body) }
      : options?.method === 'DELETE' ? {} : foods }))
    await openFridge()
    const stage = wrapper.get('.kitchen-stage')
    const rect = { left: 100, top: 100, right: 150, bottom: 150, width: 50, height: 50 }
    for (const element of stage.element.querySelectorAll('*')) element.getBoundingClientRect = () => rect
    stage.element.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 80, clientY: 80, bubbles: true }))
    document.dispatchEvent(new MouseEvent('pointermove', { clientX: 170, clientY: 170, bubbles: true }))
    document.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }))
    await flushPromises()
    expect(wrapper.findAll('.food-selected')).toHaveLength(2)
    await beginDrag()
  }
  it('moves the whole selection to the hovered location', async () => {
    await selectGroup()
    await wrapper.get('.freezer-compartment').trigger('drop', { dataTransfer: transfer() })
    await flushPromises()
    expect(request.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(2)
    expect(wrapper.findAll('.freezer-compartment .mini-food')).toHaveLength(2)
    expect(wrapper.findAll('.food-selected')).toHaveLength(0)
  })
  it.each(['consume', 'discard'])('%s uses a single confirmation for the full selection', async (action) => {
    await selectGroup()
    showConfirm.mockClear()
    showPrompt.mockClear()
    const event = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'dataTransfer', { value: transfer() })
    document.querySelector(`[data-food-action="${action}"]`).dispatchEvent(event)
    await flushPromises()
    expect(showConfirm).toHaveBeenCalledTimes(1)
    expect(showConfirm.mock.calls[0][0].message).toContain('Pears')
    expect(showPrompt).not.toHaveBeenCalled()
    expect(request.mock.calls.filter(([, options]) => options?.method === 'DELETE')).toHaveLength(2)
    expect(wrapper.findAll('.mini-food')).toHaveLength(0)
  })
  it('leaves failed items selected when only part of a group move succeeds', async () => {
    await selectGroup()
    const original = request.getMockImplementation()
    request.mockImplementation((url, options) => url.endsWith('pear-2') && options?.method === 'PATCH'
      ? Promise.resolve({ ok: false, status: 500 }) : original(url, options))
    await wrapper.get('.freezer-compartment').trigger('drop', { dataTransfer: transfer() })
    await flushPromises()
    expect(wrapper.findAll('.freezer-compartment .mini-food')).toHaveLength(1)
    expect(wrapper.findAll('.food-selected')).toHaveLength(1)
    expect(wrapper.get('.error-message').text()).toContain('remain selected')
  })
})
