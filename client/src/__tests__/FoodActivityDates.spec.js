import { describe, expect, it } from 'vitest'
import {
  activityCalendar,
  foodActivityDay,
  foodActivityTimestamp,
  indexFoodActivity,
} from '../utils/foodActivityDates.js'

describe('Singapore activity dates', () => {
  it('uses the local calendar day on both sides of midnight', () => {
    expect(foodActivityDay('2026-11-04T15:59:59Z')).toBe('2026-11-04')
    expect(foodActivityDay('2026-11-04T16:00:00Z')).toBe('2026-11-05')
    expect(foodActivityDay('2026-11-05T00:01:00Z')).toBe('2026-11-05')
    expect(foodActivityDay('2026-11-05')).toBe('2026-11-05')
    expect(foodActivityDay('invalid')).toBe('')
  })

  it('round trips the editor date without moving it to the next or previous day', () => {
    expect(foodActivityTimestamp('2026-11-05')).toBe('2026-11-04T16:00:00.000Z')
    expect(foodActivityDay(foodActivityTimestamp('2026-11-05'))).toBe('2026-11-05')
  })

  it('indexes every event once, combining opposite actions on the same local day', () => {
    const events = [
      { occurredAt: '2026-11-04T17:00:00Z', action: 'consumed', weightKg: 2 },
      { occurredAt: '2026-11-05T02:00:00Z', action: 'discarded', weightKg: 0.5 },
      { occurredAt: '2026-11-05T16:00:00Z', action: 'rescued', weightKg: 1 },
    ]
    const index = indexFoodActivity(events)
    expect(index.size).toBe(2)
    expect(index.get('2026-11-05')).toMatchObject({
      saved: 2,
      discarded: 0.5,
      events: events.slice(0, 2),
    })
    expect(index.get('2026-11-06').saved).toBe(1)
  })

  it('fills missing days and supplies an empty 30-day initial calendar', () => {
    const dates = activityCalendar(new Map(), '2026-11-05')
    expect(dates).toHaveLength(30)
    expect(dates[0]).toBe('2026-10-07')
    expect(dates.at(-1)).toBe('2026-11-05')
    const history = activityCalendar(new Map([['2024-01-01', {}]]), '2026-11-05')
    expect(history[0]).toBe('2024-01-01')
    expect(history).toContain('2024-02-29')
  })
})
