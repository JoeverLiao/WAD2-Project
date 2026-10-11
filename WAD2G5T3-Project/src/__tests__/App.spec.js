import { describe, it, expect } from 'vitest'

import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createPinia } from 'pinia'
import App from '../App.vue'
import { routes } from '../router'

describe('App', () => {
  it('renders an empty home page with routes to every feature', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    await router.push('/')
    await router.isReady()
    const wrapper = mount(App, { global: { plugins: [createPinia(), router] } })

    // Wait for async onMounted hooks in Navbar
    await flushPromises()

    expect(wrapper.get('main').text()).toBe('')
    expect(wrapper.get('main section').attributes('aria-label')).toBe('Home')

    const links = wrapper.findAll('nav a')
    expect(links).toHaveLength(10)
    for (const link of links) {
      await router.push(link.attributes('href'))
      await flushPromises()
      expect(wrapper.get('main section').attributes('aria-label')).toBe(link.text())
    }

    await router.push('/unknown-page')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/')
    expect(wrapper.get('main').text()).toBe('')
    wrapper.unmount()
  })
})
