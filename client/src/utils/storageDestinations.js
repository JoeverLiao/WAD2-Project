// Use the same saved names and main-storage labels as the fridge switcher.
export function storageDestinations(items = []) {
  const read = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
  }
  const mainLabels = read('full-circle-main-storage-labels', [])
  return ['fridge', 'pantry'].flatMap((type, index) => {
    const main = type === 'fridge' ? 'Main fridge' : 'Pantry'
    const extra = read(type === 'fridge' ? 'full-circle-fridges' : 'full-circle-pantries', [])
    const field = type === 'pantry' ? 'pantryName' : 'fridgeName'
    const savedNames = items.filter(item => (item.storage === 'pantry') === (type === 'pantry')).map(item => item[field]).filter(Boolean)
    return [...new Set([main, ...(Array.isArray(extra) ? extra : []), ...savedNames])]
      .filter(name => typeof name === 'string' && name.trim())
      .map(name => ({
        type, name, value: JSON.stringify([type, name]),
        label: name === main ? mainLabels?.[index] || main : name,
      }))
  })
}

// Old records can retain their original zone while the UI offers one Shelves choice.
export const unifiedShelfZone = zone => ['upper-shelf', 'lower-shelf'].includes(zone) ? 'middle-shelf' : zone
