import multer from 'multer'

export const MAX_FILE_SIZE = 8 * 1024 * 1024 // 8 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

const upload = multer({
  // The image is only needed long enough to run OCR, so keep it in memory.
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      return cb(
        new multer.MulterError(
          'LIMIT_UNEXPECTED_FILE',
          'Only JPG, PNG or WEBP images are allowed.',
        ),
      )
    }
    cb(null, true)
  },
})

// Wraps multer so upload problems come back as JSON ({ error }) like the rest of the API.
const receiptUpload = (req, res, next) => {
  upload.single('receipt')(req, res, (error) => {
    if (!error) return next()

    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: `Image is too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)} MB.`,
      })
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ error: 'Only JPG, PNG or WEBP images are allowed.' })
    }
    return res.status(400).json({ error: 'Could not read the uploaded file.' })
  })
}

export default {
  receiptUpload
}