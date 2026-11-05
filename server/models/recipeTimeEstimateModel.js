
import mongoose from 'mongoose'

const recipeTimeEstimateSchema = new mongoose.Schema({
  recipeId: {
    type: String,
    required: true,
    unique: true,
  },
  inputHash: {
    type: String,
    required: true,
  },
  estimatedMinutes: {
    type: Number,
    default: null,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
})

export default mongoose.models.RecipeTimeEstimate ||
  mongoose.model('RecipeTimeEstimate', recipeTimeEstimateSchema)
