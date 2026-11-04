import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, unique: true },
    password: { type: String, required: true, minlength: 8 },
    // The user's preferred pickup/drop-off location (usually home), as a Singapore postal code.
    postalCode: { type: String, trim: true, match: /^\d{6}$/, default: null },
    loginStatus: { type: Boolean, default: false },
    lastLogin: { type: Date, default: null },
    pickupLocation: {
    type: new mongoose.Schema(
      {
        address: {
          type: String,
          required: true,
          trim: true,
          maxlength: 160,
        },
        latitude: {
          type: Number,
          required: true,
          min: -90,
          max: 90,
        },
        longitude: {
          type: Number,
          required: true,
          min: -180,
          max: 180,
        },
      },
      { _id: false },
    ),
    default: null,
  },
  },
  { timestamps: true },
)

userSchema.pre('save', async function() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 10); 
});

userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password)
}

userSchema.methods.toPublicJSON = function () {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    postalCode: this.postalCode,
    loginStatus: this.loginStatus,
    lastLogin: this.lastLogin,
    pickupLocation: this.pickupLocation
    ? {
        address: this.pickupLocation.address,
        latitude: this.pickupLocation.latitude,
        longitude: this.pickupLocation.longitude,
      }
    : null,
  }
}

export default mongoose.model('User', userSchema, 'users')
