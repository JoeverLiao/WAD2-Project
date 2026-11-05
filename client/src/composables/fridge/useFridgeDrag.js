import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { storageForZone, defaultZoneFor, locationLabel } from '../../utils/inventoryModel.js'

// Drag behavior shared by the full page and dashboard fridge.
export function useFridgeDrag({
  items,
  selectedFoodIds,
  foodTooltip,
  shiftingFood,
  actionPending,
  kitchenStage,
  selectedCompartment,
  selectedFoodsFor,
  foodTransfer,
  errorMessage,
  saveFoodGroup,
  showStorage,
  consumeItem,
  discardItem,
}) {
  const draggedItemId = ref(null)

  const storageAction = ref('pantry')

  const dragPosition = ref(null)

  const dragAnchor = ref(null)

  const dragPlacement = ref('')

  const windowWidth = ref(1024)

  const draggedFood = computed(() => items.value.find((item) => item.id === draggedItemId.value))

  function trackFoodDrag(event) {
    if (!draggedItemId.value) return
    dragPosition.value = { x: event.clientX, y: event.clientY }
    windowWidth.value = window.innerWidth
    const target = event.target.closest?.('[data-drop-zone]')
    const zone = target?.dataset.dropZone
    const names = {
      'upper-shelf': 'Shelves',
      'middle-shelf': 'Shelves',
      'lower-shelf': 'Shelves',
      'freezer-main': 'Freezer',
      crisper: 'Crisper drawer',
      door: 'Upper door shelf',
      'door-lower': 'Lower door shelf',
      'dry-storage': 'Pantry',
    }
    dragPlacement.value = target ? names[zone] || '' : ''
  }

  onMounted(() => document.addEventListener('dragover', trackFoodDrag))

  onBeforeUnmount(() => document.removeEventListener('dragover', trackFoodDrag))

  const draggingFromModal = ref(false)

  const draggingOutsideModal = ref(false)

  const actionReaction = ref('')

  let actionReactionTimer = null

  let actionReactionRequestId = 0

  function setEmojiDragImage(event) {
    if (!event.dataTransfer) return

    // Hide the native snapshot; the animated food preview follows the pointer.
    const size = 72
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    // setDragImage needs a rendered element in the document in some browsers.
    // Place the transparent canvas under the pointer, then remove it next frame.
    canvas.style.position = 'fixed'
    canvas.style.left = `${Math.max(0, event.clientX - size / 2)}px`
    canvas.style.top = `${Math.max(0, event.clientY - size / 2)}px`
    canvas.style.zIndex = '2147483647'
    canvas.style.pointerEvents = 'none'
    canvas.style.background = 'transparent'
    document.body.appendChild(canvas)
    event.dataTransfer.setDragImage(canvas, size / 2, size / 2)
    requestAnimationFrame(() => canvas.remove())
  }

  function setStageEmojiDragImage(event) {
    const emojiElement = event.target.closest?.('.mini-food, .door-food')
    if (emojiElement) setEmojiDragImage(event)
  }

  function foodActionAnchor(item, event) {
    const root = event.currentTarget.closest('.fridge-page-shell')
    const onDoor = item.storage === 'fridge' && ['door', 'door-lower'].includes(item.storageZone)
    const selector = onDoor
      ? '.door-inner'
      : item.storage === 'pantry'
        ? '.pantry-cabinet'
        : '.fridge-interior'
    const bounds = root?.querySelector(selector)?.getBoundingClientRect()
    return {
      x: event.clientX,
      y: event.clientY,
      side: onDoor ? 'right' : 'left',
      edge: bounds ? (onDoor ? bounds.right : bounds.left) : event.clientX,
    }
  }

  function startDrag(item, event) {
    event?.dataTransfer?.setData('application/x-full-circle-food', item.name)
    storageAction.value = item.storage === 'pantry' ? 'fridge' : 'pantry'
    if (!selectedFoodIds.value.has(item.id)) selectedFoodIds.value = new Set([item.id])
    if (event) {
      dragPosition.value = { x: event.clientX, y: event.clientY }
      dragAnchor.value = foodActionAnchor(item, event)
    }
    foodTooltip.value = null
    draggedItemId.value = item.id
    draggingFromModal.value = false
    draggingOutsideModal.value = false
  }

  let touchDrag

  let holdTimer

  function clearTouchDrag() {
    clearTimeout(holdTimer)
    touchDrag = null
  }

  onBeforeUnmount(clearTouchDrag)

  function holdFood(event) {
    foodTooltip.value = null
    if (event.touches.length !== 1) {
      if (touchDrag?.active) finishDrag()
      clearTouchDrag()
      return
    }
    const icon = event.target.closest('[data-food-id]')
    const item = items.value.find((food) => food.id === icon?.dataset.foodId)
    if (!item || draggedItemId.value || shiftingFood.value || actionPending.value) return
    const { identifier, clientX, clientY } = event.touches[0]
    touchDrag = { identifier, clientX, clientY, active: false }
    holdTimer = setTimeout(() => {
      touchDrag.active = true
      startDrag(item, { currentTarget: icon, clientX, clientY })
      dragAnchor.value = { ...dragAnchor.value, touch: true }
    }, 350)
  }

  function moveHeldFood(event) {
    if (!touchDrag) return
    const touch = Array.from(event.touches).find(
      (point) => point.identifier === touchDrag.identifier,
    )
    if (!touch) return
    const { clientX, clientY } = touch
    if (!touchDrag.active) {
      if (Math.hypot(clientX - touchDrag.clientX, clientY - touchDrag.clientY) > 9) clearTouchDrag()
      return
    }
    event.preventDefault()
    trackFoodDrag({
      clientX,
      clientY,
      target: document.elementFromPoint(clientX, clientY) ?? event.target,
    })
  }

  function releaseHeldFood(event) {
    if (!touchDrag) return
    const touch = Array.from(event.changedTouches).find(
      (point) => point.identifier === touchDrag.identifier,
    )
    if (!touch && event.type !== 'touchcancel') return
    const active = touchDrag.active
    clearTouchDrag()
    if (!active) return
    if (event.type === 'touchcancel') {
      finishDrag()
      return
    }
    event.preventDefault()
    const { clientX, clientY } = touch
    const hit = document.elementFromPoint(clientX, clientY)
    const action = hit?.closest('[data-food-action]')
    const compartment = hit?.closest('[data-drop-zone]')
    const drop = { clientX, clientY, preventDefault() {}, currentTarget: action ?? compartment }
    if (action) dropOnAction(action.dataset.foodAction, drop)
    else if (compartment && kitchenStage.value?.contains(compartment)) {
      dropOnArea(
        { storage: compartment.dataset.dropStorage, storageZone: compartment.dataset.dropZone },
        drop,
      )
    } else finishDrag()
  }

  function startModalDrag(item, event) {
    storageAction.value = item.storage === 'pantry' ? 'fridge' : 'pantry'
    if (!selectedFoodIds.value.has(item.id)) selectedFoodIds.value = new Set([item.id])
    if (event) {
      dragPosition.value = { x: event.clientX, y: event.clientY }
      dragAnchor.value = foodActionAnchor(item, event)
      setEmojiDragImage(event)
    }
    // Starting a drag must NOT hide the popup. It stays visible until the pointer
    // actually leaves the popup's bounds.
    draggedItemId.value = item.id
    draggingFromModal.value = true
    draggingOutsideModal.value = false
  }

  function updateModalDragVisibility(event) {
    if (!draggingFromModal.value || !draggedItemId.value) return
    // This is a one-way transition for the duration of a drag: once the cursor
    // leaves the popup, keep it hidden even if the cursor later passes back over
    // the popup's original position. finishDrag() restores it after drop/cancel.
    if (draggingOutsideModal.value) return

    const modal = event.currentTarget.querySelector('.inventory-modal')
    if (!modal) return
    const rect = modal.getBoundingClientRect()
    const pointerInsideModal =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom

    if (!pointerInsideModal) draggingOutsideModal.value = true
  }

  function finishDrag() {
    foodTooltip.value = null
    draggedItemId.value = null
    dragPlacement.value = ''
    dragPosition.value = null
    draggingFromModal.value = false
    draggingOutsideModal.value = false
  }

  function dropFromModalBackdrop(event) {
    event.preventDefault()

    // Ignore drops that land inside the popup itself (including Consume/Discard).
    const backdrop = event.currentTarget
    const modal = backdrop.querySelector('.inventory-modal')
    if (modal) {
      const rect = modal.getBoundingClientRect()
      const pointerIsInsideModal =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
      if (pointerIsInsideModal) return
    }

    // Temporarily take the overlay out of hit-testing so we can discover the
    // actual compartment underneath the cursor. It is restored immediately.
    const previousVisibility = backdrop.style.visibility
    backdrop.style.visibility = 'hidden'
    const elementBelowPointer = document.elementFromPoint(event.clientX, event.clientY)
    backdrop.style.visibility = previousVisibility

    const target = elementBelowPointer?.closest('[data-drop-storage]')
    if (!target) {
      // No valid destination: leave the inventory unchanged. dragend restores
      // the popup, and the item remains in its original compartment.
      return
    }

    const storage = target.dataset.dropStorage
    const storageZone = target.dataset.dropZone || null
    if (!storage) return

    // Close the popup only after a valid storage destination has been found.
    selectedCompartment.value = null
    dropOnArea({ storage, storageZone, targetElement: target }, event)
  }

  async function dropOnArea(area, event, onSuccess) {
    event.preventDefault()
    if (shiftingFood.value || actionPending.value) return
    const itemId = event.dataTransfer?.getData('text/plain') || draggedItemId.value
    const item = items.value.find((food) => food.id === String(itemId))
    if (!item) {
      finishDrag()
      return
    }
    // Resolve both fields from the exact destination zone so they cannot drift
    // apart when an item is moved between fridge, freezer and pantry.
    // All three visual rows belong to the same shelves location.
    const requestedZone = area.storageZone
    const storageZone = storageForZone(requestedZone) ? requestedZone : defaultZoneFor(area.storage)
    const storage = storageForZone(storageZone) || area.storage
    const group = selectedFoodsFor(item).filter(
      (food) => food.storage !== storage || food.storageZone !== storageZone,
    )
    const origins = foodTransfer.capture(group, event)
    if (draggingFromModal.value) selectedCompartment.value = null
    finishDrag()
    if (!group.length) return
    errorMessage.value = ''
    shiftingFood.value = true
    if (onSuccess) actionPending.value = true
    try {
      const destination = { storage, storageZone }
      const succeeded = await saveFoodGroup(group, 'PATCH', destination)
      if (succeeded.size) showStorage(storage)
      await foodTransfer.play(origins, succeeded, locationLabel({ storage, storageZone }))
      if (succeeded.size) onSuccess?.()
    } finally {
      shiftingFood.value = false
      if (onSuccess) actionPending.value = false
      finishDrag()
    }
  }

  async function dropOnAction(action, event) {
    event.preventDefault()
    if (action === 'pantry' || action === 'fridge') {
      const requestId = ++actionReactionRequestId
      await dropOnArea(
        { storage: action, storageZone: action === 'fridge' ? 'middle-shelf' : 'dry-storage' },
        event,
        () => triggerActionReaction(action, requestId),
      )
      return
    }
    const transferredId = event.dataTransfer?.getData('text/plain')
    const itemId = transferredId || draggedItemId.value
    if (!itemId) {
      finishDrag()
      return
    }
    const item = items.value.find((food) => food.id === String(itemId))
    if (!item) {
      finishDrag()
      return
    }
    const droppedInsideDialog = Boolean(event.currentTarget.closest('.inventory-modal'))
    if (draggingFromModal.value && !droppedInsideDialog) selectedCompartment.value = null
    // Keep the targets visible while quantity confirmation and saving are in progress.
    actionPending.value = true
    finishDrag()
    const reactionTarget = droppedInsideDialog ? `modal-${action}` : action
    const reactionRequestId = ++actionReactionRequestId
    const reactAfterSuccess = () => triggerActionReaction(reactionTarget, reactionRequestId)
    try {
      if (action === 'consume') await consumeItem(item, reactAfterSuccess)
      else await discardItem(item, reactAfterSuccess)
    } finally {
      actionPending.value = false
    }
  }

  function triggerActionReaction(action, requestId) {
    // Ignore a late API response if the user has already opened or changed storage.
    if (requestId !== actionReactionRequestId) return

    // Removing and restoring the class lets consecutive drops replay the shake.
    clearTimeout(actionReactionTimer)
    actionReaction.value = ''
    nextTick(() => {
      if (requestId !== actionReactionRequestId) return
      actionReaction.value = action
      // Fallback cleanup prevents a later dialog from inheriting a stale shake
      // if the browser skips animationend while its original target is removed.
      actionReactionTimer = setTimeout(clearActionReaction, 900)
    })
  }

  function clearActionReaction() {
    clearTimeout(actionReactionTimer)
    actionReactionTimer = null
    actionReaction.value = ''
  }

  function cancelActionReaction() {
    // Invalidate callbacks that are still waiting for the consume/discard API call.
    actionReactionRequestId += 1
    clearActionReaction()
  }

  onBeforeUnmount(cancelActionReaction)

  return {
    draggedItemId,
    storageAction,
    dragPosition,
    dragAnchor,
    dragPlacement,
    windowWidth,
    draggedFood,
    draggingOutsideModal,
    actionReaction,
    setStageEmojiDragImage,
    startDrag,
    holdFood,
    moveHeldFood,
    releaseHeldFood,
    startModalDrag,
    updateModalDragVisibility,
    finishDrag,
    dropFromModalBackdrop,
    dropOnArea,
    dropOnAction,
    cancelActionReaction,
  }
}
