import axios from 'axios'

const oneMap = axios.create({
  baseURL: 'https://www.onemap.gov.sg/api',
  timeout: 15000,
})

let cachedToken = ''
let expiresAt = 0
let tokenRequest = null

async function getToken() {
  if (cachedToken && Date.now() < expiresAt - 60000) {
    return cachedToken
  }

  // Concurrent searches share the same token request.
  if (tokenRequest) return tokenRequest

  tokenRequest = (async () => {
    const email = process.env.ONEMAP_EMAIL
    const password = process.env.ONEMAP_PASSWORD

    if (!email || !password) {
      throw new Error('OneMap credentials are not configured.')
    }

    const { data } = await oneMap.post('/auth/post/getToken', {
      email,
      password,
    })

    const expiry = Number(data.expiry_timestamp) * 1000

    if (
      !data.access_token ||
      !Number.isFinite(expiry) ||
      expiry <= Date.now()
    ) {
      throw new Error('OneMap authentication failed.')
    }

    cachedToken = data.access_token
    expiresAt = expiry

    return cachedToken
  })()

  try {
    return await tokenRequest
  } finally {
    tokenRequest = null
  }
}

export async function searchAddresses(query, page = 1) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = await getToken()

    try {
      const { data } = await oneMap.get('/common/elastic/search', {
        headers: {
          Authorization: token,
        },
        params: {
          searchVal: query,
          returnGeom: 'Y',
          getAddrDetails: 'Y',
          pageNum: page,
        },
      })

      // OneMap can also return an error inside a successful HTTP response.
      if (data.error) {
        if (
          attempt === 0 &&
          /token|unauthori[sz]ed|authentication/i.test(
            String(data.error),
          )
        ) {
          cachedToken = ''
          expiresAt = 0
          continue
        }

        throw new Error('OneMap returned an unsuccessful search response.')
      }

      if (!Array.isArray(data.results)) {
        throw new Error('OneMap returned an unexpected search response.')
      }

      const addresses = data.results
        .map((result) => ({
          address: result.ADDRESS,
          building:
            result.BUILDING && result.BUILDING !== 'NIL'
              ? result.BUILDING
              : '',
          postalCode:
            result.POSTAL && result.POSTAL !== 'NIL'
              ? result.POSTAL
              : '',
          latitude: Number(result.LATITUDE),
          longitude: Number(result.LONGITUDE),
        }))
        .filter(
          (result) =>
            typeof result.address === 'string' &&
            result.address.trim() &&
            Number.isFinite(result.latitude) &&
            Number.isFinite(result.longitude) &&
            result.latitude >= -90 &&
            result.latitude <= 90 &&
            result.longitude >= -180 &&
            result.longitude <= 180,
        )

      return {
        addresses,
        page: Number(data.pageNum) || page,
        totalPages: Number(data.totalNumPages) || 0,
      }
    } catch (error) {
      const status = error.response?.status

      if (attempt === 0 && [401, 403].includes(status)) {
        cachedToken = ''
        expiresAt = 0
        continue
      }

      throw error
    }
  }

  throw new Error('OneMap authentication failed.')
}

export async function reverseAddresses(latitude, longitude) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = await getToken()

    try {
      const { data } = await oneMap.get('/public/revgeocode', {
        headers: {
          Authorization: token,
        },
        params: {
          location: `${latitude},${longitude}`,
          buffer: 100,
          addressType: 'All',
        },
      })

      if (data.error) {
        if (
          attempt === 0 &&
          /token|unauthori[sz]ed|authentication/i.test(String(data.error))
        ) {
          cachedToken = ''
          expiresAt = 0
          continue
        }

        throw new Error('OneMap reverse lookup failed.')
      }

      if (!Array.isArray(data.GeocodeInfo)) {
        throw new Error('Unexpected OneMap reverse lookup response.')
      }

      const clean = (value) => {
        const text = String(value ?? '').trim()
        return /^(nil|null|undefined)$/i.test(text) ? '' : text
      }

      return data.GeocodeInfo
        .map((item) => {
          const building = clean(item.BUILDINGNAME)
          const block = clean(item.BLOCK)
          const road = clean(item.ROAD)
          const postalCode = clean(item.POSTALCODE)

          return {
            address: [
              building,
              [block, road].filter(Boolean).join(' '),
              postalCode ? `SINGAPORE ${postalCode}` : '',
            ]
              .filter(Boolean)
              .join(', '),
            building,
            postalCode,
            latitude: Number(item.LATITUDE),
            longitude: Number(item.LONGITUDE),
          }
        })
        .filter(
          (item) =>
            item.address &&
            Number.isFinite(item.latitude) &&
            Number.isFinite(item.longitude),
        )
    } catch (error) {
      if (
        attempt === 0 &&
        [401, 403].includes(error.response?.status)
      ) {
        cachedToken = ''
        expiresAt = 0
        continue
      }

      throw error
    }
  }

  throw new Error('OneMap authentication failed.')
}