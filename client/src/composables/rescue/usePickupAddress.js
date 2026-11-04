import { onBeforeUnmount, ref, watch } from 'vue'
import { api, apiError } from '@/services/rescueApi.js'

// Cancel stale searches and keep the selected address independent of typed search text.
export function usePickupAddress(props, form, editing, locked) {
  let alive = true
  // Address search
  const addressQuery = ref(props.listing?.pickupLabel || '')
  const addressResults = ref([])
  const addressLoading = ref(false)
  const addressError = ref('')
  const addressPage = ref(1)
  const addressTotalPages = ref(0)
  const lastAddressQuery = ref('')

  function validCoordinates(latitude, longitude) {
    return (
      latitude !== '' &&
      latitude !== null &&
      latitude !== undefined &&
      longitude !== '' &&
      longitude !== null &&
      longitude !== undefined &&
      Number.isFinite(Number(latitude)) &&
      Number.isFinite(Number(longitude)) &&
      Number(latitude) >= -90 &&
      Number(latitude) <= 90 &&
      Number(longitude) >= -180 &&
      Number(longitude) <= 180
    )
  }

  // Existing listings retain their saved meeting point until another is selected.
  const selectedAddress = ref(
    props.listing?.pickupLabel &&
      validCoordinates(form.latitude, form.longitude)
      ? {
          address: props.listing.pickupLabel,
          latitude: Number(form.latitude),
          longitude: Number(form.longitude),
        }
      : null,
  )

  let addressController = null
  let addressSearchSequence = 0

  function resetAddressResults() {
    addressSearchSequence += 1
    addressController?.abort()
    addressLoading.value = false
    addressResults.value = []
    addressTotalPages.value = 0
    addressError.value = ''
  }

  watch(addressQuery, resetAddressResults)

  async function searchPickupAddresses(page = 1) {
    if (locked.value || !alive) return

    const query =
      page === 1
        ? addressQuery.value.trim()
        : lastAddressQuery.value

    if (query.length < 2 || query.length > 160) {
      addressError.value = 'Enter between 2 and 160 characters.'
      return
    }

    addressController?.abort()

    const controller = new AbortController()
    addressController = controller

    // Ignore older requests if a newer search starts before they finish.
    const sequence = ++addressSearchSequence

    addressLoading.value = true
    addressError.value = ''
    addressResults.value = []
    addressTotalPages.value = 0

    try {
      const { data } = await api.get('/locations/search', {
        params: { q: query, page },
        signal: controller.signal,
      })

      if (
        !alive ||
        controller.signal.aborted ||
        sequence !== addressSearchSequence
      ) {
        return
      }

      if (!Array.isArray(data.addresses)) {
        throw new Error('Unexpected address search response.')
      }

      addressResults.value = data.addresses.filter(
        (address) =>
          typeof address.address === 'string' &&
          address.address.trim() &&
          validCoordinates(address.latitude, address.longitude),
      )

      addressPage.value = Number(data.page) || page
      addressTotalPages.value = Number(data.totalPages) || 0
      lastAddressQuery.value = query

      if (!addressResults.value.length) {
        addressError.value =
          'No matching addresses. Try a building name or postal code.'
      }
    } catch (err) {
      if (
        alive &&
        !controller.signal.aborted &&
        sequence === addressSearchSequence
      ) {
        addressError.value = apiError(err, 'Could not search addresses.')
      }
    } finally {
      if (alive && sequence === addressSearchSequence) {
        addressLoading.value = false
      }
    }
  }

  function choosePickupAddress(address) {
    if (locked.value) return

    if (!validCoordinates(address.latitude, address.longitude)) {
      addressError.value = 'This address has invalid coordinates.'
      return
    }

    usingSavedLocation.value = false

    selectedAddress.value = {
      address: address.address,
      latitude: Number(address.latitude),
      longitude: Number(address.longitude),
    }

    form.pickupLabel = selectedAddress.value.address
    form.latitude = selectedAddress.value.latitude
    form.longitude = selectedAddress.value.longitude

    resetAddressResults()
  }

  const geolocating = ref(false)

  function getBrowserPosition() {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 30000,
      })
    })
  }

  async function useMyLocation() {
    if (locked.value || geolocating.value || addressLoading.value) return

    if (!navigator.geolocation) {
      addressError.value =
        'Your browser does not support location access. Search manually instead.'
      return
    }

    resetAddressResults()

    // Ignore older requests if a newer search starts before they finish.
    const sequence = ++addressSearchSequence

    geolocating.value = true
    addressError.value = ''

    try {
      const position = await getBrowserPosition()

      if (
        !alive ||
        locked.value ||
        sequence !== addressSearchSequence
      ) {
        return
      }

      const controller = new AbortController()
      addressController = controller

      const { data } = await api.get('/locations/reverse', {
        params: {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        },
        signal: controller.signal,
      })

      if (
        !alive ||
        locked.value ||
        controller.signal.aborted ||
        sequence !== addressSearchSequence
      ) {
        return
      }

      if (!Array.isArray(data.addresses)) {
        throw new Error('Unexpected address lookup response.')
      }

      const addresses = data.addresses.filter(
        (address) =>
          address.address &&
          validCoordinates(address.latitude, address.longitude),
      )

      if (!addresses.length) {
        addressError.value =
          'No nearby address found. Please search for your building or postal code.'
        return
      }

      // Fill the nearest result automatically.
      choosePickupAddress(addresses[0])

      // Let the user correct it if another nearby building is more accurate.
      addressResults.value = addresses
    } catch (err) {
      if (!alive || sequence !== addressSearchSequence) return

      if (err.code === 1) {
        addressError.value = 'Location permission was denied. Allow access or search manually.'
      } else if (err.code === 2) {
        addressError.value = 'Your location is unavailable. Please search manually.'
      } else if (err.code === 3) {
        addressError.value = 'Location access timed out. Try again or search manually.'
      } else {
        addressError.value = apiError(err, 'Could not locate your address.')
      }
    } finally {
      if (alive) geolocating.value = false
    }
  }

  const savedLocationLoading = ref(false)
  const savedLocationError = ref('')
  const usingSavedLocation = ref(false)

  async function loadSavedLocation() {
    // Editing must retain this listing's own pickup address.
    if (editing.value) return

    savedLocationLoading.value = true
    savedLocationError.value = ''

    try {
      const { data } = await api.get('/locations/saved')

      if (!alive || locked.value) return

      const location = data.location

      // Don't overwrite an address the user selected while loading.
      if (
        !location ||
        selectedAddress.value ||
        addressQuery.value.trim() ||
        geolocating.value ||
        addressLoading.value
      ) {
        return
      }

      if (
        !location.address ||
        !validCoordinates(location.latitude, location.longitude)
      ) {
        return
      }

      selectedAddress.value = {
        address: location.address,
        latitude: Number(location.latitude),
        longitude: Number(location.longitude),
      }

      form.pickupLabel = selectedAddress.value.address
      form.latitude = selectedAddress.value.latitude
      form.longitude = selectedAddress.value.longitude

      usingSavedLocation.value = true
    } catch {
      if (alive) {
        savedLocationError.value =
          'Could not load your saved address. You can still choose one below.'
      }
    } finally {
      if (alive) savedLocationLoading.value = false
    }
  }

  // Pickup shortcuts still fill the existing form fields.
  // Existing listings retain their original pickup window.

  onBeforeUnmount(() => {
    alive = false
    addressSearchSequence += 1
    addressController?.abort()
  })

  return {
    addressQuery,
    addressResults,
    addressLoading,
    addressError,
    addressPage,
    addressTotalPages,
    selectedAddress,
    geolocating,
    savedLocationLoading,
    savedLocationError,
    usingSavedLocation,
    searchPickupAddresses,
    choosePickupAddress,
    useMyLocation,
    loadSavedLocation,
    validCoordinates,
  }
}
