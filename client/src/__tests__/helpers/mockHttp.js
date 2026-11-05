import { afterEach } from 'vitest'
import { AxiosError } from 'axios'
import { http } from '../../services/http.js'

const defaultAdapter = http.defaults.adapter
afterEach(() => {
  http.defaults.adapter = defaultAdapter
})

// Replace only the network adapter. Axios serialization, cancellation checks,
// response transforms, credentials configuration, and interceptors still run.
export function mockHttp(request) {
  http.defaults.adapter = async (config) => {
    const result = await request(http.getUri(config), {
      ...config,
      method: config.method.toUpperCase(),
    })
    const response = {
      data: result.data,
      status: result.status ?? 200,
      statusText: '',
      headers: result.headers || {},
      config,
    }
    if (!config.validateStatus || config.validateStatus(response.status)) return response
    throw new AxiosError(
      `Request failed with status code ${response.status}`,
      'ERR_BAD_RESPONSE',
      config,
      undefined,
      response,
    )
  }
}
