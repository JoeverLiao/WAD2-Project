// Placement rules only: never change a recorded date, amount or purchase price.
// Sources and assumptions are documented in storageGuidance.md.
import { CATEGORIES, CHILLED_OR_FROZEN, DOOR_SHELVES, FRIDGE_SHELVES, ZONE_IDS } from './storageGuide.js'
import { classifyItem } from './foodKnowledge.js'

const shelves = 'middle-shelf'
const freezer = 'freezer-main'
const pantry = 'dry-storage'
const produce = ['crisper', ...FRIDGE_SHELVES]
const refrigerated = [...FRIDGE_SHELVES, ...DOOR_SHELVES]
const shelfAliases = zone => ['upper-shelf', 'lower-shelf'].includes(zone) ? shelves : zone
const rule = (suggestedLocation, allowedLocations, locationReason) => {
  const allowed = [...new Set(allowedLocations.flatMap(zone => FRIDGE_SHELVES.includes(zone) ? FRIDGE_SHELVES : [zone]))]
  const preferred = shelfAliases(suggestedLocation)
  return { suggestedLocation: allowed.includes(preferred) ? preferred : allowed[0] || pantry,
    allowedLocations: allowed, locationReason }
}

// Preserve state-bearing names when standardising receipts: "Cooked rice" is not dry rice.
export function hasStorageState(name) {
  return /\b(opened|unopened|cooked|leftover|cut|chopped|sliced|peeled|ripe|unripe|frozen|thawed|defrosted|canned|tinned|uht|shelf.stable|dried|powder|fresh pasta|fresh noodles|cream filled|custard|soup|stew|curry|salad|quiche|chilled|pesto|salsa|guacamole)\b/i.test(name)
}

