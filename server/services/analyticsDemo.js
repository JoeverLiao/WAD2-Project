import { createHash } from 'node:crypto'

const foods = [
  ['Apples', 'Fruit', 3, 'pieces', .45, 2.4],
  ['Baby spinach', 'Vegetables', 1, 'packet', .2, 2.8],
  ['Firm tofu', 'Protein', 1, 'packet', .3, 1.6],
  ['Bananas', 'Fruit', 4, 'pieces', .5, 2.2],
  ['Wholemeal bread', 'Bakery', 1, 'loaf', .4, 3.1],
  ['Cooked rice', 'Leftovers', 2, 'portions', .35, 1.4],
  ['Cherry tomatoes', 'Vegetables', 1, 'punnet', .25, 3.2],
  ['Plain yoghurt', 'Dairy', 2, 'cups', .3, 2.9],
  ['Eggs', 'Protein', 6, 'pieces', .36, 2.1],
  ['Vegetable curry', 'Leftovers', 2, 'portions', .6, 5.4],
]
const actions = ['consumed', 'shared', 'consumed', 'discarded', 'rescued', 'consumed', 'discarded']

export function analyticsDemoEvents(userId, now = new Date()) {
  const singaporeDay = new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10)
  const today = Date.parse(`${singaporeDay}T12:00:00+08:00`)
  return Array.from({ length: 50 }, (_, index) => {
    const [name, category, quantity, unit, weightKg, valueSgd] = foods[index % foods.length]
    const multiplier = 1 + Math.floor(index / 10) % 3
    return {
      // Stable per-user IDs make retries and later activations reuse the same demo set.
      _id: createHash('sha256').update(`analytics-demo-v1:${userId}:${index}`).digest('hex').slice(0, 24),
      user: userId,
      name, category, unit,
      quantity: quantity * multiplier,
      weightKg: Number((weightKg * multiplier).toFixed(2)),
      valueSgd: Number((valueSgd * multiplier).toFixed(2)),
      action: actions[index % actions.length],
      occurredAt: new Date(today - (50 - index) * 86400000),
      location: index % 3 === 0 ? 'Pantry' : 'Fridge',
      source: 'Analytics demo',
    }
  })
}
