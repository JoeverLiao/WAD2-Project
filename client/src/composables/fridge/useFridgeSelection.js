import { ref, onMounted, onBeforeUnmount } from 'vue'
import { locationLabel } from '../../utils/inventoryModel.js'

// Selection behavior shared by the full page and dashboard fridge.
export function useFridgeSelection({ shiftingFood, foodTooltip, openCompartment, items }) {
  const selectedFoodIds = ref(new Set())

  const selectionBox = ref(null)

  let selectionGesture = null

  let selectionRoot = null

  let suppressSelectionClick = false

  let selectionClickTimer

  function beginFoodSelection(event) {
    if (event.button !== 0 || event.pointerType === 'touch' || shiftingFood.value) return
    if (event.target.closest('[draggable="true"], input, .fridge-close-button, .primary-button'))
      return
    if (event.target.closest('.fridge-door') && !event.target.closest('.door-bin')) return
    selectionRoot = event.currentTarget
    selectionGesture = {
      x: event.clientX + window.scrollX,
      y: event.clientY + window.scrollY,
      additive: event.ctrlKey || event.metaKey || event.shiftKey,
      previous: new Set(selectedFoodIds.value),
      moved: false,
    }
    // Door shelves should select food without also starting a door gesture.
    event.stopPropagation()
    event.preventDefault()
  }

  function updateFoodSelection(event) {
    if (!selectionGesture) return
    const gesture = selectionGesture
    const x = event.clientX + window.scrollX
    const y = event.clientY + window.scrollY
    if (!gesture.moved && Math.hypot(x - gesture.x, y - gesture.y) < 5) return
    gesture.moved = true
    const box = {
      left: Math.min(x, gesture.x) - window.scrollX,
      top: Math.min(y, gesture.y) - window.scrollY,
      right: Math.max(x, gesture.x) - window.scrollX,
      bottom: Math.max(y, gesture.y) - window.scrollY,
    }
    selectionBox.value = box
    foodTooltip.value = null
    const selected = gesture.additive ? new Set(gesture.previous) : new Set()
    for (const icon of selectionRoot.querySelectorAll('[data-food-id]')) {
      if (icon.closest('[inert]:not([inert="false"])')) continue
      const rect = icon.getBoundingClientRect()
      let visible = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
      for (
        let parent = icon.parentElement;
        parent && parent !== selectionRoot;
        parent = parent.parentElement
      ) {
        const style = getComputedStyle(parent)
        const bounds = parent.getBoundingClientRect()
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
          visible.left = Math.max(visible.left, bounds.left)
          visible.right = Math.min(visible.right, bounds.right)
        }
        if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
          visible.top = Math.max(visible.top, bounds.top)
          visible.bottom = Math.min(visible.bottom, bounds.bottom)
        }
      }
      if (
        visible.right > visible.left &&
        visible.bottom > visible.top &&
        visible.left < box.right &&
        visible.right > box.left &&
        visible.top < box.bottom &&
        visible.bottom > box.top
      )
        selected.add(icon.dataset.foodId)
    }
    selectedFoodIds.value = selected
  }

  function endFoodSelection(event) {
    if (!selectionGesture) return
    if (event?.type === 'pointercancel') selectedFoodIds.value = selectionGesture.previous
    else if (selectionGesture.moved) {
      suppressSelectionClick = true
      clearTimeout(selectionClickTimer)
      selectionClickTimer = setTimeout(() => {
        suppressSelectionClick = false
      }, 0)
    } else if (!selectionGesture.additive) selectedFoodIds.value = new Set()
    selectionGesture = null
    selectionBox.value = null
  }

  function stopSelectionClick(event) {
    if (suppressSelectionClick) {
      event.preventDefault()
      event.stopPropagation()
      suppressSelectionClick = false
      return
    }
    const icon = event.target.closest('[data-food-id]')
    if (!icon || !event.currentTarget.contains(icon)) return
    event.preventDefault()
    event.stopPropagation()
    selectFood(icon.dataset.foodId, event.ctrlKey || event.metaKey || event.shiftKey)
  }

  function selectFood(id, additive) {
    const selected = additive ? new Set(selectedFoodIds.value) : new Set()
    if (additive && selected.has(id)) selected.delete(id)
    else selected.add(id)
    selectedFoodIds.value = selected
  }

  function selectFoodWithKeyboard(event) {
    const icon = event.target.closest('[data-food-id]')
    if (!icon || !['Enter', ' '].includes(event.key)) return
    event.preventDefault()
    event.stopPropagation()
    selectFood(icon.dataset.foodId, event.ctrlKey || event.metaKey || event.shiftKey)
  }

  function openFoodCompartment(event) {
    const icon = event.target.closest('[data-food-id]')
    if (!icon) return
    event.preventDefault()
    event.stopPropagation()
    const area = icon.closest('[data-drop-zone]')
    if (!area) return
    openCompartment({
      id: area.dataset.dropZone,
      zone: area.dataset.dropZone,
      storage: area.dataset.dropStorage,
      title: locationLabel({
        storage: area.dataset.dropStorage,
        storageZone: area.dataset.dropZone,
      }),
    })
  }

  function clearFoodSelection(event) {
    if (event.key === 'Escape') {
      selectedFoodIds.value = new Set()
      selectionGesture = null
      selectionBox.value = null
    }
  }

  onMounted(() => {
    document.addEventListener('pointermove', updateFoodSelection)
    document.addEventListener('pointerup', endFoodSelection)
    document.addEventListener('pointercancel', endFoodSelection)
    document.addEventListener('keydown', clearFoodSelection)
  })

  onBeforeUnmount(() => {
    clearTimeout(selectionClickTimer)
    document.removeEventListener('pointermove', updateFoodSelection)
    document.removeEventListener('pointerup', endFoodSelection)
    document.removeEventListener('pointercancel', endFoodSelection)
    document.removeEventListener('keydown', clearFoodSelection)
  })

  function selectedFoodsFor(item) {
    return selectedFoodIds.value.has(item.id)
      ? items.value.filter((food) => selectedFoodIds.value.has(food.id))
      : [item]
  }

  return {
    selectedFoodIds,
    selectionBox,
    beginFoodSelection,
    stopSelectionClick,
    selectFoodWithKeyboard,
    openFoodCompartment,
    selectedFoodsFor,
  }
}
