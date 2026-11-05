<script setup>
// Shows what the parser found on the receipt and lets the user fix it before it is saved.
// Nothing is saved until the user presses "Save to inventory", and every row is checked first.
import { RouterLink } from 'vue-router'
import { computed, nextTick, reactive, ref } from 'vue'
import { confirmReceiptItems, suggestItemDetails } from '../services/scanningApi.js'
import DietBadge from './common/DietBadge.vue'
import { CATEGORIES, DIETS, ZONES, categoryByValue, zoneByValue, unifiedShelfZone } from '../utils/inventoryOptions.js'
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
const keepInZones = ZONES.filter(zone => !['upper-shelf', 'lower-shelf'].includes(zone.value))
  .map(zone => ({ ...zone, label: zone.value === 'middle-shelf' ? 'Shelves' : zone.value === 'door' ? 'Upper door shelf' : zone.label }))

let nextKey = 1
function newRow(values = {}) {
  return {
    key: nextKey++,
    include: true,
    name: '',
    quantity: 1,
    unit: 'pieces',
    storage: 'fridge',
    storageZone: 'middle-shelf',
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
    openField: '', // which detail is open for editing
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
      storageZone: unifiedShelfZone(item.storageZone ?? item.suggestedLocation ?? 'middle-shelf'),
      unit: item.unit ?? 'pieces',
      storage: zoneByValue(item.storageZone ?? item.suggestedLocation)?.storage ?? item.storage ?? 'fridge',
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
const savedItems = ref([])
const savedLocations = computed(() => savedItems.value.map(item => {
  const storage = item.storage === 'pantry' ? 'Pantry' : 'Fridge'
  const zone = keepInZones.find(zone => zone.value === unifiedShelfZone(item.storageZone))?.label || item.storageZone || item.storage
  return { id: item._id, name: item.name, location: storage + ' · ' + zone }
}))
const viewItemsRoute = computed(() => ({
  name: 'fridge', query: { highlight: savedItems.value.map(item => String(item._id)) },
}))
const addedCount = ref(0)
const mergedCount = ref(0)

const includedRows = computed(() => rows.value.filter((row) => row.include))
const rowErrors = computed(() =>
  Object.fromEntries(
    includedRows.value.map((row) => [row.key, validateRow(row, { purchasedAt: purchasedAt.value })]),
  ),
)
// Errors for EVERY row (also unticked ones), so the tiles can show green or red straight away.
const allRowErrors = computed(() =>
  Object.fromEntries(rows.value.map((row) => [row.key, validateRow(row, { purchasedAt: purchasedAt.value })])),
)
const purchaseDateError = computed(() => validatePurchaseDate(purchasedAt.value, new Date(), { required: true }))
const tooMany = computed(() => includedRows.value.length > MAX_ITEMS)
const canSave = computed(() => includedRows.value.length > 0 && !saving.value && !tooMany.value)
const submissionStatus = computed(() => {
  if (saving.value) return 'Saving your items…'
  if (saveError.value) return 'Some details need checking before saving.'
  if (!includedRows.value.length) return 'Select at least one item to save.'
  if (tooMany.value) return `Select no more than ${MAX_ITEMS} items.`
  if (problemCount.value) return `${problemCount.value} missing or invalid detail${problemCount.value === 1 ? '' : 's'} — tap Save to find the first one.`
  return 'All required details look good. Ready to save.'
})

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

// ----- the tiles -----
const REQUIRED_FIELDS = new Set(['name', 'quantity', 'storageZone', 'expiresAt', 'category', 'dietType', 'weightKg'])
// field -> id prefix of its input (used to focus it)
const INPUT_PREFIX = {
  name: 'name', quantity: 'qty', unit: 'unit', purchasePrice: 'price', storageZone: 'zone',
  expiresAt: 'expires', category: 'category', icon: 'icon', dietType: 'diet', weightKg: 'weight',
}
const FIELD_ORDER = ['name', 'quantity', 'storageZone', 'expiresAt', 'category', 'dietType', 'weightKg', 'unit', 'purchasePrice', 'icon']

function formatDay(iso) {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

function tileValue(row, field) {
  switch (field) {
    case 'name': return row.name.trim()
    case 'quantity': return String(row.quantity ?? '').trim()
    case 'unit': return String(row.unit ?? '').trim()
    case 'purchasePrice': return String(row.purchasePrice ?? '').trim() ? `$${String(row.purchasePrice).trim()}` : ''
    case 'storageZone': { const z = keepInZones.find(zone => zone.value === unifiedShelfZone(row.storageZone)); return z ? `${z.icon} ${z.label}` : '' }
    case 'expiresAt': return formatDay(row.expiresAt)
    case 'category': return categoryByValue(row.category)?.label ?? ''
    case 'icon': return row.icon
    case 'dietType': { const d = DIETS.find((x) => x.value === row.dietType); return d ? `${d.icon} ${d.label}` : '' }
    case 'weightKg': return String(row.weightKg ?? '').trim() ? `${String(row.weightKg).trim()} kg` : ''
    default: return ''
  }
}

const TILE_LABELS = [
  ['name', 'Name'], ['quantity', 'Quantity'], ['unit', 'Unit'], ['purchasePrice', 'Price'], ['storageZone', 'Keep in'],
  ['expiresAt', 'Use by'], ['category', 'Category'], ['icon', 'Icon'], ['dietType', 'Diet label'], ['weightKg', 'Weight'],
]

function tilesFor(row) {
  const errors = allRowErrors.value[row.key] ?? {}
  return TILE_LABELS.map(([field, label]) => {
    const required = REQUIRED_FIELDS.has(field)
    const value = tileValue(row, field)
    let state = 'tile-optional'
    if (required) state = errors[field] ? 'tile-missing' : 'tile-ok'
    else if (errors[field]) state = 'tile-missing'
    const mark = state === 'tile-ok' ? '✓' : state === 'tile-missing' ? '!' : ''
    const statusWords =
      state === 'tile-ok' ? 'filled in' : state === 'tile-missing' ? (required ? 'required, still needed' : 'needs fixing') : 'optional'
    return { field, label, required, state, mark, statusWords, value: value || (required ? 'Required' : 'Optional') }
  })
}

function toggleField(row, field) {
  row.openField = row.openField === field ? '' : field
  if (row.openField) {
    nextTick(() => document.getElementById(`${INPUT_PREFIX[field]}-${row.key}`)?.focus())
  }
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

const iconsFor = (row) => categoryByValue(row.category)?.icons ?? []
// Every icon is available on every row; the ones for the chosen category are listed first.
const ALL_ICONS = [...new Set(CATEGORIES.flatMap((c) => c.icons))]
const otherIcons = (row) => ALL_ICONS.filter((icon) => !iconsFor(row).includes(icon))
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
      row.storageZone = unifiedShelfZone(d.suggestedLocation)
      row.storage = zoneByValue(row.storageZone).storage
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
  if (purchaseDateError.value) {
    await nextTick()
    document.getElementById('purchased-at')?.focus()
    return
  }
  // Open the first missing detail of the first item that has a problem, and put the cursor in it.
  for (const row of includedRows.value) {
    const errors = { ...(allRowErrors.value[row.key] ?? {}) }
    for (const [field, message] of Object.entries(serverErrors[row.key] ?? {})) if (message) errors[field] = message
    const field = FIELD_ORDER.find((f) => errors[f])
    if (field) {
      row.openField = field
      await nextTick()
      document.getElementById(`${INPUT_PREFIX[field]}-${row.key}`)?.focus()
      return
    }
  }
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
    const result = await confirmReceiptItems(sent.map(row => toPayload(row, purchasedAt.value)), props.manual ? 'manual' : 'receipt')
    savedItems.value = result.items || []
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
        <ul v-if="savedLocations.length" class="list-unstyled mb-3">
          <li v-for="item in savedLocations" :key="item.id"><strong>{{ item.name }}</strong> → {{ item.location }}</li>
        </ul>
        <div class="d-flex flex-wrap justify-content-center gap-2">
        <button type="button" class="btn fc-btn" @click="emit('reset')">
          Add more items
        </button>
        <RouterLink v-if="savedItems.length" class="btn fc-btn-outline" :to="viewItemsRoute">View Items</RouterLink>
        </div>
      </div>

      <!-- Review -->
      <form v-else id="review-form" class="receipt-review-fields" novalidate @submit.prevent="save">
        <h2 class="h5">{{ manual ? 'Add items yourself' : 'Check your items' }}</h2>
        <p v-if="manual" class="text-body-secondary small mb-3" data-testid="manual-intro">
          Type in what you bought. Only the name, quantity and where it is kept are needed: the price and the
          use-by date are optional. Product names are kept as entered; suggested categories and storage
          details are saved separately.
        </p>
        <p v-else class="text-body-secondary small mb-3">
          We read these from the receipt. Fix anything that is wrong, untick things you do not want to
          save, then press <strong>Save to inventory</strong>.
        </p>

        <p class="small mb-2" data-testid="required-legend">
          <span class="required-mark" aria-hidden="true">*</span> marks a required detail. Tiles turn <strong>green</strong>
          when a required detail is filled in and <strong>red</strong> while it is missing. Only the unit, price and icon
          are optional. Press a tile to edit it.
        </p>
        <div v-if="noItemsFound" class="alert alert-info" role="status" data-testid="no-items">
          We could not find any items on this receipt. You can add them yourself below.
        </div>
        <div v-if="parsed?.merchant" class="small text-body-secondary mb-2">
          Store: <strong>{{ parsed.merchant }}</strong>
        </div>
        <div v-if="!manual && parsed?.skipped?.length" class="alert alert-secondary py-2 small" role="status" data-testid="skipped-note">
          Left out because they are not food: {{ parsed.skipped.join(', ') }}.
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
            <!-- One tile per detail. Green = required and filled, red = required and missing, plain = optional.
                 Press a tile to open its editor below. -->
            <div class="field-tiles mb-2" role="group" :aria-label="`Details of item ${index + 1}`">
              <button
                v-for="tile in tilesFor(row)"
                :key="tile.field"
                type="button"
                class="field-tile"
                :class="[tile.state, { 'is-open': row.openField === tile.field }]"
                :aria-expanded="row.openField === tile.field"
                :aria-controls="`editor-${tile.field}-${row.key}`"
                :data-testid="`tile-${tile.field}`"
                @click="toggleField(row, tile.field)"
              >
                <span class="tile-label">
                  {{ tile.label }}<span v-if="tile.required" class="required-mark" aria-hidden="true"> *</span>
                </span>
                <span class="tile-value">{{ tile.value }}</span>
                <span class="tile-status" aria-hidden="true">{{ tile.mark }}</span>
                <span class="visually-hidden">{{ tile.statusWords }}</span>
              </button>
            </div>
            <div class="row g-2">
              <div v-show="row.openField === 'name'" :id="`editor-name-${row.key}`" class="col-12 col-md-6">
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
              <div v-show="row.openField === 'quantity'" :id="`editor-quantity-${row.key}`" class="col-12 col-md-6">
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
              <div v-show="row.openField === 'unit'" :id="`editor-unit-${row.key}`" class="col-12 col-md-6">
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
              <div v-show="row.openField === 'purchasePrice'" :id="`editor-purchasePrice-${row.key}`" class="col-12 col-md-6">
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
              <div v-show="row.openField === 'storageZone'" :id="`editor-storageZone-${row.key}`" class="col-12 col-md-6">
                <label class="form-label small mb-1" :for="`zone-${row.key}`">Keep in <span class="required-mark" aria-hidden="true">*</span></label>
                <select
                  :id="`zone-${row.key}`"
                  v-model="row.storageZone"
                  class="form-select"
                  :class="{ 'is-invalid': errorFor(row, 'storageZone') }"
                  data-testid="zone"
                  @change="onZoneChange(row)"
                >
                  <option v-for="zone in keepInZones" :key="zone.value" :value="zone.value">
                    {{ zone.icon }} {{ zone.label }}
                  </option>
                </select>
                <div class="invalid-feedback">{{ errorFor(row, 'storageZone') }}</div>
              </div>
              <div v-show="row.openField === 'expiresAt'" :id="`editor-expiresAt-${row.key}`" class="col-12 col-md-6">
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
              <div v-show="row.openField === 'category'" :id="`editor-category-${row.key}`" class="col-12 col-md-6">
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
              <div v-show="row.openField === 'icon'" :id="`editor-icon-${row.key}`" class="col-12 col-md-6">
                <label class="form-label small mb-1" :for="`icon-${row.key}`">Icon</label>
                <select
                  :id="`icon-${row.key}`"
                  v-model="row.icon"
                  class="form-select"
                  data-testid="icon"
                >
                  <option v-if="!row.icon" value="">–</option>
                  <optgroup v-if="iconsFor(row).length" :label="categoryByValue(row.category).label">
                    <option v-for="icon in iconsFor(row)" :key="icon" :value="icon">{{ icon }}</option>
                  </optgroup>
                  <optgroup label="All icons">
                    <option v-for="icon in otherIcons(row)" :key="icon" :value="icon">{{ icon }}</option>
                  </optgroup>
                </select>
              </div>
              <div v-show="row.openField === 'dietType'" :id="`editor-dietType-${row.key}`" class="col-12 col-md-6">
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
              <div v-show="row.openField === 'weightKg'" :id="`editor-weightKg-${row.key}`" class="col-12 col-md-6">
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

        <div class="receipt-submit-bar">
          <div class="receipt-submit-inner">
          <button type="submit" class="btn fc-btn" :disabled="!canSave" data-testid="save" aria-describedby="receipt-submit-status">
            <span v-if="saving" class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
            {{ saving ? 'Saving…' : 'Save to inventory' }}
          </button>
          <div>
          <p id="receipt-submit-status" class="receipt-submit-status" role="status">{{ submissionStatus }}</p>
          <span class="small text-body-secondary" data-testid="count">
            {{ includedRows.length }} of {{ rows.length }} {{ rows.length === 1 ? 'item' : 'items' }} will be saved
          </span>
          </div>
          </div>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.receipt-review-fields { padding-bottom:150px; }
.receipt-submit-bar {
  position:fixed; left:0; right:0; bottom:0; z-index:1050;
  padding:12px 16px max(12px, env(safe-area-inset-bottom));
  border-top:1px solid var(--line, #9bcac5); background:#fbfffdf5;
  box-shadow:0 -5px 18px #123f3b15; backdrop-filter:blur(8px);
}
.receipt-submit-inner {
  display:flex; align-items:center; gap:16px; max-width:1100px; margin:auto;
}
.receipt-submit-status { margin:0 0 3px; font-size:.95rem; color:var(--muted, #557b77); }
@media(max-width:575.98px) {
  .receipt-submit-inner { flex-direction:column-reverse; align-items:stretch; gap:8px; }
  .receipt-submit-inner > .btn { min-height:44px; }
  .receipt-review-fields { padding-bottom:210px; }
}
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

/* ----- the detail tiles: one row per item, each tile opens its editor when pressed ----- */
.field-tiles {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.field-tile {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 7.5rem;
  max-width: 14rem;
  padding: 0.45rem 1.6rem 0.45rem 0.7rem;
  border: 2px solid #cfdcd4;
  border-radius: 10px;
  background: #fff;
  color: #24352f;
  text-align: left;
  cursor: pointer;
}
.field-tile:hover {
  filter: brightness(0.97);
}
.field-tile:focus-visible,
.field-tile.is-open {
  outline: 3px solid #105c4d;
  outline-offset: 2px;
}
.tile-label {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.tile-value {
  overflow: hidden;
  font-size: 0.95rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tile-status {
  position: absolute;
  top: 0.35rem;
  right: 0.5rem;
  font-weight: 800;
}
/* required and filled: pastel green (text contrast about 8:1) */
.tile-ok {
  background: #d9f2e3;
  border-color: #2f8f5b;
  color: #14532d;
}
/* required and missing: pastel red (text contrast about 9:1) */
.tile-missing {
  background: #fde4e4;
  border-color: #d64545;
  color: #7a1d1d;
}
/* optional: plain */
.tile-optional {
  background: #fff;
}
</style>
