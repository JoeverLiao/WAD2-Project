// Food artwork in the style of the FreshKeep Figma file: a flat coloured shape with an
// ink outline, plus a detail line. leaf, cup, bottle, jar and fruit are the Figma
// originals; the rest are drawn to the same rules on the same 70 x 70 canvas.
const smile = 'M27 35c5 4 11 4 16 0'
const fruitFace = 'M35 13c-1-6 2-10 8-11M26 36h.1M44 36h.1M28 45c5 4 10 4 15 0'
const fruitShape = 'M35 13c13 0 22 10 22 23S48 58 35 58 13 49 13 36s9-23 22-23Z'
const bowlShape = 'M10 33C12 12 58 12 60 33c0 14-9 25-20 25H30C19 58 10 47 10 33Z'

export const foodIcons = {
  leaf: {
    shape: 'M35 56V31M35 38C18 38 12 27 15 13c15 0 24 9 20 25Zm0 8c15 0 24-9 21-23-15-1-24 8-21 23Z',
    detail: smile,
    color: '#91D985',
  },
  cup: { shape: 'M18 18h34l-4 39H22l-4-39Zm-3-8h40v10H15V10Z', detail: smile, color: '#B9EAE5' },
  bottle: { shape: 'M27 8h16v12l6 9v29H21V29l6-9V8Z', detail: smile, color: '#FFD66B' },
  jar: { shape: 'M18 20h34v37H18V20Zm-2-10h38v11H16V10Z', detail: smile, color: '#B7DC72' },
  fruit: { shape: fruitShape, detail: fruitFace, color: '#F48678' },
  orange: { shape: fruitShape, detail: fruitFace, color: '#FFB35C' },
  avocado: {
    shape: 'M35 8c9 0 13 11 16 20 3 8 7 12 7 18 0 8-10 14-23 14S12 54 12 46c0-6 4-10 7-18C22 19 26 8 35 8Z',
    detail: 'M27 35h.1M43 35h.1M29 43c4 3 8 3 12 0',
    color: '#B7DC72',
  },
  banana: {
    shape: 'M13 17c0 3 1 4 2 4 1 18 15 33 38 31 6-1 8-3 9-6 1-2-1-3-4-3-19 0-30-10-35-26 0-3-10-3-10 0Z',
    detail: 'M33 38c4 4 9 5 14 4',
    color: '#FFD66B',
  },
  carton: {
    shape: 'M20 26 28 12h14l8 14v32H20V26Z',
    detail: 'M20 26h30M27 40c5 4 11 4 16 0',
    color: '#E8F8F5',
  },
  egg: {
    shape: 'M35 10c12 0 20 18 20 29 0 12-9 20-20 20s-20-8-20-20c0-11 8-29 20-29Z',
    detail: 'M28 34h.1M42 34h.1M29 43c4 3 8 3 12 0',
    color: '#FFE9B8',
  },
  carrot: {
    shape: 'M49 20c6 6 3 14-2 19L20 60c-2 2-5-1-4-3l15-34c5-6 13-8 18-3Z',
    detail: 'M50 19c0-6 3-10 8-12M51 21c5-1 10 0 13 4M29 39c3 3 7 3 10 0',
    color: '#FFB35C',
  },
  broccoli: {
    shape: 'M27 58V42h-7c-9 0-12-13-3-16 0-10 13-14 18-7 6-6 18-2 18 7 9 3 6 16-3 16h-7v16H27Z',
    detail: 'M27 42h16M29 30c4 3 8 3 12 0',
    color: '#91D985',
  },
  drumstick: {
    shape: 'M44 10c11 0 17 9 15 19-2 9-11 15-20 13L28 52c2 5-5 9-8 5-5 1-8-5-4-8-3-4 2-9 6-6l10-10C29 23 33 10 44 10Z',
    detail: 'M40 25c3 3 7 3 10 0',
    color: '#F2B56B',
  },
  fish: {
    shape: 'M8 35c8-13 28-18 42-4l12-10v28L50 39C36 52 16 48 8 35Z',
    detail: 'M20 31h.1M15 39c4 2 8 2 11 0M32 26c3 6 3 12 0 18',
    color: '#9ADCEB',
  },
  rice: { shape: bowlShape, detail: 'M10 33h50M27 43c5 4 11 4 16 0', color: '#F7F1DE' },
  pasta: {
    shape: bowlShape,
    detail: 'M10 33h50M20 25c5-5 10 5 15 0s10 5 15 0M27 43c5 4 11 4 16 0',
    color: '#FFD66B',
  },
  bowl: { shape: bowlShape, detail: 'M10 33h50M27 43c5 4 11 4 16 0', color: '#FFD66B' },
  bread: {
    shape: 'M14 30c-7-2-7-18 8-18h26c15 0 15 16 8 18v28H14V30Z',
    detail: 'M27 36c5 4 11 4 16 0',
    color: '#E8B877',
  },
  cheese: {
    shape: 'M8 34 44 14c12 3 18 11 19 20v24H8V34Z',
    detail: 'M8 34h55M22 44h.1M50 42h.1M28 47c4 3 8 3 12 0',
    color: '#FFD66B',
  },
  iceCream: {
    shape: 'M20 31a15 15 0 1 1 30 0L35 62 20 31Z',
    detail: 'M20 31c5 4 10-1 15 2s10 1 15-2',
    color: '#FFC2B8',
  },
  potato: {
    shape: 'M15 23c8-12 28-14 38-6 11 9 9 26 0 34-10 8-29 9-38-1-8-8-8-19 0-27Z',
    detail: 'M22 26h.1M48 24h.1M27 35c5 4 11 4 16 0M46 45h.1',
    color: '#D9B382',
  },
  meat: {
    shape: 'M12 27C16 12 40 8 52 15c12 7 10 23 1 32-8 8-20 11-27 5-5-4-6-7-11-10-6-4-5-9-3-15Z',
    detail: 'M44 21a6 6 0 1 1-.1 0ZM21 34c4 3 8 3 12 0',
    color: '#F48678',
  },
  can: {
    shape: 'M16 14c0-8 38-8 38 0v42c0 8-38 8-38 0V14Z',
    detail: 'M16 14c0 8 38 8 38 0M27 38c5 4 11 4 16 0',
    color: '#F48678',
  },
  box: {
    shape: 'M14 24h42v33H14V24Zm-3-11h48v11H11V13Z',
    detail: 'M27 37c5 4 11 4 16 0',
    color: '#B9EAE5',
  },
}

