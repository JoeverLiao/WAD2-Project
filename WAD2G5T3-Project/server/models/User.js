import mongoose from 'mongoose'

// Sanjana: extend for the chosen authentication/session approach.
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, unique: true },
  },
  { timestamps: true },
)

export default mongoose.model('User', userSchema, 'users')
