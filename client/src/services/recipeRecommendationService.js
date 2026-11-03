
const MODEL = process.env.ANTHROPIC_MODEL

function words(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(x => x.length > 2)
}

function fallbackRank(candidates, history, inventory) {
  const preferences = new Map()

  for (const recipe of history) {
    const weight =
      (recipe.cookCount || 0) * 3 +
      (recipe.saved ? 1 : 0)

    for (const ingredient of recipe.ingredients || []) {
      for (const word of words(ingredient)) {
        preferences.set(
          word,
          (preferences.get(word) || 0) + weight
        )
      }
    }
  }

  const owned = inventory.map(item => ({
    words: words(item.name),
    expiresAt: item.expiresAt,
  }))

  return candidates.map(recipe => {
    let score = 0

    for (const ingredient of recipe.ingredients || []) {
      const tokens = words(ingredient)

      for (const token of tokens) {
        score += preferences.get(token) || 0
      }

      for (const item of owned) {
        if (tokens.some(t => item.words.includes(t))) {
          score += 5

          if (item.expiresAt) {
            const days = Math.ceil(
              (new Date(item.expiresAt) - new Date()) /
              86400000
            )

            if (days >= 0 && days <= 3) {
              score += 8
            }
          }

          break
        }
      }
    }

    return { ...recipe, score }
  }).sort((a, b) => b.score - a.score)
}

export async function recommendRecipes({
  candidates,
  history,
  inventory,
}) {
  const ranked = fallbackRank(
    candidates,
    history,
    inventory
  )

  const fallback = {
    aiUsed: false,
    recommendations: ranked.slice(0, 8).map(recipe => ({
      recipeId: recipe.id,
      reason:
        'Suggested using your cooking history and current ingredients.',
    })),
  }

  if (!process.env.ANTHROPIC_API_KEY || !MODEL) {
    return fallback
  }

  const allowedIds = new Set(
    candidates.map(recipe => String(recipe.id))
  )

  const context = {
    cookedBefore: history
      .filter(x => x.cookCount > 0)
      .slice(0, 20)
      .map(x => ({
        name: x.name,
        ingredients: x.ingredients,
        timesCooked: x.cookCount,
      })),

    savedRecipes: history
      .filter(x => x.saved)
      .slice(0, 20)
      .map(x => x.name),

    inventory: inventory.slice(0, 40).map(x => ({
      name: x.name,
      expiresAt: x.expiresAt,
    })),

    candidates: ranked.slice(0, 30).map(x => ({
      id: x.id,
      name: x.name,
      ingredients: x.ingredients,
    })),
  }

  try {
    const response = await fetch(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1200,
          temperature: 0.2,
          system: [
            'You are a food-waste reduction recommendation engine.',
            'Recommend only recipes from the candidate list.',
            'Prioritise ingredients nearing their estimated expiry dates.',
            'Learn preferences from saved and previously cooked recipes.',
            'Never assume an estimated expiry date guarantees food safety.',
            'Return ONLY valid JSON:',
            '{"recommendations":[{"recipeId":"id","reason":"short explanation"}]}',
            'Do not invent recipe IDs.',
          ].join('\n'),
          messages: [{
            role: 'user',
            content: JSON.stringify(context),
          }],
        }),
        signal: AbortSignal.timeout(15000),
      }
    )

    if (!response.ok) {
      throw new Error(`Anthropic HTTP ${response.status}`)
    }

    const data = await response.json()
    const output = data.content
      ?.filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n') || ''

    const cleaned = output
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim()

    const parsed = JSON.parse(cleaned)

    if (!Array.isArray(parsed.recommendations)) {
      throw new Error('Invalid AI response')
    }

    const seen = new Set()

    const recommendations = parsed.recommendations
      .filter(x => {
        const id = String(x.recipeId)
        if (!allowedIds.has(id) || seen.has(id)) return false
        seen.add(id)
        return true
      })
      .slice(0, 8)
      .map(x => ({
        recipeId: String(x.recipeId),
        reason: String(x.reason || '').slice(0, 250),
      }))

    if (!recommendations.length) return fallback

    return {
      aiUsed: true,
      recommendations,
    }
  } catch (error) {
    console.error('AI recommendation failed:', error.message)
    return fallback
  }
}
