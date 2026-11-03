// The app's fixed food icon library, drawn in the style of the FreshKeep Figma file.
// Every icon is the same kind of drawing on the same 70 x 70 canvas:
//   shape  - filled with the icon's single colour and outlined in ink (see FoodIcon.vue)
//   detail - ink lines drawn on top (faces, seeds, steam), never filled
// Which food gets which icon is decided in foodIconMap.js, not here.

// A circle as path data. reverse draws it the other way round, which cuts a hole (e.g. a bagel).
function circle(cx, cy, r, reverse = false) {
  const sweep = reverse ? 1 : 0
  return `M${cx - r} ${cy}a${r} ${r} 0 1 ${sweep} ${r * 2} 0a${r} ${r} 0 1 ${sweep} ${-r * 2} 0Z`
}

const face = 'M27 36h.1M43 36h.1M30 44c3 3 7 3 10 0'
const smile = 'M27 35c5 4 11 4 16 0'
const round = 'M35 13c13 0 22 10 22 23S48 58 35 58 13 49 13 36s9-23 22-23Z'
const bowl = 'M10 33C12 12 58 12 60 33c0 14-9 25-20 25H30C19 58 10 47 10 33Z'
const block = 'M8 32 18 22h44v16L52 48H8V32Z'
const steam = 'M26 22c-3-3 3-6 0-9M36 22c-3-3 3-6 0-9'

export const FOOD_ICON_GROUPS = [
  { id: 'fruit', label: 'Fruit' },
  { id: 'vegetables', label: 'Vegetables' },
  { id: 'meat_seafood', label: 'Meat & seafood' },
  { id: 'dairy_eggs', label: 'Dairy & eggs' },
  { id: 'grains', label: 'Grains & bakery' },
  { id: 'drinks', label: 'Drinks' },
  { id: 'other', label: 'Other food' },
]

