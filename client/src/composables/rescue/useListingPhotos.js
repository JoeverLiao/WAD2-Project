import { computed, onBeforeUnmount, ref } from 'vue'
import { api } from '@/services/rescueApi.js'

// Own photo previews and release their object URLs when the editor closes.
export function useListingPhotos(props, error) {
  let alive = true
  // Photos
  const photo = ref(null)
  const photoPreview = ref('')
  const photoInput = ref(null)
  const removeExistingPhoto = ref(false)
  const photoLoaded = ref(false)
  const existingPhotoUrl = ref('')

  let currentPhotoObjectUrl = ''
  let previewObjectUrl = ''

  const hasExistingPhoto = computed(
    () =>
      props.listing?.hasPhoto &&
      !removeExistingPhoto.value &&
      !photo.value,
  )

  function clearPreview() {
    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl)
    }

    previewObjectUrl = ''
    photoPreview.value = ''
  }

  function choosePhoto(event) {
    const file = event.target.files?.[0]

    if (!file) return

    error.value = ''

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      error.value =
        'Choose a JPEG, PNG or WebP image. Convert HEIC photos to JPEG first.'
      event.target.value = ''
      return
    }

    if (file.size > 8 * 1024 * 1024) {
      error.value = 'Choose a photo smaller than 8 MiB.'
      event.target.value = ''
      return
    }

    clearPreview()

    photo.value = file
    removeExistingPhoto.value = false
    previewObjectUrl = URL.createObjectURL(file)
    photoPreview.value = previewObjectUrl
  }

  function clearPhoto() {
    clearPreview()
    photo.value = null

    if (photoInput.value) {
      photoInput.value.value = ''
    }
  }

  async function loadExistingPhoto() {
    if (!props.listing?.hasPhoto) return

    try {
      const { data } = await api.get(
        `/rescue/${props.listing._id}/photo`,
        { responseType: 'blob' },
      )

      if (!alive) return

      currentPhotoObjectUrl = URL.createObjectURL(data)
      existingPhotoUrl.value = currentPhotoObjectUrl
    } catch {
      // A missing photo does not prevent editing.
    } finally {
      if (alive) photoLoaded.value = true
    }
  }

  async function persistPhoto(listing) {
    if (photo.value) {
      const body = new FormData()
      body.append('photo', photo.value)

      await api.put(`/rescue/${listing._id}/photo`, body, {
        timeout: 60000,
      })
    } else if (removeExistingPhoto.value && listing.hasPhoto) {
      await api.delete(`/rescue/${listing._id}/photo`)
    }
  }


  onBeforeUnmount(() => {
    alive = false
    clearPreview()
    if (currentPhotoObjectUrl) URL.revokeObjectURL(currentPhotoObjectUrl)
  })

  return {
    photo,
    photoPreview,
    photoInput,
    removeExistingPhoto,
    photoLoaded,
    existingPhotoUrl,
    hasExistingPhoto,
    choosePhoto,
    clearPhoto,
    loadExistingPhoto,
    persistPhoto,
  }
}
