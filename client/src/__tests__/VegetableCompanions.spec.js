import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import VegetableCompanions from '../components/analytics/VegetableCompanions.vue'
import { vegetableMessages, vegetableMood } from '../utils/analyticsMascots.js'

const events = (consumed, discarded) => [
  { action: 'consumed', weightKg: consumed },
  { action: 'discarded', weightKg: discarded },
]

describe('vegetable companions', () => {
  it.each([
    [0, 0, 'smiling'], [2, 1, 'happy'], [1.5, 1, 'smiling'],
    [1, 1, 'smiling'], [1, 1.5, 'sad'], [1, 2, 'crying'], [0, 1, 'crying'],
  ])('uses weight thresholds for %s kg consumed and %s kg discarded', (consumed, discarded, expression) => {
    expect(vegetableMood(events(consumed, discarded)).expression).toBe(expression)
  })

  it('does not treat shared or rescued food as consumed', () => {
    expect(vegetableMood([...events(1, 3), { action: 'shared', weightKg: 20 }]).expression).toBe('crying')
  })

  it('uses mood-specific messages without repeats and dismisses them after six seconds', async () => {
    vi.useFakeTimers()
    const wrapper = mount(VegetableCompanions, { props: { events: events(1, 2) } })
    try {
      const button = wrapper.get('.vegetable-button')
      await button.trigger('click')
      const first = wrapper.get('.companion-speech span').text()
      expect(vegetableMessages.crying).toContain(first)
      await button.trigger('click')
      expect(wrapper.get('.companion-speech span').text()).not.toBe(first)
      await vi.advanceTimersByTimeAsync(6000)
      expect(wrapper.text()).toBe('')
      await button.trigger('click')
      await wrapper.setProps({ events: events(4, 1) })
      expect(wrapper.text()).toBe('')
      await button.trigger('click')
      expect(vegetableMessages.happy).toContain(wrapper.get('.companion-speech span').text())
    } finally {
      wrapper.unmount()
      expect(vi.getTimerCount()).toBe(0)
      vi.useRealTimers()
    }
  })

  it('shows three vegetables and the egg mascot with messages only after clicks', async () => {
    const wrapper = mount(VegetableCompanions, { props: { events: events(3, 1) } })
    const buttons = wrapper.findAll('.vegetable-button')
    expect(buttons).toHaveLength(4)
    expect(buttons[3].attributes('aria-label')).toContain('Egg mascot')
    expect(wrapper.text()).toBe('')
    for (const button of buttons) {
      await button.trigger('click')
      expect(button.classes()).toContain('reacting')
      expect(button.classes()).not.toContain('gloomy')
      expect(button.attributes('title')).toBeUndefined()
    }
    expect(wrapper.findAll('.companion-speech span')).toHaveLength(1)
    await buttons[0].trigger('animationend')
    expect(buttons[0].classes()).not.toContain('reacting')
    await wrapper.setProps({ events: events(1, 1.5) })
    await buttons[3].trigger('click')
    expect(buttons[3].classes()).toContain('gloomy')
    expect(buttons[3].classes()).toContain('reacting')
    expect(buttons[3].attributes('aria-label')).toContain('sad')
    expect(vegetableMessages.sad).toContain(wrapper.get('.companion-speech span').text())
    await buttons[3].trigger('keydown', { key: 'Escape' })
    expect(wrapper.text()).toBe('')
    wrapper.unmount()
  })
})

