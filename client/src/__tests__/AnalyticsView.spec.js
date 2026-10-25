import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import AnalyticsView from '../views/analytics/AnalyticsView.vue'
import { sampleAnalyticsEvents } from '../data/analyticsDemo.js'

function mountChart() {
  const wrapper = mount(AnalyticsView)
  const svg = wrapper.get('.impact-chart')
  // jsdom has no SVG coordinate transforms or pointer capture.
  svg.element.createSVGPoint = () => ({
    x: 0,
    y: 0,
    matrixTransform() {
      return this
    },
  })
  svg.element.getScreenCTM = () => ({ inverse: () => ({}) })
  svg.element.setPointerCapture = vi.fn()
  svg.element.releasePointerCapture = vi.fn()
  return { wrapper, svg }
}
async function pointer(svg, type, clientX = 246) {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX, clientY: 100 })
  Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true } })
  svg.element.dispatchEvent(event)
  await nextTick()
}
async function dragAcross(svg, start, end) {
  await pointer(svg, 'pointerdown', start)
  await pointer(svg, 'pointermove', end)
  await pointer(svg, 'pointerup', end)
}

describe('Analytics demo', () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = vi.fn(function () {
      this.setAttribute('open', '')
    })
    HTMLDialogElement.prototype.close = vi.fn(function () {
      this.removeAttribute('open')
    })
  })
  afterEach(() => {
    delete HTMLDialogElement.prototype.showModal
    delete HTMLDialogElement.prototype.close
    vi.restoreAllMocks()
  })
  it('shows 50 unique records and calculates totals from their weights', () => {
    expect(sampleAnalyticsEvents).toHaveLength(50)
    expect(new Set(sampleAnalyticsEvents.map((event) => event._id)).size).toBe(50)
    const { wrapper } = mountChart()
    const saved = sampleAnalyticsEvents
      .filter((event) => event.action !== 'discarded')
      .reduce((sum, event) => sum + event.weightKg, 0)
    expect(wrapper.findAll('tbody tr')).toHaveLength(50)
    expect(wrapper.text()).toContain(`${saved.toFixed(2)} kg`)
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('pans live in both directions without changing the zoom level, and resets the data', async () => {
    const { wrapper, svg } = mountChart()
    const inputs = wrapper.findAll('input[type="range"]')
    await inputs[0].setValue('10')
    await inputs[1].setValue('30')
    await pointer(svg, 'pointerdown', 730)
    await pointer(svg, 'pointermove', 290)
    expect(inputs[0].element.value).toBe('20')
    expect(inputs[1].element.value).toBe('40')
    expect(wrapper.findAll('tbody tr')).toHaveLength(21)
    await pointer(svg, 'pointerup', 290)
    expect(wrapper.get('button').attributes('disabled')).toBeUndefined()
    await dragAcross(svg, 290, 730)
    expect(inputs[0].element.value).toBe('10')
    expect(inputs[1].element.value).toBe('30')
    expect(wrapper.findAll('tbody tr')).toHaveLength(21)
    await wrapper.get('button').trigger('click')
    expect(wrapper.findAll('tbody tr')).toHaveLength(50)
    expect(wrapper.get('[aria-label="Start date"]').element.value).toBe('0')
    wrapper.unmount()
  })

  it('clamps panning at both date boundaries without shrinking the window', async () => {
    const { wrapper, svg } = mountChart()
    const inputs = wrapper.findAll('input[type="range"]')
    await inputs[0].setValue('10')
    await inputs[1].setValue('30')
    await dragAcross(svg, 510, 2510)
    expect(inputs[0].element.value).toBe('0')
    expect(inputs[1].element.value).toBe('20')
    await dragAcross(svg, 510, -1490)
    expect(inputs[0].element.value).toBe('29')
    expect(inputs[1].element.value).toBe('49')
    expect(wrapper.findAll('tbody tr')).toHaveLength(21)
    wrapper.unmount()
  })

  it('does not zoom on drag and ignores simple clicks and cancelled drags', async () => {
    const { wrapper, svg } = mountChart()
    await dragAcross(svg, 246, 774)
    expect(wrapper.findAll('tbody tr')).toHaveLength(50)
    await dragAcross(svg, 246, 249)
    expect(wrapper.findAll('tbody tr')).toHaveLength(50)
    await pointer(svg, 'pointerdown')
    await pointer(svg, 'pointercancel')
    await pointer(svg, 'pointerup', 774)
    expect(wrapper.findAll('tbody tr')).toHaveLength(50)
    wrapper.unmount()
  })

  it('updates dates with the range handles and prevents them crossing', async () => {
    const { wrapper } = mountChart()
    const inputs = wrapper.findAll('input[type="range"]')
    await inputs[0].setValue('37')
    expect(wrapper.findAll('tbody tr')).toHaveLength(13)
    await inputs[1].setValue('7')
    expect(inputs[1].element.value).toBe('38')
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
    await inputs[0].setValue('49')
    expect(inputs[0].element.value).toBe('37')
    wrapper.unmount()
  })

  it('zooms around the cursor with the wheel and stays within the full date range', async () => {
    const { wrapper, svg } = mountChart()
    const wheel = async (deltaY, clientX = 510, clientY = 100) => {
      const event = new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        deltaY,
        clientX,
        clientY,
      })
      svg.element.dispatchEvent(event)
      await nextTick()
      return event
    }
    expect((await wheel(-100)).defaultPrevented).toBe(true)
    expect(wrapper.findAll('tbody tr')).toHaveLength(40)
    const inputs = wrapper.findAll('input[type="range"]')
    expect(inputs[0].element.value).toBe('5')
    expect(inputs[1].element.value).toBe('44')
    await wheel(100)
    expect(wrapper.findAll('tbody tr')).toHaveLength(48)
    await wheel(100)
    expect(wrapper.findAll('tbody tr')).toHaveLength(50)
    // At the right edge, zooming retains the latest date.
    for (let index = 0; index < 25; index++) await wheel(-100, 950)
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
    expect(inputs[1].element.value).toBe('49')
    await wrapper.get('button').trigger('click')
    expect(wrapper.findAll('tbody tr')).toHaveLength(50)
    // Scrolling outside the plot still scrolls the page.
    expect((await wheel(-100, 20)).defaultPrevented).toBe(false)
    expect((await wheel(-100, 510, 340)).defaultPrevented).toBe(false)
    expect(wrapper.findAll('tbody tr')).toHaveLength(50)
    wrapper.unmount()
  })

  it('opens a clicked date and saves changes to the table, chart and totals', async () => {
    const { wrapper, svg } = mountChart()
    const before = wrapper.findAll('strong')[0].text()
    await svg.trigger('click', { clientX: 70, clientY: 100 })
    await nextTick()
    const dialog = wrapper.get('dialog')
    expect(dialog.attributes('open')).toBeDefined()
    expect(dialog.text()).toContain('25 Aug 2026')
    await dialog.get('[name="name"]').setValue('Rescued apples')
    await dialog.get('[name="action"]').setValue('discarded')
    await dialog.get('[name="weightKg"]').setValue('2')
    await dialog.get('form').trigger('submit')
    expect(wrapper.find('dialog').exists()).toBe(false)
    expect(wrapper.findAll('tbody tr').at(-1).text()).toContain('Rescued apples')
    expect(wrapper.findAll('tbody tr').at(-1).text()).toContain('Discarded')
    await vi.waitFor(() => expect(wrapper.findAll('strong')[0].text()).not.toBe(before))
    expect(wrapper.get('svg polyline[stroke="#cf563e"]').attributes('points').split(' ')[0]).toBe(
      '70,30',
    )
    expect(sampleAnalyticsEvents[0].name).toBe('Apples')
    wrapper.unmount()
  })

  it('cancels edits, rejects invalid values, and opens the correct date after panning', async () => {
    const { wrapper, svg } = mountChart()
    const inputs = wrapper.findAll('input[type="range"]')
    await inputs[0].setValue('5')
    await inputs[1].setValue('25')
    await dragAcross(svg, 730, 510)
    // The click emitted at the end of a drag must not open an editor.
    await svg.trigger('click', { clientX: 510, clientY: 100 })
    expect(wrapper.find('dialog').exists()).toBe(false)
    await svg.trigger('click', { clientX: 70, clientY: 100 })
    await nextTick()
    expect(wrapper.get('dialog').text()).toContain('4 Sept 2026')
    await wrapper.get('dialog [name="weightKg"]').setValue('-2')
    await wrapper.get('dialog form').trigger('submit')
    expect(wrapper.get('[role="alert"]').text()).toContain('non-negative')
    await wrapper.get('dialog [name="name"]').setValue('Cancelled food')
    await wrapper.get('dialog').trigger('cancel')
    expect(wrapper.find('dialog').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Cancelled food')
    wrapper.unmount()
  })
})
