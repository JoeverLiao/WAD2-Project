import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ReceiptReviewForm from '../components/ReceiptReviewForm.vue'

const parsed = () => ({
  merchant: 'Ntuc Fairprice',
  purchasedAt: '2026-10-12',
  dateAmbiguous: true,
  total: 19.65,
  itemsSum: 9.6,
  totalMatches: false,
  items: [
    { name: 'Milk', receiptName: 'Fresh Milk 1L', quantity: 2, unit: 'pieces', price: 6.4, storage: 'fridge', storageZone: 'middle-shelf', suggestedLocation: 'middle-shelf', allowedLocations: ['middle-shelf', 'upper-shelf'], locationReason: 'Dairy keeps best at a steady cold temperature.', category: 'dairy', icon: '🥛', weightKg: 2, expiresAt: '2026-10-19', include: true, warnings: [] },
    { name: 'Eggs', receiptName: 'Eggs Large 10s', quantity: 1, unit: 'pieces', price: 3.2, storage: 'fridge', storageZone: 'middle-shelf', suggestedLocation: 'middle-shelf', allowedLocations: ['middle-shelf', 'upper-shelf'], category: 'eggs', icon: '🥚', weightKg: 0.6, expiresAt: '2026-11-09', include: true, warnings: [] },
    { name: 'Ziploc Bags', quantity: 1, unit: 'pieces', price: 4.89, storage: 'pantry', expiresAt: null, include: false, warnings: ['Does not look like food: untick to skip it'] },
  ],
})

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) }
}

const rows = (wrapper) => wrapper.findAll('[data-testid="item-row"]')

