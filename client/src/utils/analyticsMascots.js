// Compare weights in the currently visible period; sharing/rescue are separate actions.
export function vegetableMood(events) {
  let consumed = 0
  let discarded = 0
  for (const event of events) {
    const weight = Math.max(0, Number(event.weightKg) || 0)
    if (event.action === 'consumed') consumed += weight
    if (event.action === 'discarded') discarded += weight
  }
  let expression = 'smiling'
  if (discarded > consumed) expression = discarded >= consumed * 2 ? 'crying' : 'sad'
  else if (consumed > 0 && consumed >= discarded * 2) expression = 'happy'
  return { expression, consumed, discarded }
}

export const vegetableMessages = {
  happy: ['You’re doing egg-cellent! Keep saving good food!', 'Less waste, more tasty meals. Keep it up!', 'Every bite counts. Thanks for making us happy!'],
  smiling: ['Got leftovers? Tomorrow’s lunch is waiting!', 'Check your fridge before your next shop!', 'A little meal planning goes a long way!'],
  sad: ['Discard less food! Save those leftovers for later.', 'Eat the soon-to-expire food first. I’m rooting for you!', 'Let’s waste a little less. Try smaller portions!'],
  crying: ['Please discard less food! Freeze some for another day.', 'So much food missed its chance. Let’s save the next meal!', 'Help turn these tears into smiles. Use what’s in your fridge!'],
}
