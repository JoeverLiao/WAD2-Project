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
    assert.deepEqual(names(r), ['Milk', 'Eggs', 'Banana', 'Chicken Breast'])
    assert.deepEqual(r.items.map((i) => i.quantity), [2, 1, 1, 1])
    assert.deepEqual(r.items.map((i) => i.price), [6.4, 3.2, 2.1, 7.95])
  })
  test('suggests where each item is stored but never a use-by date', () => {
    const [milk, , banana] = r.items
    assert.equal(milk.storage, 'fridge')
    assert.equal(banana.storage, 'pantry')
    assert.ok(r.items.every((i) => i.expiresAt === null && !('expiresEstimated' in i)))
  })
  test('keeps the wording from the receipt next to the standard name', () => {
    assert.equal(r.items[0].receiptName, 'Fresh Milk 1L')
  })
})

describe('leading quantity formats', () => {
  test('"2 x Apples 3.00", "3x Eggs 4.50" and decimal-comma quantities', () => {
    const r = parse(`2 x Apples 3.00
3x Eggs 4.50
1,00 Norrlands Guld 45,00`)
    assert.deepEqual(r.items.map((i) => [i.name, i.quantity, i.price]), [
      ['Apple', 2, 3],
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
    assert.equal(r.items.length, 1) // three lines of the same beer are ONE item
    assert.equal(r.items[0].quantity, 3)
    assert.equal(r.items[0].price, 135)
    assert.equal(r.total, 675)
  })
  test('does not mistake the VAT table for items', () => {
    assert.ok(!names(r).some((n) => /netto|brutto|moms/i.test(n)))
  })
  test('warns about a product it does not recognise, and about the combined lines', () => {
    assert.ok(r.items[0].warnings.some((w) => /check this item/i.test(w)))
    assert.ok(r.items[0].warnings.some((w) => /3 receipt lines/i.test(w)))
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
    assert.equal(byName['Orange'].quantity, 0.358)
    assert.equal(byName['Orange'].unit, 'kg')
    assert.equal(byName['Orange'].price, 0.56)
    assert.equal(byName['Lime'].quantity, 5)
    assert.equal(byName['Lime'].price, 2)
  })
  test('does not turn discounts, coupons, tax or headings into items', () => {
    assert.deepEqual(names(r), ['Tea', 'Avocado', 'Orange', 'Lime'])
  })
  test('leaves non-food items out of the list completely, and says what was left out', () => {
    assert.deepEqual(r.skipped, ['Finish Quantum', 'Ziploc Org Singl', 'Tylenol Cold & S'])
    assert.ok(r.items.every((i) => i.include === true))
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

describe('the same product is always ONE item with a clean, shared name', () => {
  test('repeated lines add up; the count printed at the front is never part of the name', () => {
    const r = parse(`CAFE
1COFFEE 3.00
1LATTE 4.00
2COFFEE 6.00
1 COFFEE 3.00
Subtotal 16.00`)
    assert.deepEqual(r.items.map((i) => [i.name, i.quantity, i.price]), [
      ['Coffee', 4, 12],
      ['Latte', 1, 4],
    ])
    assert.equal(r.totalMatches, true)
  })
  test('different brands and sizes of the same product get the same name', () => {
    const r = parse('1 MEIJI FRESH MILK 1L 3.00\n2 FARMHOUSE MILK 2L 8.00')
    assert.deepEqual(r.items.map((i) => [i.name, i.quantity]), [['Milk', 3]])
  })
  test('products with a code or a tax flag are cleaned (Target style)', () => {
    const r = parse(`GROCERY
284060402 HORIZON NF $5.49
261030079GG Nf $10.89
083057607 B&B T $14.99
083057779 PETCOLLAR T $5.99
SUBTOTAL $37.36`)
    assert.deepEqual(names(r), ['Horizon', 'GG', 'B&B'])
    assert.deepEqual(r.skipped, ['Petcollar']) // not food: left out, but counted in the totals
    assert.equal(r.totalMatches, true)
  })
  test('tax and payment lines are never added as items, even when OCR glued them together', () => {
    const r = parse(`1 Milk 3.00
SUBTOTAL $3.00
T=FLTAX7.000000n$20.98 $1.47
TAX 7.000000% $0.21
*0015 MASTERCARD CHARGE $3.21
AID: A0000000041010
TOTAL $3.21`)
    assert.deepEqual(names(r), ['Milk'])
  })
})

describe('names with missing spaces, abbreviations and promotion text', () => {
  const r = parse(`FAIRPRICE
12/10/2026
AUSTJPNPUMPKIN 2.87
AUST JPN PUMPKIN 2.87
FRESH MILK 1L 3.20
NORMAL PRICE 3.90
2 FOR $5.00
TOILETPAPER 8PK 6.50
RASPBERY 125G 4.50
SAVE 1.00
WAS $4.00 NOW $3.00
Subtotal 19.94
Total 19.94`)
  test('finds the real food inside a run-together or abbreviated name', () => {
    assert.deepEqual(names(r), ['Pumpkin', 'Milk', 'Raspberry'])
    assert.equal(r.items[0].quantity, 2) // the two pumpkin lines are one item
    assert.equal(r.items[0].dietType ?? 'vegan', 'vegan')
  })
  test('promotion text and non-food are never listed', () => {
    assert.ok(!names(r).some((n) => /normal|price|for|save|was|now|toilet/i.test(n)))
    assert.deepEqual(r.skipped, ['Toiletpaper 8pk'])
    assert.equal(r.totalMatches, true)
  })
  test('promotion-only names are rejected even without a price word match', () => {
    assert.deepEqual(names(parse('1 Milk 3.20\nSpecial Offer 1.00\nEach 2.00\nNormal 3.00')), ['Milk'])
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
    const word = (i) => String.fromCharCode(97 + (i % 26)) + String.fromCharCode(97 + Math.floor(i / 26))
    const text = Array.from({ length: 150 }, (_, i) => `Prod ${word(i)}${word(i)} 1.00`).join('\n')
    assert.equal(parse(text).items.length, 100)
  })
})
