import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { expiryBadge, expiryLabel, locationLabel, expiryDays } from '../../utils/inventoryModel.js'

// Layout behavior shared by the full page and dashboard fridge.
export function useFridgeLayout({
  props,
  finishDrag,
  cancelActionReaction,
  selectedFoodIds,
  foodTooltip,
  fridgeDoorOpen,
  selectedCompartment,
  expiryPanelOpen,
  formVisible,
  shiftingFood,
  getRecommendation,
  guidanceDestinationLabel,
  items,
}) {
  const activeStorage = ref('fridge')

  const animateStorageSlide = ref(true)

  function showStorage(storage, animate = false) {
    if (props.embedded) return
    animateStorageSlide.value = animate
    activeStorage.value = storage === 'pantry' ? 'pantry' : 'fridge'
  }

  function changeStorage(storage) {
    finishDrag()
    cancelActionReaction()
    selectedFoodIds.value = new Set()
    foodTooltip.value = null
    showStorage(storage, true)
  }

  const searchQuery = ref('')

  const fridgeSearch = ref(null)

  function clearSearch() {
    searchQuery.value = ''
    fridgeSearch.value?.focus()
  }

  function typeToSearch(event) {
    const input = fridgeSearch.value
    if (
      !input ||
      props.embedded ||
      !fridgeDoorOpen.value ||
      activeStorage.value !== 'fridge' ||
      event.defaultPrevented ||
      event.isComposing ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.key.length !== 1 ||
      !event.key.trim() ||
      event.target.closest?.('input, textarea, select, [contenteditable], [role="dialog"]') ||
      selectedCompartment.value ||
      expiryPanelOpen.value ||
      formVisible.value ||
      shiftingFood.value
    )
      return

    event.preventDefault()
    searchQuery.value += event.key
    input.focus()
  }

  onMounted(() => document.addEventListener('keydown', typeToSearch))

  onBeforeUnmount(() => document.removeEventListener('keydown', typeToSearch))

  function showFoodName(item, event) {
    const rect = event.currentTarget.getBoundingClientRect()
    const badge = expiryBadge(item)
    foodTooltip.value = {
      name: item.name,
      expiry: badge === 'Expired' ? badge : badge ? expiryLabel(item) : null,
      expired: badge === 'Expired',
      storageWarning: getRecommendation(item)
        ? guidanceDestinationLabel(item)
          ? `Move to ${guidanceDestinationLabel(item)}`
          : 'Check storage guidance'
        : '',
      x: Math.max(100, Math.min(window.innerWidth - 100, rect.left + rect.width / 2)),
      y: rect.top,
    }
  }

  function scrollCompartment(event) {
    if (event.ctrlKey) return
    const container = event.currentTarget
    const row = container.matches('.door-bin')
      ? container
      : container.querySelector('.food-preview, .pantry-all-foods')
    if (!row || row.scrollWidth <= row.clientWidth) return
    const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX
    const multiplier = event.deltaMode === 1 ? 24 : event.deltaMode === 2 ? row.clientWidth : 1
    event.preventDefault()
    foodTooltip.value = null
    row.scrollLeft += delta * multiplier
  }

  const storageOptions = computed(() => [
    { type: 'fridge', name: 'Main fridge', label: 'Fridge' },
    { type: 'pantry', name: 'Pantry', label: 'Pantry' },
  ])

  const fridgeItems = computed(() => items.value)

  const storageIndex = computed(() =>
    storageOptions.value.findIndex((option) => option.type === activeStorage.value),
  )

  const currentStorage = computed(() => storageOptions.value[storageIndex.value])

  const fridgeDoorTitle = 'Fridge'

  function selectStorage(option) {
    changeStorage(option.type)
    if (props.embedded) activeStorage.value = option.type
  }

  function stepStorage(direction) {
    const count = storageOptions.value.length
    selectStorage(storageOptions.value[(storageIndex.value + direction + count) % count])
  }

  const filteredItems = computed(() => {
    const query = searchQuery.value.trim().toLowerCase()

    return fridgeItems.value.filter((item) => {
      return (
        !query ||
        [item.name, item.unit, locationLabel(item), item.storageZone].some((value) =>
          String(value || '')
            .toLowerCase()
            .includes(query),
        )
      )
    })
  })

  const itemsByZone = computed(() => {
    const zones = new Map()
    for (const item of filteredItems.value) {
      const zone =
        item.storage === 'fridge' &&
        ['upper-shelf', 'middle-shelf', 'lower-shelf'].includes(item.storageZone)
          ? 'middle-shelf'
          : item.storageZone
      const key = `${item.storage}:${zone}`
      if (!zones.has(key)) zones.set(key, [])
      zones.get(key).push(item)
    }
    for (const zoneItems of zones.values()) {
      zoneItems.sort((a, b) => (a.expiresAt || '9999').localeCompare(b.expiresAt || '9999'))
    }
    return zones
  })

  function itemsInZone(storage, storageZone) {
    return itemsByZone.value.get(`${storage}:${storageZone}`) || []
  }

  const pantryShelves = computed(() => {
    const pantryItems = itemsInZone('pantry', 'dry-storage')
    return Array.from({ length: 4 }, (_, shelf) =>
      pantryItems.filter((_, index) => index % 4 === shelf),
    )
  })

  function countItems(storage) {
    return fridgeItems.value.filter((item) => item.storage === storage).length
  }

  const totalItems = computed(() => fridgeItems.value.length)

  const expiredCount = computed(
    () =>
      fridgeItems.value.filter((item) => {
        const days = expiryDays(item)
        return days !== null && days < 0
      }).length,
  )

  const expiringSoonCount = computed(
    () =>
      fridgeItems.value.filter((item) => {
        const days = expiryDays(item)
        return days !== null && days >= 0 && days <= 3
      }).length,
  )

  return {
    activeStorage,
    animateStorageSlide,
    showStorage,
    searchQuery,
    fridgeSearch,
    clearSearch,
    showFoodName,
    scrollCompartment,
    storageOptions,
    storageIndex,
    currentStorage,
    fridgeDoorTitle,
    selectStorage,
    stepStorage,
    filteredItems,
    itemsInZone,
    pantryShelves,
    countItems,
    totalItems,
    expiredCount,
    expiringSoonCount,
  }
}
