import { describe, expect, it } from 'vitest'
import {
  summarizeFoodEvents,
  previousFoodPeriod,
  rankWastedFoods,
  foodPeriodChange,
} from '../utils/analyticsUtils.js'

const events = [
  { name: ' Spinach ', action: 'discarded', weightKg: 0.2, valueSgd: 3 },
  { name: 'spinach', action: 'discarded', weightKg: 0.3, valueSgd: 4 },
  { name: 'Rice', action: 'discarded', weightKg: 2, valueSgd: 2 },
  { name: 'Apples', action: 'consumed', weightKg: 1, valueSgd: 5 },
  { name: 'Bread', action: 'shared', weightKg: 0.4, valueSgd: 2 },
  { name: 'Tofu', action: 'rescued', weightKg: 0.3, valueSgd: 1 },
]

describe('Food waste insights', () => {
  it('separates discarded purchase value from retained value', () => {
    expect(summarizeFoodEvents(events)).toEqual({
      saved: 1.7,
      value: 8,
      discarded: 2.5,
      discardedValue: 9,
      community: 2,
    })
  })
  it('groups repeated names and ranks by cost, weight, or frequency', () => {
    const [spinach] = rankWastedFoods(events, 'value')
    expect(spinach).toMatchObject({ key: 'spinach', value: 7, weight: 0.5, frequency: 2 })
    expect(rankWastedFoods(events, 'weight')[0].name).toBe('Rice')
    expect(rankWastedFoods(events, 'frequency')[0].key).toBe('spinach')
    expect(rankWastedFoods(events)).toHaveLength(2)
    expect(rankWastedFoods([])).toEqual([])
  })
  it('uses the immediately preceding equal calendar window across month boundaries', () => {
    expect(previousFoodPeriod('2026-10-01', '2026-10-07', '2026-08-25')).toEqual({
      start: '2026-09-24',
      end: '2026-09-30',
      length: 7,
      complete: true,
    })
  })
  it('does not compare against a partial or unavailable historical window', () => {
    expect(previousFoodPeriod('2026-08-25', '2026-10-13', '2026-08-25').complete).toBe(false)
    expect(previousFoodPeriod('2026-09-14', '2026-10-13', '2026-08-25').complete).toBe(false)
  })
  it('handles zero baselines and marks lower waste as an improvement', () => {
    expect(foodPeriodChange(6, 8, true)).toEqual({ text: '↓ 25% vs previous', tone: 'good' })
    expect(foodPeriodChange(10, 8, true)).toEqual({ text: '↑ 25% vs previous', tone: 'bad' })
    expect(foodPeriodChange(5, 0, true)).toEqual({ text: 'New this period', tone: 'bad' })
    expect(foodPeriodChange(0, 0)).toEqual({ text: 'No change', tone: 'neutral' })
    expect(foodPeriodChange(0, 5, true)).toEqual({ text: '↓ 100% vs previous', tone: 'good' })
    expect(foodPeriodChange(10, 8)).toMatchObject({ tone: 'good' })
  })
})
