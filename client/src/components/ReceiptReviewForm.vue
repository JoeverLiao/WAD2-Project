<script setup>
// Shows what the parser found on the receipt and lets the user fix it before it is saved.
// Nothing is saved until the user presses "Save to inventory", and every row is checked first.
import { computed, nextTick, reactive, ref } from 'vue'
import { confirmReceiptItems, suggestItemDetails } from '../services/scanningApi.js'
import DietBadge from './common/DietBadge.vue'
import { CATEGORIES, DIETS, ZONES, categoryByValue, zoneByValue } from '../utils/inventoryOptions.js'
import { FOOD_ICONS } from '../utils/foodIcons.js'
import { foodIconForEmoji } from '../utils/foodIconMap.js'
import {
  MAX_ITEMS,
  UNIT_SUGGESTIONS,
  toIsoDay,
  toPayload,
  validatePurchaseDate,
  validateRow,
} from '../utils/receiptValidation.js'

const props = defineProps({
  // The `parsed` object from POST /api/scanning/receipts (may be null if parsing failed).
  parsed: { type: Object, default: null },
  // true when the user types the items in themselves instead of scanning a receipt
  manual: { type: Boolean, default: false },
})
const emit = defineEmits(['saved', 'reset'])

let nextKey = 1
function newRow(values = {}) {
  return {
    key: nextKey++,
    include: true,
    name: '',
    quantity: 1,
    unit: 'pieces',
    storage: 'pantry',
    storageZone: 'dry-storage',
    category: '',
    icon: '',
    dietType: '',
    suggestedLocation: '',
    allowedLocations: [],
    locationReason: '',
    weightKg: '',
    expiresAt: '',
    purchasePrice: '',
    warnings: [],
    receiptName: '',
    ...values,
  }
}

function initialRows(parsed) {
  const items = parsed?.items ?? []
  if (!items.length) return [newRow()]
  return items.map((item) =>
    newRow({
      include: item.include !== false,
      name: item.name ?? '',
      quantity: item.quantity ?? '',
      weightKg: item.weightKg ?? '',
      category: item.category ?? '',
      icon: item.icon ?? '',
      dietType: item.dietType ?? '',
      suggestedLocation: item.suggestedLocation ?? '',
      allowedLocations: item.allowedLocations ?? [],
      locationReason: item.locationReason ?? '',
      storageZone: item.storageZone ?? item.suggestedLocation ?? 'dry-storage',
      unit: item.unit ?? 'pieces',
      storage: item.storage ?? 'pantry',
      expiresAt: item.expiresAt ?? '',
      purchasePrice: item.price ?? '',
      warnings: item.warnings ?? [],
      receiptName: item.receiptName ?? '',
    }),
  )
}

const noItemsFound = !props.manual && !props.parsed?.items?.length
const rows = ref(initialRows(props.parsed))
const today = toIsoDay(new Date())
const purchasedAt = ref(props.parsed?.purchasedAt ?? (props.manual ? today : ''))

const submitted = ref(false)
// How many required fields still need filling in, shown after a failed save so nothing is missed.
const problemCount = computed(
  () =>
    (purchaseDateError.value ? 1 : 0) +
    includedRows.value.reduce((n, row) => n + Object.keys(rowErrors.value[row.key] ?? {}).length, 0),
)
const touched = reactive({}) // { [rowKey]: { [field]: true } }
const serverErrors = reactive({}) // { [rowKey]: { [field]: message } }
const saving = ref(false)
const saveError = ref('')
const savedCount = ref(0)
const addedCount = ref(0)
const mergedCount = ref(0)

const includedRows = computed(() => rows.value.filter((row) => row.include))
const rowErrors = computed(() =>
  Object.fromEntries(
    includedRows.value.map((row) => [row.key, validateRow(row, { purchasedAt: purchasedAt.value })]),
  ),
)
const purchaseDateError = computed(() => validatePurchaseDate(purchasedAt.value, new Date(), { required: true }))
const tooMany = computed(() => includedRows.value.length > MAX_ITEMS)
const canSave = computed(() => includedRows.value.length > 0 && !saving.value && !tooMany.value)

function errorFor(row, field) {
  const fromServer = serverErrors[row.key]?.[field]
  if (fromServer) return fromServer
  if (!row.include) return ''
  return submitted.value || touched[row.key]?.[field] ? (rowErrors.value[row.key]?.[field] ?? '') : ''
}

