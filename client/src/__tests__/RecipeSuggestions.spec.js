import { describe, expect, it } from 'vitest'
import { analyseRecipes, canonicalName, normalizeRecipe } from '../utils/recipeSuggestions.js'

describe('shared recipe suggestions', () => {
  it('ranks recipes by owned ingredients and urgency using the same counts shown on cards', () => {
    const inventory = [
      { _id: '1', name: 'Chicken breast', days: 2 },
      { _id: '2', name: 'Onions', days: 7 },
    ]
    const recipes = [
      { id: 'a', name: 'Soup', ingredients: ['Carrot', 'Water'] },
      { id: 'b', name: 'Chicken', ingredients: ['Chicken', 'Onion', 'Salt'] },
    ].map(normalizeRecipe)
    const ranked = analyseRecipes(recipes, inventory).sort((a, b) => b.rescueScore - a.rescueScore)
    expect(ranked[0].id).toBe('b')
    expect(ranked[0].matched).toEqual(['Chicken', 'Onion'])
    expect(ranked[0].ingredients).toHaveLength(3)
    expect(canonicalName('Chicken breast')).toBe('chicken')
  })
})
