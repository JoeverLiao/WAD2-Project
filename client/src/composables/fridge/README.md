# Smart fridge code

`FridgeView.vue` composes the page and its dashboard version. It accepts only
`embedded`; both versions read and update `useInventoryStore()` rather than
passing copies of inventory through props and events.

| File | Responsibility |
| --- | --- |
| `useFridgeActions.js` | Save/edit, consume/discard, remove, and move food; commit successful group operations and retain failures for retry. |
| `useFridgeSelection.js` | Rectangle selection, keyboard selection, and selected food groups. |
| `useFridgeDrag.js` | Desktop dragging, mobile long press, drop destinations, and action animations. |
| `useFridgeDoor.js` | Opening/closing, pointer gestures, and scrolling the cabinet into view. |
| `useFridgeLayout.js` | Search, fridge/pantry switching, cached compartment lists, counts, and tooltips. |
| `useFridgeDialogs.js` | Compartment/edit/expiry panels, keyboard focus, route links, and food highlighting. |
| `useFridgeGuidance.js` | Storage warnings, arrange/ignore actions, and their confirmations. |

Shared inventory normalization and labels live in `utils/inventoryModel.js`.
Requests go through `services/inventory.js` and `services/api.js`. The store owns
loading and account changes. `FoodPreview.vue` renders the same food icon,
quantity, and warning badges in every compartment. Scoped fridge styles live in
`styles/fridge/fridge.css`; preserve cascade order when changing responsive rules.

Analytics follows the same separation: `useFoodActivity.js` loads/edits history,
`useAnalyticsChart.js` handles chart navigation/rendering, and
`useAnimatedTotals.js` animates counters. `utils/foodActivityDates.js` groups
timestamps by Singapore calendar day; expiry/form dates remain calendar dates.