export function storageGuidance(item) {
  const text = `${item.name || ''} ${item.receiptName || ''}`.toLowerCase().replace(/[-_]/g, ' ')
  const known = classifyItem(text)
  const category = item.category && item.category !== 'other' ? item.category : known.category || 'other'
  const info = CATEGORIES[category] || CATEGORIES.other
  const opened = /\bopened\b/.test(text)
  const cut = /\b(cut|chopped|sliced|peeled|diced|shredded)\b/.test(text)

  if (category === 'non_food') return rule(pantry, [pantry], 'Keep non-food items in a dedicated dry cabinet, separate from food. Follow the product label.')
  if (/\b(egg whites?|egg yolks?)\b/.test(text)) return rule(shelves, CHILLED_OR_FROZEN, 'Refrigerate separated egg whites or yolks on Shelves in a covered container, or freeze in a suitable container. Do not use the door.')
  if (/\b(?:egg|chicken|ham|tuna|potato|macaroni) salad\b|coleslaw|sushi|sashimi/.test(text)) return rule(shelves, FRIDGE_SHELVES, 'Keep prepared salads and sushi covered on refrigerated Shelves. These foods do not generally freeze well; follow product instructions and use-by dates.')
  if (/quiche|omelett?e?|scrambled eggs?|egg fried rice|egg casserole/.test(text)) return rule(shelves, CHILLED_OR_FROZEN, 'Keep cooked egg dishes on Shelves or freeze suitable portions. Follow the recipe or product instructions for cooling, freezing and reheating.')
  if (/powdered eggs?|egg powder|dried eggs?/.test(text) && !/reconstituted|mixed with water/.test(text)) return rule(pantry, [pantry], 'Keep dry egg powder sealed in the Pantry as directed on its packaging. Once reconstituted, refrigerate and follow the product instructions.')
  if (category === 'eggs') return rule(shelves, FRIDGE_SHELVES, 'Keep eggs in their carton on Shelves. Opening the door lets warm air in, so neither door shelf is suitable. Do not freeze whole eggs in their shells; hard-boiled eggs also do not freeze well.')
  if (/\b(thawed|defrosted)\b/.test(text)) return rule(shelves, FRIDGE_SHELVES, 'Keep thawed food covered on Shelves and follow its defrosting instructions. Keep raw meat below ready-to-eat foods; do not automatically refreeze.')
  if (/\bfrozen\b|ice cream|gelato|popsicles?|ice cubes?/.test(text) || category === 'frozen') return rule(freezer, [freezer], 'Keep frozen products in the Freezer at -18°C or colder. Follow the label for thawing and home-freezing instructions.')

  const packaged = /\b(uht|shelf stable|long life|canned|tinned|evaporated|condensed)\b|coconut milk|coconut cream/.test(text) && !/\b(powder|powdered|dried)\b/.test(text)
  if (/keep refrigerated|\b(chilled|fresh)\b/.test(text) && packaged) return rule(shelves, FRIDGE_SHELVES, 'This product is labelled or described as chilled. Keep it on Shelves even if it is canned or packaged; follow its label.')
  if (packaged) return opened
    ? rule(shelves, FRIDGE_SHELVES, 'Once opened, refrigerate this shelf-stable carton or canned food on Shelves. Transfer food from an opened can into a clean covered container and follow the label.')
    : rule(pantry, [pantry], 'An unopened shelf-stable carton or can belongs in a cool, dry Pantry. Refrigerate after opening; products labelled Keep Refrigerated are exceptions.')
  if (/milk powder|powdered milk|protein powder|cocoa powder|stock cubes?|bouillon|dried (?:fruit|mushrooms?|herbs?)|\b(spices?|cinnamon|cumin|turmeric|paprika|peppercorns?|oregano|thyme|rosemary)\b/.test(text) && !/\bfresh\b/.test(text)) {
    return rule(pantry, [pantry], 'Keep dry ingredients sealed in the Pantry, away from heat, moisture and light. Follow any special instructions after opening.')
  }
  if ((/\b(cooked|leftovers?|rotisserie|fried|steamed|boiled)\b|\b(soup|stew|curry|pizza|lasagne|lasagna|casserole|risotto|congee|porridge)\b/.test(text) && !['snacks', 'condiments', 'beverages'].includes(category)) || (category === 'meat' && /\broast(?:ed)?\b/.test(text))) {
    return rule(shelves, CHILLED_OR_FROZEN, 'Keep cooked food covered on Shelves, above raw meat, or freeze suitable portions promptly. Cool and refrigerate promptly; freezing does not make spoiled food safe.')
  }
  if (category === 'seafood' && /\b(mussels?|clams?|oysters?|cockles?|live shellfish)\b/.test(text) && !/\bshucked\b/.test(text)) return rule(shelves, FRIDGE_SHELVES, 'Keep live shellfish chilled on Shelves, separate from ready-to-eat food. Do not freeze live shellfish; follow product-specific preparation and storage instructions.')
  if (/fresh (?:pasta|noodles)|\b(dumplings?|gyoza|wontons?|fishballs?|fish balls?|meatballs?|dim sum)\b/.test(text)) return rule(shelves, CHILLED_OR_FROZEN, 'Keep fresh prepared foods on Shelves or freeze if the product label permits. Dry pasta and noodles use the Pantry instead.')
  if (/cream filled|custard|cheesecake|tiramisu|cream cake|fresh cream/.test(text)) return rule(shelves, FRIDGE_SHELVES, 'Cream, custard and soft-cheese desserts need refrigerated Shelves. They are not ordinary shelf-stable bakery items; follow the label for freezing.')
  if (/\b(mayonnaise|mayo|pesto|salsa|hummus|guacamole)\b/.test(text) && (opened || /fresh|homemade|home made/.test(text))) return rule(shelves, refrigerated, 'Fresh or opened refrigerated dips and sauces belong in the fridge. Follow the label after opening; keep raw-food ingredients and ready-to-eat dips separate.')
  if (category === 'beverages' && /\b(fresh|chilled|smoothie)\b/.test(text)) return rule(shelves, refrigerated, 'Keep fresh or chilled drinks refrigerated and follow the label after opening. Unopened shelf-stable drinks are a different case and may use the Pantry.')
  if (opened && ['condiments', 'beverages'].includes(category) && !/\b(honey|vinegar)\b/.test(text)) return rule(shelves, refrigerated, 'Follow the label after opening. Products requiring refrigeration can use Shelves or either door shelf; keep milk and other temperature-sensitive foods on Shelves.')
  if (/\b(nuts?|almonds?|peanuts?|cashews?|walnuts?|pecans?|pistachios?|hazelnuts?|seeds?|chia|flaxseed|linseed)\b/.test(text) && !/milk|butter|sauce|bread/.test(text)) return rule(pantry, [pantry, ...CHILLED_OR_FROZEN], 'Keep nuts and seeds sealed in the Pantry, or refrigerate/freeze in an airtight container to preserve quality for longer.')

  const isProduce = ['fruit', 'vegetables', 'root_vegetables'].includes(category)
  if (isProduce && cut) return rule('crisper', [...produce, freezer], 'Cut or peeled produce needs refrigeration in a clean covered container. Freeze suitable prepared portions; whole-produce pantry advice no longer applies.')
  if (/\bbasil\b/.test(text)) return rule(pantry, [pantry], 'Whole fresh basil is best kept at room temperature, with stems in water, away from heat and direct sunlight. Cut preparations may need refrigeration.')
  if (/\b(fresh herbs?|parsley|coriander|cilantro|dill|mint|chives|spring onions?|scallions?|lemongrass)\b/.test(text)) return rule('crisper', produce, 'Keep fresh herbs chilled in the Crisper or on Shelves, protected from drying out. Dried herbs use the Pantry; basil is an exception.')
  if (/\b(potatoes?|onions?|garlic|shallots?|sweet potatoes?|pumpkins?|winter squash)\b/.test(text) && category === 'root_vegetables') return rule(pantry, [pantry], 'Store whole potatoes, onions and garlic in a cool, dark, dry, ventilated Pantry. Once cut, peeled or cooked, refrigerate instead.')
  if (isProduce && /\b(unripe|green banana)\b/.test(text)) return rule(pantry, [pantry], 'Allow whole unripe produce to ripen at room temperature, away from heat. Refrigerate suitable ripe fruit afterwards; cut produce always needs chilling.')
  if (category === 'fruit' && /\b(bananas?|avocado|mango|papaya|peaches?|pears?|nectarines?|apricots?|plums?|kiwi|guava|pineapple|durian|coconut)\b/.test(text)) {
    const ripe = /\bripe\b/.test(text)
    return rule(ripe ? 'crisper' : pantry, [pantry, ...produce, freezer], 'Whole fruit may ripen at room temperature; refrigerate suitable ripe fruit to slow further ripening. Cut fruit needs refrigeration. Prepare fruit appropriately before freezing; texture may change.')
  }
  if (category === 'fruit' && /\b(citrus|oranges?|mandarins?|tangerines?|clementines?|lemons?|limes?|pomelo|grapefruit|whole melon|watermelon)\b/.test(text)) return rule('crisper', [pantry, ...produce], 'Whole citrus and whole melons can use a cool Pantry or chilled storage. Once cut, refrigerate in a covered container.')
  if (category === 'vegetables' && /\b(tomatoes?|cucumbers?|eggplant|brinjal|aubergine|capsicum|bell peppers?)\b/.test(text)) return rule(pantry, [pantry, ...produce], 'Whole produce can use a cool Pantry; refrigeration is also an option for short storage but may affect quality. Cut produce must be refrigerated.')
  if (category === 'vegetables' || category === 'fruit') return rule('crisper', [...produce, freezer], 'Keep fresh produce chilled in the Crisper or on Shelves. Prepare fruit or blanch suitable vegetables before freezing; follow product instructions. Keep produce separate from raw meat.')

  if (category === 'other') {
    const allowed = (item.allowedLocations || []).filter(zone => ZONE_IDS.includes(zone))
    return rule(ZONE_IDS.includes(item.suggestedLocation) ? item.suggestedLocation : pantry, allowed.length ? allowed : ZONE_IDS, item.locationReason || 'Item not recognised: follow its packaging and storage instructions. No specific placement warning can be inferred.')
  }
  return rule(info.zone, info.allowed, info.reason)
}

export function withStorageGuidance(item) {
  const plain = item.toObject ? item.toObject() : item
  return { ...plain, ...storageGuidance(plain) }
}
