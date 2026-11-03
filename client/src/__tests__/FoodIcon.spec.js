import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import FoodIcon from '../components/FoodIcon.vue'
import NoticeIcon from '../components/NoticeIcon.vue'
import { DEFAULT_FOOD_ICON, FOOD_ICON_GROUPS, FOOD_ICONS } from '../utils/foodIcons.js'
import { foodIconFor, foodIconForEmoji, resolveFoodIcon } from '../utils/foodIconMap.js'
import { CATEGORIES } from '../utils/inventoryOptions.js'

describe('food icon library', () => {
  it('gives every icon artwork, a label, a known group and one colour', () => {
    const groups = FOOD_ICON_GROUPS.map((g) => g.id)
    const incomplete = Object.entries(FOOD_ICONS)
      .filter(([, icon]) => !icon.shape || !icon.detail || !icon.label || !groups.includes(icon.group) || !/^#[0-9A-F]{6}$/i.test(icon.color))
      .map(([id]) => id)
    expect(incomplete).toEqual([])
  })

  it('covers every group the app needs', () => {
    const empty = FOOD_ICON_GROUPS.filter((group) => !Object.values(FOOD_ICONS).some((icon) => icon.group === group.id))
    expect(empty).toEqual([])
  })

  it('has a library icon for every emoji an item can be saved with', () => {
    const missing = CATEGORIES.flatMap((category) => category.icons).filter((emoji) => foodIconForEmoji(emoji) === null)
    expect(missing).toEqual([])
  })
})

describe('choosing a food icon', () => {
  it.each([
    ['Full cream milk', 'milk'],
    ['Cream cheese', 'cheese'],
    ['Orange juice', 'juice'],
    ['Oranges', 'orange'],
    ['Tomato sauce', 'jar'],
    ['Garden tomatoes', 'tomato'],
    ['Greek yoghurt', 'yoghurt'],
    ['Fresh pesto', 'jar'],
    ['Organic veggie box', 'leafy'],
    ['Extra sourdough', 'bread'],
    ['Banana bread', 'bread'],
    ['Pineapple chunks', 'pineapple'],
    ['Pink Lady apples', 'apple'],
    ['Sweet potato', 'sweetPotato'],
    ['Goat cheese', 'cheese'],
    ['Boiled eggs', 'egg'],
    ['Eggplant', 'eggplant'],
    ['Watermelon', 'watermelon'],
    ['Steak', 'steak'],
    ['Vanilla ice cream', 'iceCream'],
    ['Salmon fillet', 'fish'],
    ['Fish sauce', 'jar'],
  ])('matches %s to %s', (name, id) => {
    expect(foodIconFor(name)).toBe(id)
  })

  it('uses the name first, so the same food always gets the same icon', () => {
    expect(resolveFoodIcon({ name: 'Milk', icon: '🧀', category: 'dairy' })).toBe('milk')
    expect(resolveFoodIcon({ name: 'Milk', icon: '🥛', category: 'other' })).toBe('milk')
  })

  it('falls back to the stored emoji, then the category, then the default', () => {
    expect(resolveFoodIcon({ name: 'Zorblax', icon: '🍓', category: 'fruit' })).toBe('strawberry')
    expect(resolveFoodIcon({ name: 'Zorblax', icon: '🌶️' })).toBe('chilli')
    expect(resolveFoodIcon({ name: 'Zorblax', category: 'seafood' })).toBe('fish')
    expect(resolveFoodIcon({ name: 'Zorblax' })).toBe(DEFAULT_FOOD_ICON)
    expect(resolveFoodIcon()).toBe(DEFAULT_FOOD_ICON)
    expect(foodIconFor('')).toBe(DEFAULT_FOOD_ICON)
  })
})

describe('FoodIcon', () => {
  it('draws the resolved icon for an item, hidden from screen readers', () => {
    const wrapper = mount(FoodIcon, { props: { item: { name: 'Bananas', icon: '🍎', category: 'fruit' } } })
    expect(wrapper.attributes('data-food-icon')).toBe('banana')
    // Drawn with the one fruit shape, in the banana's own colour.
    expect(wrapper.get('.food-shape').attributes('d')).toBe(FOOD_ICONS.avocado.shape)
    expect(wrapper.get('.food-shape').attributes('fill')).toBe(FOOD_ICONS.banana.color)
    expect(wrapper.attributes('aria-hidden')).toBe('true')
  })

  it('accepts a plain name or a chosen icon id', () => {
    expect(mount(FoodIcon, { props: { food: 'Sourdough' } }).attributes('data-food-icon')).toBe('bread')
    expect(mount(FoodIcon, { props: { kind: 'can' } }).attributes('data-food-icon')).toBe('can')
    expect(mount(FoodIcon, { props: { kind: 'not-an-icon', food: 'Kiwi' } }).attributes('data-food-icon')).toBe('kiwi')
  })

  it('lets a colour replace the icon colour without changing its shape', () => {
    const wrapper = mount(FoodIcon, { props: { food: 'Apple', color: '#123456' } })
    expect(wrapper.get('.food-shape').attributes('fill')).toBe('#123456')
    expect(wrapper.get('.food-shape').attributes('d')).toBe(FOOD_ICONS.avocado.shape)
  })
})

describe('NoticeIcon', () => {
  it('renders in the current text colour', () => {
    const bell = mount(NoticeIcon, { props: { name: 'bell' } })
    expect(bell.attributes('stroke')).toBe('currentColor')
    expect(bell.get('path').attributes('d')).toBeTruthy()
  })
})
