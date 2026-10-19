import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import sharp from 'sharp'
import { createWorker, PSM } from 'tesseract.js'
import { preprocessReceiptImage, ReceiptImageError } from './receiptImage.js'

// Thrown when the uploaded file is not a readable image (answer 400).
export { ReceiptImageError }
// Thrown when the OCR engine could not start, e.g. the language data could not be
// downloaded (answer 503).
export class OcrUnavailableError extends Error {}

const LANG = 'eng'
const LOW_CONFIDENCE_BELOW = 55
const DEFAULT_LANG_SOURCE = `https://cdn.jsdelivr.net/npm/@tesseract.js-data/${LANG}/4.0.0_best_int`
const DOWNLOAD_TIMEOUT_MS = Number(process.env.OCR_DOWNLOAD_TIMEOUT_MS) || 60 * 1000
const SETUP_TIMEOUT_MS = Number(process.env.OCR_SETUP_TIMEOUT_MS) || 90 * 1000
const MIN_VALID_DATA_BYTES = 1_000_000 // the real English data is ~5 MB

// The English language data (~3 MB download) is saved here the first time it is needed.
// The folder is git-ignored; delete it any time to force a fresh download.
const cachePath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.tesseract-cache')
const dataFile = path.join(cachePath, `${LANG}.traineddata`)

function hasCachedData() {
  try {
    return fs.statSync(dataFile).size > MIN_VALID_DATA_BYTES
  } catch {
    return false
  }
}

// OCR_LANG_PATH (optional) can be a URL or a local folder containing eng.traineddata.gz,
// for networks where the default CDN is blocked.
async function readLanguageData(source) {
  if (/^https?:\/\//i.test(source)) {
    const url = `${source.replace(/\/$/, '')}/${LANG}.traineddata.gz`
    const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) })
    if (!response.ok) throw new Error(`HTTP ${response.status} while downloading ${url}`)
    return Buffer.from(await response.arrayBuffer())
  }
  return fs.promises.readFile(path.join(source, `${LANG}.traineddata.gz`))
}

// We fetch the language data ourselves, BEFORE starting the Tesseract worker. If tesseract.js
// downloads it internally and the download fails, it leaves a half-started worker thread
// behind that can never be stopped, which stops the server from exiting on Ctrl+C.
async function ensureLanguageData() {
  if (hasCachedData()) return

  const raw = await readLanguageData(process.env.OCR_LANG_PATH || DEFAULT_LANG_SOURCE)
  const data = raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw
  if (data.length < MIN_VALID_DATA_BYTES) throw new Error('Downloaded language data is invalid')

  fs.mkdirSync(cachePath, { recursive: true })
  // Write to a temp file and rename, so a half-written file is never mistaken for valid data.
  const tmpFile = `${dataFile}.${process.pid}.tmp`
  await fs.promises.writeFile(tmpFile, data)
  await fs.promises.rename(tmpFile, dataFile)
}

// One shared worker: creating a worker is slow, so we create it once and reuse it.
// Tesseract.js queues jobs internally, so concurrent requests are safe.
let workerPromise = null
let shutdownHooked = false

function getWorker() {
  if (!workerPromise) {
    // Rejects if the worker reports an error while starting up.
    let rejectSetup
    const setupFailed = new Promise((_, reject) => {
      rejectSetup = reject
    })

    const create = (async () => {
      await ensureLanguageData()
      const worker = await createWorker(LANG, 1, {
        cachePath,
        // Without an errorHandler, tesseract.js re-throws worker errors and that would
        // crash the whole Express server.
        errorHandler: (error) => {
          console.error('Tesseract worker error:', error)
          rejectSetup(new Error('Tesseract worker error'))
        },
      })
      await worker.setParameters({
        // PSM 6 = "assume one uniform block of text": works well for receipts,
        // where every item sits on its own line.
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        // Keep the spacing between columns (item name ... price).
        preserve_interword_spaces: '1',
      })
      return worker
    })()

    // Safety net: never leave a request waiting forever on a stuck setup.
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('OCR engine setup timed out')), SETUP_TIMEOUT_MS).unref()
    })

    workerPromise = Promise.race([create, setupFailed, timeout]).catch((error) => {
      workerPromise = null // allow a retry on the next request
      // If the worker finishes starting after we gave up, shut it down so it doesn't leak.
      create.then((worker) => worker.terminate()).catch(() => {})
      console.error('OCR engine setup failed:', error)
      throw new OcrUnavailableError('OCR engine setup failed', { cause: error })
    })

    // A running Tesseract worker thread keeps Node alive, so stop it on shutdown
    // (Ctrl+C / `node --watch` restart) or the server would never exit.
    if (!shutdownHooked) {
      shutdownHooked = true
      process.once('SIGINT', shutdownOcr)
      process.once('SIGTERM', shutdownOcr)
    }
  }
  return workerPromise
}

/**
 * Fallback engine: Tesseract.
 * @param {Buffer} imageBuffer raw image bytes (jpg / png / webp)
 * @returns {Promise<{ rawText: string, lines: string[], confidence: number, lowConfidence: boolean }>}
 */
