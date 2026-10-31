import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import AppDialog from '../components/AppDialog.vue'
import { activeDialog, dismissDialog, showConfirm, showPrompt } from '../utils/dialog.js'

let wrapper
async function open(show, options) {
  wrapper = mount(AppDialog, { attachTo: document.body })
  const answer = show(options)
  await flushPromises()
  return answer
}

afterEach(() => {
  dismissDialog()
  wrapper?.unmount()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('AppDialog', () => {
  it('renders nothing until a dialog is requested', () => {
    wrapper = mount(AppDialog, { attachTo: document.body })
    expect(wrapper.find('.dialog-panel').exists()).toBe(false)
  })

  it('resolves a confirmation true or false from its buttons', async () => {
    const accepted = open(showConfirm, { title: 'Remove Apples?', message: 'Gone for good.', confirmLabel: 'Remove', danger: true })
    await flushPromises()
    expect(wrapper.get('[role="alertdialog"]').text()).toContain('Gone for good.')
    expect(wrapper.get('.confirm-button').text()).toBe('Remove')
    expect(wrapper.get('.confirm-button').classes()).toContain('danger')
    expect(document.activeElement).toBe(wrapper.get('.confirm-button').element)
    await wrapper.get('form').trigger('submit')
    await expect(accepted).resolves.toBe(true)
    await flushPromises()
    expect(wrapper.find('.dialog-panel').exists()).toBe(false)

    const declined = showConfirm({ title: 'Remove Apples?' })
    await flushPromises()
    await wrapper.get('.cancel-button').trigger('click')
    await expect(declined).resolves.toBe(false)
  })

  it('stays open with an inline error until the prompt value is valid', async () => {
    const validate = (value) => (value === '2' ? '' : 'Too many')
    const answer = open(showPrompt, { title: 'How many?', label: 'Quantity', defaultValue: '3', validate })
    await flushPromises()
    const input = wrapper.get('input')
    expect(input.element.value).toBe('3')
    expect(document.activeElement).toBe(input.element)

    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('.dialog-error').text()).toBe('Too many')
    expect(input.attributes('aria-invalid')).toBe('true')
    expect(activeDialog.value).not.toBeNull()

    await input.setValue('2')
    await wrapper.get('form').trigger('submit')
    await expect(answer).resolves.toBe('2')
  })

  it('cancels from Escape or a backdrop click', async () => {
    const escaped = open(showPrompt, { title: 'How many?', label: 'Quantity' })
    await flushPromises()
    await wrapper.get('.dialog-panel').trigger('keydown', { key: 'Escape' })
    await expect(escaped).resolves.toBeNull()

    const clickedAway = showPrompt({ title: 'How many?', label: 'Quantity' })
    await flushPromises()
    await wrapper.get('.dialog-backdrop').trigger('click')
    await expect(clickedAway).resolves.toBeNull()
  })

  it('keeps Tab inside the dialog and returns focus to the opener', async () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()

    const answer = open(showConfirm, { title: 'Remove Apples?' })
    await flushPromises()
    const confirm = wrapper.get('.confirm-button')
    confirm.element.focus()
    await confirm.trigger('keydown', { key: 'Tab' })
    expect(document.activeElement).toBe(wrapper.get('.cancel-button').element)

    await wrapper.get('.cancel-button').trigger('click')
    await answer
    await flushPromises()
    expect(document.activeElement).toBe(opener)
  })

  it('cancels the open dialog when another one replaces it', async () => {
    const first = open(showConfirm, { title: 'First' })
    await flushPromises()
    const second = showConfirm({ title: 'Second' })
    await expect(first).resolves.toBe(false)
    await flushPromises()
    expect(wrapper.get('h2').text()).toBe('Second')
    dismissDialog()
    await second
  })
})