function touch(row, field) {
  touched[row.key] = { ...touched[row.key], [field]: true }
}

function edited(row, field) {
  if (serverErrors[row.key]) delete serverErrors[row.key][field]
}

function onZoneChange(row) {
  const zone = zoneByValue(row.storageZone)
  if (zone) row.storage = zone.storage
  edited(row, 'storageZone')
}

function onCategoryChange(row) {
  const category = categoryByValue(row.category)
  // Keep the icon the user picked; only choose one for the category when there is none yet.
  if (category && !row.icon) row.icon = category.icons[0]
  edited(row, 'category')
}

// Count of ticked items per diet label, shown above the list.
const dietCounts = computed(() =>
  DIETS.map((diet) => ({ ...diet, count: includedRows.value.filter((row) => row.dietType === diet.value).length })),
)

// The stored value is still the emoji, but the picker names the library icon it draws as.
// Several emojis share one library icon (🍎 and 🍏 are both the apple), so each icon is listed
// once, keeping whichever of them the row already has.
const libraryIcon = (emoji) => foodIconForEmoji(emoji) ?? emoji
const iconLabel = (emoji) => FOOD_ICONS[foodIconForEmoji(emoji)]?.label ?? emoji
function uniqueIcons(emojis, current) {
  const byIcon = new Map()
  for (const emoji of emojis) {
    if (!byIcon.has(libraryIcon(emoji)) || emoji === current) byIcon.set(libraryIcon(emoji), emoji)
  }
  return [...byIcon.values()]
}

const iconsFor = (row) => uniqueIcons(categoryByValue(row.category)?.icons ?? [], row.icon)
// Every icon is available on every row; the ones for the chosen category are listed first.
const ALL_ICONS = [...new Set(CATEGORIES.flatMap((c) => c.icons))]
const otherIcons = (row) => {
  const listed = new Set(iconsFor(row).map(libraryIcon))
  return uniqueIcons(ALL_ICONS.filter((icon) => !listed.has(libraryIcon(icon))), row.icon)
}
const isOffSuggestion = (row) =>
  Boolean(row.suggestedLocation) && row.allowedLocations.length > 0 && !row.allowedLocations.includes(row.storageZone)

// Manual entry: ask the server to suggest the details for rows that have a name but no category yet.
function aiNotice(status) {
  if (status === 'not_configured') {
    return 'Some items were not recognised and the AI is switched off (no API key on the server), so please choose their category and place yourself.'
  }
  if (status === 'failed') {
    return 'Some items were not recognised and the AI could not be reached, so please choose their category and place yourself.'
  }
  return ''
}
const suggesting = ref(false)
const suggestMessage = ref('')
async function suggestDetails() {
  const targets = rows.value.filter((row) => row.name.trim() && !row.category)
  if (!targets.length) {
    suggestMessage.value = 'Type an item name first (rows that already have details are left alone).'
    return
  }
  suggesting.value = true
  suggestMessage.value = ''
  try {
    const { items, aiUsed, aiStatus } = await suggestItemDetails(
      targets.map((row) => ({
        name: row.name.trim(),
        quantity: Number(row.quantity) > 0 ? Number(row.quantity) : undefined,
        unit: row.unit || undefined,
        purchasedAt: purchasedAt.value || undefined,
      })),
    )
    targets.forEach((row, i) => {
      const d = items[i]
      if (!d) return
      row.category = d.category
      row.icon = d.icon
      row.dietType = d.dietType ?? ''
      row.suggestedLocation = d.suggestedLocation
      row.allowedLocations = d.allowedLocations
      row.locationReason = d.locationReason
      row.storageZone = d.suggestedLocation
      row.storage = d.storage
      if (!row.expiresAt && d.expiresAt) row.expiresAt = d.expiresAt
      if (row.weightKg === '' && d.weightKg) row.weightKg = d.weightKg
    })
    suggestMessage.value = aiUsed
      ? 'Details suggested. Please check them: the use-by date and weight are estimates.'
      : aiStatus === 'not_configured' || aiStatus === 'failed'
        ? aiNotice(aiStatus)
        : 'Details suggested from our storage rules. Please check them: the use-by date and weight are estimates.'
  } catch (error) {
    suggestMessage.value = error.message
  } finally {
    suggesting.value = false
  }
}

