import { computed, ref } from 'vue'
import {
  storageForZone,
  locationLabel,
  itemStorageName,
  expiryBadge,
} from '../../utils/inventoryModel.js'
import { showConfirm } from '../../utils/dialog.js'

// Guidance behavior shared by the full page and dashboard fridge.
export function useFridgeGuidance({
  filteredItems,
  props,
  items,
  shiftingFood,
  saving,
  actionPending,
  errorMessage,
  selectedFoodIds,
  saveFoodGroup,
  foodTooltip,
}) {
  function getRecommendation(item) {
    return item.storageGuidanceIgnored ? '' : storageAdvice(item)
  }

  function storageAdvice(item) {
    const allowedLocations =
      Array.isArray(item.allowedLocations) && item.allowedLocations.length
        ? item.allowedLocations
        : storageForZone(item.suggestedLocation)
          ? [item.suggestedLocation]
          : []
    if (allowedLocations.includes(item.storageZone)) return ''
    if (allowedLocations.length > 0 && !allowedLocations.includes(item.storageZone)) {
      const zoneLabels = {
        'upper-shelf': 'Shelves',
        'middle-shelf': 'Shelves',
        'lower-shelf': 'Shelves',
        door: 'Upper door shelf',
        'door-lower': 'Lower door shelf',
        crisper: 'Crisper drawer',
        'freezer-main': 'Freezer',
        'dry-storage': 'Pantry',
      }
      const allowedNames = [
        ...new Set(allowedLocations.map((zone) => zoneLabels[zone] || zone)),
      ].join(', ')
      const suggestedName = zoneLabels[item.suggestedLocation] || item.suggestedLocation
      return `Storage warning: ${item.name} is in ${locationLabel(item)}, but its allowed locations are ${allowedNames}.${suggestedName ? ` Suggested: ${suggestedName}.` : ''}${item.locationReason ? ` ${item.locationReason}` : ''}`
    }

    const name = item.name.toLowerCase()

    if (name.includes('frozen') || name.includes('ice cream')) {
      if (item.storage !== 'freezer') {
        return 'Consider whether this product needs freezer storage.'
      }
    }

    if (
      name.includes('rice') ||
      name.includes('pasta') ||
      name.includes('cereal') ||
      name.includes('flour')
    ) {
      if (item.storage !== 'pantry') {
        return 'Check the packaging to see whether pantry storage is suitable.'
      }
    }

    return ''
  }

  const storageRecommendations = computed(() =>
    filteredItems.value.filter(
      (item) => (!props.embedded || item.storage !== 'pantry') && getRecommendation(item),
    ),
  )

  const ignoredStorageRecommendations = computed(() =>
    filteredItems.value.filter((item) => item.storageGuidanceIgnored && storageAdvice(item)),
  )

  const movedStorageAdviceIds = ref([])

  const movedStorageWarnings = computed(() =>
    items.value.filter(
      (item) => movedStorageAdviceIds.value.includes(item.id) && getRecommendation(item),
    ),
  )

  function showMovedStorageAdvice(moved) {
    movedStorageAdviceIds.value = moved
      .filter((item) => getRecommendation(item))
      .map((item) => item.id)
  }

  const arrangingFoodIds = ref(new Set())

  const arrangementError = ref('')

  const confirmingGuidanceAction = ref(false)

  const guidanceBusy = computed(
    () =>
      shiftingFood.value || saving.value || actionPending.value || confirmingGuidanceAction.value,
  )

  function guidanceDestination(item) {
    if (!getRecommendation(item)) return null
    const allowed = (
      item.allowedLocations.length ? item.allowedLocations : [item.suggestedLocation]
    ).filter((zone) => storageForZone(zone))
    let zone = allowed.length
      ? allowed.includes(item.suggestedLocation)
        ? item.suggestedLocation
        : allowed[0]
      : null
    if (!zone) {
      const name = item.name.toLowerCase()
      if (name.includes('frozen') || name.includes('ice cream')) zone = 'freezer-main'
      else if (['rice', 'pasta', 'cereal', 'flour'].some((word) => name.includes(word)))
        zone = 'dry-storage'
    }
    const storage = storageForZone(zone)
    if (!storage || (storage === item.storage && zone === item.storageZone)) return null
    return { storage, storageZone: zone }
  }

  function guidanceDestinationLabel(item) {
    const destination = guidanceDestination(item)
    if (!destination) return ''
    return `${itemStorageName(destination)} · ${locationLabel(destination)}`
  }

  const arrangeableFoods = computed(() =>
    storageRecommendations.value.filter((item) => guidanceDestination(item)),
  )

  async function confirmArrangeAll() {
    if (guidanceBusy.value || !arrangeableFoods.value.length) return
    const foods = [...arrangeableFoods.value]
    confirmingGuidanceAction.value = true
    let confirmed
    try {
      confirmed = await showConfirm({
        title: 'Arrange all displayed items?',
        message: `Move ${foods.length} displayed item(s) to their recommended storage locations?`,
        confirmLabel: 'Arrange all',
      })
    } finally {
      confirmingGuidanceAction.value = false
    }
    if (confirmed) await arrangeGuidance(foods)
  }

  async function arrangeGuidance(group = arrangeableFoods.value) {
    if (guidanceBusy.value) return
    const destinations = new Map(group.map((item) => [item.id, guidanceDestination(item)]))
    const foods = group.filter((item) => destinations.get(item.id))
    if (!foods.length) return
    errorMessage.value = ''
    arrangementError.value = ''
    arrangingFoodIds.value = new Set(foods.map((item) => item.id))
    selectedFoodIds.value = new Set([...selectedFoodIds.value, ...arrangingFoodIds.value])
    shiftingFood.value = true
    try {
      await saveFoodGroup(foods, 'PATCH', (item) => destinations.get(item.id))
      arrangementError.value = errorMessage.value
    } finally {
      shiftingFood.value = false
      arrangingFoodIds.value = new Set()
    }
  }

  async function setGuidanceIgnored(item, ignored) {
    return saveGuidancePreferences([item], ignored)
  }

  async function saveGuidancePreferences(group, ignored) {
    if (guidanceBusy.value) return
    saving.value = true
    errorMessage.value = ''
    arrangementError.value = ''
    const previousSelection = new Set(selectedFoodIds.value)
    try {
      await saveFoodGroup(group, 'PATCH', { storageGuidanceIgnored: ignored })
      selectedFoodIds.value = new Set([...selectedFoodIds.value, ...previousSelection])
      arrangementError.value = errorMessage.value
      foodTooltip.value = null
      movedStorageAdviceIds.value = []
    } finally {
      saving.value = false
    }
  }

  async function ignoreAllGuidance() {
    if (guidanceBusy.value || !storageRecommendations.value.length) return
    const foods = [...storageRecommendations.value]
    confirmingGuidanceAction.value = true
    let confirmed
    try {
      confirmed = await showConfirm({
        title: 'Ignore all displayed storage guidance?',
        message: `Hide storage guidance for ${foods.length} displayed item(s)? Expiry warnings will stay visible. You can restore guidance under Ignored guidance.`,
        confirmLabel: 'Ignore all',
      })
    } finally {
      confirmingGuidanceAction.value = false
    }
    if (confirmed) await saveGuidancePreferences(foods, true)
  }

  function foodDescription(item) {
    return [expiryBadge(item), getRecommendation(item)].filter(Boolean).join('. ')
  }

  return {
    getRecommendation,
    storageRecommendations,
    ignoredStorageRecommendations,
    movedStorageAdviceIds,
    movedStorageWarnings,
    showMovedStorageAdvice,
    arrangingFoodIds,
    arrangementError,
    guidanceBusy,
    guidanceDestination,
    guidanceDestinationLabel,
    arrangeableFoods,
    confirmArrangeAll,
    arrangeGuidance,
    setGuidanceIgnored,
    ignoreAllGuidance,
    foodDescription,
  }
}
