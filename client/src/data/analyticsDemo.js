// Fictional activity only; no accounts or MongoDB records are used.
// weightKg compares different inventory units; valueSgd is the total event value.
const foods = [
  ['Apples', 'Fruit', 3, 'pieces', 0.45, 2.4],
  ['Baby spinach', 'Vegetables', 1, 'packet', 0.2, 2.8],
  ['Firm tofu', 'Protein', 1, 'packet', 0.3, 1.6],
  ['Bananas', 'Fruit', 4, 'pieces', 0.5, 2.2],
  ['Wholemeal bread', 'Bakery', 1, 'loaf', 0.4, 3.1],
  ['Cooked rice', 'Leftovers', 2, 'portions', 0.35, 1.4],
  ['Cherry tomatoes', 'Vegetables', 1, 'punnet', 0.25, 3.2],
  ['Plain yoghurt', 'Dairy', 2, 'cups', 0.3, 2.9],
  ['Eggs', 'Protein', 6, 'pieces', 0.36, 2.1],
  ['Vegetable curry', 'Leftovers', 2, 'portions', 0.6, 5.4],
]
const actions = ['consumed', 'shared', 'consumed', 'discarded', 'rescued', 'consumed', 'shared']
const locations = ['Tampines', 'Bedok', 'Jurong East', 'Bishan', 'Queenstown']

// Exactly 50 reproducible records, 25 August–13 October 2026.
export const sampleAnalyticsEvents = Array.from({ length: 50 }, (_, index) => {
  const [name, category, quantity, unit, weightKg, valueSgd] = foods[index % foods.length]
  const action = actions[index % actions.length]
  const multiplier = 1 + (Math.floor(index / 10) % 3)
  return {
    _id: `demo-event-${index + 1}`,
    inventoryItem: `demo-inventory-${index + 1}`,
    name,
    category,
    unit,
    action,
    quantity: quantity * multiplier,
    weightKg: Number((weightKg * multiplier).toFixed(2)),
    valueSgd: Number((valueSgd * multiplier).toFixed(2)),
    occurredAt: new Date(Date.UTC(2026, 7, 25 + index, 4)).toISOString(),
    location: locations[index % locations.length],
    source: action === 'rescued' ? 'Community food rescue' : 'My fridge',
  }
})
