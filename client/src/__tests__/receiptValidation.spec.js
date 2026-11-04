import { describe, expect, it } from 'vitest'
import { parseDay, toPayload, validatePurchaseDate, validateRow } from '../utils/receiptValidation.js'

const today = new Date(2026, 9, 21) // 21 Oct 2026
const good = {
  name: 'Fresh Milk 1L', quantity: 2, unit: 'pieces', storage: 'fridge', storageZone: 'middle-shelf', category: 'dairy',
  dietType: 'vegetarian', expiresAt: '2026-10-19', purchasePrice: 6.4, weightKg: 1,
}
const check = (changes, purchasedAt = '2026-10-12') => validateRow({ ...good, ...changes }, { purchasedAt, today })

describe('validateRow', () => {
  it('accepts a good row', () => {
    expect(check({})).toEqual({})
  })

  it('needs a name', () => {
    expect(check({ name: '   ' }).name).toBeDefined()
    expect(check({ name: 'x'.repeat(101) }).name).toBeDefined()
  })

  it('needs a sensible quantity', () => {
    for (const quantity of ['', 0, -1, 'abc', '2 kg', 10000, 1.2345]) {
      expect(check({ quantity }).quantity).toBeDefined()
    }
    for (const quantity of [1, '2', '0.358', 9999]) {
      expect(check({ quantity }).quantity).toBeUndefined()
    }
  })

  it('requires a quantity and a weight, and checks the weight', () => {
    expect(check({ quantity: '' }).quantity).toBeDefined()
    expect(check({ weightKg: '' }).weightKg).toBeDefined()
    expect(check({ weightKg: '0' }).weightKg).toBeDefined()
    expect(check({ weightKg: 'abc' }).weightKg).toBeDefined()
    expect(check({ weightKg: '0.1234' }).weightKg).toBeDefined()
    expect(check({ weightKg: '1500' }).weightKg).toBeDefined()
    expect(check({ weightKg: '0.125' }).weightKg).toBeUndefined()
  })

  it('checks the place and category when given', () => {
    expect(check({ storageZone: 'garage' }).storageZone).toBeDefined()
    expect(check({ storageZone: 'crisper' }).storageZone).toBeUndefined()
    expect(check({ category: 'spaceship' }).category).toBeDefined()
    expect(check({ category: 'dairy' }).category).toBeUndefined()
  })

  it('needs a valid storage place', () => {
    expect(check({ storage: 'garage' }).storage).toBeDefined()
    expect(check({ storage: '' }).storage).toBeDefined()
  })

  it('treats only unit and price as optional', () => {
    expect(check({ unit: '', purchasePrice: '' })).toEqual({})
  })

  it('requires the place, category, diet label and use-by date', () => {
    expect(check({ storageZone: '' }).storageZone).toBeDefined()
    expect(check({ category: '' }).category).toBeDefined()
    expect(check({ dietType: '' }).dietType).toBeDefined()
    expect(check({ expiresAt: '' }).expiresAt).toMatch(/use-by date/)
  })

  it('asks for a use-by date and diet label on every item, whatever the category', () => {
    const errors = check({ category: 'non_food', expiresAt: '', dietType: '' })
    expect(errors.expiresAt).toBeDefined()
    expect(errors.dietType).toBeDefined()
  })

  it('needs a purchase date only when it is required', () => {
    expect(validatePurchaseDate('', today)).toBeNull()
    expect(validatePurchaseDate('', today, { required: true })).toMatch(/purchase date/)
  })

  it('checks the expiry date', () => {
    expect(check({ expiresAt: '2026-02-30' }).expiresAt).toBeDefined()
    expect(check({ expiresAt: '2040-01-01' }).expiresAt).toBeDefined()
    expect(check({ expiresAt: '2026-10-11' }).expiresAt).toMatch(/before the purchase date/)
    expect(check({ expiresAt: '2026-10-11' }, '').expiresAt).toBeUndefined() // no purchase date to compare
  })

  it('checks the price', () => {
    for (const purchasePrice of [-1, 'abc', 100001, '1.234']) {
      expect(check({ purchasePrice }).purchasePrice).toBeDefined()
    }
    expect(check({ purchasePrice: '3.50' }).purchasePrice).toBeUndefined()
  })
})

describe('validatePurchaseDate', () => {
  it('allows empty, today and tomorrow; rejects bad, old and future dates', () => {
    expect(validatePurchaseDate('', today)).toBeNull()
    expect(validatePurchaseDate('2026-10-21', today)).toBeNull()
    expect(validatePurchaseDate('2026-10-22', today)).toBeNull()
    expect(validatePurchaseDate('2026-10-23', today)).toMatch(/future/)
    expect(validatePurchaseDate('1999-12-31', today)).toBeDefined()
    expect(validatePurchaseDate('2026-13-01', today)).toBeDefined()
  })
})

describe('helpers', () => {
  it('parseDay accepts only real YYYY-MM-DD days', () => {
    expect(parseDay('2026-10-12')).toBe('2026-10-12')
    expect(parseDay('2026-02-29')).toBeNull()
    expect(parseDay('12/10/2026')).toBeNull()
    expect(parseDay(undefined)).toBeNull()
  })

  it('toPayload builds numbers and drops empty optional fields', () => {
    expect(toPayload({ ...good, name: ' Fresh  Milk ', quantity: '2', purchasePrice: '6.40', unit: '', expiresAt: '' }, '2026-10-12')).toEqual({
      name: 'Fresh Milk',
      quantity: 2,
      weightKg: 1,
      storage: 'fridge',
      storageZone: 'middle-shelf',
      category: 'dairy',
      dietType: 'vegetarian',
      purchasedAt: '2026-10-12',
      purchasePrice: 6.4,
    })
  })
})
