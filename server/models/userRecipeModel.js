import mongoose from 'mongoose'

const userRecipeSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    recipeId: {
      type: String,
      required: true,
    },

    name: {
      type: String,
      required: true,
    },

    image: {
      type: String,
      default: '',
    },

    ingredients: {
      type: [String],
      default: [],
    },

    dietaryTags: {
      type: [String],
      default: [],
    },

    saved: {
      type: Boolean,
      default: false,
    },

    savedAt: {
      type: Date,
      default: null,
    },

    cookCount: {
      type: Number,
      default: 0,
    },

    lastCookedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
)

userRecipeSchema.index(
  { user: 1, recipeId: 1 },
  { unique: true }
)

export default mongoose.model(
  'UserRecipe',
  userRecipeSchema,
  'user_recipes'
)