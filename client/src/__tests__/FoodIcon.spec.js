import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import FoodIcon from '../components/FoodIcon.vue'
import manifest from '../icons/manifest.json'
import { iconConfig } from '../icons/config.js'
import { flushIconRequests, resetIconResolver } from '../icons/iconResolver.js'

const YELLOW = manifest.palette.yellow.toUpperCase()
const entry = (id) => manifest.icons.find((icon) => icon.id === id)

afterEach(() => resetIconResolver())

describe('FoodIcon', () => {
  it('shows a loading placeholder, then the chosen icon in the chosen colour', async () => {
    resetIconResolver({ request: async (names) => names.map((input) => ({ input, icon: 'banana', color: YELLOW })) })
    const wrapper = mount(FoodIcon, { props: { name: 'Banana' } })
    expect(wrapper.find('[data-food-icon-loading]').exists()).toBe(true)

    await flushIconRequests()
    await flushPromises()
    const icon = wrapper.find('.food-icon')
    expect(icon.attributes('data-food-icon')).toBe('banana')
    expect(icon.attributes('data-food-color')).toBe(YELLOW)
    expect(icon.attributes('style')).toContain('color:')
    expect(icon.find('svg .food-shape').attributes('fill')).toBe('currentColor')
  })

  it('reads the name from an item', async () => {
    resetIconResolver({ request: async (names) => names.map((input) => ({ input, icon: 'egg', color: YELLOW })) })
    const wrapper = mount(FoodIcon, { props: { item: { name: 'Eggs', quantity: 6 } } })
    await flushIconRequests()
    await flushPromises()
    expect(wrapper.find('.food-icon').attributes('data-food-icon')).toBe('egg')
  })

  it('shows the fallback icon and colour when no answer is available', () => {
    const wrapper = mount(FoodIcon, { props: { name: 'Apple' } }) // requests are off in tests by default
    const icon = wrapper.find('.food-icon')
    expect(icon.attributes('data-food-icon')).toBe(manifest.fallbackIcon)
    expect(icon.attributes('data-food-color')).toBe(iconConfig.fallbackColor)
    expect(icon.find('svg').exists()).toBe(true)
  })

  it('draws a manifest icon directly with kind, in its own colour unless color is given', () => {
    const ice = mount(FoodIcon, { props: { kind: 'ice' } }).find('.food-icon')
    expect(ice.attributes('data-food-icon')).toBe('ice')
    expect(ice.attributes('data-food-color')).toBe(entry('ice').color)

    const recoloured = mount(FoodIcon, { props: { kind: 'ice', color: '#000000' } }).find('.food-icon')
    expect(recoloured.attributes('data-food-color')).toBe('#000000')
  })

  it('treats an unknown kind as a food name', () => {
    const wrapper = mount(FoodIcon, { props: { kind: 'bowl' } })
    expect(wrapper.find('.food-icon').attributes('data-food-icon')).toBe(manifest.fallbackIcon)
  })
})