function addRow() {
  rows.value.push(newRow())
}

function removeRow(key) {
  rows.value = rows.value.filter((row) => row.key !== key)
  if (!rows.value.length) rows.value.push(newRow())
}

async function focusFirstProblem() {
  await nextTick()
  document.querySelector('#review-form .is-invalid')?.focus()
}

async function save() {
  submitted.value = true
  saveError.value = ''
  for (const key of Object.keys(serverErrors)) delete serverErrors[key]

  const hasErrors =
    purchaseDateError.value || includedRows.value.some((row) => Object.keys(rowErrors.value[row.key]).length)
  if (hasErrors || !canSave.value) {
    await focusFirstProblem()
    return
  }

  const sent = includedRows.value.slice()
  saving.value = true
  try {
    const result = await confirmReceiptItems(sent.map((row) => toPayload(row, purchasedAt.value)), props.manual ? 'manual' : 'receipt')
    savedCount.value = result.saved
    addedCount.value = result.added ?? result.saved
    mergedCount.value = result.merged ?? 0
    emit('saved', result)
  } catch (error) {
    saveError.value = error.message
    // The server says which item and field it rejected: mark them on the form.
    for (const detail of error.details ?? []) {
      const row = sent[detail.index]
      if (row && detail.field) {
        serverErrors[row.key] = { ...serverErrors[row.key], [detail.field]: detail.message }
      }
    }
    await focusFirstProblem()
  } finally {
    saving.value = false
  }
}

const totalWarning = computed(() => {
  const p = props.parsed
  if (!p || p.totalMatches !== false || p.total === null || p.total === undefined) return ''
  return `The items add up to ${p.itemsSum.toFixed(2)} but the receipt total is ${p.total.toFixed(2)}, so an item may be missing or misread.`
})
</script>

