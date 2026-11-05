import { describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
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
    const wrapper = mount(VegetableCompanions, { props: { events: events(1, 2) }, global: { stubs: { Teleport: true } } })
    try {
      const button = wrapper.get('.vegetable-button')
      await button.trigger('click')
      const first = wrapper.get('.speech-message').text()
      expect(vegetableMessages.crying).toContain(first)
      await button.trigger('click')
      expect(wrapper.get('.speech-message').text()).not.toBe(first)
      await vi.advanceTimersByTimeAsync(6000)
      expect(wrapper.find('.speech-message').exists()).toBe(false)
      await button.trigger('click')
      await wrapper.setProps({ events: events(4, 1) })
      expect(wrapper.find('.speech-message').exists()).toBe(false)
      await button.trigger('click')
      expect(vegetableMessages.happy).toContain(wrapper.get('.speech-message').text())
    } finally {
      wrapper.unmount()
      expect(vi.getTimerCount()).toBe(0)
      vi.useRealTimers()
    }
  })

  it('shows only the egg, animates its mood, and dismisses speech when the message is clicked', async () => {
    const wrapper = mount(VegetableCompanions, { props: { events: events(3, 1) }, global: { stubs: { Teleport: true } } })
    try {
      const buttons = wrapper.findAll('.vegetable-button')
      expect(buttons).toHaveLength(1)
      const button = () => wrapper.get('.vegetable-button')
      expect(button().attributes('aria-label')).toContain('Egg mascot')
      expect(wrapper.find('.speech-message').exists()).toBe(false)
      await button().trigger('click')
      await flushPromises()
      expect(button().classes()).toContain('reacting')
      expect(button().classes()).not.toContain('gloomy')
      expect(button().attributes('title')).toBeUndefined()
      expect(wrapper.findAll('.speech-message')).toHaveLength(1)
      await button().trigger('animationend')
      expect(button().classes()).not.toContain('reacting')
      await wrapper.setProps({ events: events(1, 1.5) })
      await button().trigger('click')
      await flushPromises()
      expect(button().classes()).toContain('gloomy')
      expect(button().classes()).toContain('reacting')
      expect(button().attributes('aria-label')).toContain('sad')
      expect(vegetableMessages.sad).toContain(wrapper.get('.speech-message').text())
      await wrapper.get('.speech-message').trigger('click')
      expect(wrapper.find('.speech-message').exists()).toBe(false)
    } finally {
      wrapper.unmount()
    }
  })
})

