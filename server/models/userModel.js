import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, unique: true },
    password: { type: String, required: true, minlength: 8 },
    loginStatus: { type: Boolean, default: false },
    lastLogin: { type: Date, default: null },
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
    loginStatus: this.loginStatus,
    lastLogin: this.lastLogin,
  }
}

export default mongoose.model('User', userSchema, 'users')
