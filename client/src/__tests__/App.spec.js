import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'

import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import App from '../App.vue'
import { authGuard, routes } from '../router'
import { activeDialog, showConfirm } from '../utils/dialog.js'

function mockSession(user) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      user
        ? new Response(JSON.stringify(user), { status: 200 })
        : new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401 }),
    ),
  )
}

async function mountApp(path) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createRouter({ history: createMemoryHistory(), routes })
  router.beforeEach(authGuard)
  await router.push(path)
  await router.isReady()
  const wrapper = mount(App, {
    global: { plugins: [pinia, router], stubs: { RouterView: true } },
  })
  await flushPromises()
  return { router, wrapper }
}

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('App', () => {
  it('cancels an open dialog when the route changes', async () => {
    mockSession(null)
    const { router } = await mountApp('/analytics')
    const answer = showConfirm({ title: 'Remove Apples?' })

    await router.push('/')

    await expect(answer).resolves.toBe(false)
    expect(activeDialog.value).toBeNull()
  })

  it('keeps the full navbar and shows a login prompt on protected pages for guests', async () => {
    mockSession(null)
    const { router, wrapper } = await mountApp('/analytics')

    expect(router.currentRoute.value.name).toBe('analytics')
    expect(wrapper.findAll('nav .orbit-option')).toHaveLength(8)
    expect(
      wrapper.get('button[aria-controls="radial-navigation"]').attributes('aria-expanded'),
    ).toBe('false')
    expect(wrapper.get('main').text()).toContain('Please login to access your Food Waste Analytics')
    expect(wrapper.get('main a').attributes('href')).toBe('/login?redirect=/analytics')

    await router.push('/login')
    await flushPromises()
    expect(wrapper.find('.login-prompt').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows protected pages to signed-in users', async () => {
    mockSession({ id: '1', username: 'demo', email: 'demo@example.com' })
    const { wrapper } = await mountApp('/analytics')

    expect(wrapper.find('.login-prompt').exists()).toBe(false)
    expect(wrapper.findAll('nav .orbit-option')).toHaveLength(8)
    wrapper.unmount()
  })
})
