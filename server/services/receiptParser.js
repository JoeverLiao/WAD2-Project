// Turns the raw text of a receipt (from OCR) into a list of purchased items, with quantities,
// prices and the purchase date. Pure functions only: no database, no network, easy to test.
//
// OCR text is imperfect, so the parser is careful rather than clever: it only keeps a line as an
// item when it can find a plausible name AND (a price OR a leading quantity). Everything it is
// unsure about is flagged in `warnings`, so the review form can ask the user to check it.
import { classifyItem } from './foodKnowledge.js'

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
}
const MIN_YEAR = 2000
const MAX_ITEMS = 100

// ----- small helpers -------------------------------------------------------------------------

function pad(n) {
  return String(n).padStart(2, '0')
}

function isoDate(year, month, day) {
  return `${year}-${pad(month)}-${pad(day)}`
}

function isRealDate(year, month, day) {
  if (year < MIN_YEAR || month < 1 || month > 12 || day < 1 || day > 31) return false
  const d = new Date(Date.UTC(year, month - 1, day))
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day
}

function todayIso(today) {
  return isoDate(today.getFullYear(), today.getMonth() + 1, today.getDate())
}

// Receipts are sometimes printed or scanned a day ahead/behind; allow one day of slack.
function notInFuture(iso, today) {
  const limit = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  return iso <= isoDate(limit.getFullYear(), limit.getMonth() + 1, limit.getDate())
}

export function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + days))
  return isoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
}

// OCR often reads the digit 0 as the letter O and 1 as l or I. Fix that inside number-like tokens.
function fixDigitLookalikes(token) {
  return token.replace(/[Oo]/g, '0').replace(/[lI|]/g, '1')
}

function cleanSpaces(s) {
  return s.replace(/[\t ]+/g, ' ').replace(/ {1,}/g, (m) => (m.length > 1 ? m : ' ')).trimEnd()
}

// ----- dates ---------------------------------------------------------------------------------

