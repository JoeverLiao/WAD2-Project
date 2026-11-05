import axios from 'axios'

// Shared transport for the fridge, analytics, and their dashboard requests.
export const http = axios.create({
  baseURL: '/api',
  withCredentials: true,
  responseType: 'json',
  transitional: { silentJSONParsing: false },
})

export const isRequestCancelled = axios.isCancel

function requestErrorMessage(cause) {
  const status = cause.response?.status
  const serverMessage = cause.response?.data?.error
  if (typeof serverMessage === 'string' && serverMessage) return serverMessage
  if (status === 401) return 'Your session has expired. Please sign in again.'
  if (status >= 200 && status < 300) return `Server returned an invalid response (HTTP ${status}).`
  if (status) return `Request failed (HTTP ${status}).`
  return cause.message || 'Unable to reach the server. Please try again.'
}

http.interceptors.response.use(
  (response) => response,
  (cause) => {
    // Preserve Axios cancellation so callers can silently ignore aborted loads.
    if (isRequestCancelled(cause)) return Promise.reject(cause)
    const error = new Error(requestErrorMessage(cause), { cause })
    error.status = cause.response?.status
    return Promise.reject(error)
  },
)