async function extractWithTesseract(imageBuffer) {
  const processed = await preprocessReceiptImage(imageBuffer)
  const worker = await getWorker()
  const { data } = await worker.recognize(processed)

  const rawText = (data.text || '').trim()
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const confidence = Math.round(data.confidence || 0)
  // Heuristic only: below this Tesseract is usually reading poorly (checked on a benchmark of
  // scanned and faded receipts: few false alarms, but it misses many bad reads).
  return { rawText, lines, confidence, lowConfidence: confidence < LOW_CONFIDENCE_BELOW }
}

// ---------------------------------------------------------------------------------------
// Main engine: PaddleOCR (neural text detection + recognition, run locally through ONNX).
// On photographed receipts it reads far more accurately than Tesseract. Its models ship inside
// the npm package, so nothing is downloaded. Tesseract above stays as the fallback.
// ---------------------------------------------------------------------------------------
const LOW_PADDLE_CONFIDENCE_BELOW = 88
let paddlePromise = null
let paddleQueue = Promise.resolve()

function getPaddle() {
  if (!paddlePromise) {
    paddlePromise = import('@gutenye/ocr-node')
      .then(({ default: Ocr }) => Ocr.create())
      .catch((error) => {
        paddlePromise = null // allow a retry on the next request
        throw error
      })
  }
  return paddlePromise
}

// PaddleOCR returns one box per piece of text. Put boxes that share a row back together,
// left to right, so "FRESH MILK ........ 6.40" stays on one line.
function groupIntoLines(texts) {
  const boxes = texts
    .map((t) => {
      const ys = t.box.map((p) => p[1])
      const xs = t.box.map((p) => p[0])
      const top = Math.min(...ys)
      const bottom = Math.max(...ys)
      return { text: t.text, mean: t.mean, left: Math.min(...xs), top, bottom }
    })
    .filter((b) => b.text && b.text.trim())
    .sort((a, b) => a.top + a.bottom - (b.top + b.bottom))

  const rows = []
  for (const box of boxes) {
    const centre = (box.top + box.bottom) / 2
    const row = rows[rows.length - 1]
    if (row && Math.abs(centre - row.centre) < (row.height + (box.bottom - box.top)) / 4) {
      row.boxes.push(box)
      row.centre = (row.centre * (row.boxes.length - 1) + centre) / row.boxes.length
    } else {
      rows.push({ boxes: [box], centre, height: box.bottom - box.top })
    }
  }
  return rows.map((row) =>
    row.boxes
      .sort((a, b) => a.left - b.left)
      .map((b) => b.text.trim())
      .join('  '),
  )
}

async function extractWithPaddle(imageBuffer) {
  const processed = await preprocessReceiptImage(imageBuffer, { gentle: true })
  const { data, info } = await sharp(processed)
    .ensureAlpha(1)
    .raw()
    .toBuffer({ resolveWithObject: true })
  const ocr = await getPaddle()

  // One image at a time: keeps memory use predictable on a small server.
  const run = paddleQueue.then(() => ocr.detect({ data, width: info.width, height: info.height }))
  paddleQueue = run.catch(() => {})
  const { texts } = await run

  const lines = groupIntoLines(texts)
  const chars = texts.reduce((n, t) => n + t.text.length, 0)
  const weighted = texts.reduce((sum, t) => sum + t.mean * t.text.length, 0)
  const confidence = chars ? Math.round((weighted / chars) * 100) : 0
  return {
    rawText: lines.join('\n'),
    lines,
    confidence,
    // Few lines found means the photo was too small, dark or blurry to detect text at all.
    lowConfidence: lines.length < 3 || confidence < LOW_PADDLE_CONFIDENCE_BELOW,
  }
}

/**
 * Run OCR on an uploaded receipt image.
 * Uses PaddleOCR; falls back to Tesseract if PaddleOCR cannot start on this machine
 * (set OCR_ENGINE=tesseract to force the fallback).
 * @param {Buffer} imageBuffer raw image bytes (jpg / png / webp)
 * @returns {Promise<{ rawText: string, lines: string[], confidence: number, lowConfidence: boolean }>}
 */
export async function extractTextFromReceipt(imageBuffer) {
  if (process.env.OCR_ENGINE !== 'tesseract') {
    try {
      await getPaddle()
      return await extractWithPaddle(imageBuffer)
    } catch (error) {
      // A bad upload is the user's problem, not the engine's: report it as it is.
      if (error instanceof ReceiptImageError) throw error
      console.error('PaddleOCR failed, falling back to Tesseract:', error)
      return extractWithTesseract(imageBuffer)
    }
  }
  return extractWithTesseract(imageBuffer)
}

export async function shutdownOcr() {
  paddlePromise = null
  if (!workerPromise) return
  const pending = workerPromise
  workerPromise = null
  try {
    const worker = await pending
    await worker.terminate()
  } catch {
    // setup had already failed; nothing to terminate
  }
}
