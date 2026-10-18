// Draws a fake "phone photo" of a supermarket receipt for tests: text on paper, paper on a
// table, with optional tilt, faded ink and a shadow. No image files are needed in the repo.
import sharp from 'sharp'

export const RECEIPT_LINES = [
  'NTUC FAIRPRICE',
  'Date: 12/10/2026  Time: 10:15',
  '----------------------------',
  'FRESH MILK 1L        2   6.40',
  'EGGS LARGE 10S       1   3.20',
  'BANANA CAVENDISH     1   2.10',
  'CHICKEN BREAST 500G  1   7.95',
  '----------------------------',
  'TOTAL                   19.65',
]

const FONT = "'DejaVu Sans Mono', 'Courier New', Consolas, monospace"

function lineMarkup(lines, color) {
  return lines
    .map(
      (line, i) =>
        `<text x="46" y="${92 + i * 52}" font-family="${FONT}" font-size="34" fill="${color}" xml:space="preserve">${line}</text>`,
    )
    .join('')
}

/** True when this machine can draw text into an SVG (needs at least one usable font). */
export async function canRenderText() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100"><rect width="100%" height="100%" fill="white"/>${lineMarkup(['MILK 6.40'], 'black').replace('y="92"', 'y="60"')}</svg>`
  const { channels } = await sharp(Buffer.from(svg)).grayscale().stats()
  return channels[0].min < 100
}

/**
 * @param {{ tilt?: number, ink?: string, shadow?: number, blur?: number }} options
 *   tilt: degrees clockwise; ink: text colour (light grey = faded print);
 *   shadow: 0-1 darkness of a shadow across the receipt.
 * @returns {Promise<Buffer>} a JPEG
 */
export async function renderReceiptPhoto({ tilt = 0, ink = '#111111', shadow = 0, blur = 0 } = {}) {
  const W = 1000
  const H = 1000
  const paperW = 760
  const paperH = 60 + RECEIPT_LINES.length * 52 + 40
  const px = (W - paperW) / 2
  const py = (H - paperH) / 2
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><linearGradient id="shade" x1="0" y1="0" x2="1" y2="0.3">
      <stop offset="0" stop-color="black" stop-opacity="0"/>
      <stop offset="1" stop-color="black" stop-opacity="${shadow}"/>
    </linearGradient></defs>
    <rect width="${W}" height="${H}" fill="#6f5b47"/>
    <g transform="rotate(${tilt} ${W / 2} ${H / 2}) translate(${px} ${py})">
      <rect width="${paperW}" height="${paperH}" fill="#ece6d6"/>
      ${lineMarkup(RECEIPT_LINES, ink)}
    </g>
    <rect width="${W}" height="${H}" fill="url(#shade)"/>
  </svg>`
  let image = sharp(Buffer.from(svg))
  if (blur > 0) image = image.blur(blur)
  return image.jpeg({ quality: 75 }).toBuffer()
}
