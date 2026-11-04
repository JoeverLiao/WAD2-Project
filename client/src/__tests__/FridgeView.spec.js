import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { flushPromises, mount } from '@vue/test-utils'
import FridgeView from '../views/fridge/FridgeView.vue'
import FoodDragActions from '../components/fridge/FoodDragActions.vue'
import FoodItemForm from '../components/fridge/FoodItemForm.vue'
import { showConfirm, showPrompt } from '../utils/dialog.js'

vi.mock('../utils/dialog.js')
vi.mock('../components/EggLoader.vue', () => ({ default: { template: '<div />' } }))

const food = { _id: 'apple-1', name: 'Apples', quantity: 3, unit: 'pieces', storage: 'fridge', storageZone: 'middle-shelf', expiresAt: '2026-11-05' }
let wrapper
let request
function transfer() {
  return { setData: vi.fn(), getData: () => food._id, setDragImage: vi.fn(), effectAllowed: '' }
}
async function openFridge(props = {}) {
  wrapper = mount(FridgeView, { attachTo: document.body, props, global: { stubs: { RouterLink: true } } })
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
  it.each(['stage', 'popup'])('offers Put in fridge for pantry food dragged from the %s and saves to shelves', async (source) => {
    request.mockResolvedValueOnce({ ok: true, json: async () => [{ ...food, storage: 'pantry', storageZone: 'dry-storage' }] })
    await openFridge()
    await wrapper.get('.storage-slide-options button:nth-child(2)').trigger('click')
    if (source === 'popup') await wrapper.get('.pantry-whole-storage').trigger('click')
    let complete
    request.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
    await wrapper.get(source === 'popup' ? '.food-card' : '.pantry-unit .mini-food').trigger('dragstart', { dataTransfer: transfer(), clientX: 400, clientY: 300 })
    const target = document.querySelector('[data-food-action="fridge"]')
    expect(target.textContent).toContain('Put in fridge')
    expect(document.querySelector('[data-food-action="pantry"]')).toBeNull()
    const event = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'dataTransfer', { value: transfer() })
    target.dispatchEvent(event)
    await flushPromises()
    expect(JSON.parse(request.mock.calls.at(-1)[1].body)).toEqual({ storage: 'fridge', storageZone: 'middle-shelf' })
    expect(document.querySelector('[data-food-action="fridge"]')).not.toBeNull()
    complete({ ok: true, json: async () => ({ item: food }) })
    await flushPromises()
    expect(wrapper.get('.shelf-compartment .mini-food').attributes('aria-label')).toBe('Apples')
    expect(wrapper.findAll('.pantry-unit .mini-food')).toHaveLength(0)
    expect(document.querySelector('.fridge-target.celebrating')).not.toBeNull()
  })

  it('opens and lights the default fridge slide with the pantry hidden', async () => {
    await openFridge()
    expect(wrapper.get('.fridge-body').classes()).toContain('fridge-is-open')
    expect(wrapper.get('.fridge-door').attributes('aria-expanded')).toBe('true')
    expect(wrapper.find('.cold-air').exists()).toBe(true)
    expect(wrapper.get('.fridge-body').classes()).toContain('light-on')
    expect(wrapper.get('.pantry-unit').attributes('inert')).toBeDefined()
    expect(wrapper.get('.pantry-unit').attributes('aria-hidden')).toBe('true')
    expect(wrapper.find('.carousel-nav').exists()).toBe(false)
    expect(document.querySelector('.food-action-dock')).toBeNull()
  })

  it('switches storage with arrows and direct buttons without reloading inventory', async () => {
    await openFridge()
    const calls = request.mock.calls.length
    expect(wrapper.get('.fridge-unit').classes()).toContain('slide-active')
    await wrapper.get('[aria-label="Next storage: Pantry"]').trigger('click')
    expect(wrapper.get('.pantry-unit').classes()).toContain('slide-active')
    expect(wrapper.get('.pantry-unit').attributes('inert')).toBeUndefined()
    expect(wrapper.get('.fridge-unit').attributes('inert')).toBeDefined()
    expect(wrapper.get('.storage-slide-status').text()).toBe('2 / 2')
    await wrapper.get('[aria-label="Previous storage: Fridge"]').trigger('click')
    expect(wrapper.get('.fridge-unit').classes()).toContain('slide-active')
    expect(wrapper.get('.fridge-door').attributes('aria-expanded')).toBe('true')
    await wrapper.get('.storage-slide-options button:nth-child(2)').trigger('click')
    expect(wrapper.get('.pantry-unit').classes()).toContain('slide-active')
    expect(request.mock.calls).toHaveLength(calls)
  })

  it('keeps the embedded dashboard as fridge only', async () => {
    await openFridge({ embedded: true, inventoryItems: [food] })
    expect(wrapper.find('.storage-switcher').exists()).toBe(false)
    expect(wrapper.find('.pantry-unit').exists()).toBe(false)
    expect(wrapper.get('.fridge-unit').attributes('inert')).toBeUndefined()
  })

  it('leaves all four illustrated pantry shelves empty without inventory', async () => {
    request.mockResolvedValueOnce({ ok: true, json: async () => [] })
    await openFridge()
    await wrapper.get('.storage-slide-options button:nth-child(2)').trigger('click')
    expect(wrapper.findAll('.open-pantry .pantry-whole-storage')).toHaveLength(4)
    expect(wrapper.findAll('.open-pantry .mini-food')).toHaveLength(0)
    expect(wrapper.findAll('.open-pantry .empty-mini')).toHaveLength(0)
  })

  it('places every real pantry food on a shelf without adding decorative food', async () => {
    const foods = Array.from({ length: 29 }, (_, i) => ({ ...food, _id: `pantry-${i}`, storage: 'pantry', storageZone: 'dry-storage' }))
    request.mockResolvedValueOnce({ ok: true, json: async () => foods })
    await openFridge()
    await wrapper.get('.storage-slide-options button:nth-child(2)').trigger('click')
    const shelves = wrapper.findAll('.open-pantry .pantry-whole-storage')
    expect(shelves.map(shelf => shelf.findAll('.mini-food').length)).toEqual([8, 7, 7, 7])
    expect(new Set(wrapper.findAll('.open-pantry .mini-food').map(icon => icon.attributes('data-food-id'))).size).toBe(29)
    await shelves[3].trigger('click')
    expect(wrapper.findAll('.inventory-modal .food-card')).toHaveLength(29)
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

  it('opens the mouth, bin lid and pantry door when the dragged item approaches', async () => {
    wrapper = mount(FoodDragActions, { attachTo: document.body, props: { visible: true } })
    const face = document.querySelector('.consume-target')
    const bin = document.querySelector('.discard-target')
    const pantry = document.querySelector('.pantry-target')
    face.getBoundingClientRect = () => ({ left: 100, right: 230, top: 500, bottom: 650 })
    bin.getBoundingClientRect = () => ({ left: 300, right: 430, top: 500, bottom: 650 })
    pantry.getBoundingClientRect = () => ({ left: 500, right: 630, top: 500, bottom: 650 })
    await wrapper.setProps({ position: { x: 160, y: 450 } })
    expect(face.classList.contains('approaching')).toBe(true)
    expect(bin.classList.contains('approaching')).toBe(false)
    await wrapper.setProps({ position: { x: 360, y: 450 } })
    expect(face.classList.contains('approaching')).toBe(false)
    expect(bin.classList.contains('approaching')).toBe(true)
    await wrapper.setProps({ position: { x: 560, y: 450 } })
    expect(pantry.classList.contains('approaching')).toBe(true)
    expect(bin.classList.contains('approaching')).toBe(false)
  })

  it('places a vertical dock on the source side and keeps it inside the viewport', async () => {
    wrapper = mount(FoodDragActions, { attachTo: document.body, props: { visible: true, anchor: { x: 450, y: 300, edge: 400, side: 'left' }  } })
    const dock = document.querySelector('.food-action-dock')
    expect(dock.style.top).toBe('60px')
    expect(dock.style.left).toBe('254px')
    await wrapper.setProps({ position: { x: 900, y: 600 } })
    expect(dock.style.left).toBe('254px')
    await wrapper.setProps({ anchor: { x: 450, y: 300, edge: 600, side: 'right' } })
    expect(dock.style.left).toBe('616px')
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
    wrapper = mount(FridgeView, { attachTo: document.body, global: { stubs: { RouterLink: true } } })
    await flushPromises()
    await wrapper.get('.fridge-door').trigger('click')
    expect(wrapper.findAll('.shelf-compartment')).toHaveLength(1)
    const shelf = wrapper.get('.shelf-compartment')
    expect(shelf.findAll('.mini-food')).toHaveLength(3)
    expect(shelf.findAll('.mini-food').every(icon => !icon.element.style.gridRow)).toBe(true)
    expect(shelf.findAll('.food-quantity-badge').map(badge => badge.text())).toEqual(['×3', '×3', '×3'])
    expect(shelf.text()).toContain('Shelves')
    await shelf.trigger('click')
    expect(wrapper.findAll('.food-card')).toHaveLength(3)
  })

  it.each([150, 250, 350])('uses one shelves destination when dropping at y=%i', async clientY => {
    request.mockResolvedValueOnce({ ok: true, json: async () => [{ ...food, storage: 'freezer', storageZone: 'freezer-main' }] })
    wrapper = mount(FridgeView, { attachTo: document.body, global: { stubs: { RouterLink: true } } })
    await flushPromises()
    await wrapper.get('.fridge-door').trigger('click')
    const shelf = wrapper.get('.shelf-compartment')
    shelf.get('.food-preview').element.getBoundingClientRect = () => ({ top: 100, bottom: 400, height: 300 })
    await wrapper.get('.freezer-compartment .mini-food').trigger('dragstart', { dataTransfer: transfer(), clientX: 100, clientY: 50 })
    await shelf.trigger('dragover', { clientY })
    expect(document.querySelector('.drag-placement-hint').textContent).toBe('Place at Shelves')
    request.mockResolvedValueOnce({ ok: true, json: async () => ({ item: { ...food, storageZone: 'middle-shelf' } }) })
    await shelf.trigger('drop', { dataTransfer: transfer(), clientY })
    await flushPromises()
    expect(request).toHaveBeenCalledWith('/api/inventory/apple-1', expect.objectContaining({
      method: 'PATCH', body: expect.any(String),
    }))
    const patch = request.mock.calls.find(([, options]) => options?.method === 'PATCH')
    expect(JSON.parse(patch[1].body).storageZone).toBe('middle-shelf')
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

describe('food transfer animations', () => {
  function mockLayout() {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      const small = this.matches('.mini-food, .door-food, .food-emoji')
      const top = small ? this.closest('.freezer-compartment') ? 120 : 400 : 80
      const left = small ? 350 : 100
      const width = small ? 40 : 600
      const height = small ? 40 : 520
      return { top, left, width, height, right: left + width, bottom: top + height }
    })
  }
  async function saveMove(response) {
    request.mockResolvedValueOnce(response)
    await beginDrag()
    await wrapper.get('.freezer-compartment').trigger('drop', { dataTransfer: transfer() })
    await flushPromises()
  }

  it('flies to the saved destination only after the request succeeds and cleans up on arrival', async () => {
    await openFridge()
    mockLayout()
    let complete
    request.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
    await beginDrag()
    await wrapper.get('.freezer-compartment').trigger('drop', { dataTransfer: transfer() })
    expect(document.querySelector('.food-transfer-flight')).toBeNull()
    complete({ ok: true, json: async () => ({ ...food, storage: 'freezer', storageZone: 'freezer-main' }) })
    await flushPromises()
    const flight = document.querySelector('.food-transfer-flight')
    expect(flight).not.toBeNull()
    expect(flight.style.getPropertyValue('--from-y')).toBe('420px')
    expect(flight.style.getPropertyValue('--to-y')).toBe('140px')
    expect(wrapper.get('.freezer-compartment .mini-food').classes()).toContain('food-transfer-incoming')
    expect(document.querySelector('.food-transfer-layer').getAttribute('aria-hidden')).toBe('true')
    flight.dispatchEvent(new Event('animationend', { bubbles: true }))
    await flushPromises()
    expect(document.querySelector('.food-transfer-flight')).toBeNull()
    expect(wrapper.get('.freezer-compartment .mini-food').classes()).not.toContain('food-transfer-incoming')
    expect(wrapper.get('.freezer-compartment').classes()).not.toContain('food-transfer-arrival')
  })

  it('does not animate a rejected move or remove the original food', async () => {
    await openFridge()
    mockLayout()
    await saveMove({ ok: false, status: 500 })
    expect(document.querySelector('.food-transfer-flight')).toBeNull()
    expect(wrapper.get('.shelf-compartment .mini-food').attributes('aria-label')).toBe('Apples')
    expect(wrapper.get('.error-message').text()).toContain('could not be updated')
  })

  it('uses a static destination highlight for reduced motion', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    await openFridge()
    mockLayout()
    await saveMove({ ok: true, json: async () => ({ ...food, storage: 'freezer', storageZone: 'freezer-main' }) })
    expect(document.querySelector('.food-transfer-flight')).toBeNull()
    expect(wrapper.get('.freezer-compartment').classes()).toContain('food-transfer-arrival')
    expect(document.body.textContent).toContain('Moved 1 food item to Freezer.')
  })

  it('restores the destination when scrolling interrupts the flight', async () => {
    await openFridge()
    mockLayout()
    await saveMove({ ok: true, json: async () => ({ ...food, storage: 'freezer', storageZone: 'freezer-main' }) })
    expect(document.querySelector('.food-transfer-flight')).not.toBeNull()
    window.dispatchEvent(new Event('scroll'))
    await flushPromises()
    expect(document.querySelector('.food-transfer-flight')).toBeNull()
    expect(wrapper.get('.freezer-compartment .mini-food').classes()).not.toContain('food-transfer-incoming')
  })

  it('animates a location change made with the edit form', async () => {
    await openFridge()
    mockLayout()
    await wrapper.get('.shelf-compartment').trigger('click')
    await wrapper.get('.food-card .icon-button').trigger('click')
    request.mockResolvedValueOnce({ ok: true, json: async () => ({ item: { ...food, storage: 'freezer', storageZone: 'freezer-main' } }) })
    wrapper.findComponent(FoodItemForm).vm.$emit('save', { ...food, storage: 'freezer', storageZone: 'freezer-main' })
    await flushPromises()
    expect(document.querySelector('.food-transfer-flight')).not.toBeNull()
    expect(wrapper.find('.inventory-modal').exists()).toBe(false)
    expect(wrapper.get('.freezer-compartment .mini-food').attributes('aria-label')).toBe('Apples')
  })

  it('keeps lower-door flights running when shelf contents scroll', async () => {
    await openFridge()
    mockLayout()
    request.mockResolvedValueOnce({ ok: true, json: async () => ({ ...food, storageZone: 'door-lower' }) })
    await beginDrag()
    await wrapper.get('[data-drop-zone="door-lower"]').trigger('drop', { dataTransfer: transfer() })
    await flushPromises()
    expect(document.querySelector('.food-transfer-flight')).not.toBeNull()
    const lower = wrapper.get('[data-drop-zone="door-lower"]')
    lower.element.dispatchEvent(new Event('scroll'))
    await flushPromises()
    expect(document.querySelector('.food-transfer-flight')).not.toBeNull()
    expect(lower.get('.door-food').classes()).toContain('food-transfer-incoming')
    document.querySelector('.food-transfer-flight').dispatchEvent(new Event('animationend', { bubbles: true }))
    await flushPromises()
    expect(lower.get('.door-food').classes()).not.toContain('food-transfer-incoming')
  })

  it('cleans up even if the browser never sends animationend', async () => {
    await openFridge()
    mockLayout()
    vi.useFakeTimers()
    try {
      await saveMove({ ok: true, json: async () => ({ ...food, storage: 'freezer', storageZone: 'freezer-main' }) })
      expect(document.querySelector('.food-transfer-flight')).not.toBeNull()
      await vi.advanceTimersByTimeAsync(1600)
      expect(document.querySelector('.food-transfer-flight')).toBeNull()
      expect(wrapper.get('.freezer-compartment .mini-food').classes()).not.toContain('food-transfer-incoming')
    } finally { vi.useRealTimers() }
  })
})


describe('food rectangle selection', () => {
  it('selects with clicks, toggles with modifiers and opens details with a double-click', async () => {
    request.mockResolvedValue({ ok: true, json: async () => [food, { ...food, _id: 'pear-2', name: 'Pears' }] })
    await openFridge()
    const icons = wrapper.findAll('.shelf-compartment .mini-food')
    await icons[0].trigger('click')
    expect(icons[0].attributes('aria-pressed')).toBe('true')
    expect(wrapper.find('.inventory-modal').exists()).toBe(false)
    await icons[1].trigger('click', { ctrlKey: true })
    expect(wrapper.findAll('.food-selected')).toHaveLength(2)
    await icons[0].trigger('click', { metaKey: true })
    expect(wrapper.findAll('.food-selected')).toHaveLength(1)
    await icons[0].trigger('keydown', { key: ' ', ctrlKey: true })
    expect(wrapper.findAll('.food-selected')).toHaveLength(2)
    await icons[0].trigger('dblclick')
    expect(wrapper.find('.inventory-modal').exists()).toBe(true)
  })

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
  async function selectGroup(embedded = false) {
    const foods = [food, { ...food, _id: 'pear-2', name: 'Pears', storageZone: 'crisper' }]
    request.mockImplementation(async (url, options) => ({ ok: true, json: async () => options?.method === 'PATCH'
      ? { ...foods.find(item => url.endsWith(item._id)), ...JSON.parse(options.body) }
      : options?.method === 'DELETE' ? {} : foods }))
    await openFridge(embedded ? { embedded: true, inventoryItems: foods } : {})
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
  it('moves the selected group through the animated pantry target', async () => {
    await selectGroup()
    const event = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'dataTransfer', { value: transfer() })
    document.querySelector('[data-food-action="pantry"]').dispatchEvent(event)
    await flushPromises()
    const patches = request.mock.calls.filter(([, options]) => options?.method === 'PATCH')
    expect(patches).toHaveLength(2)
    expect(patches.every(([, options]) => JSON.parse(options.body).storageZone === 'dry-storage')).toBe(true)
    expect(wrapper.findAll('.pantry-unit .mini-food')).toHaveLength(2)
    expect(document.querySelector('.pantry-target.celebrating')).not.toBeNull()
    expect(showConfirm).not.toHaveBeenCalled()
  })
  it('emits the entire moved group in one update when embedded', async () => {
    await selectGroup(true)
    await wrapper.get('.freezer-compartment').trigger('drop', { dataTransfer: transfer() })
    await flushPromises()
    const updates = wrapper.emitted('inventory-change')
    expect(updates).toHaveLength(1)
    expect(updates[0][0]).toHaveLength(2)
    expect(updates[0][0].every(item => item.storage === 'freezer' && item.storageZone === 'freezer-main')).toBe(true)
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
    expect(document.querySelectorAll('.food-transfer-flight')).toHaveLength(1)
  })
})

it('renders visible expiry badges for expired and soon-to-expire shelf food', async () => {
  const dateAt = offset => {
    const date = new Date()
    date.setDate(date.getDate() + offset)
    return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
      .map(part => String(part).padStart(2, '0')).join('-')
  }
  request.mockResolvedValueOnce({ ok: true, json: async () => [
    { ...food, _id: 'expired', expiresAt: dateAt(-1) },
    { ...food, _id: 'soon', expiresAt: dateAt(2) },
    { ...food, _id: 'fresh', expiresAt: dateAt(10) },
  ] })
  await openFridge()
  expect(wrapper.get('[data-food-id="expired"] .food-expiry-badge.expired').isVisible()).toBe(true)
  expect(wrapper.get('[data-food-id="soon"] .food-expiry-badge').classes()).not.toContain('expired')
  expect(wrapper.find('[data-food-id="fresh"] .food-expiry-badge').exists()).toBe(false)
})

it('moves a food from the card to a named pantry even when the API omits pantryName', async () => {
  localStorage.setItem('full-circle-pantries', JSON.stringify(['Pantry 2']))
  try {
    wrapper = mount(FridgeView, { attachTo: document.body, global: { stubs: { RouterLink: true } } })
    await flushPromises()
    await wrapper.get('.fridge-door').trigger('click')
    await wrapper.get('.shelf-compartment').trigger('click')
    request.mockResolvedValueOnce({ ok: true, json: async () => ({
      item: { ...food, storage: 'pantry', storageZone: 'dry-storage' },
    }) })
    await wrapper.get('select[aria-label="Move Apples to another location"]')
      .setValue(JSON.stringify({ type: 'pantry', name: 'Pantry 2' }))
    await flushPromises()
    expect(request).toHaveBeenCalledWith('/api/inventory/apple-1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ pantryName: 'Pantry 2', storage: 'pantry', storageZone: 'dry-storage' }),
    }))
    expect(wrapper.findAll('.food-card')).toHaveLength(0)
    expect(JSON.parse(localStorage.getItem('full-circle-item-storage-assignments'))['apple-1'])
      .toEqual({ pantryName: 'Pantry 2' })
  } finally {
    localStorage.removeItem('full-circle-pantries')
    localStorage.removeItem('full-circle-item-storage-assignments')
  }
})


