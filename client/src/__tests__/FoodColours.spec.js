import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import FoodIcon from '../components/FoodIcon.vue'
import { FOOD_ICONS } from '../utils/foodIcons.js'
import { FOOD_COLOURS, foodColourForName } from '../utils/foodColours.js'
import { classifyFood, flushFoodIconLookups, resetFoodIconClassifier } from '../utils/foodIconClassifier.js'

const drawn = (props) => {
  const svg = mount(FoodIcon, { props })
  return { icon: svg.attributes('data-food-icon'), fill: svg.get('.food-shape').attributes('fill') }
}

beforeEach(() => resetFoodIconClassifier())
afterEach(() => resetFoodIconClassifier())

describe('food colours without the AI', () => {
  it.each([
    ['Red apple', 'apple', FOOD_COLOURS.red],
    ['Green apple', 'apple', FOOD_COLOURS.green],
    ['Granny Smith apples', 'apple', FOOD_COLOURS.green],
    ['Tomato', 'tomato', FOOD_ICONS.tomato.color],
    ['Carrot', 'carrot', FOOD_ICONS.carrot.color],
    ['Banana', 'banana', FOOD_ICONS.banana.color],
    ['Eggplant', 'eggplant', FOOD_ICONS.eggplant.color],
    ['Yellow bell pepper', 'pepper', FOOD_COLOURS.yellow],
    ['Red pepper', 'pepper', FOOD_COLOURS.red],
    ['Red onion', 'onion', FOOD_COLOURS.purple],
    ['Limes', 'lemon', FOOD_COLOURS.green],
    ['Salmon fillet', 'fish', FOOD_COLOURS.coral],
  ])('%s -> %s icon in its own colour', (name, icon, fill) => {
    expect(drawn({ food: name })).toEqual({ icon, fill })
  })

  it('keeps the same shape when only the colour differs', () => {
    const red = mount(FoodIcon, { props: { food: 'Red apple' } }).get('.food-shape')
    const green = mount(FoodIcon, { props: { food: 'Green apple' } }).get('.food-shape')
    expect(red.attributes('d')).toBe(green.attributes('d'))
    expect(red.attributes('fill')).not.toBe(green.attributes('fill'))
  })

  it('draws every food of a type with one shape, coloured by the food', () => {
    const shapeOf = (food) => mount(FoodIcon, { props: { food } }).attributes('data-food-shape')
    expect(['Apple', 'Banana', 'Grapes', 'Strawberries'].map(shapeOf)).toEqual(['avocado', 'avocado', 'avocado', 'avocado'])
    expect(['Tomato', 'Carrot', 'Eggplant'].map(shapeOf)).toEqual(['leafy', 'leafy', 'leafy'])
    expect(['Orange juice', 'Cola', 'Coffee'].map(shapeOf)).toEqual(['bottle', 'bottle', 'bottle'])
    expect(drawn({ food: 'Cola' }).fill).toBe(FOOD_COLOURS.red)
    expect(drawn({ food: 'Orange juice' }).fill).toBe(FOOD_COLOURS.orange)
    // A food still says which food it is, and a chosen kind keeps its own shape.
    expect(drawn({ food: 'Banana' }).icon).toBe('banana')
    expect(mount(FoodIcon, { props: { kind: 'can' } }).attributes('data-food-shape')).toBe('can')
  })

  it('gives foods in the same category different colours', () => {
    const fills = ['Tomato', 'Carrot', 'Eggplant', 'Broccoli'].map((food) => drawn({ food }).fill)
    expect(new Set(fills).size).toBe(4)
  })

  it('only matches whole colour words', () => {
    expect(foodColourForName('Blueberries')).toBeNull()
    expect(foodColourForName('Reduced fat milk')).toBeNull()
    expect(foodColourForName('Chickpeas')).toBeNull()
  })

  it('draws a library icon in its own colour, and color still overrides', () => {
    expect(drawn({ kind: 'carrot' }).fill).toBe(FOOD_ICONS.carrot.color)
    expect(drawn({ food: 'Red apple', color: '#123456' }).fill).toBe('#123456')
  })
})

describe('food colours from the AI', () => {
  it('asks once for unknown names, then uses the checked answer everywhere', async () => {
    const lookup = vi.fn(async () => [
      { input: 'dragon fruit', name: 'Dragon fruit', category: 'fruit', icon: 'peach', colour: 'pink' },
    ])
    resetFoodIconClassifier({ lookup })

    const first = mount(FoodIcon, { props: { item: { name: 'Dragon fruit', category: 'fruit' } } })
    mount(FoodIcon, { props: { food: 'Dragon Fruit' } })
    // Until the answer arrives the built-in rules draw it, so the icon never disappears.
    expect(first.attributes('data-food-icon')).toBe('apple')

    await flushFoodIconLookups()
    await nextTick()
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(lookup).toHaveBeenCalledWith(['dragon fruit'])
    expect(first.attributes('data-food-icon')).toBe('peach')
    expect(first.get('.food-shape').attributes('fill')).toBe(FOOD_COLOURS.pink)
    expect(drawn({ food: 'dragon fruit' })).toEqual({ icon: 'peach', fill: FOOD_COLOURS.pink })
    expect(lookup).toHaveBeenCalledTimes(1)
  })

  it('lets the AI decide for foods the built-in list knows too', async () => {
    const lookup = vi.fn(async () => [{ input: 'cola', name: 'Cola', category: 'beverages', icon: 'softDrink', colour: 'deepRed' }])
    resetFoodIconClassifier({ lookup })
    expect(classifyFood('Cola').source).toBe('rules')
    classifyFood('Milk')
    await flushFoodIconLookups()
    expect(lookup).toHaveBeenCalledWith(['cola', 'milk'])
    expect(classifyFood('Cola')).toEqual({ icon: 'softDrink', color: FOOD_COLOURS.deepRed, source: 'saved' })
  })

  it('ignores icons and colours that are not in the library', async () => {
    resetFoodIconClassifier({
      lookup: async () => [
        { input: 'lychee', icon: 'unicorn', colour: 'pink' },
        { input: 'durian', icon: 'pineapple', colour: '#00FF00' },
      ],
    })
    classifyFood('Lychee')
    classifyFood('Durian')
    await flushFoodIconLookups()
    expect(classifyFood('Lychee').source).toBe('rules')
    expect(classifyFood('Durian').source).toBe('rules')
  })

  it('keeps showing the built-in icon when the server fails, and does not ask again', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const lookup = vi.fn(async () => {
      throw new Error('offline')
    })
    resetFoodIconClassifier({ lookup })
    const item = { name: 'Mystery jar', icon: '🫙', category: 'condiments' }
    classifyFood(item)
    await flushFoodIconLookups()
    expect(classifyFood(item)).toEqual({ icon: 'jar', color: FOOD_ICONS.jar.color, source: 'rules' })
    await flushFoodIconLookups()
    expect(lookup).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})