<template>
  <div class="card mt-4" data-testid="review-form">
    <div class="card-body">
      <!-- Saved -->
      <div v-if="savedCount" class="text-center py-3" data-testid="saved-message">
        <div class="alert alert-success" role="status">
          Saved {{ savedCount }} {{ savedCount === 1 ? 'item' : 'items' }} to your inventory.
          <span v-if="mergedCount" data-testid="merged-message">
            {{ mergedCount }} {{ mergedCount === 1 ? 'was' : 'were' }} already in stock, so the quantity was increased
            ({{ addedCount }} new).
          </span>
        </div>
        <button type="button" class="btn fc-btn" @click="emit('reset')">
          {{ manual ? 'Add more items' : 'Scan another receipt' }}
        </button>
      </div>

      <!-- Review -->
      <form v-else id="review-form" novalidate @submit.prevent="save">
        <h2 class="h5">{{ manual ? 'Add items yourself' : 'Check your items' }}</h2>
        <p v-if="manual" class="text-body-secondary small mb-3" data-testid="manual-intro">
          Type in what you bought. Only the name, quantity and where it is kept are needed: the price and the
          use-by date are optional. Common foods are saved under a standard name (for example "Full cream milk"
          becomes "Milk") so the same product is always counted together.
        </p>
        <p v-else class="text-body-secondary small mb-3">
          We read these from the receipt. Fix anything that is wrong, untick things you do not want to
          save, then press <strong>Save to inventory</strong>.
        </p>

        <p class="small mb-2" data-testid="required-legend">
          <span class="required-mark" aria-hidden="true">*</span> marks a required field. Only the price and the unit
          are optional, and you need either a quantity or a weight.
        </p>
        <div v-if="noItemsFound" class="alert alert-info" role="status" data-testid="no-items">
          We could not find any items on this receipt. You can add them yourself below.
        </div>
        <div v-if="parsed?.merchant" class="small text-body-secondary mb-2">
          Store: <strong>{{ parsed.merchant }}</strong>
        </div>
        <div v-if="!manual && aiNotice(parsed?.aiStatus)" class="alert alert-warning py-2 small" role="alert" data-testid="ai-notice">
          {{ aiNotice(parsed.aiStatus) }}
        </div>
        <div v-if="totalWarning" class="alert alert-warning py-2 small" role="alert" data-testid="total-warning">
          {{ totalWarning }}
        </div>

        <!-- Diet key and summary: what the labels mean, and how many items of each kind -->
        <section class="border rounded p-3 mb-3 bg-body-tertiary" aria-labelledby="diet-key-title" data-testid="diet-key">
          <h3 id="diet-key-title" class="h6 mb-2">Diet labels</h3>
          <ul class="list-unstyled d-flex flex-wrap gap-3 mb-2">
            <li v-for="diet in dietCounts" :key="diet.value" class="d-flex align-items-center gap-2" data-testid="diet-key-item">
              <DietBadge :value="diet.value" />
              <span class="fw-semibold" :aria-label="`${diet.count} items`">× {{ diet.count }}</span>
            </li>
          </ul>
          <p class="small mb-0 text-body-secondary">
            Labels are based on the usual recipe of each food. Recipes and brands differ, so always check the
            pack if you have an allergy or follow a strict diet. You can change any label.
          </p>
        </section>

        <div class="row g-3 mb-3">
          <div class="col-12 col-md-4">
            <label class="form-label fw-semibold" for="purchased-at">Purchase date <span class="required-mark" aria-hidden="true">*</span></label>
            <input
              id="purchased-at"
              v-model="purchasedAt"
              type="date"
              class="form-control"
              :class="{ 'is-invalid': submitted && purchaseDateError }"
              :max="today"
              data-testid="purchased-at"
            />
            <div class="invalid-feedback">{{ purchaseDateError }}</div>
            <div v-if="parsed?.dateAmbiguous" class="form-text text-warning-emphasis">
              The receipt date could be read as day/month or month/day. Please check it.
            </div>
            <div v-else-if="!purchasedAt && !submitted" class="form-text">
              {{ manual ? 'Required.' : 'No date was found on the receipt: please enter it.' }}
            </div>
          </div>
        </div>

        <div
          v-for="(row, index) in rows"
          :key="row.key"
          class="item-row border rounded p-3 mb-3"
          :class="[{ 'bg-body-tertiary': !row.include }, row.dietType ? `diet-edge-${row.dietType}` : '']"
          data-testid="item-row"
        >
          <div class="d-flex align-items-center mb-2">
            <div class="form-check">
              <input
                :id="`include-${row.key}`"
                v-model="row.include"
                type="checkbox"
                class="form-check-input"
                data-testid="include"
              />
              <label class="form-check-label fw-semibold" :for="`include-${row.key}`">
                Item {{ index + 1 }}
              </label>
            </div>
            <DietBadge :value="row.dietType" class="ms-3" />
            <button
              type="button"
              class="btn btn-sm btn-outline-danger ms-auto"
              :aria-label="`Remove item ${index + 1}`"
              data-testid="remove"
              @click="removeRow(row.key)"
            >
              Remove
            </button>
          </div>

          <p
            v-if="row.receiptName && row.receiptName.toLowerCase() !== row.name.trim().toLowerCase()"
            class="small text-body-secondary mb-1"
            data-testid="receipt-name"
          >
            On the receipt: {{ row.receiptName }}
          </p>
          <ul v-if="row.warnings.length" class="small text-warning-emphasis ps-3 mb-2">
            <li v-for="warning in row.warnings" :key="warning">{{ warning }}</li>
          </ul>

          <fieldset :disabled="!row.include" class="border-0 p-0 m-0">
            <div class="row g-2">
              <div class="col-12 col-md-5">
                <label class="form-label small mb-1" :for="`name-${row.key}`">Name <span class="required-mark" aria-hidden="true">*</span></label>
                <input
                  :id="`name-${row.key}`"
                  v-model="row.name"
                  type="text"
                  class="form-control"
                  :class="{ 'is-invalid': errorFor(row, 'name') }"
                  maxlength="100"
                  :placeholder="manual ? 'For example: Milk' : ''"
                  data-testid="name"
                  @blur="touch(row, 'name')"
                  @input="edited(row, 'name')"
                />
                <div class="invalid-feedback">{{ errorFor(row, 'name') }}</div>
              </div>
              <div class="col-4 col-md-2">
                <label class="form-label small mb-1" :for="`qty-${row.key}`">Quantity (optional)</label>
                <input
                  :id="`qty-${row.key}`"
                  v-model="row.quantity"
                  type="text"
                  inputmode="decimal"
                  class="form-control"
                  :class="{ 'is-invalid': errorFor(row, 'quantity') }"
                  data-testid="quantity"
                  @blur="touch(row, 'quantity')"
                  @input="edited(row, 'quantity')"
                />
                <div class="invalid-feedback">{{ errorFor(row, 'quantity') }}</div>
              </div>
              <div class="col-4 col-md-3">
                <label class="form-label small mb-1" :for="`unit-${row.key}`">Unit</label>
                <input
                  :id="`unit-${row.key}`"
                  v-model="row.unit"
                  type="text"
                  list="unit-options"
                  class="form-control"
                  :class="{ 'is-invalid': errorFor(row, 'unit') }"
                  maxlength="20"
                  data-testid="unit"
                  @blur="touch(row, 'unit')"
                  @input="edited(row, 'unit')"
                />
                <div class="invalid-feedback">{{ errorFor(row, 'unit') }}</div>
              </div>
              <div class="col-4 col-md-2">
                <label class="form-label small mb-1" :for="`price-${row.key}`">Price (optional)</label>
                <input
                  :id="`price-${row.key}`"
                  v-model="row.purchasePrice"
                  type="text"
                  inputmode="decimal"
                  class="form-control"
                  :class="{ 'is-invalid': errorFor(row, 'purchasePrice') }"
                  data-testid="price"
                  @blur="touch(row, 'purchasePrice')"
                  @input="edited(row, 'purchasePrice')"
                />
                <div class="invalid-feedback">{{ errorFor(row, 'purchasePrice') }}</div>
              </div>
              <div class="col-6 col-md-4">
                <label class="form-label small mb-1" :for="`zone-${row.key}`">Keep in <span class="required-mark" aria-hidden="true">*</span></label>
                <select
                  :id="`zone-${row.key}`"
                  v-model="row.storageZone"
                  class="form-select"
                  :class="{ 'is-invalid': errorFor(row, 'storageZone') }"
                  data-testid="zone"
                  @change="onZoneChange(row)"
                >
                  <option v-for="zone in ZONES" :key="zone.value" :value="zone.value">
                    {{ zone.icon }} {{ zone.label }}
                  </option>
                </select>
                <div class="invalid-feedback">{{ errorFor(row, 'storageZone') }}</div>
              </div>
              <div class="col-6 col-md-4">
                <label class="form-label small mb-1" :for="`expires-${row.key}`">Use by (estimate, editable) <span class="required-mark" aria-hidden="true">*</span></label>
                <input
                  :id="`expires-${row.key}`"
                  v-model="row.expiresAt"
                  type="date"
                  class="form-control"
                  :class="{ 'is-invalid': errorFor(row, 'expiresAt') }"
                  data-testid="expires"
                  @blur="touch(row, 'expiresAt')"
                  @input="edited(row, 'expiresAt')"
                />
                <div class="invalid-feedback">{{ errorFor(row, 'expiresAt') }}</div>
              </div>
              <div class="col-6 col-md-4">
                <label class="form-label small mb-1" :for="`category-${row.key}`">Category <span class="required-mark" aria-hidden="true">*</span></label>
                <select
                  :id="`category-${row.key}`"
                  v-model="row.category"
                  class="form-select"
                  :class="{ 'is-invalid': errorFor(row, 'category') }"
                  data-testid="category"
                  @change="onCategoryChange(row)"
                >
                  <option value="">Choose a category…</option>
                  <option v-for="category in CATEGORIES" :key="category.value" :value="category.value">
                    {{ category.label }}
                  </option>
                </select>
                <div class="invalid-feedback">{{ errorFor(row, 'category') }}</div>
              </div>
              <div class="col-6 col-md-2">
                <label class="form-label small mb-1" :for="`icon-${row.key}`">Icon</label>
                <select
                  :id="`icon-${row.key}`"
                  v-model="row.icon"
                  class="form-select"
                  data-testid="icon"
                >
                  <option v-if="!row.icon" value="">–</option>
                  <optgroup v-if="iconsFor(row).length" :label="categoryByValue(row.category).label">
                    <option v-for="icon in iconsFor(row)" :key="icon" :value="icon">{{ iconLabel(icon) }}</option>
                  </optgroup>
                  <optgroup label="All icons">
                    <option v-for="icon in otherIcons(row)" :key="icon" :value="icon">{{ iconLabel(icon) }}</option>
                  </optgroup>
                </select>
              </div>
              <div class="col-6 col-md-3">
                <label class="form-label small mb-1" :for="`diet-${row.key}`">Diet label <span class="required-mark" aria-hidden="true">*</span></label>
                <select
                  :id="`diet-${row.key}`"
                  v-model="row.dietType"
                  class="form-select"
                  :class="{ 'is-invalid': errorFor(row, 'dietType') }"
                  data-testid="diet"
                >
                  <option value="">Choose a diet label…</option>
                  <option v-for="diet in DIETS" :key="diet.value" :value="diet.value">{{ diet.icon }} {{ diet.label }}</option>
                </select>
                <div class="invalid-feedback">{{ errorFor(row, 'dietType') }}</div>
              </div>
              <div class="col-6 col-md-3">
                <label class="form-label small mb-1" :for="`weight-${row.key}`">Weight (kg)</label>
                <input
                  :id="`weight-${row.key}`"
                  v-model="row.weightKg"
                  type="text"
                  inputmode="decimal"
                  class="form-control"
                  :class="{ 'is-invalid': errorFor(row, 'weightKg') }"
                  data-testid="weight"
                  @blur="touch(row, 'weightKg')"
                  @input="edited(row, 'weightKg')"
                />
                <div class="invalid-feedback">{{ errorFor(row, 'weightKg') }}</div>
              </div>
              <div v-if="row.suggestedLocation" class="col-12">
                <p class="small mb-0" :class="isOffSuggestion(row) ? 'text-warning-emphasis' : 'text-body-secondary'" data-testid="location-hint">
                  Suggested place: <strong>{{ zoneByValue(row.suggestedLocation)?.label }}</strong>.
                  {{ row.locationReason }}
                </p>
              </div>
            </div>
          </fieldset>
        </div>

        <datalist id="unit-options">
          <option v-for="unit in UNIT_SUGGESTIONS" :key="unit" :value="unit" />
        </datalist>

        <div class="d-flex flex-wrap gap-2 align-items-center mb-3">
          <button type="button" class="btn fc-btn-outline btn-sm" data-testid="add-row" @click="addRow">
            + Add an item
          </button>
          <button
            v-if="manual"
            type="button"
            class="btn fc-btn-outline btn-sm"
            :disabled="suggesting"
            data-testid="suggest"
            @click="suggestDetails"
          >
            <span v-if="suggesting" class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>
            ✨ Suggest category, place, use-by date and weight
          </button>
          <span v-if="suggestMessage" class="small text-body-secondary" role="status" data-testid="suggest-message">
            {{ suggestMessage }}
          </span>
        </div>

        <div v-if="tooMany" class="alert alert-danger py-2" role="alert">
          You can save at most {{ MAX_ITEMS }} items at a time. Untick or remove some.
        </div>
        <div
          v-if="submitted && problemCount && !savedCount"
          class="alert alert-danger py-2"
          role="alert"
          data-testid="problem-summary"
        >
          Please fill in the {{ problemCount }} required {{ problemCount === 1 ? 'field' : 'fields' }} marked in red before saving.
        </div>
        <div v-if="saveError" class="alert alert-danger py-2" role="alert" data-testid="save-error">
          {{ saveError }}
        </div>

        <div class="d-flex flex-wrap gap-2 align-items-center">
          <button type="submit" class="btn fc-btn" :disabled="!canSave" data-testid="save">
            <span v-if="saving" class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
            {{ saving ? 'Saving…' : 'Save to inventory' }}
          </button>
          <span class="small text-body-secondary" data-testid="count">
            {{ includedRows.length }} of {{ rows.length }} {{ rows.length === 1 ? 'item' : 'items' }} will be saved
          </span>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
/* A thick coloured edge on each item repeats the diet label (the badge and the word say it too). */
.item-row {
  border-left-width: 8px !important;
}
.diet-edge-vegan {
  border-left-color: #14532d !important;
}
.diet-edge-vegetarian {
  border-left-color: #16a34a !important;
}
.diet-edge-other {
  border-left-color: #7c2d12 !important;
}
.diet-edge-unknown {
  border-left-color: #6b7280 !important;
  border-left-style: dashed !important;
}
</style>
