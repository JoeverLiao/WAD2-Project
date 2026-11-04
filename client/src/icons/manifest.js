// Loads the icon manifest and the SVG file each entry points to.
// To add an icon: add an SVG to ./svg and an entry to manifest.json. Nothing here changes.
import manifest from './manifest.json'

// Every SVG in ./svg as raw markup, keyed by its path relative to this folder ("svg/apple.svg").
const files = Object.fromEntries(
  Object.entries(
    import.meta.glob('./svg/*.svg', { query: '?raw', import: 'default', eager: true }),
  ).map(([path, markup]) => [path.replace(/^\.\//, ''), markup]),
)

const byId = new Map(manifest.icons.map((icon) => [icon.id, icon]))

export { manifest }
export const fallbackIconId = manifest.fallbackIcon

export const isIconId = (id) => byId.has(id)

/** The manifest entry for an icon id, or the fallback entry. */
export const iconEntry = (id) => byId.get(id) ?? byId.get(fallbackIconId)

/** Raw SVG markup for an icon id (the fallback icon's markup for an unknown id). */
export const iconSvg = (id) => files[iconEntry(id)?.file] ?? files[byId.get(fallbackIconId)?.file] ?? ''

/** Manifest entries whose SVG file is missing. Used by tests; should always be empty. */
export const missingIconFiles = () => manifest.icons.filter((icon) => !files[icon.file]).map((icon) => icon.id)
