// File uploads can't use apiRequest() in api.js because it always sends JSON,
// so this helper posts multipart/form-data. Vite proxies /api to Express in development.

/**
 * Upload a receipt image and get the OCR text back.
 * @param {File} file
 * @returns {Promise<{ rawText: string, lines: string[], confidence: number, lowConfidence: boolean, parsed: object|null }>}
 */
export async function uploadReceipt(file) {
  const formData = new FormData()
  formData.append('receipt', file) // must match upload.single('receipt') on the server

  let response
  try {
    // No Content-Type header: the browser adds it, including the multipart boundary.
    response = await fetch('/api/scanning/receipts', { method: 'POST', body: formData })
  } catch {
    throw new Error('Could not reach the server. Please check your connection.')
  }

  if (response.status === 401) {
    throw new Error('Please log in to scan a receipt.')
  }

  const text = await response.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`Server returned ${response.status}: ${text || '(empty response)'}`)
  }

  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`)
  return data
}

/**
 * Ask the server to suggest category, icon, place, use-by date and weight for items typed by hand.
 * @param {Array<{ name: string, quantity?: number, unit?: string, purchasedAt?: string }>} items
 * @returns {Promise<{ aiUsed: boolean, items: object[] }>} same order as the input
 */
export async function suggestItemDetails(items) {
  let response
  try {
    response = await fetch('/api/scanning/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    })
  } catch {
    throw new Error('Could not reach the server. Please check your connection.')
  }
  if (response.status === 401) throw new Error('Please log in again.')
  const text = await response.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`Server returned ${response.status}: ${text || '(empty response)'}`)
  }
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`)
  return data
}

/**
 * Save the reviewed items to the user's inventory.
 * On a 400 the thrown error has `.details`: [{ index, field, message }] telling which
 * item and field the server rejected, so the form can mark them.
 * @param {Array<object>} items payloads built by toPayload()
 * @param {'receipt'|'manual'} [source] where the items came from
 * @returns {Promise<{ saved: number, added: number, merged: number }>}
 */
export async function confirmReceiptItems(items, source = 'receipt') {
  let response
  try {
    response = await fetch('/api/scanning/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, source }),
    })
  } catch {
    throw new Error('Could not reach the server. Please check your connection.')
  }

  if (response.status === 401) throw new Error('Please log in again to save your items.')

  const text = await response.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`Server returned ${response.status}: ${text || '(empty response)'}`)
  }

  if (!response.ok) {
    const error = new Error(data.error || `Request failed (${response.status})`)
    error.details = Array.isArray(data.details) ? data.details : []
    throw error
  }
  return data
}
