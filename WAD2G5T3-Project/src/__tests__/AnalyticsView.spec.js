import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import AnalyticsView from '../views/analytics/AnalyticsView.vue'
import { sampleAnalyticsEvents } from '../data/analyticsDemo.js'

function mountChart() {
  const wrapper = mount(AnalyticsView)
  const svg = wrapper.get('svg')
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

  it('zooms in either drag direction, supports repeated zoom, and resets the data', async () => {
    const { wrapper, svg } = mountChart()
    await dragAcross(svg, 774, 246)
    expect(wrapper.findAll('tbody tr')).toHaveLength(30)
    expect(wrapper.get('[aria-label="Start date"]').attributes('aria-valuetext')).toBe('4 Sept')
    expect(wrapper.get('button').attributes('disabled')).toBeUndefined()
    await dragAcross(svg, 246, 774)
    expect(wrapper.findAll('tbody tr')).toHaveLength(18)
    await wrapper.get('button').trigger('click')
    expect(wrapper.findAll('tbody tr')).toHaveLength(50)
    expect(wrapper.get('[aria-label="Start date"]').element.value).toBe('0')
    wrapper.unmount()
  })

  it('ignores simple clicks and cancelled selections', async () => {
    const { wrapper, svg } = mountChart()
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
})