describe('Compartment popup UI', () => {
  beforeEach(() => {
    showPrompt.mockClear()
    showConfirm.mockClear()
  })

  it('shows food illustrations, expiry counts and a searchable inventory', async () => {
    request.mockResolvedValueOnce({ ok: true, json: async () => [
      { ...food, expiresAt: '2000-01-01' },
      { ...food, _id: 'milk-2', name: 'Milk', expiresAt: null },
    ] })
    await openFridge()
    await wrapper.get('.shelf-compartment').trigger('click')
    expect(wrapper.get('.compartment-count').text()).toBe('2 foods')
    expect(wrapper.get('.compartment-expired').text()).toContain('1 expired')
    expect(wrapper.findAll('.food-emoji .food-icon')).toHaveLength(2)
    const search = wrapper.get('[aria-label="Search compartment food"]')
    await search.setValue('Milk')
    expect(wrapper.findAll('.food-card')).toHaveLength(1)
    expect(wrapper.get('.food-card').text()).toContain('Milk')
    expect(wrapper.get('.compartment-count').text()).toBe('1 food found')
    await search.setValue('no matching food')
    expect(wrapper.get('.modal-empty').text()).toContain('No foods match this search')
    await search.setValue('')
    expect(wrapper.findAll('.food-card')).toHaveLength(2)
    await wrapper.get('[aria-label="Close compartment"]').trigger('click')
    expect(wrapper.find('.inventory-modal').exists()).toBe(false)
  })

  it.each(['consume', 'discard'])('restores the %s card action without quantity prompts for a single item', async action => {
    request.mockResolvedValueOnce({ ok: true, json: async () => [{ ...food, quantity: 1 }] })
    await openFridge()
    await wrapper.get('.shelf-compartment').trigger('click')
    await wrapper.get(`.${action}-button`).trigger('click')
    await flushPromises()
    expect(request).toHaveBeenCalledWith('/api/inventory/apple-1', expect.objectContaining({
      method: 'DELETE', body: JSON.stringify({ activity: action === 'consume' ? 'consumed' : 'discarded' }),
    }))
    expect(showPrompt).not.toHaveBeenCalled()
    expect(wrapper.findAll('.food-card')).toHaveLength(0)
    expect(wrapper.get('.modal-empty').text()).toContain('This compartment is empty')
    expect(document.querySelector('.food-action-dock')).toBeNull()
  })
})


