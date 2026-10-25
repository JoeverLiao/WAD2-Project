import mongoose from 'mongoose'
import InventoryItem from '../models/inventoryItemModel.js'
import { validateInventoryItems } from '../services/inventoryValidation.js'
import { parseReceiptText } from '../services/receiptParser.js'
import { notImplemented } from './notImplemented.js'
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

// Combine rows that are the same product (same name ignoring case, unit and storage).
function groupSameProducts(items) {
  const groups = new Map()
  for (const item of items) {
    const key = `${item.name.toLowerCase()}|${item.unit ?? ''}|${item.storage}`
    const group = groups.get(key)
    if (!group) {
      groups.set(key, { ...item })
      continue
    }
    group.quantity = Math.round((group.quantity + item.quantity) * 1000) / 1000
    if (item.purchasePrice !== undefined) {
      group.purchasePrice = Math.round(((group.purchasePrice ?? 0) + item.purchasePrice) * 100) / 100
    }
    group.purchasedAt ??= item.purchasedAt
    group.expiresAt ??= item.expiresAt
  }
  return [...groups.values()]
}

// Saves the items the user reviewed and confirmed into THEIR inventory. Everything is validated
// first. An item that is already in stock (same name ignoring upper/lower case, same unit, same
// storage) has its quantity increased instead of being added a second time, so "2 Coffee" bought
// today adds to the "Coffee" already on the shelf. The existing item keeps its own dates.
const confirmItems = async (req, res) => {
  const { items, errors } = validateInventoryItems(req.body?.items)
  if (errors.length) {
    return res.status(400).json({ error: 'Please fix the items marked in red and try again.', details: errors })
  }
  if (!mongoose.isValidObjectId(req.userId)) {
    return res.status(401).json({ error: 'Please log in again.' })
  }

  try {
    const operations = groupSameProducts(items).map((item) => {
      const inc = { quantity: item.quantity }
      if (item.purchasePrice !== undefined) inc.purchasePrice = item.purchasePrice
      const onInsert = {}
      if (item.purchasedAt) onInsert.purchasedAt = item.purchasedAt
      if (item.expiresAt) onInsert.expiresAt = item.expiresAt
      const update = { $inc: inc }
      if (Object.keys(onInsert).length) update.$setOnInsert = onInsert
      return {
        updateOne: {
          // `user` always comes from the login token, never from the request body.
          filter: { user: req.userId, name: item.name, unit: item.unit ?? null, storage: item.storage },
          update,
          upsert: true,
          collation: { locale: 'en', strength: 2 },
        },
      }
    })
    const result = await InventoryItem.bulkWrite(operations, { ordered: true })
    const added = result.upsertedCount ?? 0
    const merged = result.matchedCount ?? 0
    return res.status(201).json({ saved: operations.length, added, merged })
  } catch (error) {
    if (error?.name === 'ValidationError') {
      return res.status(400).json({ error: 'Some items were not valid. Please check them and try again.' })
    }
    console.error('Saving scanned items failed:', error)
    return res.status(500).json({ error: 'Could not save your items. Please try again.' })
  }
}

// Product (barcode) scanning is a separate feature, not part of the receipt flow.
const scanProduct = notImplemented('Product scanning')

export default {
  scanReceipt,
  scanProduct,
  confirmItems
};