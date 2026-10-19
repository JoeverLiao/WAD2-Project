// Prepares a photo of a receipt for OCR.
//
// Phone photos of receipts are hard for Tesseract: the print is often faded, the light is
// uneven (shadows, glare), the paper is tilted and the table around it is in the picture.
// Pipeline, in order:
//   1. decode to grey, 2. find the paper and crop to it, 3. straighten it (deskew),
//   4. scale it to a fixed width, 5. flatten the lighting (divide by the estimated paper
//   brightness), 6. denoise a little and push faint ink towards black, 7. add a white border.
//
// Everything uses `sharp` plus plain JavaScript. We benchmarked OpenCV.js for the same job;
// its flat-field step scored the same as this one and its usual CLAHE + adaptive-threshold
// recipe scored much worse, so it is not needed.
import sharp from 'sharp'

// Thrown when the uploaded file cannot be decoded as an image (answer 400).
export class ReceiptImageError extends Error {}

const LOAD_WIDTH = 2400 // width used while locating and straightening the paper
const GENTLE_WIDTH = 1400 // same, for the gentle (neural OCR) version
const TARGET_WIDTH = 1600 // width of the cropped paper that is handed to Tesseract
const MIN_SKEW_DEGREES = 0.3 // smaller tilts are left alone

// --------------------------------------------------------------------------- pixel helpers
// sharp can silently hand back 3 channels even for a grey input (extract, extend, rotate and
// resize all do it), which scrambles every index calculation. Everything goes through
// `toGray`, which forces one channel and checks the size.
async function toGray(pipeline) {
  const { data, info } = await pipeline.toColourspace('b-w').raw().toBuffer({ resolveWithObject: true })
  if (info.channels !== 1 || data.length !== info.width * info.height) {
    throw new Error(`Expected a 1-channel image, got ${info.channels} channels`)
  }
  return { data: new Uint8Array(data), w: info.width, h: info.height }
}

const fromGray = ({ data, w, h }) =>
  sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), {
    raw: { width: w, height: h, channels: 1 },
  })

async function resizeGray(img, width, blur = 0) {
  let p = fromGray(img).resize({ width, kernel: 'lanczos3' })
  if (blur > 0) p = p.blur(blur)
  return toGray(p)
}

// --------------------------------------------------------------------------- lighting
// Paper brightness at every pixel: the maximum of each 8x8 block (ink is darker than paper,
// so a block bigger than a stroke contains paper), widened a little and smoothed.
async function estimateBackground({ data, w, h }, block = 8, grow = 2, sigma = 2) {
  const sw = Math.ceil(w / block)
  const sh = Math.ceil(h / block)
  const small = new Uint8Array(sw * sh)
  for (let by = 0; by < sh; by++) {
    for (let bx = 0; bx < sw; bx++) {
      let m = 0
      const y1 = Math.min(h, (by + 1) * block)
      const x1 = Math.min(w, (bx + 1) * block)
      for (let y = by * block; y < y1; y++) {
        for (let x = bx * block; x < x1; x++) if (data[y * w + x] > m) m = data[y * w + x]
      }
      small[by * sw + bx] = m
    }
  }
  const maxFilter = (src, horizontal) => {
    const out = new Uint8Array(sw * sh)
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        let m = 0
        for (let k = -grow; k <= grow; k++) {
          const xx = horizontal ? Math.min(sw - 1, Math.max(0, x + k)) : x
          const yy = horizontal ? y : Math.min(sh - 1, Math.max(0, y + k))
          if (src[yy * sw + xx] > m) m = src[yy * sw + xx]
        }
        out[y * sw + x] = m
      }
    }
    return out
  }
  const widened = maxFilter(maxFilter(small, true), false)
  const bg = await toGray(
    fromGray({ data: widened, w: sw, h: sh })
      .blur(sigma)
      .resize({ width: w, height: h, fit: 'fill', kernel: 'cubic' }),
  )
  return bg.data
}

// gray / background: paper becomes ~255 everywhere, even under a shadow.
function flatten(data, bg) {
  const out = new Uint8Array(data.length)
  for (let i = 0; i < data.length; i++) {
    const v = (data[i] * 255) / Math.max(bg[i], 1)
    out[i] = v > 255 ? 255 : v
  }
  return out
}

