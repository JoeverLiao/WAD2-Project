// Tests for the receipt text parser. Pure functions, no database or network.
// Run from the server folder:  node --test tests/receiptParser.test.js
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { findPurchaseDate, parseReceiptText, tidyName } from '../services/receiptParser.js'

const today = new Date('2026-10-21T08:00:00+08:00')
const parse = (text) => parseReceiptText(text, { today })
const names = (r) => r.items.map((i) => i.name)

describe('dates', () => {
  const date = (line) => findPurchaseDate([line], today)

  test('reads year-first dates', () => {
    assert.deepEqual(date('2020-09-18 23:02:50, Kassa3'), { purchasedAt: '2020-09-18', dateAmbiguous: false })
  })
  test('month-first only when the numbers force it', () => {
    assert.deepEqual(date('04/24/2024 10:13 AM'), { purchasedAt: '2024-04-24', dateAmbiguous: false })
  })
  test('day-first by default, and says when it is a guess', () => {
    assert.deepEqual(date('Date: 12/10/2026'), { purchasedAt: '2026-10-12', dateAmbiguous: true })
    assert.deepEqual(date('25/12/2025'), { purchasedAt: '2025-12-25', dateAmbiguous: false })
  })
  test('two-digit years and different separators', () => {
    assert.equal(date('12.10.26').purchasedAt, '2026-10-12')
    assert.equal(date('12-10-2026').purchasedAt, '2026-10-12')
  })
  test('month names', () => {
    assert.equal(date('18 Oct 2026').purchasedAt, '2026-10-18')
    assert.equal(date('Oct 18, 2026').purchasedAt, '2026-10-18')
    assert.equal(date('18-OCT-26').purchasedAt, '2026-10-18')
  })
  test('fixes letters that OCR confuses with digits', () => {
    assert.equal(date('l2/IO/2O26').purchasedAt, '2026-10-12')
  })
  test('ignores impossible, future and expiry dates', () => {
    assert.equal(date('31/02/2026').purchasedAt, null)
    assert.equal(date('01/01/2030').purchasedAt, null)
    assert.equal(date('EXP 12/12/2026').purchasedAt, null)
    assert.equal(date('Best before 12/12/2026').purchasedAt, null)
  })
  test('prefers the line that says "date"', () => {
    const r = findPurchaseDate(['Promo ends 01/11/2025', 'Date: 12/10/2026 10:15'], today)
    assert.equal(r.purchasedAt, '2026-10-12')
  })
})

describe('names', () => {
  test('tidies codes, symbols and capitals', () => {
    assert.equal(tidyName('FRESH MILK 1L 05178600879'), 'Fresh Milk 1L')
    assert.equal(tidyName('4012 ORANGE NAVEL LG'), 'Orange Navel Lg')
    assert.equal(tidyName('CHICKEN BREAST 500G'), 'Chicken Breast 500g')
    assert.equal(tidyName('  **Brown   Rice** |'), 'Brown Rice')
    assert.equal(tidyName('Mixed Case Item'), 'Mixed Case Item')
  })
})

describe('Singapore supermarket receipt (quantity in its own column)', () => {
  const r = parse(`NTUC FAIRPRICE
Date: 12/10/2026  Time: 10:15
----------------------------
FRESH MILK 1L        2   6.40
EGGS LARGE 10S       1   3.20
BANANA CAVENDISH     1   2.10
CHICKEN BREAST 500G  1   7.95
----------------------------
TOTAL                   19.65`)

  test('finds the shop, date and total', () => {
    assert.equal(r.merchant, 'Ntuc Fairprice')
    assert.equal(r.purchasedAt, '2026-10-12')
    assert.equal(r.dateAmbiguous, true)
    assert.equal(r.total, 19.65)
    assert.equal(r.totalMatches, true)
  })
  test('finds each item with its quantity and price', () => {
    assert.deepEqual(names(r), ['Fresh Milk 1L', 'Eggs Large 10s', 'Banana Cavendish', 'Chicken Breast 500g'])
    assert.deepEqual(r.items.map((i) => i.quantity), [2, 1, 1, 1])
    assert.deepEqual(r.items.map((i) => i.price), [6.4, 3.2, 2.1, 7.95])
  })
  test('suggests storage and an estimated expiry from the purchase date', () => {
    const [milk, , banana] = r.items
    assert.equal(milk.storage, 'fridge')
    assert.equal(milk.expiresAt, '2026-10-19')
    assert.equal(milk.expiresEstimated, true)
    assert.equal(banana.storage, 'pantry')
  })
})

describe('leading quantity formats', () => {
  test('"2 x Apples 3.00", "3x Eggs 4.50" and decimal-comma quantities', () => {
    const r = parse(`2 x Apples 3.00
3x Eggs 4.50
1,00 Norrlands Guld 45,00`)
    assert.deepEqual(r.items.map((i) => [i.name, i.quantity, i.price]), [
      ['Apples', 2, 3],
      ['Eggs', 3, 4.5],
      ['Norrlands Guld', 1, 45],
    ])
  })
  test('a size is part of the name, not the quantity', () => {
    const r = parse('500G CHICKEN BREAST 7.95\n1L MILK 3.20')
    assert.deepEqual(r.items.map((i) => i.quantity), [1, 1])
  })
})

