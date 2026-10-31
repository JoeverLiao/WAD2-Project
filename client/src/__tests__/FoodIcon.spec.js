import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import FoodIcon from '../components/FoodIcon.vue'
import NoticeIcon from '../components/NoticeIcon.vue'
import { foodIconFor, foodIcons } from '../utils/foodIcons.js'

describe('food icons', () => {
  it.each([
    ['Full cream milk', 'carton'],
    ['Orange juice', 'bottle'],
    ['Oranges', 'orange'],
    ['Tomato sauce', 'jar'],
    ['Garden tomatoes', 'fruit'],
    ['Greek yoghurt', 'cup'],
    ['Fresh pesto', 'jar'],
    ['Organic veggie box', 'leaf'],
    ['Extra sourdough', 'bread'],
    ['Goat cheese', 'cheese'],
    ['Boiled eggs', 'egg'],
    ['Vanilla ice cream', 'iceCream'],
    ['Salmon fillet', 'fish'],
    ['Something unknown', 'box'],
  ])('matches %s to the %s icon', (name, kind) => {
    expect(foodIconFor(name)).toBe(kind)
  })

  it('has artwork for every icon and handles a missing name', () => {
    expect(foodIconFor()).toBe('box')
    for (const icon of Object.values(foodIcons)) {
      expect(icon.shape).toBeTruthy()
      expect(icon.detail).toBeTruthy()
      expect(icon.color).toMatch(/^#/)
    }
  })

  it('renders from a food name or an explicit kind, hidden from screen readers', () => {
    const named = mount(FoodIcon, { props: { food: 'Banana' } })
    expect(named.get('.food-shape').attributes('d')).toBe(foodIcons.banana.shape)
    expect(named.attributes('aria-hidden')).toBe('true')

    const chosen = mount(FoodIcon, { props: { kind: 'can' } })
    expect(chosen.get('.food-shape').attributes('fill')).toBe(foodIcons.can.color)
  })

  it('renders notice icons in the current text colour', () => {
    const bell = mount(NoticeIcon, { props: { name: 'bell' } })
    expect(bell.attributes('stroke')).toBe('currentColor')
    expect(bell.get('path').attributes('d')).toBeTruthy()
  })
})
