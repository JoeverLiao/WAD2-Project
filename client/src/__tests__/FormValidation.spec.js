import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { installFormValidation } from '../utils/formValidation.js'

function renderForm(fields) {
  document.body.innerHTML = `<form>${fields}<button type="submit">Save</button></form>`
  const form = document.querySelector('form')
  const onSubmit = vi.fn((event) => event.preventDefault())
  form.addEventListener('submit', onSubmit)
  return { form, onSubmit }
}
const errorFor = (input) => document.getElementById(input.getAttribute('aria-describedby'))?.textContent

beforeAll(installFormValidation)
afterEach(() => {
  document.body.innerHTML = ''
})

describe('form validation messages', () => {
  it('blocks submission, shows inline errors and focuses the first invalid field', () => {
    const { form, onSubmit } = renderForm('<input id="a" required /><input id="b" type="email" required />')
    const [first, second] = form.querySelectorAll('input')
    form.requestSubmit()

    expect(onSubmit).not.toHaveBeenCalled()
    expect(errorFor(first)).toBe('This field is required.')
    expect(first.nextElementSibling.getAttribute('role')).toBe('alert')
    expect(first.getAttribute('aria-invalid')).toBe('true')
    expect(errorFor(second)).toBe('This field is required.')
    expect(document.activeElement).toBe(first)
  })

  it('cancels the browser bubble', () => {
    const { form } = renderForm('<input required />')
    const event = new Event('invalid', { cancelable: true })
    form.querySelector('input').dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })

  it.each([
    ['<input type="email" value="nope" />', 'Please enter a valid email address.'],
    ['<input type="number" min="2" value="1" />', 'Please enter 2 or more.'],
    ['<input type="number" max="2" value="3" />', 'Please enter 2 or less.'],
  ])('explains the problem for %s', (field, message) => {
    const { form } = renderForm(field)
    form.requestSubmit()
    expect(errorFor(form.querySelector('input'))).toBe(message)
  })

  it('explains a step mismatch once the user has edited the value', () => {
    const { form } = renderForm('<input type="number" step="0.01" />')
    const input = form.querySelector('input')
    input.value = '1.234'
    form.requestSubmit()
    expect(errorFor(input)).toBe('Please round this to the nearest 0.01.')
  })

  it('updates as the user types and clears once valid, then allows submission', () => {
    const { form, onSubmit } = renderForm('<input type="email" required />')
    const input = form.querySelector('input')
    form.requestSubmit()

    input.value = 'sam'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    expect(errorFor(input)).toBe('Please enter a valid email address.')
    expect(document.querySelectorAll('.field-error')).toHaveLength(1)

    input.value = 'sam@example.com'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    expect(document.querySelector('.field-error')).toBeNull()
    expect(input.hasAttribute('aria-invalid')).toBe(false)

    form.requestSubmit()
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('clears errors when a containing dialog closes', () => {
    document.body.innerHTML = '<dialog><form><input required /></form></dialog>'
    document.querySelector('form').requestSubmit()
    expect(document.querySelector('.field-error')).not.toBeNull()
    document.querySelector('dialog').dispatchEvent(new Event('close'))
    expect(document.querySelector('.field-error')).toBeNull()
  })

  it('leaves errors managed by other components alone', () => {
    const { form } = renderForm('<input aria-invalid="true" aria-describedby="app-dialog-error" />')
    form.requestSubmit()
    expect(form.querySelector('input').getAttribute('aria-describedby')).toBe('app-dialog-error')
  })
})