describe('coffee shop receipt', () => {
  const r = parse(`COFFEE SHOP
123 MAIN STREET
CITY, ST 12345
Receipt
04/24/2024 10:13 AM
1 COFFEE 3.00
1 LATTE 4.00
1 CROISSANT 3.50
Subtotal 10.50
Tax 0.92
Total 11.42
Thank you!`)
  test('keeps items, drops address, subtotal, tax and thanks', () => {
    assert.deepEqual(names(r), ['Coffee', 'Latte', 'Croissant'])
    assert.equal(r.purchasedAt, '2024-04-24')
    assert.equal(r.subtotal, 10.5)
    assert.equal(r.total, 11.42)
  })
  test('items add up to the subtotal even though tax makes the total higher', () => {
    assert.equal(r.itemsSum, 10.5)
    assert.equal(r.totalMatches, true)
  })
})

describe('Swedish receipt read by the real OCR', () => {
  const r = parse(`Brs kaaantan
Tel:08-6120388
2020-09-18 23:02:50,Ka8883
Kassor::Baran SNr：80781301106321174
NOTA
1,00 Norrlands Guld 45,00
1,00 Norrlande Guld 45,00
1,00 Norrlands Guld 45,00
Totalt: 675,00:-
Netto Hons Brutto
250 540.00 135.01 675.10`)
  test('reads the date and the repeated items', () => {
    assert.equal(r.purchasedAt, '2020-09-18')
    assert.equal(r.items.length, 3)
    assert.ok(r.items.every((i) => i.quantity === 1 && i.price === 45))
    assert.equal(r.total, 675)
  })
  test('does not mistake the VAT table for items', () => {
    assert.ok(!names(r).some((n) => /netto|brutto|moms/i.test(n)))
  })
  test('warns about a product it does not recognise', () => {
    assert.ok(r.items[0].warnings.some((w) => /check this item/i.test(w)))
  })
})

describe('Canadian supermarket receipt (details on the line below the item)', () => {
  const r = parse(`REAL CANADIAN Superstore
GROCERY
05178600879 FINISH QUANTUM MRJ 7.27
41800500513 SAVE $2 FINISH MRJ -2.00
67785200222 HERBAL TEA MRJ 3.49
PRODUCE
5314225 AVOCADO MRJ
3 @ $1.47 4.41
4012 ORANGE NAVEL LG MRJ
0.358 kg @ $1.56/kg 0.56
4046 LIME MRJ
5 @ $0.40 2.00
HOME
0571460341 ZIPLOC ORG SINGL MRJ 4.89
OTC
0620005326 TYLENOL COLD & S MRJ 7.49
Manufacturer/Store Coupons
MFR CPN -3.00
SUBTOTAL 25.11
H-HST 13% 17.45 2.27
TOTAL 27.38`)
  const byName = Object.fromEntries(r.items.map((i) => [i.name, i]))

  test('keeps the multi-line items with their quantity, unit and price', () => {
    assert.equal(byName['Avocado'].quantity, 3)
    assert.equal(byName['Avocado'].price, 4.41)
    assert.equal(byName['Orange Navel Lg'].quantity, 0.358)
    assert.equal(byName['Orange Navel Lg'].unit, 'kg')
    assert.equal(byName['Orange Navel Lg'].price, 0.56)
    assert.equal(byName['Lime'].quantity, 5)
    assert.equal(byName['Lime'].price, 2)
  })
  test('does not turn discounts, coupons, tax or headings into items', () => {
    assert.deepEqual(names(r), [
      'Finish Quantum', 'Herbal Tea', 'Avocado', 'Orange Navel Lg', 'Lime', 'Ziploc Org Singl', 'Tylenol Cold & S',
    ])
  })
  test('starts non-food items unticked', () => {
    assert.equal(byName['Finish Quantum'].include, false)
    assert.equal(byName['Ziploc Org Singl'].include, false)
    assert.equal(byName['Tylenol Cold & S'].include, false)
    assert.equal(byName['Avocado'].include, true)
  })
  test('items less coupons add up to the subtotal', () => {
    assert.equal(r.subtotal, 25.11)
    assert.equal(r.totalMatches, true)
  })
})

describe('OCR slips in the total line', () => {
  test('"Fotal" and "T0TAL" are still the total, not an item', () => {
    for (const word of ['Fotal', 'T0TAL', 'TOTAL']) {
      const r = parse(`1 Milk 3.20\n${word} 3.20`)
      assert.deepEqual(names(r), ['Milk'])
      assert.equal(r.total, 3.2)
    }
  })
})

describe('bad input', () => {
  test('empty, null and garbage text give no items and do not throw', () => {
    for (const text of ['', null, undefined, '   \n \n', '||| ~~~ ###', 'rs has\nLr |\nBhaaasnstisggyyysgqssnssssing\nNOTA']) {
      const r = parse(text)
      assert.deepEqual(r.items, [])
      assert.equal(r.merchant, null)
    }
  })
  test('a line with no readable price is only kept when it starts with a small quantity', () => {
    const r = parse('1,00 Norrlands Guld &,0\nHeader without price\n123 MAIN STREET')
    assert.deepEqual(r.items.map((i) => [i.name, i.price]), [['Norrlands Guld', null]])
    assert.ok(r.items[0].warnings.includes('Price could not be read'))
  })
  test('never returns more than 100 items', () => {
    const text = Array.from({ length: 150 }, (_, i) => `Item${i} apple 1.00`).join('\n')
    assert.equal(parse(text).items.length, 100)
  })
})