// Checked in order, so "orange juice" matches its drink first and "veggie" is not an egg.
const keywords = [
  ['bottle', ['juice', 'smoothie', 'soda', ' oil']],
  ['jar', ['sauce', 'pesto', 'jam', 'salsa', 'pickle']],
  ['iceCream', ['ice cream']],
  ['cup', ['yoghurt', 'yogurt', 'pudding']],
  ['carton', ['milk']],
  ['leaf', ['veggie', 'vegetable', 'spinach', 'lettuce', 'salad', 'kale', 'herb', 'basil', 'greens']],
  ['egg', ['egg']],
  ['carrot', ['carrot']],
  ['broccoli', ['broccoli']],
  ['drumstick', ['chicken']],
  ['fish', ['fish', 'salmon', 'tuna']],
  ['rice', ['rice']],
  ['pasta', ['pasta', 'noodle', 'spaghetti']],
  ['cheese', ['cheese']],
  ['bowl', ['cereal', 'oat', 'soup']],
  ['bread', ['bread', 'sourdough', 'loaf', 'bagel']],
  ['fruit', ['apple', 'tomato', 'berry', 'cherr']],
  ['banana', ['banana']],
  ['orange', ['orange', 'mandarin', 'peach']],
  ['avocado', ['avocado', 'pear']],
  ['potato', ['potato']],
  ['meat', ['meat', 'beef', 'pork', 'steak', 'lamb']],
  ['can', ['beans', 'tinned', 'canned']],
]

export function foodIconFor(name = '') {
  const value = String(name).toLowerCase()
  const match = keywords.find(([, words]) => words.some((word) => value.includes(word)))
  return match ? match[0] : 'box'
}
