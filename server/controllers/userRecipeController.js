import UserRecipe from '../models/userRecipeModel.js'

function recipePayload(body) {
  const recipeId = String(body?.recipeId ?? '').trim()
  const name = String(body?.name ?? '').trim().slice(0, 200)

  if (!/^\d{1,30}$/.test(recipeId) || !name) {
    return null
  }

  return {
    recipeId,
    name,
    image: String(body.image || '').slice(0, 1000),
    ingredients: Array.isArray(body.ingredients)
      ? body.ingredients
          .filter(item => typeof item === 'string')
          .slice(0, 50)
          .map(item => item.slice(0, 100))
      : [],
    dietaryTags: Array.isArray(body.dietaryTags)
      ? body.dietaryTags
          .filter(item => typeof item === 'string')
          .slice(0, 10)
      : [],
  }
}

async function list(req, res, next) {
  try {
    const recipes = await UserRecipe.find({
      user: req.userId,
    })
      .sort({ updatedAt: -1 })
      .lean()

    res.json({ recipes })
  } catch (error) {
    next(error)
  }
}

async function save(req, res, next) {
  try {
    const data = recipePayload(req.body)

    if (!data) {
      return res.status(400).json({
        error: 'Invalid recipe.',
      })
    }

    const recipe = await UserRecipe.findOneAndUpdate(
      {
        user: req.userId,
        recipeId: data.recipeId,
      },
      {
        $set: {
          ...data,
          saved: true,
          savedAt: new Date(),
        },
        $setOnInsert: {
          cookCount: 0,
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
      }
    )

    res.json({ recipe })
  } catch (error) {
    next(error)
  }
}

async function unsave(req, res, next) {
  try {
    const recipe = await UserRecipe.findOneAndUpdate(
      {
        user: req.userId,
        recipeId: req.params.recipeId,
      },
      {
        $set: {
          saved: false,
          savedAt: null,
        },
      },
      { new: true }
    )

    if (!recipe) {
      return res.status(404).json({
        error: 'Recipe not found.',
      })
    }

    res.json({ recipe })
  } catch (error) {
    next(error)
  }
}

async function cooked(req, res, next) {
  try {
    const data = recipePayload(req.body)

    if (!data) {
      return res.status(400).json({
        error: 'Invalid recipe.',
      })
    }

    const recipe = await UserRecipe.findOneAndUpdate(
      {
        user: req.userId,
        recipeId: data.recipeId,
      },
      {
        $set: {
          ...data,
          lastCookedAt: new Date(),
        },
        $inc: {
          cookCount: 1,
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
      }
    )

    res.json({ recipe })
  } catch (error) {
    next(error)
  }
}

export default {
  list,
  save,
  unsave,
  cooked,
}