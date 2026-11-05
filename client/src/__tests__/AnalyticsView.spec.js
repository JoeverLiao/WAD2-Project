import { mockHttp } from './helpers/mockHttp.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import { nextTick } from 'vue'
import AnalyticsView from '../views/analytics/AnalyticsView.vue'
import { sampleAnalyticsEvents } from '../data/analyticsDemo.js'

vi.mock('../components/analytics/VegetableCompanions.vue', () => ({ default: { template: '<div />' } }))

async function mountChart() {
  const wrapper = mount(AnalyticsView, { global: { stubs: { RouterLink: RouterLinkStub } } })
  await flushPromises()
  await wrapper.get('.period-presets button').trigger('click')
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

const demoDates = [...new Set(sampleAnalyticsEvents.map(event => event.occurredAt.slice(0, 10)))].sort()
function expectedVisibleRecords(wrapper) {
  const start = Number(wrapper.get('[aria-label="Start date"]').element.value)
  const end = Number(wrapper.get('[aria-label="End date"]').element.value)
  const dates = new Set(demoDates.slice(start, end + 1))
  return sampleAnalyticsEvents.filter(event => dates.has(event.occurredAt.slice(0, 10))).length
}

describe('Analytics with API history', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-13T12:00:00Z'))
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))
    mockHttp(vi.fn(async (url, options) => ({ data: (()=>{
      if (options?.method === 'PUT') return { event: { ...JSON.parse(options.data), _id: url.split('/').at(-1) } }
      return { events: structuredClone(sampleAnalyticsEvents) }
    })(), status: 200 })))
    HTMLDialogElement.prototype.showModal = vi.fn(function () {
      this.setAttribute('open', '')
    })
    HTMLDialogElement.prototype.close = vi.fn(function () {
      this.removeAttribute('open')
    })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    delete HTMLDialogElement.prototype.showModal
    delete HTMLDialogElement.prototype.close
    vi.restoreAllMocks()
  })
  it('shows 60 unique records and calculates totals from their weights', async () => {
    expect(sampleAnalyticsEvents).toHaveLength(60)
    expect(new Set(sampleAnalyticsEvents.map((event) => event._id)).size).toBe(60)
    const { wrapper } = await mountChart()
    const saved = sampleAnalyticsEvents
      .filter((event) => event.action !== 'discarded')
      .reduce((sum, event) => sum + event.weightKg, 0)
    expect(wrapper.findAll('tbody tr')).toHaveLength(60)
    expect(wrapper.text()).toContain(`${saved.toFixed(2)} kg`)
    expect(wrapper.get('.chart-panel .btn-paper-secondary').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('pans live in both directions without changing the zoom level, and resets the data', async () => {
    const { wrapper, svg } = await mountChart()
    const inputs = wrapper.findAll('input[type="range"]')
    await inputs[0].setValue('10')
    await inputs[1].setValue('30')
    await pointer(svg, 'pointerdown', 730)
    await pointer(svg, 'pointermove', 290)
    expect(inputs[0].element.value).toBe('20')
    expect(inputs[1].element.value).toBe('40')
    expect(wrapper.findAll('tbody tr')).toHaveLength(expectedVisibleRecords(wrapper))
    await pointer(svg, 'pointerup', 290)
    expect(wrapper.get('.chart-panel .btn-paper-secondary').attributes('disabled')).toBeUndefined()
    await dragAcross(svg, 290, 730)
    expect(inputs[0].element.value).toBe('10')
    expect(inputs[1].element.value).toBe('30')
    expect(wrapper.findAll('tbody tr')).toHaveLength(expectedVisibleRecords(wrapper))
    await wrapper.get('.chart-panel .btn-paper-secondary').trigger('click')
    expect(wrapper.findAll('tbody tr')).toHaveLength(60)
    expect(wrapper.get('[aria-label="Start date"]').element.value).toBe('0')
    wrapper.unmount()
  })

  it('clamps panning at both date boundaries without shrinking the window', async () => {
    const { wrapper, svg } = await mountChart()
    const inputs = wrapper.findAll('input[type="range"]')
    await inputs[0].setValue('10')
    await inputs[1].setValue('30')
    await dragAcross(svg, 510, 2510)
    expect(inputs[0].element.value).toBe('0')
    expect(inputs[1].element.value).toBe('20')
    await dragAcross(svg, 510, -1490)
    expect(inputs[0].element.value).toBe('29')
    expect(inputs[1].element.value).toBe('49')
    expect(wrapper.findAll('tbody tr')).toHaveLength(expectedVisibleRecords(wrapper))
    wrapper.unmount()
  })

  it('does not zoom on drag and ignores simple clicks and cancelled drags', async () => {
    const { wrapper, svg } = await mountChart()
    await dragAcross(svg, 246, 774)
    expect(wrapper.findAll('tbody tr')).toHaveLength(60)
    await dragAcross(svg, 246, 249)
    expect(wrapper.findAll('tbody tr')).toHaveLength(60)
    await pointer(svg, 'pointerdown')
    await pointer(svg, 'pointercancel')
    await pointer(svg, 'pointerup', 774)
    expect(wrapper.findAll('tbody tr')).toHaveLength(60)
    wrapper.unmount()
  })

  it('updates dates with the range handles and prevents them crossing', async () => {
    const { wrapper } = await mountChart()
    const inputs = wrapper.findAll('input[type="range"]')
    await inputs[0].setValue('37')
    expect(wrapper.findAll('tbody tr')).toHaveLength(expectedVisibleRecords(wrapper))
    await inputs[1].setValue('7')
    expect(inputs[1].element.value).toBe('38')
    expect(wrapper.findAll('tbody tr')).toHaveLength(expectedVisibleRecords(wrapper))
    await inputs[0].setValue('49')
    expect(inputs[0].element.value).toBe('37')
    wrapper.unmount()
  })

  it('zooms around the cursor with the wheel and stays within the full date range', async () => {
    const { wrapper, svg } = await mountChart()
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
    expect(wrapper.findAll('tbody tr')).toHaveLength(expectedVisibleRecords(wrapper))
    const inputs = wrapper.findAll('input[type="range"]')
    expect(inputs[0].element.value).toBe('5')
    expect(inputs[1].element.value).toBe('44')
    await wheel(100)
    expect(wrapper.findAll('tbody tr')).toHaveLength(expectedVisibleRecords(wrapper))
    await wheel(100)
    expect(wrapper.findAll('tbody tr')).toHaveLength(60)
    // At the right edge, zooming retains the latest date.
    for (let index = 0; index < 25; index++) await wheel(-100, 950)
    expect(wrapper.findAll('tbody tr')).toHaveLength(expectedVisibleRecords(wrapper))
    expect(inputs[1].element.value).toBe('49')
    await wrapper.get('.chart-panel .btn-paper-secondary').trigger('click')
    expect(wrapper.findAll('tbody tr')).toHaveLength(60)
    // Scrolling outside the plot still scrolls the page.
    expect((await wheel(-100, 20)).defaultPrevented).toBe(false)
    expect((await wheel(-100, 510, 340)).defaultPrevented).toBe(false)
    expect(wrapper.findAll('tbody tr')).toHaveLength(60)
    wrapper.unmount()
  })

  it('opens a clicked date and saves changes to the table, chart and totals', async () => {
    const { wrapper, svg } = await mountChart()
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
    await flushPromises()
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
    const { wrapper, svg } = await mountChart()
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
  it('shows discarded value, compares equal periods and filters ranked food activity', async () => {
    const { wrapper } = await mountChart()
    expect(wrapper.get('.discarded-cost').attributes('aria-label')).toContain(sampleAnalyticsEvents.filter(event => event.action === 'discarded').reduce((sum, event) => sum + event.valueSgd, 0).toFixed(2))
    expect(wrapper.get('.comparison-note').text()).toContain('Not enough earlier history')
    const firstFood = wrapper.get('.ranking-row .ranking-food-heading b').text()
    await wrapper.get('.ranking-row').trigger('click')
    expect(wrapper.get('.waste-insight').text()).toContain(firstFood)
    expect(
      wrapper.findAll('tbody tr').every((row) => row.findAll('td')[1].text().includes(firstFood)),
    ).toBe(true)
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Clear food filter')
      .trigger('click')
    expect(wrapper.findAll('tbody tr')).toHaveLength(60)
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Last 7 days')
      .trigger('click')
    expect(wrapper.findAll('tbody tr')).toHaveLength(expectedVisibleRecords(wrapper))
    expect(wrapper.get('.comparison-note').text()).toContain('7 days each')
    expect(wrapper.findAll('.period-change')).toHaveLength(4)
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Weight')
      .trigger('click')
    expect(wrapper.get('.ranking-controls button[aria-pressed="true"]').text()).toBe('Weight')
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'All dates')
      .trigger('click')
    expect(wrapper.findAll('tbody tr')).toHaveLength(60)
    expect(wrapper.get('.comparison-note').text()).toContain('Not enough earlier history')
    wrapper.unmount()
  })
})
