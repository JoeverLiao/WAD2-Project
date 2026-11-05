import mongoose from 'mongoose'
import { addItemsToInventory } from '../services/inventoryService.js'
import { enrichItems, mergeDuplicateItems } from '../services/itemEnrichment.js'
import { validateInventoryItems } from '../services/inventoryValidation.js'
import { parseReceiptText } from '../services/receiptParser.js'
import {
  extractTextFromReceipt,
  OcrUnavailableError,
  ReceiptImageError,
} from '../services/ocrService.js'

const scanReceipt = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No receipt image was uploaded.' })
  }

  try {
    const { rawText, lines, confidence, lowConfidence } = await extractTextFromReceipt(req.file.buffer)

    if (!rawText) {
      return res.status(422).json({
        error:
          'No text could be read from this image. Try a clearer, well-lit photo of the receipt.',
      })
    }

    // Parsing is a convenience on top of OCR: if it ever fails, still return the text so the
    // user can type the items in by hand instead of losing the scan.
    let parsed = null
    try {
      parsed = parseReceiptText(rawText)
    } catch (error) {
      console.error('Receipt parsing failed:', error)
    }

    // Add category, icon, suggested location and estimated use-by date / weight to each item.
    // This never blocks the scan: without the AI the fixed storage rules still fill everything in.
    if (parsed?.items?.length) {
      try {
        const { items: details, aiStatus } = await enrichItems(
          parsed.items.map((item) => ({ ...item, purchasedAt: parsed.purchasedAt ?? undefined, expiresAt: undefined })),
        )
        parsed.aiStatus = aiStatus
        parsed.items = mergeDuplicateItems(parsed.items.map((item, i) => {
          const d = details[i]
          const warnings = [...item.warnings]
          if (d.expiresAt && d.expiresEstimated) warnings.push('Use-by date and weight are estimates: please check them')
          return { ...item, ...d, warnings }
        }))
      } catch (error) {
        console.error('Adding item details failed:', error)
      }
    }

    return res.json({ rawText, lines, confidence, lowConfidence, parsed })
  } catch (error) {
    if (error instanceof ReceiptImageError) {
      return res.status(400).json({ error: error.message })
    }
    if (error instanceof OcrUnavailableError) {
      return res.status(503).json({
        error:
          'The OCR engine is not ready. The first scan needs the server to have internet access (it downloads language data once). Please try again.',
      })
    }
    console.error('Receipt OCR failed:', error)
    return res.status(500).json({ error: 'Failed to process the receipt. Please try again.' })
  }
}

// Suggests details (category, icon, location, use-by estimate, weight) for items typed in by hand.
const suggestDetails = async (req, res) => {
  const input = req.body?.items
  if (!Array.isArray(input) || input.length === 0 || input.length > 100) {
    return res.status(400).json({ error: 'Send between 1 and 100 items.' })
  }
  const items = input.map((raw) => ({
    name: typeof raw?.name === 'string' ? raw.name.replace(/\s+/g, ' ').trim().slice(0, 100) : '',
    quantity: Number(raw?.quantity) > 0 ? Number(raw.quantity) : null,
    unit: typeof raw?.unit === 'string' ? raw.unit.trim().slice(0, 20) : null,
    purchasedAt: typeof raw?.purchasedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.purchasedAt) ? raw.purchasedAt : undefined,
  }))
  try {
    const { items: details, aiUsed, aiStatus } = await enrichItems(items)
    return res.json({ aiUsed, aiStatus, items: details })
  } catch (error) {
    console.error('Suggesting item details failed:', error)
    return res.status(500).json({ error: 'Could not suggest details. You can fill them in yourself.' })
  }
}

// Saves the items the user reviewed (from a scanned receipt or typed in by hand) into THEIR
// inventory. Everything is validated first; the writing itself is in services/inventoryService.js.
const confirmItems = async (req, res) => {
  const { items, errors } = validateInventoryItems(req.body?.items, { requireComplete: true })
  if (errors.length) {
    return res.status(400).json({ error: 'Please fix the items marked in red and try again.', details: errors })
  }
  if (!mongoose.isValidObjectId(req.userId)) {
    return res.status(401).json({ error: 'Please log in again.' })
  }

  try {
    // `user` always comes from the login token, never from the request body.
    const result = await addItemsToInventory(req.userId, items, {
      standardiseNames: req.body?.source === 'manual',
    })
    return res.status(201).json(result)
  } catch (error) {
    if (error?.name === 'ValidationError') {
      return res.status(400).json({ error: 'Some items were not valid. Please check them and try again.' })
    }
    console.error('Saving scanned items failed:', error)
    return res.status(500).json({ error: 'Could not save your items. Please try again.' })
  }
}

export default {
  scanReceipt,
  suggestDetails,
  confirmItems
};