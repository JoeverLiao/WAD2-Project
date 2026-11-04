import mongoose from 'mongoose'

const MAX_PHOTO_BYTES = 200 * 1024

const schema = new mongoose.Schema(
  {
    listing: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      unique: true,
    },

    data: {
      type: Buffer,
      required: true,
      select: false,
      validate: {
        validator(value) {
          if (!value) return false
          const size =
            typeof value.length === 'function'
              ? value.length()
              : value.length

          return (
            Number.isInteger(size) &&
            size > 0 &&
            size <= MAX_PHOTO_BYTES
          )
        },
        message: 'Photo must contain between 1 byte and 200 KiB.',
      },
    },

    contentType: {
      type: String,
      enum: ['image/webp'],
      default: 'image/webp',
    },
  },
  { timestamps: true },
)

export default mongoose.models.RescuePhoto ||
  mongoose.model('RescuePhoto', schema, 'rescue_photos')