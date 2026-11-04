// Everything about the Claude icon request that is derived from the icon manifest:
// the system prompt, the JSON schema of the answer, and the check every answer must pass.
// Pure functions with no browser or Node dependencies: the server builds its request with these,
// and the client uses the same validation before it trusts a cached or returned answer.
// No icon id or colour is written here; they all come from the manifest passed in.

export const HEX_COLOR = /^#[0-9a-f]{6}$/i

/** Cache key for a food name: whitespace collapsed, trimmed, lowercased, at most 100 characters. */
export const normaliseFoodName = (name) =>
  String(name ?? '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 100)

export const iconIds = (manifest) => manifest.icons.map((icon) => icon.id)

/** The palette as uppercase hex values, or [] when the manifest has no palette (any hex allowed). */
export const paletteColors = (manifest) =>
  [...new Set(Object.values(manifest.palette ?? {}).map((hex) => String(hex).toUpperCase()))]

/** The system prompt, built from the manifest's icon descriptions and palette. */
export function buildSystemPrompt(manifest) {
  const describe = (icon) => `- ${icon.id}: ${icon.description}`
  const byType = (type) => manifest.icons.filter((icon) => icon.type === type).map(describe)
  const palette = Object.entries(manifest.palette ?? {})

  const colorRule = palette.length
    ? `"color" must be one of these palette values (name: hex):\n${palette
        .map(([name, hex]) => `- ${name}: ${String(hex).toUpperCase()}`)
        .join('\n')}`
    : '"color" is any 6-digit hex colour such as #A1B2C3.'

  return `You choose an icon and a colour for each food item in a household food-inventory app. You only choose from the lists below; you never invent icons or draw anything.

For each numbered food name:
1. Work out the real food. Names may be abbreviated or misspelled receipt text.
2. "icon": if a specific icon exists for that food, or for a food of the same shape, use it. Otherwise use the closest category icon. Use the fallback icon only when you cannot tell what the item is or it is not food.
3. "color": the colour of the food itself as people see it, not its packaging. For a drink, use the colour people associate with it.
4. Return exactly one entry per food name, with the same "index" as its number.

Specific icons:
${byType('specific').join('\n')}

Category icons:
${byType('category').join('\n')}

Fallback icon:
${byType('fallback').join('\n')}

${colorRule}`
}

/** JSON schema for the structured output: { items: [{ index, icon, color }] }. */
export function buildOutputSchema(manifest) {
  const palette = paletteColors(manifest)
  return {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            index: { type: 'integer', description: 'The number of the food name in the input list.' },
            icon: { type: 'string', enum: iconIds(manifest) },
            color: palette.length
              ? { type: 'string', enum: palette }
              : { type: 'string', description: 'A 6-digit hex colour such as #A1B2C3.' },
          },
          required: ['index', 'icon', 'color'],
          additionalProperties: false,
        },
      },
    },
    required: ['items'],
    additionalProperties: false,
  }
}

/**
 * Checks one answer against the manifest. Returns { icon, color } with the colour in uppercase,
 * or null when the icon is unknown, the colour is not a hex value, or (with a palette) the colour
 * is not in the palette.
 */
export function validateIconResult(result, manifest) {
  const icon = result?.icon
  const color = typeof result?.color === 'string' ? result.color.trim().toUpperCase() : ''
  if (typeof icon !== 'string' || !iconIds(manifest).includes(icon)) return null
  if (!HEX_COLOR.test(color)) return null
  const palette = paletteColors(manifest)
  if (palette.length && !palette.includes(color)) return null
  return { icon, color }
}
