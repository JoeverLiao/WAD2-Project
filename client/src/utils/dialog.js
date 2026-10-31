import { shallowRef } from 'vue'

// Styled replacements for window.confirm and window.prompt, rendered by AppDialog.vue.
// Unlike the native dialogs these do not block, so callers must await the result.
export const activeDialog = shallowRef(null)

function openDialog(options) {
  dismissDialog()
  return new Promise((resolve) => {
    activeDialog.value = { ...options, resolve }
  })
}

export function closeDialog(result) {
  activeDialog.value?.resolve(result)
  activeDialog.value = null
}

// Treated the same as pressing Cancel.
export function dismissDialog() {
  closeDialog(null)
}

// Resolves true when confirmed and false when cancelled.
// Options: title, message, confirmLabel, danger.
export async function showConfirm(options) {
  return Boolean(await openDialog({ ...options, kind: 'confirm' }))
}

// Resolves the entered text, or null when cancelled.
// Options: title, message, label, defaultValue, inputMode, confirmLabel, and
// validate, which returns an error to show while keeping the dialog open.
export function showPrompt(options) {
  return openDialog({ ...options, kind: 'prompt' })
}