describe('ReceiptReviewForm', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows every parsed item, with non-food unticked', () => {
    const wrapper = mount(ReceiptReviewForm, { props: { parsed: parsed() } })
    expect(rows(wrapper)).toHaveLength(3)
    expect(rows(wrapper)[0].get('[data-testid="name"]').element.value).toBe('Milk')
    expect(rows(wrapper)[0].get('[data-testid="quantity"]').element.value).toBe('2')
    expect(rows(wrapper)[0].get('[data-testid="zone"]').element.value).toBe('middle-shelf')
    expect(rows(wrapper)[0].get('[data-testid="category"]').element.value).toBe('dairy')
    expect(rows(wrapper)[0].get('[data-testid="icon"]').element.value).toBe('🥛')
    expect(rows(wrapper)[0].get('[data-testid="weight"]').element.value).toBe('2')
    expect(rows(wrapper)[0].get('[data-testid="location-hint"]').text()).toContain('Middle shelf')
    expect(rows(wrapper)[2].get('[data-testid="include"]').element.checked).toBe(false)
    expect(wrapper.get('[data-testid="count"]').text()).toContain('2 of 3')
    expect(wrapper.get('[data-testid="purchased-at"]').element.value).toBe('2026-10-12')
  })

  it('warns about an ambiguous date and about totals that do not add up', () => {
    const wrapper = mount(ReceiptReviewForm, { props: { parsed: parsed() } })
    expect(wrapper.text()).toContain('day/month or month/day')
    expect(wrapper.get('[data-testid="total-warning"]').text()).toContain('19.65')
  })

  it('starts with one empty row when nothing was found, and lets the user add rows', async () => {
    const wrapper = mount(ReceiptReviewForm, { props: { parsed: null } })
    expect(wrapper.find('[data-testid="no-items"]').exists()).toBe(true)
    expect(rows(wrapper)).toHaveLength(1)
    await wrapper.get('[data-testid="add-row"]').trigger('click')
    expect(rows(wrapper)).toHaveLength(2)
    await rows(wrapper)[1].get('[data-testid="remove"]').trigger('click')
    expect(rows(wrapper)).toHaveLength(1)
    await rows(wrapper)[0].get('[data-testid="remove"]').trigger('click')
    expect(rows(wrapper)).toHaveLength(1) // never leaves the form without a row
  })

  it('does not send anything while a field is invalid, and says what is wrong', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(ReceiptReviewForm, { props: { parsed: parsed() }, attachTo: document.body })

    await rows(wrapper)[0].get('[data-testid="name"]').setValue('   ')
    await rows(wrapper)[1].get('[data-testid="quantity"]').setValue('-3')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(rows(wrapper)[0].text()).toContain('Enter the item name.')
    expect(rows(wrapper)[1].text()).toContain('Quantity must be more than 0.')
    wrapper.unmount()
  })

  it('shows the estimated use-by date (editable) and the original receipt wording', () => {
    const wrapper = mount(ReceiptReviewForm, { props: { parsed: parsed() } })
    expect(rows(wrapper)[0].get('[data-testid="expires"]').element.value).toBe('2026-10-19')
    expect(rows(wrapper)[0].get('[data-testid="receipt-name"]').text()).toContain('Fresh Milk 1L')
    wrapper.unmount()
  })

  it('ignores errors on unticked rows', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(201, { saved: 2, added: 1, merged: 1 }))
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(ReceiptReviewForm, { props: { parsed: parsed() } })
    await rows(wrapper)[2].get('[data-testid="name"]').setValue('') // unticked row
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('saves only ticked rows, with edits applied, then offers to scan another receipt', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(201, { saved: 2, added: 1, merged: 1 }))
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(ReceiptReviewForm, { props: { parsed: parsed() } })

    await rows(wrapper)[0].get('[data-testid="name"]').setValue('Full Cream Milk')
    await rows(wrapper)[0].get('[data-testid="quantity"]').setValue('3')
    await rows(wrapper)[0].get('[data-testid="zone"]').setValue('freezer-main')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/scanning/confirm')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body).items).toEqual([
      { name: 'Full Cream Milk', quantity: 3, unit: 'pieces', storage: 'freezer', storageZone: 'freezer-main', category: 'dairy', icon: '🥛', suggestedLocation: 'middle-shelf', weightKg: 2, purchasedAt: '2026-10-12', expiresAt: '2026-10-19', purchasePrice: 6.4 },
      { name: 'Eggs', quantity: 1, unit: 'pieces', storage: 'fridge', storageZone: 'middle-shelf', category: 'eggs', icon: '🥚', suggestedLocation: 'middle-shelf', weightKg: 0.6, purchasedAt: '2026-10-12', expiresAt: '2026-11-09', purchasePrice: 3.2 },
    ])
    expect(wrapper.get('[data-testid="saved-message"]').text()).toContain('Saved 2 items')
    expect(wrapper.get('[data-testid="merged-message"]').text()).toContain('1 was already in stock')
    expect(wrapper.emitted('saved')).toHaveLength(1)

    await wrapper.get('[data-testid="saved-message"] button').trigger('click')
    expect(wrapper.emitted('reset')).toHaveLength(1)
  })

  it('cannot be saved with nothing ticked', async () => {
    const wrapper = mount(ReceiptReviewForm, { props: { parsed: parsed() } })
    for (const row of rows(wrapper).slice(0, 2)) await row.get('[data-testid="include"]').setValue(false)
    expect(wrapper.get('[data-testid="save"]').attributes('disabled')).toBeDefined()
  })

  it('does not send twice when the button is pressed twice', async () => {
    let finish
    const fetchMock = vi.fn(() => new Promise((resolve) => (finish = () => resolve(jsonResponse(201, { saved: 2, added: 1, merged: 1 })))))
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(ReceiptReviewForm, { props: { parsed: parsed() } })
    await wrapper.get('form').trigger('submit')
    await wrapper.get('form').trigger('submit')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    finish()
    await flushPromises()
  })

  it('marks the item and field the server rejected, and keeps the form so nothing is lost', async () => {
    const body = { error: 'Please fix the items marked in red and try again.', details: [{ index: 1, field: 'name', message: 'Name must be 100 characters or fewer.' }] }
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(400, body)))
    const wrapper = mount(ReceiptReviewForm, { props: { parsed: parsed() }, attachTo: document.body })
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-testid="save-error"]').text()).toContain('Please fix the items')
    expect(rows(wrapper)[1].text()).toContain('Name must be 100 characters or fewer.')
    expect(rows(wrapper)[0].text()).not.toContain('Name must be 100')
    expect(wrapper.find('[data-testid="saved-message"]').exists()).toBe(false)
    await rows(wrapper)[1].get('[data-testid="name"]').setValue('Eggs') // editing clears the server message
    expect(rows(wrapper)[1].text()).not.toContain('Name must be 100')
    wrapper.unmount()
  })

  it('shows a friendly message when the server cannot be reached or login expired', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network') }))
    const wrapper = mount(ReceiptReviewForm, { props: { parsed: parsed() } })
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[data-testid="save-error"]').text()).toContain('Could not reach the server')

    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(401, { error: 'Authentication required' })))
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[data-testid="save-error"]').text()).toContain('log in again')
  })

  describe('manual entry (no receipt)', () => {
    it('starts with one empty row, today as the date and no "nothing found" message', () => {
      const wrapper = mount(ReceiptReviewForm, { props: { manual: true } })
      expect(rows(wrapper)).toHaveLength(1)
      expect(wrapper.find('[data-testid="no-items"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="manual-intro"]').exists()).toBe(true)
      expect(wrapper.get('[data-testid="purchased-at"]').element.value).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      wrapper.unmount()
    })

    it('saves an item with no price and no use-by date, marked as manual', async () => {
      const fetchMock = vi.fn(async () => jsonResponse(201, { saved: 1, added: 1, merged: 0 }))
      vi.stubGlobal('fetch', fetchMock)
      const wrapper = mount(ReceiptReviewForm, { props: { manual: true } })
      await rows(wrapper)[0].get('[data-testid="name"]').setValue('Milk')
      await wrapper.get('form').trigger('submit')
      await flushPromises()

      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.source).toBe('manual')
      expect(body.items).toHaveLength(1)
      expect(body.items[0]).toMatchObject({ name: 'Milk', quantity: 1 })
      expect(body.items[0]).not.toHaveProperty('purchasePrice')
      expect(body.items[0]).not.toHaveProperty('expiresAt')
      expect(body.items[0]).not.toHaveProperty('weightKg')
      expect(wrapper.get('[data-testid="saved-message"]').text()).toContain('Saved 1 item')
      wrapper.unmount()
    })

    it('suggests details for typed items and fills them in without overwriting what the user typed', async () => {
      const suggestion = {
        category: 'meat', icon: '🍗', suggestedLocation: 'lower-shelf', allowedLocations: ['lower-shelf'],
        locationReason: 'Raw meat goes low.', storage: 'fridge', expiresAt: '2026-11-03', weightKg: 0.5,
      }
      const fetchMock = vi.fn(async () => jsonResponse(200, { aiUsed: false, items: [suggestion] }))
      vi.stubGlobal('fetch', fetchMock)
      const wrapper = mount(ReceiptReviewForm, { props: { manual: true } })
      await rows(wrapper)[0].get('[data-testid="name"]').setValue('Chicken breast')
      await rows(wrapper)[0].get('[data-testid="weight"]').setValue('0.75')
      await wrapper.get('[data-testid="suggest"]').trigger('click')
      await flushPromises()

      expect(fetchMock.mock.calls[0][0]).toBe('/api/scanning/suggest')
      const row = rows(wrapper)[0]
      expect(row.get('[data-testid="category"]').element.value).toBe('meat')
      expect(row.get('[data-testid="icon"]').element.value).toBe('🍗')
      expect(row.get('[data-testid="zone"]').element.value).toBe('lower-shelf')
      expect(row.get('[data-testid="expires"]').element.value).toBe('2026-11-03')
      expect(row.get('[data-testid="weight"]').element.value).toBe('0.75') // the user's own weight is kept
      expect(row.get('[data-testid="location-hint"]').text()).toContain('Lower shelf')
      wrapper.unmount()
    })

    it('offers every icon on every row, and keeps an icon picked from another category', async () => {
      const wrapper = mount(ReceiptReviewForm, { props: { parsed: parsed() } })
      const select = rows(wrapper)[0].get('[data-testid="icon"]')
      const options = select.findAll('option').map((o) => o.element.value)
      for (const icon of ['🥛', '🍓', '🫐', '🍒', '🥭', '🐟', '🍞', '🥫']) expect(options).toContain(icon)
      expect(options.length).toBeGreaterThan(60)
      await select.setValue('🍓')
      await rows(wrapper)[0].get('[data-testid="category"]').setValue('fruit')
      expect(select.element.value).toBe('🍓')
      wrapper.unmount()
    })

    it('tells the user when unknown items could not be classified by the AI', () => {
      const withStatus = (aiStatus) => mount(ReceiptReviewForm, { props: { parsed: { ...parsed(), aiStatus } } })
      expect(withStatus('not_configured').get('[data-testid="ai-notice"]').text()).toContain('switched off')
      expect(withStatus('failed').get('[data-testid="ai-notice"]').text()).toContain('could not be reached')
      expect(withStatus('used').find('[data-testid="ai-notice"]').exists()).toBe(false)
      expect(withStatus('not_needed').find('[data-testid="ai-notice"]').exists()).toBe(false)
    })

    it('a weight is enough: the quantity can be left empty', async () => {
      const fetchMock = vi.fn(async () => jsonResponse(201, { saved: 1, added: 1, merged: 0 }))
      vi.stubGlobal('fetch', fetchMock)
      const wrapper = mount(ReceiptReviewForm, { props: { manual: true } })
      await rows(wrapper)[0].get('[data-testid="name"]').setValue('Chicken breast')
      await rows(wrapper)[0].get('[data-testid="quantity"]').setValue('')
      await rows(wrapper)[0].get('[data-testid="weight"]').setValue('0.5')
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      const [item] = JSON.parse(fetchMock.mock.calls[0][1].body).items
      expect(item.weightKg).toBe(0.5)
      expect(item).not.toHaveProperty('quantity')
      wrapper.unmount()
    })

    it('still needs a name', async () => {
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
      const wrapper = mount(ReceiptReviewForm, { props: { manual: true } })
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      expect(fetchMock).not.toHaveBeenCalled()
      expect(wrapper.text()).toContain('Enter the item name.')
      wrapper.unmount()
    })
  })
})
