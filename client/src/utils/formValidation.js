// Replaces the browser's validation bubbles ("Please fill in this field.") across
// the whole app. Forms keep their required/min/type rules and invalid forms still
// cannot submit; only the message changes, so new forms are covered automatically.
const errorElements = new WeakMap()
let nextErrorId = 0

function messageFor(control) {
  const { validity } = control
  if (validity.valueMissing) return 'This field is required.'
  if (validity.typeMismatch && control.type === 'email') return 'Please enter a valid email address.'
  if (validity.tooShort) return `Please use at least ${control.minLength} characters.`
  if (validity.rangeUnderflow) return `Please enter ${control.min} or more.`
  if (validity.rangeOverflow) return `Please enter ${control.max} or less.`
  if (validity.stepMismatch) return `Please round this to the nearest ${control.step}.`
  return 'Please enter a valid value.'
}

function showError(control) {
  let error = errorElements.get(control)
  if (!error) {
    error = document.createElement('span')
    error.id = `field-error-${++nextErrorId}`
    error.className = 'field-error'
    error.setAttribute('role', 'alert')
    control.after(error)
    control.setAttribute('aria-invalid', 'true')
    control.setAttribute('aria-describedby', error.id)
    errorElements.set(control, error)
  }
  error.textContent = messageFor(control)
}

function clearError(control) {
  errorElements.get(control)?.remove()
  errorElements.delete(control)
  control.removeAttribute('aria-invalid')
  control.removeAttribute('aria-describedby')
}

function clearErrorsIn(container) {
  container.querySelectorAll('[aria-describedby^="field-error-"]').forEach(clearError)
}

function handleInvalid(event) {
  const control = event.target
  // Cancelling the event hides the bubble, but the form still does not submit.
  event.preventDefault()
  showError(control)

  // The browser only moves focus for bubbles it shows itself.
  const invalidControls = [...(control.form?.elements ?? [])].filter(
    (element) => element.willValidate && !element.validity.valid,
  )
  if (invalidControls[0] === control) control.focus()
}

// Keep the message up to date as the user corrects the field.
function handleInput({ target }) {
  if (!errorElements.has(target)) return
  if (target.validity.valid) clearError(target)
  else showError(target)
}

// These events are listened for during capture because invalid and close do not bubble.
export function installFormValidation() {
  document.addEventListener('invalid', handleInvalid, true)
  document.addEventListener('input', handleInput, true)
  document.addEventListener('submit', (event) => clearErrorsIn(event.target), true)
  // <dialog> forms stay in the page when closed, so reopening must start clean.
  document.addEventListener('close', (event) => clearErrorsIn(event.target), true)
}
