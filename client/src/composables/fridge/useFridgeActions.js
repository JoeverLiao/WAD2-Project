import { saveInventoryItem, deleteInventoryItem } from '../../services/inventory.js'
import { nextTick } from 'vue'
import { prepareItemForApi, locationLabel, amountLabel } from '../../utils/inventoryModel.js'
import { showPrompt, showConfirm } from '../../utils/dialog.js'

// Actions behavior shared by the full page and dashboard fridge.
export function useFridgeActions({
  saving,
  errorMessage,
  editingItem,
  foodTransfer,
  items,
  closeForm,
  showMovedStorageAdvice,
  selectedCompartment,
  showStorage,
  selectedFoodsFor,
  dialogRef,
  actionPending,
  shiftingFood,
  cardActionPending,
  selectedFoodIds,
  storageOptions,
}) {
  async function saveItem(formData) {
    // Avoid duplicate submissions if the user clicks Save repeatedly.
    if (saving.value) return

    saving.value = true
    errorMessage.value = ''

    const originalItem = editingItem.value
    const isEditing = Boolean(originalItem)
    const itemId = originalItem?.id
    const payload = prepareItemForApi(formData)
    const origins = originalItem ? foodTransfer.capture([originalItem]) : []

    try {
      const savedItem = await saveInventoryItem(itemId, payload)

      if (isEditing) {
        // Replace the old version with the version returned by MongoDB.
        items.value = items.value.map((item) => (item.id === String(itemId) ? savedItem : item))
      } else {
        // Show a newly created item at the top of the inventory.
        items.value = [savedItem, ...items.value]
      }

      closeForm()
      if (
        originalItem &&
        (originalItem.storage !== savedItem.storage ||
          originalItem.storageZone !== savedItem.storageZone)
      ) {
        showMovedStorageAdvice([savedItem])
        selectedCompartment.value = null
        showStorage(savedItem.storage)
        await foodTransfer.play(origins, new Set([savedItem.id]), locationLabel(savedItem))
      }
    } catch (error) {
      console.error('Failed to save inventory item:', error)
      errorMessage.value =
        error.message || 'Unable to save this food item. Please check the backend and try again.'
    } finally {
      saving.value = false
    }
  }

  async function changeFoodQuantity(item, action, onAnimationSuccess) {
    const group = selectedFoodsFor(item)
    if (group.length > 1) return changeSelectedFoods(group, action, onAnimationSuccess)
    const isWeight = !(Number(item.quantity) > 0)
    const current = Number(isWeight ? item.weightKg : item.quantity)
    const unit = isWeight ? 'kg' : item.unit
    if (!Number.isFinite(current) || current <= 0) {
      errorMessage.value = `${item.name} has no quantity or weight recorded.`
      return
    }
    const input =
      isWeight || current > 1
        ? await showPrompt({
            title: `How many ${unit} of ${item.name} would you like to ${action}?`,
            message: isWeight
              ? `Current weight: ${current} kg`
              : `Current quantity: ${item.quantity}`,
            label: isWeight ? 'Amount (kg)' : `Quantity (${unit})`,
            defaultValue: String(current),
            inputMode: 'decimal',
            confirmLabel: action === 'consume' ? 'Consume' : 'Continue',
            validate: (value) => {
              const amount = Number(value)
              return !Number.isFinite(amount) || amount <= 0 || amount > current
                ? `Please enter an amount greater than 0 and no more than ${current}${isWeight ? ' kg' : ''}.`
                : ''
            },
          })
        : String(current)
    if (input === null) return
    const amount = Number(input)
    const remainingQuantity = Math.max(0, current - amount)
    if (!isWeight && action === 'discard' && current > 1) {
      const confirmed = await showConfirm({
        title:
          remainingQuantity === 0
            ? `Discard all ${item.name}?`
            : `Discard ${amount} ${unit} of ${item.name}?`,
        message:
          remainingQuantity === 0
            ? 'This will remove it from your inventory.'
            : `${remainingQuantity} will remain.`,
        confirmLabel: 'Discard',
        danger: true,
      })
      if (!confirmed) return
    }
    errorMessage.value = ''
    try {
      const activity = action === 'consume' ? 'consumed' : 'discarded'
      if (remainingQuantity === 0) {
        await deleteInventoryItem(item.id, { activity })
        items.value = items.value.filter((food) => food.id !== item.id)
        await nextTick()
        if (selectedCompartment.value) dialogRef.value?.focus()
      } else {
        const saved = await saveInventoryItem(item.id, { activity, amount })
        items.value = items.value.map((food) => (food.id === item.id ? saved : food))
      }
      onAnimationSuccess?.({
        amount,
        originalQuantity: current,
        remainingQuantity,
        proportion: amount / current,
      })
    } catch (error) {
      errorMessage.value = error.message || `Unable to ${action} ${item.name}. Please try again.`
    }
  }

  function consumeItem(item, onAnimationSuccess) {
    return changeFoodQuantity(item, 'consume', onAnimationSuccess)
  }

  function discardItem(item, onAnimationSuccess) {
    return changeFoodQuantity(item, 'discard', onAnimationSuccess)
  }

  async function runCardAction(item, action) {
    if (actionPending.value || shiftingFood.value || saving.value) return
    cardActionPending.value = true
    actionPending.value = true
    try {
      await changeFoodQuantity(item, action)
    } finally {
      actionPending.value = false
      cardActionPending.value = false
    }
  }

  async function removeItem(item) {
    // Ask before deleting, so a click does not immediately remove food.
    const confirmed = await showConfirm({
      title: `Remove ${item.name}?`,
      message: 'Are you sure you want to remove this item from your inventory?',
      confirmLabel: 'Remove',
      danger: true,
    })
    if (!confirmed) return

    errorMessage.value = ''

    try {
      await deleteInventoryItem(item.id)

      // Only update the screen after the backend confirms deletion.
      items.value = items.value.filter((existingItem) => existingItem.id !== item.id)
      await nextTick()
      if (selectedCompartment.value) dialogRef.value?.focus()
    } catch (error) {
      console.error('Failed to remove inventory item:', error)
      errorMessage.value = `Unable to remove ${item.name}. Please try again.`
    }
  }

  async function saveFoodGroup(group, method, payload) {
    const results = await Promise.allSettled(
      group.map(async (item) => {
        const itemPayload = typeof payload === 'function' ? payload(item) : payload
        if (method === 'DELETE') {
          await deleteInventoryItem(item.id, itemPayload)
          return item
        }
        return saveInventoryItem(item.id, itemPayload)
      }),
    )
    const succeeded = new Set()
    const updates = new Map()
    results.forEach((result, index) => {
      if (result.status !== 'fulfilled') return
      const id = group[index].id
      succeeded.add(id)
      updates.set(id, result.value)
    })
    // Commit successful updates together; keep failures selected for retry.
    if (succeeded.size)
      items.value =
        method === 'DELETE'
          ? items.value.filter((item) => !succeeded.has(item.id))
          : items.value.map((item) => updates.get(item.id) || item)
    if (method === 'PATCH') {
      const moved = group
        .filter((item) => {
          const updated = updates.get(item.id)
          return (
            updated &&
            (updated.storage !== item.storage || updated.storageZone !== item.storageZone)
          )
        })
        .map((item) => updates.get(item.id))
      if (moved.length) showMovedStorageAdvice(moved)
    }
    selectedFoodIds.value = new Set([...selectedFoodIds.value].filter((id) => !succeeded.has(id)))
    const failed = results.filter((result) => result.status === 'rejected').length
    if (failed)
      errorMessage.value = `${failed} food item(s) could not be updated. They remain selected; please try again.`
    return succeeded
  }

  function otherStorageOptions(item) {
    const type = item.storage === 'pantry' ? 'pantry' : 'fridge'
    return storageOptions.value.filter((option) => option.type !== type)
  }

  async function moveToStorage({ item, destination }) {
    if (shiftingFood.value || actionPending.value || saving.value) return
    if (
      !otherStorageOptions(item).some(
        (option) => option.type === destination.type && option.name === destination.name,
      )
    )
      return
    const payload = {
      storage: destination.type,
      storageZone: destination.type === 'pantry' ? 'dry-storage' : 'middle-shelf',
    }
    errorMessage.value = ''
    shiftingFood.value = true
    try {
      await saveFoodGroup([item], 'PATCH', payload)
    } finally {
      shiftingFood.value = false
    }
  }

  async function changeSelectedFoods(group, action, onAnimationSuccess) {
    const confirmed = await showConfirm({
      title: `${action === 'consume' ? 'Consume' : 'Discard'} ${group.length} selected foods?`,
      message: `This uses the full amount of each selected food: ${group.map((item) => `${item.name} (${amountLabel(item)})`).join(', ')}.`,
      confirmLabel: action === 'consume' ? 'Consume all' : 'Discard all',
      danger: action === 'discard',
    })
    if (!confirmed) return
    errorMessage.value = ''
    actionPending.value = true
    try {
      const succeeded = await saveFoodGroup(group, 'DELETE', {
        activity: action === 'consume' ? 'consumed' : 'discarded',
      })
      if (succeeded.size && typeof onAnimationSuccess === 'function')
        onAnimationSuccess({ proportion: 1 })
    } finally {
      actionPending.value = false
    }
  }

  return {
    saveItem,
    consumeItem,
    discardItem,
    runCardAction,
    removeItem,
    saveFoodGroup,
    otherStorageOptions,
    moveToStorage,
  }
}
