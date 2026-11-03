export const CATEGORY_OPTIONS = [
  { value:'produce', label:'Fruit & veg' },
  { value:'bakery', label:'Bakery' },
  { value:'dairy', label:'Dairy & eggs' },
  { value:'pantry', label:'Pantry food' },
  { value:'cooked', label:'Cooked food' },
  { value:'other', label:'Other' },
]
export const categoryLabel = value => CATEGORY_OPTIONS.find(option=>option.value===value)?.label || 'Other'
