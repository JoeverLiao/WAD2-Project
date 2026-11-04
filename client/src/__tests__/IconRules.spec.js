import { describe, expect, it } from 'vitest'
import manifest from '../icons/manifest.json'
import { missingIconFiles } from '../icons/manifest.js'
import {
  buildOutputSchema,
  buildSystemPrompt,
  normaliseFoodName,
  paletteColors,
  validateIconResult,
} from '../icons/iconRules.js'

const RED = manifest.palette.red.toUpperCase()
const withIcons = (...icons) => ({ ...manifest, icons: [...manifest.icons, ...icons] })

describe('icon manifest', () => {
  it('has unique ids, a file for every entry, and a fallback icon', () => {
    const ids = manifest.icons.map((icon) => icon.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(missingIconFiles()).toEqual([])
    expect(manifest.icons.find((icon) => icon.id === manifest.fallbackIcon)?.type).toBe('fallback')
  })

  it('has category icons and specific icons for foods that do not fit their category shape', () => {
    const types = Object.fromEntries(manifest.icons.map((icon) => [icon.id, icon.type]))
    expect(types).toMatchObject({ fruit: 'category', vegetable: 'category', drink: 'category', banana: 'specific', egg: 'specific' })
    expect(manifest.icons.filter((icon) => !icon.description?.trim()).map((icon) => icon.id)).toEqual([])
  })

  it('has a palette of valid hex colours', () => {
    for (const hex of Object.values(manifest.palette)) expect(hex).toMatch(/^#[0-9a-f]{6}$/i)
  })
})

describe('buildSystemPrompt', () => {
  it('lists every icon id with its description, grouped by type, and the palette', () => {
    const prompt = buildSystemPrompt(manifest)
    for (const icon of manifest.icons) expect(prompt).toContain(`- ${icon.id}: ${icon.description}`)
    expect(prompt.indexOf('- banana:')).toBeLessThan(prompt.indexOf('Category icons:'))
    expect(prompt.indexOf('- fruit:')).toBeGreaterThan(prompt.indexOf('Category icons:'))
    expect(prompt).toContain(`- red: ${RED}`)
  })

  it('picks up a new manifest entry without code changes', () => {
    const prompt = buildSystemPrompt(
      withIcons({ id: 'durian', type: 'specific', description: 'Spiky durians.', file: 'svg/durian.svg' }),
    )
    expect(prompt).toContain('- durian: Spiky durians.')
  })

  it('allows any hex colour when the manifest has no palette', () => {
    expect(buildSystemPrompt({ ...manifest, palette: undefined })).toContain('any 6-digit hex colour')
  })
})

describe('buildOutputSchema', () => {
  const itemSchema = (m) => buildOutputSchema(m).properties.items.items

  it('takes the icon enum from the manifest and the colour enum from the palette', () => {
    const schema = itemSchema(manifest)
    expect(schema.properties.icon.enum).toEqual(manifest.icons.map((icon) => icon.id))
    expect(schema.properties.color.enum).toEqual(paletteColors(manifest))
    expect(schema.required).toEqual(['index', 'icon', 'color'])
    expect(schema.additionalProperties).toBe(false)
  })

  it('updates the enum when an icon is added, and drops the colour enum without a palette', () => {
    expect(itemSchema(withIcons({ id: 'durian' })).properties.icon.enum).toContain('durian')
    expect(itemSchema({ ...manifest, palette: {} }).properties.color.enum).toBeUndefined()
  })
})

describe('validateIconResult', () => {
  it('accepts a known icon with a palette colour, in any case', () => {
    expect(validateIconResult({ icon: 'banana', color: RED.toLowerCase() }, manifest)).toEqual({ icon: 'banana', color: RED })
  })

  it.each([
    ['unknown icon', { icon: 'dragon', color: RED }],
    ['colour name instead of hex', { icon: 'banana', color: 'red' }],
    ['short hex', { icon: 'banana', color: '#FFF' }],
    ['colour outside the palette', { icon: 'banana', color: '#123456' }],
    ['missing fields', {}],
    ['not an object', null],
  ])('rejects %s', (_, result) => {
    expect(validateIconResult(result, manifest)).toBeNull()
  })

  it('accepts any hex colour when there is no palette', () => {
    expect(validateIconResult({ icon: 'banana', color: '#123456' }, { ...manifest, palette: {} })).toEqual({
      icon: 'banana',
      color: '#123456',
    })
  })
})

it('normalises food names for caching', () => {
  expect(normaliseFoodName('  Green   APPLE ')).toBe('green apple')
  expect(normaliseFoodName(null)).toBe('')
})
