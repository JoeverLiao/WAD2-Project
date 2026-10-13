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
    const { rawText, lines, confidence } = await extractTextFromReceipt(req.file.buffer)

    if (!rawText) {
      return res.status(422).json({
        error:
          'No text could be read from this image. Try a clearer, well-lit photo of the receipt.',
      })
    }

    return res.json({ rawText, lines, confidence })
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

// TODO (Tarunikaa): parsing, review/correction, and confirmed inventory insertion.
const scanProduct = notImplemented('Product scanning')
const confirmItems = notImplemented('Confirm scanned items')

export default {
  scanReceipt,
  scanProduct,
  confirmItems
};