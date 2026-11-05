// Vite proxies /api to Express in development. Production needs the same routing.
export async function apiRequest(path, { body, headers, ...options } = {}) {
  const response = await fetch(`/api${path}`, {
    method: 'GET',
    credentials: 'include',
    ...options,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (response.status === 204) return null

  let data
  try {
    data = await response.json()
  } catch {
    if (response.ok)
      throw new Error(`Server returned an invalid response (HTTP ${response.status}).`)
  }

  if (!response.ok) {
    const error = new Error(
      data?.error ||
        (response.status === 401
          ? 'Your session has expired. Please sign in again.'
          : `Request failed (HTTP ${response.status}).`),
    )
    error.status = response.status
    throw error
  }
  return data
}