// Everything clearly darker than the midpoint between paper and ink goes to black, everything
// clearly lighter goes to white, with a smooth ramp between. Faint ink becomes dark while the
// soft edges that Tesseract's neural network likes are kept (hard binarising scored worse).
function softContrast(img, k = 0.35, width = 0.3, inkPct = 1) {
  const hist = new Uint32Array(256)
  for (let i = 0; i < img.length; i++) hist[img[i]]++
  const percentile = (p) => {
    const target = img.length * p
    let acc = 0
    for (let v = 0; v < 256; v++) {
      acc += hist[v]
      if (acc >= target) return v
    }
    return 255
  }
  const paper = percentile(0.6) // paper dominates a receipt
  const ink = Math.min(percentile(inkPct / 100), paper - 30)
  const span = paper - ink
  const mid = paper - k * span
  const d = Math.max(4, width * span)
  const lut = new Uint8Array(256)
  for (let v = 0; v < 256; v++) {
    let t = (v - (mid - d)) / (2 * d)
    t = t < 0 ? 0 : t > 1 ? 1 : t
    lut[v] = Math.round(255 * t * t * (3 - 2 * t))
  }
  const out = new Uint8Array(img.length)
  for (let i = 0; i < img.length; i++) out[i] = lut[img[i]]
  return out
}

// --------------------------------------------------------------------------- geometry
function otsuThreshold(img) {
  const hist = new Float64Array(256)
  for (let i = 0; i < img.length; i++) hist[img[i]]++
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * hist[i]
  let wB = 0
  let sB = 0
  let best = 0
  let threshold = 128
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (!wB) continue
    const wF = img.length - wB
    if (!wF) break
    sB += t * hist[t]
    const mB = sB / wB
    const mF = (sum - sB) / wF
    const between = wB * wF * (mB - mF) * (mB - mF)
    if (between > best) {
      best = between
      threshold = t
    }
  }
  return threshold
}

/**
 * Bounding box of the paper (the bright region), as fractions of the image: { x0, x1, y0, y1 }.
 * Returns null when there is no clear bright region.
 */
export async function findPaper(img) {
  const sw = 320
  const sh = Math.max(1, Math.round((img.h * sw) / img.w))
  const small = (await resizeGray(img, sw, 2)).data
  const total = small.length
  // Otsu separates paper from table; the cut-off is then moved towards the table so that
  // paper lying in shadow still counts as paper.
  const otsu = otsuThreshold(small)
  let darkSum = 0
  let darkN = 0
  let lightSum = 0
  let lightN = 0
  for (let i = 0; i < total; i++) {
    if (small[i] > otsu) {
      lightSum += small[i]
      lightN++
    } else {
      darkSum += small[i]
      darkN++
    }
  }
  const threshold =
    darkN && lightN
      ? darkSum / darkN + 0.4 * (lightSum / lightN - darkSum / darkN)
      : otsu
  const realH = Math.round(total / sw)
  const xs = []
  const ys = []
  for (let y = 0; y < realH; y++) {
    for (let x = 0; x < sw; x++) {
      if (small[y * sw + x] > threshold) {
        xs.push(x)
        ys.push(y)
      }
    }
  }
  if (xs.length < total * 0.2) return null
  xs.sort((a, b) => a - b)
  ys.sort((a, b) => a - b)
  const q = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))]
  return {
    x0: q(xs, 0.004) / sw,
    x1: (q(xs, 0.996) + 1) / sw,
    y0: q(ys, 0.004) / realH,
    y1: (q(ys, 0.996) + 1) / realH,
  }
}

async function cropToBox(img, box, inset = 0) {
  const { w, h } = img
  const ix = inset * (box.x1 - box.x0) * w
  const iy = inset * (box.y1 - box.y0) * h
  const left = Math.max(0, Math.round(box.x0 * w + ix))
  const top = Math.max(0, Math.round(box.y0 * h + iy))
  const width = Math.min(w - left, Math.round((box.x1 - box.x0) * w - 2 * ix))
  const height = Math.min(h - top, Math.round((box.y1 - box.y0) * h - 2 * iy))
  if (width < 50 || height < 50) return img
  return toGray(fromGray(img).extract({ left, top, width, height }))
}

