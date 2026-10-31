import { describe, it, expect } from 'vitest'
import { ref, effectScope } from 'vue'
import { navigating, pageIsLoading, pageLoadingLabel, usePageLoading } from '../utils/pageLoading.js'

describe('shared page loading', () => {
  it('waits for requests and clears tasks when a page unmounts', () => {
    navigating.value = false
    const scope = effectScope()
    const food = ref(true)
    const recipes = ref(true)
    scope.run(() => {
      usePageLoading(food, 'Loading food')
      usePageLoading(recipes, 'Finding recipes')
    })
    expect(pageIsLoading.value).toBe(true)
    expect(pageLoadingLabel.value).toBe('Finding recipes')
    food.value = false
    expect(pageIsLoading.value).toBe(true)
    recipes.value = false
    expect(pageIsLoading.value).toBe(false)
    food.value = true
    scope.stop()
    expect(pageIsLoading.value).toBe(false)
    navigating.value = true
    expect(pageLoadingLabel.value).toBe('Loading page')
    navigating.value = false
  })
})
