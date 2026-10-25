import mongoose from 'mongoose'
import { addItemsToInventory } from '../services/inventoryService.js'
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

// Saves the items the user reviewed (from a scanned receipt or typed in by hand) into THEIR
// inventory. Everything is validated first; the writing itself is in services/inventoryService.js.
const confirmItems = async (req, res) => {
  const { items, errors } = validateInventoryItems(req.body?.items)
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

// Product (barcode) scanning is a separate feature, not part of the receipt flow.
const scanProduct = notImplemented('Product scanning')

export default {
  scanReceipt,
  scanProduct,
  confirmItems
};