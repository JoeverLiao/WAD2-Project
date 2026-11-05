import { watch, ref, nextTick, computed, onBeforeUnmount } from 'vue'
import { defaultZoneFor, expiryBadge, expiryDays } from '../../utils/inventoryModel.js'
import { showConfirm } from '../../utils/dialog.js'

// Dialogs behavior shared by the full page and dashboard fridge.
export function useFridgeDialogs({
  route,
  props,
  items,
  fridgeDoorOpen,
  dialogRef,
  selectedCompartment,
  expiryPanelOpen,
  formVisible,
  router,
  finishDrag,
  cancelActionReaction,
  showStorage,
  filteredItems,
  errorMessage,
  saveFoodGroup,
  selectedFoodIds,
  kitchenStage,
  searchQuery,
  selectStorage,
}) {
  watch(
    () => [route?.query?.location, route?.query?.highlight],
    () => {
      if (!props.embedded) openLinkedCompartment()
    },
  )

  function openLinkedCompartment() {
    const queryIds = route?.query?.highlight
    const ids = new Set(Array.isArray(queryIds) ? queryIds : queryIds ? [queryIds] : [])
    const highlighted = items.value.filter((item) => ids.has(item.id))
    if (highlighted.length) {
      showSavedItems(highlighted)
      return
    }
    const locations = {
      'upper-shelf': { title: 'Upper shelf', storage: 'fridge' },
      'middle-shelf': { title: 'Shelves', storage: 'fridge' },
      'lower-shelf': { title: 'Lower shelf', storage: 'fridge' },
      'freezer-main': { title: 'Freezer', storage: 'freezer' },
      crisper: { title: 'Crisper drawer', storage: 'fridge' },
      door: { title: 'Upper door shelf', storage: 'fridge' },
      'door-lower': { title: 'Lower door shelf', storage: 'fridge' },
      'dry-storage': { title: 'Pantry', storage: 'pantry' },
    }
    const zone = route?.query?.location
    const location = locations[zone]
    if (!location) return
    fridgeDoorOpen.value = true
    openCompartment({ id: zone, zone, ...location })
  }

  const editingItem = ref(null)

  const defaultStorage = ref('fridge')

  const defaultStorageZone = ref('middle-shelf')

  let modalReturnFocus = null

  function focusDialog() {
    nextTick(() => dialogRef.value?.focus())
  }

  function closeOpenModal() {
    if (selectedCompartment.value) {
      closeCompartment()
    } else if (expiryPanelOpen.value) {
      closeExpiryPanel()
    }
  }

  function handleDialogKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeOpenModal()
      return
    }

    if (event.key !== 'Tab') return
    const focusable = [
      ...dialogRef.value.querySelectorAll(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]',
      ),
    ]
    if (!focusable.length) {
      event.preventDefault()
      dialogRef.value.focus()
      return
    }

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const expiryTrigger = ref(null)

  function leaveExpiryDropdown(event) {
    if (
      event.pointerType === 'mouse' &&
      !discardingExpired.value &&
      !event.currentTarget.contains(document.activeElement)
    )
      expiryPanelOpen.value = false
  }

  function closeExpiryPanel() {
    expiryPanelOpen.value = false
    expiryTrigger.value?.focus()
  }

  function openEditForm(item) {
    // Pass the selected item to the form so it can pre-fill the fields.
    editingItem.value = item
    defaultStorage.value = item.storage
    // Editing should preserve the item's current compartment.
    defaultStorageZone.value = item.storageZone || defaultZoneFor(item.storage)
    formVisible.value = true
  }

  function closeForm() {
    formVisible.value = false
    editingItem.value = null
  }

  function openCompartment(compartment) {
    if (props.embedded && router) {
      finishDrag()
      const query = { location: compartment.zone }
      router.push({ name: 'fridge', query })
      return
    }
    // Clear any drag that ended while its source card was being unmounted.
    finishDrag()
    cancelActionReaction()
    showStorage(compartment.storage)
    modalReturnFocus = document.activeElement
    selectedCompartment.value = compartment
    focusDialog()
  }

  function closeCompartment() {
    selectedCompartment.value = null
    finishDrag()
    cancelActionReaction()
    nextTick(() => modalReturnFocus?.focus?.())
  }

  function itemsForCompartment(compartment) {
    const list = filteredItems.value.filter((item) => {
      if (compartment.storage === 'fridge') {
        return (
          item.storage === 'fridge' &&
          (compartment.zone === 'middle-shelf'
            ? ['upper-shelf', 'middle-shelf', 'lower-shelf'].includes(item.storageZone)
            : item.storageZone === compartment.zone)
        )
      }
      if (compartment.storage === 'freezer') {
        return item.storage === 'freezer'
      }
      return item.storage === 'pantry'
    })

    return list.sort((a, b) => {
      const aDate = a.expiresAt ? new Date(`${a.expiresAt}T00:00:00`).getTime() : Infinity
      const bDate = b.expiresAt ? new Date(`${b.expiresAt}T00:00:00`).getTime() : Infinity
      return aDate - bDate
    })
  }

  const compartmentItems = computed(() =>
    selectedCompartment.value ? itemsForCompartment(selectedCompartment.value) : [],
  )

  const compartmentStatus = computed(() => ({
    expired: compartmentItems.value.filter((item) => expiryBadge(item) === 'Expired').length,
    soon: compartmentItems.value.filter((item) => expiryBadge(item) === 'Expiring soon').length,
  }))

  function itemCount(compartment) {
    return itemsForCompartment(compartment).length
  }

  const expiryItems = computed(() => {
    return items.value
      .filter((item) => {
        const days = expiryDays(item)
        return days !== null && days < 0
      })
      .sort((a, b) => expiryDays(a) - expiryDays(b))
  })

  const expiryItemCount = computed(() => expiryItems.value.length)

  const discardingExpired = ref(false)

  async function discardExpiredFoods() {
    if (discardingExpired.value || !expiryItems.value.length) return
    discardingExpired.value = true
    try {
      const confirmed = await showConfirm({
        title: 'Discard all expired food?',
        message:
          'This removes the full quantities of expired foods across all fridges and pantries.',
        confirmLabel: 'Discard all expired food',
        danger: true,
      })
      if (!confirmed) return
      errorMessage.value = ''
      const expired = [...expiryItems.value]
      const discarded = await saveFoodGroup(expired, 'DELETE', { activity: 'discarded' })
      if (discarded.size < expired.length) {
        errorMessage.value = 'Some expired foods could not be discarded. Please try again.'
      }
    } finally {
      discardingExpired.value = false
    }
  }

  async function showSavedItems(foods) {
    await jumpToItem(foods[0])
    selectedFoodIds.value = new Set(foods.map((item) => item.id))
    if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      for (const icon of kitchenStage.value?.querySelectorAll('[data-food-id]') || []) {
        if (selectedFoodIds.value.has(icon.dataset.foodId)) {
          icon.animate?.([{ rotate: '-7deg' }, { rotate: '7deg' }, { rotate: '0deg' }], {
            duration: 500,
            delay: 450,
            easing: 'ease-in-out',
          })
        }
      }
    }
  }

  function highlightFood(id) {
    const item = items.value.find((food) => food.id === id)
    if (item) return jumpToItem(item)
  }

  const revealedFoodId = ref(null)

  let revealTimer

  onBeforeUnmount(() => clearTimeout(revealTimer))

  async function jumpToItem(item) {
    selectedCompartment.value = null
    finishDrag()
    expiryPanelOpen.value = false
    searchQuery.value = ''
    const type = item.storage === 'pantry' ? 'pantry' : 'fridge'
    selectStorage({ type })
    if (type === 'fridge') fridgeDoorOpen.value = true
    await nextTick()

    const icon = [...(kitchenStage.value?.querySelectorAll('[data-food-id]') || [])].find(
      (element) => element.dataset.foodId === item.id,
    )
    if (!icon) return
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    icon.scrollIntoView?.({
      behavior: reduceMotion ? 'instant' : 'smooth',
      block: 'center',
      inline: 'nearest',
    })
    icon.focus({ preventScroll: true })
    selectedFoodIds.value = new Set([item.id])
    clearTimeout(revealTimer)
    revealedFoodId.value = item.id
    revealTimer = setTimeout(() => {
      revealedFoodId.value = null
    }, 3500)
    if (!reduceMotion) {
      icon.animate?.(
        [
          { rotate: '0deg' },
          { rotate: '-9deg' },
          { rotate: '8deg' },
          { rotate: '-5deg' },
          { rotate: '0deg' },
        ],
        { duration: 520, delay: 450, easing: 'ease-in-out' },
      )
    }
  }

  return {
    openLinkedCompartment,
    editingItem,
    defaultStorage,
    defaultStorageZone,
    handleDialogKeydown,
    expiryTrigger,
    leaveExpiryDropdown,
    closeExpiryPanel,
    openEditForm,
    closeForm,
    openCompartment,
    closeCompartment,
    compartmentItems,
    compartmentStatus,
    itemCount,
    expiryItems,
    expiryItemCount,
    discardingExpired,
    discardExpiredFoods,
    highlightFood,
    revealedFoodId,
    jumpToItem,
  }
}
