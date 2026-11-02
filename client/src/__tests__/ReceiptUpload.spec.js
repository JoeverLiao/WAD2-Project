import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ReceiptUpload from '../components/ReceiptUpload.vue'

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) }
}

async function chooseFile(wrapper, file) {
  const input = wrapper.get('[data-testid="receipt-file-input"]')
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
}

const png = () => new File(['x'], 'receipt.png', { type: 'image/png' })

describe('ReceiptUpload', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:preview')
    URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps the scan button disabled until an image is chosen', () => {
    const wrapper = mount(ReceiptUpload)
    expect(wrapper.get('button.fc-btn').attributes('disabled')).toBeDefined()
  })

  it('rejects files that are not JPG, PNG or WEBP', async () => {
    const wrapper = mount(ReceiptUpload)
    await chooseFile(wrapper, new File(['x'], 'notes.txt', { type: 'text/plain' }))
    expect(wrapper.text()).toContain('Please upload a JPG, PNG or WEBP image.')
    expect(wrapper.get('button.fc-btn').attributes('disabled')).toBeDefined()
  })

  it('uploads the image and shows and emits the extracted text', async () => {
    const result = { rawText: 'MILK 1L  2  6.40', lines: ['MILK 1L  2  6.40'], confidence: 91 }
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, result))
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = mount(ReceiptUpload)
    await chooseFile(wrapper, png())
    await wrapper.get('button.fc-btn').trigger('click')
    await flushPromises()

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/scanning/receipts')
    expect(options.method).toBe('POST')
    expect(options.body.get('receipt').name).toBe('receipt.png')
    expect(wrapper.get('textarea').element.value).toBe(result.rawText)
    expect(wrapper.emitted('ocr-complete')[0]).toEqual([result])
  })

  it('asks the user to log in on a 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(401, { error: 'Authentication required' })),
    )

    const wrapper = mount(ReceiptUpload)
    await chooseFile(wrapper, png())
    await wrapper.get('button.fc-btn').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Please log in to scan a receipt.')
    expect(wrapper.emitted('ocr-complete')).toBeUndefined()
  })

  it('shows the server error message when OCR fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(500, { error: 'Failed to process the receipt. Please try again.' }),
        ),
    )

    const wrapper = mount(ReceiptUpload)
    await chooseFile(wrapper, png())
    await wrapper.get('button.fc-btn').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Failed to process the receipt. Please try again.')
  })
})