const DATE_NUM = /(?<![\d/.-])([\dOolI]{1,4})\s?([/.-])\s?([\dOolI]{1,2})\s?\2\s?([\dOolI]{2,4})(?![\d/-])/g
const DATE_TEXT_DMY = /\b(\d{1,2})[\s\-./]*(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?,?[\s\-./]*(\d{4}|\d{2})\b/gi
const DATE_TEXT_MDY = /\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?[\s\-./]*(\d{1,2})(?:st|nd|rd|th)?,?[\s\-./]*(\d{4})\b/gi
const NOT_PURCHASE_DATE = /\b(exp|expiry|expires|best\s*before|use\s*by|valid|until|till|due)\b/i

function fullYear(text) {
  const y = Number(text)
  if (text.length === 2) return y >= 70 ? 1900 + y : 2000 + y
  return y
}

/** Candidate dates found on one line, as { iso, ambiguous }. */
function datesOnLine(line) {
  const found = []

  for (const m of line.matchAll(DATE_NUM)) {
    const a = fixDigitLookalikes(m[1])
    const b = fixDigitLookalikes(m[3])
    const c = fixDigitLookalikes(m[4])
    if (![a, b, c].every((t) => /^\d+$/.test(t))) continue
    if (a.length === 4) {
      // 2026-10-12  (year first)
      const [y, mo, d] = [Number(a), Number(b), Number(c)]
      if (c.length <= 2 && isRealDate(y, mo, d)) found.push({ iso: isoDate(y, mo, d), ambiguous: false })
      continue
    }
    if (a.length > 2 || b.length > 2 || (c.length !== 2 && c.length !== 4)) continue
    const first = Number(a)
    const second = Number(b)
    const year = fullYear(c)
    // Day first is the default (Singapore, UK, most of the world). Month first only when the
    // numbers force it, e.g. 04/24/2024.
    const dayFirstOk = isRealDate(year, second, first)
    const monthFirstOk = isRealDate(year, first, second)
    if (dayFirstOk && monthFirstOk) {
      found.push({ iso: isoDate(year, second, first), ambiguous: first !== second })
    } else if (dayFirstOk) {
      found.push({ iso: isoDate(year, second, first), ambiguous: false })
    } else if (monthFirstOk) {
      found.push({ iso: isoDate(year, first, second), ambiguous: false })
    }
  }

  for (const m of line.matchAll(DATE_TEXT_DMY)) {
    const year = fullYear(m[3])
    const month = MONTHS[m[2].toLowerCase()]
    if (isRealDate(year, month, Number(m[1]))) found.push({ iso: isoDate(year, month, Number(m[1])), ambiguous: false })
  }
  for (const m of line.matchAll(DATE_TEXT_MDY)) {
    const month = MONTHS[m[1].toLowerCase()]
    if (isRealDate(Number(m[3]), month, Number(m[2]))) {
      found.push({ iso: isoDate(Number(m[3]), month, Number(m[2])), ambiguous: false })
    }
  }
  return found
}

/**
 * Find the purchase date.
 * @returns {{ purchasedAt: string|null, dateAmbiguous: boolean }}
 */
export function findPurchaseDate(lines, today = new Date()) {
  const candidates = []
  lines.forEach((line, index) => {
    if (NOT_PURCHASE_DATE.test(line)) return
    for (const d of datesOnLine(line)) {
      if (!notInFuture(d.iso, today)) continue
      // A line that says "date" or has a time next to it is very likely the purchase date.
      const score = (/\bdate\b|\btarikh\b|\bdatum\b/i.test(line) ? 2 : 0) + (/\d{1,2}:\d{2}/.test(line) ? 1 : 0)
      candidates.push({ ...d, score, index })
    }
  })
  if (!candidates.length) return { purchasedAt: null, dateAmbiguous: false }
  candidates.sort((x, y) => y.score - x.score || x.index - y.index)
  return { purchasedAt: candidates[0].iso, dateAmbiguous: candidates[0].ambiguous }
}

// ----- lines that are never items --------------------------------------------------------------

const NON_ITEM_LINE = new RegExp(
  [
    '\\b(sub\\s?total|total|totalt|grand\\s*total|amount|balance|change|cash|tender|tendered|rounding|round\\s*off)\\b',
    '\\b(gst|hst|pst|vat|tax|moms|svc|service\\s*charge|surcharge|tip|gratuity)\\b',
    '%',
    '\\b(visa|master\\s?card|amex|nets|paynow|paylah|credit|debit|card|payment|paid|approval|auth|terminal|batch|trace)\\b',
    '\\b(thank|thanks|welcome|goodbye|please\\s+come|have\\s+a\\s+nice|visit\\s+us|follow\\s+us|survey|feedback)\\b',
    '\\b(receipt|invoice|nota|kvitto|tel|telephone|phone|hotline|fax|www|http|website|email|e-mail)\\b',
    '\\.(com|sg|net|org)\\b',
    '\\b(cashier|kass[oö]r|kassa|server|operator|staff|clerk|guest|table|order\\s*(no|#)|trans(action)?|ref(erence)?|store\\s*(no|#)?|outlet|branch|reg(ister)?|pos|till)\\b',
    '\\b(member|membership|points?|rewards?|loyalty|voucher|you\\s+saved?|savings?|netto|brutto|items?\\s+(sold|count)|no\\.?\\s+of\\s+items?|qty\\s+total)\\b',
    '\\b(gst\\s*(reg|no)|uen|co\\.?\\s*reg|reg(istration)?\\s*no|vat\\s*no)\\b',
    '\\b(returns?|exchange|policy|terms)\\b',
  ].join('|'),
  'i',
)
const DISCOUNT_LINE = /\b(discount|disc|coupon|cpn|promo|promotion|offer|voucher|save|saving|rebate|mfr|manufacturer|off)\b/i
// OCR often reads the T of TOTAL as F and the O as 0.
const TOTAL_WORD = /\b(?:[tf][o0]tal|[tf][o0]talt|grand\s*[tf][o0]tal)\b/i
const ADDRESS_WORDS = /\b(street|st|road|rd|avenue|ave|blvd|lane|drive|dr|singapore|blk|block|level|unit|city|stockholm)\b/i
const SEPARATOR_LINE = /^[\s\-_=*#.~+|:]{3,}$/

// ----- prices and quantities -------------------------------------------------------------------

// A price at the end of the line: 6.40, 6,40, $6.40, S$6.40, 6.40 A, 6.40 T*, -3.00
const TRAILING_PRICE = /(-?)\s*(?:S\$|\$|€|£|RM)?\s*(\d{1,6}(?:[.,]\d{2}))\s*(?:[A-Za-z]{1,4}\*?|\*)?\s*:?-?\s*$/

function parseAmount(text) {
  const n = Number(String(text).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

// "2 @ $1.50", "0.358 kg @ $8.48/kg", "3 x 1.50": extra detail printed under an item.
const WEIGHT_DETAIL = /^\s*(\d+(?:[.,]\d+)?)\s*(kg|g|lb|lbs|oz|l|ml)\b/i
const COUNT_DETAIL = /^\s*(\d+)\s*(?:@|x|×|\*)\s*(?:S\$|\$)?\s*\d+(?:[.,]\d+)?/i

const UNIT_WORDS = /^(g|kg|ml|l|oz|lb|lbs|pk|pack|packs|pcs|pc|s)$/i

/**
 * Strip noise from a product name and make it readable.
 * "FRESH MILK 1L 05178600879" -> "Fresh Milk 1L"
 */
export function tidyName(raw) {
  let name = raw
    .replace(/\b\d{5,}\b/g, ' ') // product / barcode numbers
    .replace(/^\s*\d{4}\s+(?=[A-Za-z])/, '') // short produce codes such as "4012 ORANGE"
    .replace(/\s+(?:H?MRJ|GST|HST|PST|TX)\s*$/i, '') // tax flags printed before the price
    .replace(/[|_~`^<>{}[\]\\]/g, ' ') // characters OCR invents
    .replace(/[.·•]{2,}/g, ' ') // dotted leaders
    .replace(/\s*[*#@]+\s*/g, ' ')
    .replace(/^[\s\-–—:;,.'"]+|[\s\-–—:;,.'"]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  const letters = name.replace(/[^A-Za-z]/g, '')
  if (letters.length >= 3 && letters === letters.toUpperCase()) {
    name = name
      .split(' ')
      .map((word) => {
        const size = word.match(/^(\d+(?:\.\d+)?)(ml|l|g|kg|oz|lb|s|pk|pc|pcs)$/i)
        if (size) return size[1] + (size[2].toLowerCase() === 'l' ? 'L' : size[2].toLowerCase())
        if (/\d/.test(word)) return word
        return word.charAt(0) + word.slice(1).toLowerCase()
      })
      .join(' ')
  }
  return name
}

function hasEnoughLetters(name) {
  return (name.match(/[A-Za-z]/g) || []).length >= 3
}

/**
 * Pull a quantity off the front or the end of an item line.
 * @returns {{ quantity: number|null, unit: string|null, name: string }}
 */
function takeQuantity(text) {
  // "2 x Apples", "2x Apples", "1,00 Norrlands Guld", "3 EGGS"
  const lead = text.match(/^\s*(\d{1,3}(?:[.,]\d{1,3})?)\s*(?:x|×|\*)?\s+(?=[A-Za-z])(.*)$/i)
  if (lead) {
    const rest = lead[2]
    const firstWord = rest.split(/\s+/)[0]
    const q = parseAmount(lead[1])
    if (q !== null && q > 0 && q <= 999 && !UNIT_WORDS.test(firstWord)) {
      return { quantity: q, unit: null, name: rest }
    }
  }
  // "FRESH MILK 1L        2": a lone number in its own column at the end (2+ spaces before it).
  const trail = text.match(/^(.*?\S)\s{2,}(\d{1,2})\s*$/)
  if (trail && !UNIT_WORDS.test(trail[2])) {
    const q = Number(trail[2])
    if (q > 0) return { quantity: q, unit: null, name: trail[1] }
  }
  // "Apples x3"
  const times = text.match(/^(.*?\S)\s+[x×]\s?(\d{1,2})\s*$/i)
  if (times) return { quantity: Number(times[2]), unit: null, name: times[1] }

  return { quantity: null, unit: null, name: text }
}

function looksLikeMerchantLine(line) {
  const letters = (line.match(/[A-Za-z]/g) || []).length
  const total = line.replace(/\s/g, '').length
  if (letters < 5 || total === 0 || letters / total < 0.7) return false
  if (line.length > 45) return false
  const words = line.split(/\s+/).filter((w) => /[A-Za-z]/.test(w))
  const avgLength = words.reduce((n, w) => n + w.replace(/[^A-Za-z]/g, '').length, 0) / words.length
  if (avgLength < 3.5) return false // "rs has", "Lr": OCR noise, not a shop name
  if (words.some((w) => w.length > 18)) return false // a 25-letter "word" is OCR noise
  const wordLike = words.filter((w) => /^[A-Za-z][A-Za-z&'.,-]*$/.test(w)).length
  if (wordLike / words.length < 0.75) return false // "aite) lavage 15": stray symbols and numbers
  if (/\b(street|st\.|road|rd\.|avenue|ave\.|blvd|singapore|#\d|unit|level|blk|block|tel|phone|www|receipt|invoice|date|time|gst)\b/i.test(line)) return false
  return true
}

// ----- main entry point ------------------------------------------------------------------------

/**
 * @param {string} rawText text from OCR, one receipt line per text line
 * @param {{ today?: Date }} [options]
 * @returns {{
 *   merchant: string|null,
 *   purchasedAt: string|null,
 *   dateAmbiguous: boolean,
 *   total: number|null,
 *   itemsSum: number,
 *   totalMatches: boolean|null,
 *   items: Array<{
 *     name: string, quantity: number, unit: string, price: number|null,
 *     storage: 'fridge'|'freezer'|'pantry', expiresAt: string|null, expiresEstimated: boolean,
 *     likelyFood: boolean|null, include: boolean, rawLine: string, warnings: string[]
 *   }>
 * }}
 */
export function parseReceiptText(rawText, { today = new Date() } = {}) {
  const lines = String(rawText ?? '')
    .split(/\r?\n/)
    .map(cleanSpaces)
    .filter((line) => line.trim() && !SEPARATOR_LINE.test(line))

  const { purchasedAt, dateAmbiguous } = findPurchaseDate(lines, today)
  const baseDate = purchasedAt ?? todayIso(today)

  let merchant = null
  let total = null
  let subtotal = null
  let discounts = 0
  const items = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    // Total line: remember the amount, never an item.
    if (TOTAL_WORD.test(line) && !/\bsub\s?[tf][o0]tal\b/i.test(line)) {
      const m = line.match(TRAILING_PRICE)
      if (m && m[1] !== '-') total = parseAmount(m[2])
      continue
    }
    if (/\bsub\s?[tf][o0]tal\b/i.test(line)) {
      const m = line.match(TRAILING_PRICE)
      if (m && m[1] !== '-') subtotal = parseAmount(m[2])
      continue
    }
    if (NON_ITEM_LINE.test(line)) continue

    const priceMatch = line.match(TRAILING_PRICE)
    const price = priceMatch ? parseAmount(priceMatch[2]) : null
    const negative = Boolean(priceMatch && priceMatch[1] === '-')
    const body = priceMatch ? line.slice(0, priceMatch.index).trim() : line

    // Extra detail printed under the previous item ("3 @ $1.47", "0.358 kg @ $8.48/kg").
    const previous = items[items.length - 1]
    const weight = body.match(WEIGHT_DETAIL)
    const count = body.match(COUNT_DETAIL)
    if (previous && previous.lineIndex >= i - 2 && (weight || count) && !/[A-Za-z]{3,}/.test(body.replace(/\b(kg|lbs?|oz|ml)\b/gi, ''))) {
      if (weight) {
        previous.quantity = parseAmount(weight[1])
        previous.unit = weight[2].toLowerCase()
        if (previous.unit === 'lbs') previous.unit = 'lb'
      } else {
        previous.quantity = Number(count[1])
        previous.unit = 'pieces'
      }
      if (price !== null && !negative && previous.price === null) previous.price = price
      previous.lineIndex = i
      continue
    }

    // A price on its own line belongs to the item above it that has no price yet.
    if (!/[A-Za-z]{2,}/.test(body) && price !== null && !negative) {
      if (previous && previous.price === null && previous.lineIndex >= i - 2) {
        previous.price = price
        previous.lineIndex = i
      }
      continue
    }

    if (negative || (DISCOUNT_LINE.test(body) && price !== null)) {
      if (negative && price !== null) discounts -= price
      continue
    }

    // Merchant: first plausible name-like line above the first item.
    if (!merchant && items.length === 0 && price === null && looksLikeMerchantLine(line)) {
      merchant = tidyName(line)
      continue
    }

    const { quantity: foundQty, name: rawName } = takeQuantity(body)
    // When the price is unreadable it leaves junk like "&,0" or "$5" after the name: drop it.
    const afterQty = price === null ? rawName.replace(/(\s+[^A-Za-z\s]+)+\s*$/, '') : rawName
    const name = tidyName(afterQty)
    if (!hasEnoughLetters(name)) continue
    // No price and no leading quantity: probably a header, address or OCR noise, not an item.
    // Exception: the next line is a "3 @ $1.47" / "0.358 kg @ ..." detail that carries the price.
    const nextLine = lines[i + 1] ?? ''
    const detailFollows = WEIGHT_DETAIL.test(nextLine) || COUNT_DETAIL.test(nextLine)
    if (price === null && foundQty === null && !detailFollows) continue
    if (price === null && foundQty !== null && (foundQty > 20 || ADDRESS_WORDS.test(name))) continue
    // Prices of zero or absurdly large amounts are OCR mistakes.
    if (price !== null && (price === 0 || price > 9999)) continue

    const warnings = []

    const info = classifyItem(name)
    const unit = 'pieces'
    items.push({
      name,
      quantity: foundQty ?? 1,
      unit,
      price,
      storage: info.storage,
      expiresAt: info.shelfDays ? addDays(baseDate, info.shelfDays) : null,
      expiresEstimated: Boolean(info.shelfDays),
      likelyFood: info.likelyFood,
      include: info.likelyFood !== false,
      rawLine: line,
      warnings,
      lineIndex: i,
    })
    if (items.length >= MAX_ITEMS) break
  }

  // Finish: warnings that need the whole list, then remove internal bookkeeping.
  for (const item of items) {
    if (item.price === null) item.warnings.unshift('Price could not be read')
    if (item.likelyFood === false) item.warnings.push('Does not look like food: untick to skip it')
    else if (item.likelyFood === null) item.warnings.push('Please check this item and where it is stored')
    if (item.expiresEstimated) item.warnings.push('Expiry date is an estimate')
    if (item.quantity > 99) item.warnings.push('Quantity looks very high')
    delete item.lineIndex
  }

  const round2 = (n) => Math.round(n * 100) / 100
  const itemsSum = round2(items.reduce((sum, item) => sum + (item.price ?? 0), 0))
  // The items (less any coupons) should add up to the subtotal, or to the total when there is no tax line.
  const netSum = round2(itemsSum + discounts)
  const targets = [subtotal, total].filter((n) => n !== null)
  const totalMatches =
    targets.length === 0 || items.length === 0
      ? null
      : targets.some((t) => Math.abs(netSum - t) <= 0.05 || Math.abs(itemsSum - t) <= 0.05)

  return { merchant, purchasedAt, dateAmbiguous, total, subtotal, itemsSum, totalMatches, items }
}
