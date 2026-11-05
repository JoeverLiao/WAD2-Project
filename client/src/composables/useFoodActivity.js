import { ref, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { fetchFoodActivity, saveFoodActivity } from '../services/analytics.js'
import { foodActivityDay, foodActivityTimestamp } from '../utils/foodActivityDates.js'
import { isRequestCancelled } from '../services/http.js'

export const actionLabels = {
  consumed: 'Consumed',
  discarded: 'Discarded',
  shared: 'Shared',
  rescued: 'Rescued',
}

// Loading and editing activity is independent of chart rendering and navigation.
export function useFoodActivity() {
  const events = ref([])
  const loading = ref(false)
  const saving = ref(false)
  const loadError = ref('')
  const editor = ref(null)
  const selectedDate = ref(null)
  const drafts = ref([])
  const editError = ref('')
  let request
  let disposed = false

  async function loadActivity() {
    request?.abort()
    const current = new AbortController()
    request = current
    loading.value = true
    loadError.value = ''
    try {
      const records = await fetchFoodActivity({ signal: current.signal })
      if (!disposed && request === current) events.value = records
    } catch (error) {
      if (!disposed && request === current && !isRequestCancelled(error))
        loadError.value = error.message
    } finally {
      if (!disposed && request === current) loading.value = false
    }
  }

  async function openDate(date) {
    if (saving.value) return
    selectedDate.value = date
    drafts.value = events.value
      .filter((event) => foodActivityDay(event.occurredAt) === date)
      .map((event) => ({ ...event }))
    editError.value = ''
    await nextTick()
    editor.value?.showModal()
  }

  function closeEditor() {
    if (saving.value) return
    editor.value?.close()
    selectedDate.value = null
    drafts.value = []
  }

  async function saveDay() {
    if (saving.value) return
    if (
      drafts.value.some(
        (event) =>
          !event.name.trim() ||
          !event.unit.trim() ||
          !event.location.trim() ||
          !Object.hasOwn(actionLabels, event.action) ||
          ['quantity', 'weightKg', 'valueSgd'].some(
            (field) =>
              typeof event[field] !== 'number' ||
              !Number.isFinite(event[field]) ||
              event[field] < 0,
          ),
      )
    ) {
      editError.value = 'Enter a food name, unit and location, and valid non-negative numbers.'
      return
    }
    saving.value = true
    editError.value = ''
    try {
      // Record each successful ID immediately so retrying after a partial failure
      // updates that activity instead of creating it again. Preserve existing times.
      for (const draft of drafts.value) {
        const timestamp =
          draft._id && foodActivityDay(draft.occurredAt) === selectedDate.value
            ? draft.occurredAt
            : foodActivityTimestamp(selectedDate.value)
        const saved = await saveFoodActivity(draft, timestamp)
        if (disposed) return
        const index = events.value.findIndex((event) => event._id === saved._id)
        if (index >= 0) events.value[index] = saved
        else events.value.push(saved)
        Object.assign(draft, saved)
      }
      events.value.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
      saving.value = false
      closeEditor()
    } catch (error) {
      if (!disposed) editError.value = error.message
    } finally {
      if (!disposed) saving.value = false
    }
  }

  function addDraft() {
    drafts.value.push({
      name: '',
      action: 'consumed',
      quantity: 1,
      unit: 'pieces',
      weightKg: 0,
      valueSgd: 0,
      location: 'My kitchen',
      category: 'Other',
      source: 'Manual entry',
    })
  }

  onMounted(loadActivity)
  onBeforeUnmount(() => {
    disposed = true
    request?.abort()
  })
  return {
    events,
    loading,
    saving,
    loadError,
    editor,
    selectedDate,
    drafts,
    editError,
    loadActivity,
    openDate,
    closeEditor,
    saveDay,
    addDraft,
  }
}