/**
 * Tilt of the text lines in degrees: the angle at which the row-by-row ink totals are the
 * most "peaky" (text lines line up). Positive = rotate by -angle to straighten.
 */
export async function estimateSkew(img) {
  const sw = 520
  const small = await resizeGray(img, sw)
  const sh = small.h
  const bg = await estimateBackground(small, 6, 1, 1.5)
  const flat = flatten(small.data, bg)
  const ink = new Float32Array(sw * sh)
  for (let i = 0; i < ink.length; i++) ink[i] = 255 - flat[i]

  // Only look at the middle of the paper so the paper's own edges do not dominate.
  const x0 = Math.floor(sw * 0.15)
  const x1 = Math.floor(sw * 0.85)
  const y0 = Math.floor(sh * 0.12)
  const y1 = Math.floor(sh * 0.88)
  const cx = sw / 2
  const cy = sh / 2
  const score = (deg) => {
    const a = (deg * Math.PI) / 180
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    const rows = new Float64Array(sh)
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const ry = Math.round(-sa * (x - cx) + ca * (y - cy) + cy)
        if (ry >= 0 && ry < sh) rows[ry] += ink[y * sw + x]
      }
    }
    let mean = 0
    for (let y = 0; y < sh; y++) mean += rows[y]
    mean /= sh
    let variance = 0
    for (let y = 0; y < sh; y++) variance += (rows[y] - mean) * (rows[y] - mean)
    return variance
  }
  let best = 0
  let bestScore = -1
  for (let d = -10; d <= 10; d += 0.5) {
    const s = score(d)
    if (s > bestScore) {
      bestScore = s
      best = d
    }
  }
  for (let d = best - 0.5; d <= best + 0.5; d += 0.1) {
    const s = score(d)
    if (s > bestScore) {
      bestScore = s
      best = d
    }
  }
  return Math.round(best * 10) / 10
}

// --------------------------------------------------------------------------- pipeline
/**
 * @param {Buffer} buffer raw image bytes (jpg / png / webp)
 * @returns {Promise<Buffer>} a PNG ready for Tesseract
 */
export async function preprocessReceiptImage(buffer, { gentle = false } = {}) {
  let img
  try {
    img = await toGray(
      sharp(buffer)
        .rotate() // honour the phone's EXIF orientation
        .resize({ width: LOAD_WIDTH, kernel: 'lanczos3', withoutEnlargement: false }),
    )
  } catch {
    throw new ReceiptImageError('That file could not be read as an image.')
  }

  // 2. Find the paper and cut away the table (skipped when the photo is already all paper).
  const box = await findPaper(img)
  if (box && (box.x1 - box.x0 < 0.93 || box.y1 - box.y0 < 0.93)) {
    img = await cropToBox(img, box)
  }

  // 3. Straighten, then crop again: the rotation exposes black corners that must go.
  const skew = await estimateSkew(img)
  if (Math.abs(skew) >= MIN_SKEW_DEGREES) {
    img = await toGray(fromGray(img).rotate(-skew, { background: { r: 0, g: 0, b: 0 } }))
    const straight = await findPaper(img)
    if (straight) img = await cropToBox(img, straight, 0.012)
  }

  // 4-6. Fixed scale, flat lighting, soft contrast.
  // "gentle" keeps natural grey tones (no hard contrast, almost no blur): the neural OCR engine
  // reads those better. The default strong version is tuned for Tesseract.
  const width = gentle ? GENTLE_WIDTH : TARGET_WIDTH
  if (img.w !== width) img = await resizeGray(img, width)
  const background = await estimateBackground(img)
  const flat = await toGray(
    fromGray({ data: flatten(img.data, background), w: img.w, h: img.h }).blur(gentle ? 0.3 : 1.0),
  )
  const contrasted = { data: gentle ? flat.data : softContrast(flat.data), w: img.w, h: img.h }

  // 7. White border: Tesseract reads text touching the image edge badly.
  const margin = Math.round(img.w * 0.04)
  return fromGray(contrasted)
    .extend({
      top: margin,
      bottom: margin,
      left: margin,
      right: margin,
      background: { r: 255, g: 255, b: 255 },
    })
    .toColourspace('b-w')
    .png()
    .toBuffer()
}
