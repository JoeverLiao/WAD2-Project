import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
      const event = new MouseEvent(type, { bubbles: true, button: 0, clientX })
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