describe('Lower door drops and compartment food reveal', () => {
  it.each([false, true])('moves food to the lower door shelf (embedded: %s)', async embedded => {
    await openFridge(embedded ? { embedded: true, inventoryItems: [food] } : {})
    request.mockResolvedValueOnce({ ok: true, json: async () => ({ item: { ...food, storageZone: 'door-lower' } }) })
    await beginDrag()
    await wrapper.get('[data-drop-zone="door-lower"]').trigger('drop', { dataTransfer: transfer() })
    await flushPromises()
    const patch = request.mock.calls.find(([, options]) => options?.method === 'PATCH')
    expect(JSON.parse(patch[1].body)).toEqual(expect.objectContaining({ storage: 'fridge', storageZone: 'door-lower' }))
    if (embedded) {
      const updated = wrapper.emitted('inventory-change').at(-1)[0]
      await wrapper.setProps({ inventoryItems: updated })
    }
    expect(wrapper.findAll('[data-drop-zone="door-lower"] [data-food-id="apple-1"]')).toHaveLength(1)
    expect(wrapper.findAll('.shelf-compartment [data-food-id="apple-1"]')).toHaveLength(0)
  })

  it.each([
    ['fridge', 'middle-shelf'], ['freezer', 'freezer-main'], ['fridge', 'door'],
    ['fridge', 'door-lower'], ['fridge', 'crisper'], ['pantry', 'dry-storage'],
  ])('reveals a food picture in %s / %s after closing its compartment', async (storage, storageZone) => {
    request.mockResolvedValueOnce({ ok: true, json: async () => [{ ...food, storage, storageZone }] })
    await openFridge()
    if (storage === 'pantry') {
      await wrapper.findAll('.storage-slide-options > button').find(button => button.text() === 'Pantry').trigger('click')
    }
    const area = wrapper.findAll('[data-drop-zone]').find(element => element.attributes('data-drop-zone') === storageZone)
    await area.trigger('click')
    await wrapper.get('[aria-label="Search compartment food"]').setValue('Apples')
    const icon = wrapper.get('[data-food-id="apple-1"]').element
    icon.scrollIntoView = vi.fn()
    icon.animate = vi.fn()
    await wrapper.get('.food-emoji').trigger('click')
    await flushPromises()
    expect(wrapper.find('.inventory-modal').exists()).toBe(false)
    expect(icon.scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: 'center' }))
    expect(document.activeElement).toBe(icon)
    expect(icon.classList.contains('food-location-highlight')).toBe(true)
    expect(icon.animate).toHaveBeenCalled()
    if (storage !== 'pantry') expect(wrapper.get('.fridge-door').attributes('aria-expanded')).toBe('true')
    expect(request.mock.calls.filter(([, options]) => options?.method !== 'GET')).toHaveLength(0)
  })
})