export const FOOD_ICONS = {
  // Fruit
  apple: {
    label: 'Apple', group: 'fruit', color: '#F48678',
    shape: 'M35 20c-6-4-20-3-21 13-1 13 8 25 21 25s22-12 21-25c-1-16-15-17-21-13Z',
    detail: `M35 20c0-6 2-10 6-13M41 10c3-2 7-2 9 0-3 3-6 3-9 0Z${face}`,
  },
  pear: {
    label: 'Pear', group: 'fruit', color: '#C8DB72',
    shape: 'M35 9c5 0 7 6 7 12 0 6 13 13 13 25 0 9-9 14-20 14s-20-5-20-14c0-12 13-19 13-25 0-6 2-12 7-12Z',
    detail: 'M35 9c0-3 1-5 4-6M29 40h.1M41 40h.1M31 47c3 2 5 2 8 0',
  },
  orange: {
    label: 'Orange', group: 'fruit', color: '#FFB35C',
    shape: round,
    detail: `M35 13c1-5 5-8 10-8M35 13c-3-3-7-4-10-2${face}`,
  },
  lemon: {
    label: 'Lemon', group: 'fruit', color: '#FFE07A',
    shape: 'M6 36c3-1 5-3 6-5 5-11 13-16 23-16s18 5 23 16c1 2 3 4 6 5-3 1-5 3-6 5-5 11-13 16-23 16S17 52 12 41c-1-2-3-4-6-5Z',
    detail: 'M28 33h.1M42 33h.1M31 41c3 2 6 2 8 0',
  },
  banana: {
    label: 'Banana', group: 'fruit', color: '#FFD66B',
    shape: 'M13 17c0 3 1 4 2 4 1 18 15 33 38 31 6-1 8-3 9-6 1-2-1-3-4-3-19 0-30-10-35-26 0-3-10-3-10 0Z',
    detail: 'M33 38c4 4 9 5 14 4',
  },
  grapes: {
    label: 'Grapes', group: 'fruit', color: '#B9A0E0',
    shape: [circle(24, 26, 7), circle(46, 26, 7), circle(35, 26, 7), circle(29.5, 38, 7), circle(40.5, 38, 7), circle(35, 50, 7)].join(''),
    detail: 'M35 19c0-6 3-10 8-12M33 50h.1M37 50h.1',
  },
  strawberry: {
    label: 'Strawberry', group: 'fruit', color: '#F48678',
    shape: 'M35 58C24 50 13 38 14 26c1-7 8-10 21-10s20 3 21 10c1 12-10 24-21 32Z',
    detail: 'M24 17l6 5 5-8 5 8 6-5M24 29h.1M46 29h.1M35 48h.1M27 41h.1M43 41h.1M30 34c3 3 7 3 10 0',
  },
  blueberry: {
    label: 'Blueberries', group: 'fruit', color: '#8FA8E8',
    shape: [circle(35, 25, 11), circle(23, 44, 11), circle(47, 44, 11)].join(''),
    detail: 'M32 19l3 3 3-3M20 38l3 3 3-3M44 38l3 3 3-3',
  },
  cherry: {
    label: 'Cherries', group: 'fruit', color: '#F48678',
    shape: [circle(24, 49, 10), circle(47, 47, 10)].join(''),
    detail: 'M24 39c2-12 8-22 16-28M47 37c-2-10-4-18-7-26M40 11c5-3 10-2 13 1-4 3-9 3-13-1ZM21 50c2 1 4 1 6 0M44 48c2 1 4 1 6 0',
  },
  peach: {
    label: 'Peach', group: 'fruit', color: '#FFB8A0',
    shape: 'M35 20c-12-6-23 4-21 18 2 12 10 20 21 20s19-8 21-20c2-14-9-24-21-18Z',
    detail: 'M35 20c3-6 8-9 14-8-2 5-7 8-14 8Z' + 'M27 38h.1M43 38h.1M30 46c3 3 7 3 10 0',
  },
  mango: {
    label: 'Mango', group: 'fruit', color: '#FFC15C',
    shape: 'M20 22c10-12 32-10 38 6 6 15-4 30-20 30-14 0-24-9-24-19 0-7 3-12 6-17Z',
    detail: 'M24 20c-1-5 2-9 7-11M30 36h.1M44 36h.1M33 44c3 2 6 2 9 0',
  },
  pineapple: {
    label: 'Pineapple', group: 'fruit', color: '#FFD66B',
    shape: 'M35 24c11 0 17 9 17 19s-6 17-17 17-17-7-17-17 6-19 17-19Z',
    detail: 'M35 24 28 8M35 24l7-16M35 24 23 14M35 24l12-10M35 24V5M29 40h.1M41 40h.1M31 48c3 2 5 2 8 0',
  },
  watermelon: {
    label: 'Watermelon', group: 'fruit', color: '#F48678',
    shape: 'M8 24h54c0 15-12 28-27 28S8 39 8 24Z',
    detail: 'M14 31c4 9 12 15 21 15s17-6 21-15M25 30h.1M35 34h.1M45 30h.1',
  },
  melon: {
    label: 'Melon', group: 'fruit', color: '#C8DB72',
    shape: round,
    detail: 'M35 13v45M24 16c-6 12-6 28 0 40M46 16c6 12 6 28 0 40',
  },
  coconut: {
    label: 'Coconut', group: 'fruit', color: '#C9A27E',
    shape: round,
    detail: 'M30 28h.1M40 28h.1M35 35h.1M29 46c4 3 8 3 12 0',
  },
  kiwi: {
    label: 'Kiwi', group: 'fruit', color: '#A8C66C',
    shape: round,
    detail: `${circle(35, 36, 7)}M35 21h.1M35 51h.1M20 36h.1M50 36h.1M24 25h.1M46 25h.1M24 47h.1M46 47h.1`,
  },
  avocado: {
    label: 'Avocado', group: 'fruit', color: '#B7DC72',
    shape: 'M35 8c9 0 13 11 16 20 3 8 7 12 7 18 0 8-10 14-23 14S12 54 12 46c0-6 4-10 7-18C22 19 26 8 35 8Z',
    detail: 'M27 35h.1M43 35h.1M29 43c4 3 8 3 12 0',
  },

  // Vegetables
  leafy: {
    label: 'Leafy greens', group: 'vegetables', color: '#91D985',
    shape: 'M35 56V31M35 38C18 38 12 27 15 13c15 0 24 9 20 25Zm0 8c15 0 24-9 21-23-15-1-24 8-21 23Z',
    detail: smile,
  },
  broccoli: {
    label: 'Broccoli', group: 'vegetables', color: '#91D985',
    shape: 'M27 58V42h-7c-9 0-12-13-3-16 0-10 13-14 18-7 6-6 18-2 18 7 9 3 6 16-3 16h-7v16H27Z',
    detail: 'M27 42h16M29 30c4 3 8 3 12 0',
  },
  carrot: {
    label: 'Carrot', group: 'vegetables', color: '#FFB35C',
    shape: 'M49 20c6 6 3 14-2 19L20 60c-2 2-5-1-4-3l15-34c5-6 13-8 18-3Z',
    detail: 'M50 19c0-6 3-10 8-12M51 21c5-1 10 0 13 4M29 39c3 3 7 3 10 0',
  },
  cucumber: {
    label: 'Cucumber', group: 'vegetables', color: '#8FCB7B',
    shape: 'M14 50c-4-4-2-10 4-16L42 14c6-5 13-5 16 0 3 4 1 10-4 14L28 52c-5 4-11 3-14-2Z',
    detail: 'M22 46h.1M48 20h.1M32 32h.1M40 30h.1M33 38c3 1 6 0 8-2',
  },
  corn: {
    label: 'Corn', group: 'vegetables', color: '#FFD66B',
    shape: 'M35 6c9 0 13 12 13 26s-4 26-13 26-13-12-13-26 4-26 13-26Z',
    detail: 'M26 38c-6 5-8 13-5 20 6-1 11-5 14-11M44 38c6 5 8 13 5 20-6-1-11-5-14-11M29 18h12M28 26h14M30 22h.1M40 22h.1',
  },
  tomato: {
    label: 'Tomato', group: 'vegetables', color: '#F48678',
    shape: round,
    detail: `M26 15l9 4 9-4M35 19v-8${face}`,
  },
  eggplant: {
    label: 'Eggplant', group: 'vegetables', color: '#A88BD8',
    shape: 'M44 16c10 6 12 18 4 28-9 11-23 17-31 11-6-5-3-15 4-21 6-5 12-8 15-14 2-4 4-6 8-4Z',
    detail: 'M44 16c2-4 6-7 10-8M38 20c4 3 10 3 14 0M27 42h.1M35 38h.1M28 48c3 1 6 0 8-3',
  },
  pepper: {
    label: 'Bell pepper', group: 'vegetables', color: '#91D985',
    shape: 'M22 22c4-4 9-4 13-1 4-3 9-3 13 1 6 6 7 17 4 27-2 7-7 10-11 8-2-1-4-1-6 0-2-1-4-1-6 0-4 2-9-1-11-8-3-10-2-21 4-27Z',
    detail: 'M35 21v-9c0-3 2-5 5-5M29 34h.1M41 34h.1M31 42c3 2 5 2 8 0',
  },
  chilli: {
    label: 'Chilli', group: 'vegetables', color: '#F2665A',
    shape: 'M16 24c3 12 13 24 28 30 6 2 10 3 12 1 1-2-1-5-6-8-12-7-19-15-22-25-2-6-14-6-12 2Z',
    detail: 'M22 21c1-6 5-10 11-12M26 32c2 3 5 5 8 6',
  },
  mushroom: {
    label: 'Mushroom', group: 'vegetables', color: '#E6CDB0',
    shape: 'M8 34C8 18 20 10 35 10s27 8 27 24H8ZM26 34h18v18c0 4-4 6-9 6s-9-2-9-6V34Z',
    detail: 'M24 22h.1M46 21h.1M35 26h.1M31 43h.1M39 43h.1M32 49c2 2 4 2 6 0',
  },
  potato: {
    label: 'Potato', group: 'vegetables', color: '#D9B382',
    shape: 'M15 23c8-12 28-14 38-6 11 9 9 26 0 34-10 8-29 9-38-1-8-8-8-19 0-27Z',
    detail: 'M22 26h.1M48 24h.1M27 35c5 4 11 4 16 0M46 45h.1',
  },
  sweetPotato: {
    label: 'Sweet potato', group: 'vegetables', color: '#D98A6C',
    shape: 'M8 40c2-14 18-24 34-24 12 0 20 6 20 13 0 10-14 20-32 22-14 2-24-2-22-11Z',
    detail: 'M28 32h.1M42 30h.1M31 39c4 3 8 2 11-1M15 44h.1M54 26h.1',
  },
  onion: {
    label: 'Onion', group: 'vegetables', color: '#E9C2E3',
    shape: 'M35 12c4 8 22 14 22 30 0 10-10 16-22 16s-22-6-22-16c0-16 18-22 22-30Z',
    detail: 'M35 12c0-4 1-7 4-9M30 58l-2 4M35 58v5M40 58l2 4M28 39h.1M42 39h.1M31 46c3 2 5 2 8 0',
  },
  garlic: {
    label: 'Garlic', group: 'vegetables', color: '#F4EEDF',
    shape: 'M35 10c3 8 20 12 20 28 0 12-9 20-20 20s-20-8-20-20c0-16 17-20 20-28Z',
    detail: 'M35 10V4M24 30c-3 8-3 18 1 26M46 30c3 8 3 18-1 26M30 40h.1M40 40h.1M32 46c2 2 4 2 6 0',
  },
  pumpkin: {
    label: 'Pumpkin', group: 'vegetables', color: '#FFB35C',
    shape: 'M35 20c-8-4-24-2-26 16-1 12 10 22 26 22s27-10 26-22c-2-18-18-20-26-16Z',
    detail: 'M35 20c0-5 1-9 5-12M24 22c-6 10-6 26 1 35M46 22c6 10 6 26-1 35M30 36h.1M40 36h.1M31 44c3 2 5 2 8 0',
  },

  // Meat & seafood
  steak: {
    label: 'Meat', group: 'meat_seafood', color: '#F48678',
    shape: 'M12 27C16 12 40 8 52 15c12 7 10 23 1 32-8 8-20 11-27 5-5-4-6-7-11-10-6-4-5-9-3-15Z',
    detail: `${circle(44, 27, 6)}M21 34c4 3 8 3 12 0`,
  },
  drumstick: {
    label: 'Chicken', group: 'meat_seafood', color: '#F2B56B',
    shape: 'M44 10c11 0 17 9 15 19-2 9-11 15-20 13L28 52c2 5-5 9-8 5-5 1-8-5-4-8-3-4 2-9 6-6l10-10C29 23 33 10 44 10Z',
    detail: 'M40 25c3 3 7 3 10 0',
  },
  bacon: {
    label: 'Bacon & ham', group: 'meat_seafood', color: '#F4A091',
    shape: 'M8 24c9-8 17 6 27-2s18-6 27 2v18c-9-8-18-10-27-2s-18 6-27 2V24Z',
    detail: 'M8 33c9-8 17 6 27-2s18-6 27 2',
  },
  sausage: {
    label: 'Sausage', group: 'meat_seafood', color: '#E89070',
    shape: 'M14 46C8 40 12 30 20 26c10-5 22-6 32-12 6-4 12 2 10 8-3 8-12 14-24 20-10 5-18 10-24 4Z',
    detail: 'M57 14l3-4M13 47l-4 3M30 33h.1M40 29h.1M31 39c3 1 6 0 8-2',
  },
  fish: {
    label: 'Fish', group: 'meat_seafood', color: '#9ADCEB',
    shape: 'M8 35c8-13 28-18 42-4l12-10v28L50 39C36 52 16 48 8 35Z',
    detail: 'M20 31h.1M15 39c4 2 8 2 11 0M32 26c3 6 3 12 0 18',
  },
  shrimp: {
    label: 'Shrimp & prawns', group: 'meat_seafood', color: '#FFAA8A',
    shape: 'M42 12c12 2 18 14 14 26-4 13-18 20-31 18-6-1-9-6-6-9 3-3 8-1 13-2 9-2 14-9 14-16 0-6-3-9-7-10-5-1-6-8 3-7Z',
    detail: 'M46 22c4 2 5 6 4 10M40 38c3 2 7 2 10-1M19 47l-9 1 5-7M44 18h.1',
  },
  crab: {
    label: 'Crab', group: 'meat_seafood', color: '#F48678',
    shape: 'M12 40c0-10 10-16 23-16s23 6 23 16-10 14-23 14-23-4-23-14Z',
    detail: 'M14 46l-7 5M13 40l-8 1M56 46l7 5M57 40l8 1M22 26c-4-6-10-8-14-4 4 0 6 2 7 5M48 26c4-6 10-8 14-4-4 0-6 2-7 5M29 34h.1M41 34h.1M31 41c3 2 5 2 8 0',
  },
  octopus: {
    label: 'Squid & octopus', group: 'meat_seafood', color: '#F4A6C0',
    shape: 'M35 9c12 0 18 9 18 20 0 6-2 10-5 13l4 12c1 3-3 4-5 1l-5-8-3 11c-1 3-4 3-5 0l-1-10-1 10c-1 3-4 3-5 0l-3-11-5 8c-2 3-6 2-5-1l4-12c-3-3-5-7-5-13 0-11 6-20 18-20Z',
    detail: 'M29 27h.1M41 27h.1M32 34c2 2 4 2 6 0',
  },
  shell: {
    label: 'Shellfish', group: 'meat_seafood', color: '#E6DCCD',
    shape: 'M10 44C10 26 21 14 35 14s25 12 25 30c-6 6-15 9-25 9s-19-3-25-9Z',
    detail: 'M35 14v39M24 17l3 35M46 17l-3 35M14 30l10 21M56 30l-10 21',
  },
  sushi: {
    label: 'Sushi', group: 'meat_seafood', color: '#F48678',
    shape: 'M10 34c4-12 18-16 30-14 10 1 18 6 20 12 1 3-1 5-4 5H14c-3 0-5-1-4-3ZM14 37h42v11c0 4-3 6-7 6H21c-4 0-7-2-7-6V37Z',
    detail: 'M27 23c2 4 2 9 0 13M39 21c2 5 2 11 0 15M31 45c3 2 5 2 8 0',
  },

  // Dairy & eggs
  milk: {
    label: 'Milk', group: 'dairy_eggs', color: '#E8F8F5',
    shape: 'M20 26 28 12h14l8 14v32H20V26Z',
    detail: 'M20 26h30M27 40c5 4 11 4 16 0',
  },
  cheese: {
    label: 'Cheese', group: 'dairy_eggs', color: '#FFD66B',
    shape: 'M8 34 44 14c12 3 18 11 19 20v24H8V34Z',
    detail: 'M8 34h55M22 44h.1M50 42h.1M28 47c4 3 8 3 12 0',
  },
  butter: {
    label: 'Butter', group: 'dairy_eggs', color: '#FFE9A0',
    shape: block,
    detail: 'M8 32h44l10-10M52 32v16M24 38c3 2 6 2 9 0',
  },
  yoghurt: {
    label: 'Yoghurt', group: 'dairy_eggs', color: '#B9EAE5',
    shape: 'M18 18h34l-4 39H22l-4-39Zm-3-8h40v10H15V10Z',
    detail: smile,
  },
  iceCream: {
    label: 'Ice cream', group: 'dairy_eggs', color: '#FFC2B8',
    shape: 'M20 31a15 15 0 1 1 30 0L35 62 20 31Z',
    detail: 'M20 31c5 4 10-1 15 2s10 1 15-2M30 23h.1M40 23h.1',
  },
  egg: {
    label: 'Egg', group: 'dairy_eggs', color: '#FFE9B8',
    shape: 'M35 10c12 0 20 18 20 29 0 12-9 20-20 20s-20-8-20-20c0-11 8-29 20-29Z',
    detail: 'M28 34h.1M42 34h.1M29 43c4 3 8 3 12 0',
  },

  // Grains & bakery
  bread: {
    label: 'Bread', group: 'grains', color: '#E8B877',
    shape: 'M14 30c-7-2-7-18 8-18h26c15 0 15 16 8 18v28H14V30Z',
    detail: 'M27 36c5 4 11 4 16 0',
  },
  croissant: {
    label: 'Croissant', group: 'grains', color: '#F2B56B',
    shape: 'M8 44c2-14 12-24 27-24s25 10 27 24c-4 4-10 4-13 1-3 4-9 5-14 5s-11-1-14-5c-3 3-9 3-13-1Z',
    detail: 'M22 26l5 22M35 21v28M48 26l-5 22',
  },
  baguette: {
    label: 'Baguette', group: 'grains', color: '#E8B877',
    shape: 'M12 56c-4-4-3-9 2-14L44 12c5-5 11-6 14-3s2 9-3 14L25 53c-5 5-9 7-13 3Z',
    detail: 'M23 39l6 6M33 29l6 6M43 19l6 6',
  },
  bagel: {
    label: 'Bagel & pretzel', group: 'grains', color: '#D9A066',
    shape: circle(35, 37, 22) + circle(35, 37, 7, true),
    detail: 'M24 22h.1M47 24h.1M48 48h.1M22 50h.1',
  },
  pancake: {
    label: 'Pancakes', group: 'grains', color: '#F2C46B',
    shape: 'M10 30c0-5 11-9 25-9s25 4 25 9v6c0 2-1 3-2 4v6c0 5-11 9-23 9s-23-4-23-9v-6c-1-1-2-2-2-4v-6Z',
    detail: 'M10 30c0 5 11 9 25 9s25-4 25-9M12 40c3 4 12 7 23 7s20-3 23-7',
  },
  rice: {
    label: 'Rice', group: 'grains', color: '#F7F1DE',
    shape: bowl,
    detail: 'M10 33h50M27 43c5 4 11 4 16 0',
  },
  noodles: {
    label: 'Pasta & noodles', group: 'grains', color: '#FFD66B',
    shape: bowl,
    detail: 'M10 33h50M20 25c5-5 10 5 15 0s10 5 15 0M27 43c5 4 11 4 16 0',
  },
  cereal: {
    label: 'Cereal & oats', group: 'grains', color: '#F2C46B',
    shape: bowl,
    detail: 'M10 33h50M22 27h.1M30 24h.1M40 25h.1M48 28h.1M27 43c5 4 11 4 16 0',
  },
  grain: {
    label: 'Flour & grains', group: 'grains', color: '#E8D29A',
    shape: 'M22 18c-3-4 0-8 4-8h18c4 0 7 4 4 8 8 6 14 16 14 26 0 9-8 14-27 14S8 53 8 44c0-10 6-20 14-26Z',
    detail: 'M22 18h26M35 30v20M35 35l-5-4M35 35l5-4M35 42l-5-4M35 42l5-4',
  },

  // Drinks
  juice: {
    label: 'Juice', group: 'drinks', color: '#FFD66B',
    shape: 'M18 18 24 10h30v40l-6 8H18V18Z',
    detail: 'M18 18h30l6-8M48 18v40M40 10l4-8 6 1M26 36h.1M40 36h.1M28 44c3 2 7 2 10 0',
  },
  bottle: {
    label: 'Bottle', group: 'drinks', color: '#B9EAE5',
    shape: 'M27 8h16v12l6 9v29H21V29l6-9V8Z',
    detail: smile,
  },
  softDrink: {
    label: 'Soft drink', group: 'drinks', color: '#F48678',
    shape: 'M18 20h34l-4 38H22l-4-38Zm-2-8h38v8H16v-8Z',
    detail: `M38 12l4-10h7${smile}`,
  },
  coffee: {
    label: 'Coffee', group: 'drinks', color: '#C9A27E',
    shape: 'M12 22h36v24c0 8-6 12-14 12h-8c-8 0-14-4-14-12V22Z',
    detail: 'M48 28h4c5 0 8 3 8 8s-3 8-8 8h-5M24 15c-3-3 3-6 0-9M34 15c-3-3 3-6 0-9M24 36c4 3 8 3 12 0',
  },
  tea: {
    label: 'Tea', group: 'drinks', color: '#B7DC72',
    shape: 'M10 30h42c0 14-9 24-21 24S10 44 10 30Z',
    detail: `M52 34c6 0 8 4 6 8-2 3-6 4-9 3M14 60h34${steam}M25 38c4 3 8 3 12 0`,
  },
  beer: {
    label: 'Beer', group: 'drinks', color: '#FFD66B',
    shape: 'M14 16h32v38c0 3-2 5-5 5H19c-3 0-5-2-5-5V16Z',
    detail: 'M14 22c3 3 7 3 9 0 3 3 7 3 9 0 3 3 7 3 9 0 2 2 4 2 5 0M46 26h5c5 0 8 3 8 8v6c0 5-3 8-8 8h-5M24 40c3 2 7 2 10 0',
  },
  wine: {
    label: 'Wine', group: 'drinks', color: '#C46B8A',
    shape: 'M20 8h30c0 18-6 30-15 30S20 26 20 8Z',
    detail: 'M35 38v20M24 60h22M21 17h28M31 26c3 2 5 2 8 0',
  },
  water: {
    label: 'Water', group: 'drinks', color: '#9ADCEB',
    shape: 'M35 8c10 14 20 24 20 34 0 11-9 18-20 18s-20-7-20-18c0-10 10-20 20-34Z',
    detail: 'M29 40h.1M41 40h.1M31 47c3 2 5 2 8 0',
  },

  // Other food
  jar: {
    label: 'Sauces & spreads', group: 'other', color: '#B7DC72',
    shape: 'M18 20h34v37H18V20Zm-2-10h38v11H16V10Z',
    detail: smile,
  },
  honey: {
    label: 'Honey', group: 'other', color: '#FFC15C',
    shape: 'M14 30c0-8 9-12 21-12s21 4 21 12v14c0 9-9 14-21 14s-21-5-21-14V30ZM20 9h30v8H20V9Z',
    detail: 'M15 30h40M24 30c0 6 4 6 4 0M30 42c3 2 7 2 10 0',
  },
  salt: {
    label: 'Salt & spices', group: 'other', color: '#F4EEDF',
    shape: 'M22 26c0-8 6-14 13-14s13 6 13 14v28c0 3-2 5-5 5H27c-3 0-5-2-5-5V26Z',
    detail: 'M22 24h26M31 17h.1M35 15h.1M39 17h.1M30 40h.1M40 40h.1M32 47c2 2 4 2 6 0',
  },
  can: {
    label: 'Canned food', group: 'other', color: '#F48678',
    shape: 'M16 14c0-8 38-8 38 0v42c0 8-38 8-38 0V14Z',
    detail: 'M16 14c0 8 38 8 38 0M27 38c5 4 11 4 16 0',
  },
  beans: {
    label: 'Beans & lentils', group: 'other', color: '#C98A6C',
    shape: 'M14 40c-4-10 4-20 14-18 6 1 8 6 14 6s10-6 16-2c6 5 2 16-8 20-10 5-32 6-36-6Z',
    detail: 'M22 31c2-2 5-3 8-2M30 38h.1M42 38h.1M32 45c3 2 6 2 9 0',
  },
  tofu: {
    label: 'Tofu', group: 'other', color: '#F7F1DE',
    shape: block,
    detail: 'M8 32h44l10-10M52 32v16M24 38c3 2 6 2 9 0',
  },
  nut: {
    label: 'Nuts', group: 'other', color: '#D9B382',
    shape: 'M35 6c8 0 13 6 12 13-1 5-4 7-4 11s4 6 5 11c2 9-5 17-13 17s-15-8-13-17c1-5 5-7 5-11s-3-6-4-11c-1-7 4-13 12-13Z',
    detail: 'M30 16h.1M40 14h.1M30 45h.1M41 49h.1M31 29c3 2 5 2 8 0',
  },
  chocolate: {
    label: 'Chocolate', group: 'other', color: '#A9785A',
    shape: 'M14 12h42v46H14V12Z',
    detail: 'M14 27h42M14 42h42M35 12v46',
  },
  cookie: {
    label: 'Cookies & biscuits', group: 'other', color: '#E8B877',
    shape: round,
    detail: 'M24 27l3 2M44 26l2 3M23 44l3-1M46 45l-2 2M28 36h.1M42 36h.1M31 43c3 2 5 2 8 0',
  },
  candy: {
    label: 'Sweets', group: 'other', color: '#F4A6C0',
    shape: `${circle(35, 36, 12)}M24 36 10 26v20ZM46 36l14-10v20Z`,
    detail: 'M30 33c3-3 9-1 9 3s-4 5-6 3',
  },
  snack: {
    label: 'Snacks & crisps', group: 'other', color: '#FFB35C',
    shape: 'M16 12h38l-3 6c4 10 4 26 0 36l3 6H16l3-6c-4-10-4-26 0-36l-3-6Z',
    detail: 'M19 18h32M19 54h32M29 33h.1M41 33h.1M30 40c3 2 7 2 10 0',
  },
  cake: {
    label: 'Cake & pastries', group: 'other', color: '#FFC2B8',
    shape: `M8 38 50 22l12 8v26H8V38Z${circle(50, 15, 5)}`,
    detail: 'M8 38h54M8 47h54',
  },
  sandwich: {
    label: 'Sandwiches & wraps', group: 'other', color: '#F2C46B',
    shape: 'M8 52 35 14l27 38H8Z',
    detail: 'M14 44h42M20 36h30M31 48c3 2 5 2 8 0',
  },
  pizza: {
    label: 'Pizza', group: 'other', color: '#FFD66B',
    shape: 'M10 14c16-6 34-6 50 0L35 62 10 14Z',
    detail: `M13 20c15-5 29-5 44 0${circle(28, 28, 3.5)}${circle(42, 29, 3.5)}${circle(35, 42, 3.5)}`,
  },
  burger: {
    label: 'Burger', group: 'other', color: '#E8B877',
    shape: 'M10 32c0-12 11-20 25-20s25 8 25 20H10ZM8 36h54v6H8V36ZM10 46h50v4c0 4-3 7-7 7H17c-4 0-7-3-7-7v-4Z',
    detail: 'M28 20h.1M38 18h.1M45 24h.1M24 25h.1',
  },
  salad: {
    label: 'Salad', group: 'other', color: '#91D985',
    shape: 'M8 34h54c0 14-12 24-27 24S8 48 8 34Z',
    detail: 'M16 34c0-8 6-14 14-14 2-6 10-8 14-4 6-2 12 4 10 10M30 34c0-5 3-8 7-9M29 44c4 3 8 3 12 0',
  },
  soup: {
    label: 'Soups & curries', group: 'other', color: '#F2B56B',
    shape: 'M8 30h54c0 15-12 26-27 26S8 45 8 30Z',
    detail: `${steam}M46 22c-3-3 3-6 0-9M29 40c4 3 8 3 12 0`,
  },
  dumpling: {
    label: 'Dumplings', group: 'other', color: '#F7F1DE',
    shape: 'M8 44c0-14 12-24 27-24s27 10 27 24c0 6-12 10-27 10S8 50 8 44Z',
    detail: 'M24 22c2 4 2 8 0 12M35 20v14M46 22c-2 4-2 8 0 12M31 44c2 2 6 2 8 0',
  },
  ice: {
    label: 'Frozen food', group: 'other', color: '#CDEFFB',
    shape: 'M14 24 35 12l21 12v24L35 60 14 48V24Z',
    detail: 'M14 24l21 12 21-12M35 36v24M20 38h.1M28 42h.1M21 46c2 2 5 2 7 1',
  },
  box: {
    label: 'Other food', group: 'other', color: '#B9EAE5',
    shape: 'M14 24h42v33H14V24Zm-3-11h48v11H11V13Z',
    detail: 'M27 37c5 4 11 4 16 0',
  },
}

export const FOOD_ICON_IDS = Object.keys(FOOD_ICONS)

// Used whenever nothing else matches, so every food always gets an icon.
export const DEFAULT_FOOD_ICON = 'box'
