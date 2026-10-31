<script setup>
import { nextTick, ref, watch } from 'vue'
import { activeDialog, closeDialog, dismissDialog } from '../utils/dialog.js'

const panel = ref(null)
const inputValue = ref('')
const errorMessage = ref('')
let returnFocusElement = null

watch(activeDialog, async (dialog, previousDialog) => {
  if (!dialog) {
    returnFocusElement?.focus?.()
    returnFocusElement = null
    return
  }

  if (!previousDialog) returnFocusElement = document.activeElement
  inputValue.value = dialog.defaultValue ?? ''
  errorMessage.value = ''

  await nextTick()
  const firstControl = panel.value?.querySelector('input, .confirm-button')
  firstControl?.focus()
  firstControl?.select?.()
})

function submit() {
  const dialog = activeDialog.value
  if (dialog.kind === 'confirm') {
    closeDialog(true)
    return
  }

  const error = dialog.validate?.(inputValue.value)
  if (error) {
    errorMessage.value = error
    return
  }
  closeDialog(inputValue.value)
}

// Escape cancels, and Tab/Shift+Tab cycle through the dialog's controls.
function handleKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault()
    dismissDialog()
    return
  }

  if (event.key !== 'Tab') return
  const focusable = [...panel.value.querySelectorAll('button, input')]
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
</script>

<template>
  <div v-if="activeDialog" class="dialog-backdrop" @click.self="dismissDialog">
    <section
      ref="panel"
      class="dialog-panel"
      :role="activeDialog.kind === 'confirm' ? 'alertdialog' : 'dialog'"
      aria-modal="true"
      aria-labelledby="app-dialog-title"
      :aria-describedby="activeDialog.message ? 'app-dialog-message' : undefined"
      tabindex="-1"
      @keydown="handleKeydown"
    >
      <h2 id="app-dialog-title">{{ activeDialog.title }}</h2>
      <p v-if="activeDialog.message" id="app-dialog-message" class="dialog-message">
        {{ activeDialog.message }}
      </p>

      <!-- novalidate keeps the browser's own validation bubbles from appearing. -->
      <form novalidate @submit.prevent="submit">
        <div v-if="activeDialog.kind === 'prompt'" class="dialog-field">
          <label for="app-dialog-input">{{ activeDialog.label }}</label>
          <input
            id="app-dialog-input"
            v-model="inputValue"
            type="text"
            autocomplete="off"
            :inputmode="activeDialog.inputMode"
            :aria-invalid="Boolean(errorMessage)"
            :aria-describedby="errorMessage ? 'app-dialog-error' : undefined"
          />
          <p v-if="errorMessage" id="app-dialog-error" class="dialog-error" role="alert">
            {{ errorMessage }}
          </p>
        </div>

        <footer class="dialog-actions">
          <button type="button" class="cancel-button" @click="dismissDialog">Cancel</button>
          <button
            type="submit"
            class="confirm-button"
            :class="{ danger: activeDialog.danger }"
          >
            {{ activeDialog.confirmLabel || 'OK' }}
          </button>
        </footer>
      </form>
    </section>
  </div>
</template>

<style scoped>
/* Sits above the fridge's modals, food form, drag dock and held food. */
.dialog-backdrop {
  position: fixed;
  z-index: 3100;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow-y: auto;
  padding: 20px;
  background: rgb(18 35 27 / 58%);
  backdrop-filter: blur(4px);
}

.dialog-panel {
  width: 100%;
  max-width: 440px;
  padding: 25px;
  border: 2px solid var(--ink);
  border-radius: 17px;
  background: var(--paper);
  box-shadow: var(--shadow-paper), 0 20px 60px rgb(0 0 0 / 20%);
  color: var(--ink);
  font-family: var(--font-sans);
}

.dialog-panel:focus {
  outline: none;
}

.dialog-panel h2 {
  margin: 0;
  overflow-wrap: anywhere;
  font-family: var(--font-display);
  font-size: 27px;
}

.dialog-message {
  margin: 10px 0 0;
  color: var(--muted);
  font-size: 18px;
}

.dialog-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 18px;
}

.dialog-field label {
  font-size: 16px;
  font-weight: 700;
}

.dialog-field input {
  width: 100%;
  min-height: 43px;
  padding: 10px 12px;
  border: 2px solid #b8d1c9;
  border-radius: 8px;
  outline: none;
  background: var(--paper-bright);
  color: var(--ink);
  font-size: 17px;
}

.dialog-field input:focus {
  border-color: var(--aqua);
  box-shadow: 0 0 0 3px rgb(15 168 156 / 16%);
}

.dialog-error {
  margin: 0;
  color: #b5382a;
  font-size: 16px;
}

.dialog-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 22px;
  padding-top: 18px;
  border-top: 2px dashed #b8d1c9;
}

.cancel-button,
.confirm-button {
  padding: 11px 17px;
  border: 2px solid var(--ink);
  border-radius: 9px;
  box-shadow: 2px 3px 0 var(--ink);
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
}

.cancel-button {
  background: var(--paper-bright);
  color: var(--ink);
}

.confirm-button {
  background: var(--aqua);
  color: white;
}

.confirm-button:hover {
  background: #087d73;
}

.confirm-button.danger {
  background: var(--coral);
  color: var(--ink);
}

.confirm-button.danger:hover {
  background: #ff7f6e;
}

.dialog-panel button:focus-visible,
.dialog-panel input:focus-visible {
  outline: 3px solid #f0b93d;
  outline-offset: 2px;
}
</style>
