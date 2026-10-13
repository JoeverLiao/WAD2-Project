// File uploads can't use apiRequest() in api.js because it always sends JSON,
// so this helper posts multipart/form-data. Vite proxies /api to Express in development.

/**
 * Upload a receipt image and get the OCR text back.
 * @param {File} file
 * @returns {Promise<{ rawText: string, lines: string[], confidence: number }>}
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
