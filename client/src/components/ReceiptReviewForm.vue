<script setup>
// Shows what the parser found on the receipt and lets the user fix it before it is saved.
// Nothing is saved until the user presses "Save to inventory", and every row is checked first.
import { computed, nextTick, reactive, ref } from 'vue'
import { confirmReceiptItems } from '../services/scanningApi.js'
import {
  MAX_ITEMS,
  STORAGE_OPTIONS,
  UNIT_SUGGESTIONS,
  toIsoDay,
  toPayload,
  validatePurchaseDate,
  validateRow,
} from '../utils/receiptValidation.js'

const props = defineProps({
  // The `parsed` object from POST /api/scanning/receipts (may be null if parsing failed).
  parsed: { type: Object, default: null },
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
      quantity: item.quantity ?? 1,
      unit: item.unit ?? 'pieces',
      storage: item.storage ?? 'pantry',
      expiresAt: item.expiresAt ?? '',
      purchasePrice: item.price ?? '',
      warnings: item.warnings ?? [],
      receiptName: item.receiptName ?? '',
    }),
  )
}

const noItemsFound = !props.parsed?.items?.length
const rows = ref(initialRows(props.parsed))
const purchasedAt = ref(props.parsed?.purchasedAt ?? '')
const today = toIsoDay(new Date())

const submitted = ref(false)
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
const purchaseDateError = computed(() => validatePurchaseDate(purchasedAt.value))
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
    const result = await confirmReceiptItems(sent.map((row) => toPayload(row, purchasedAt.value)))
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
        <button type="button" class="btn btn-success" @click="emit('reset')">Scan another receipt</button>
      </div>

      <!-- Review -->
      <form v-else id="review-form" novalidate @submit.prevent="save">
        <h2 class="h5">Check your items</h2>
        <p class="text-body-secondary small mb-3">
          We read these from the receipt. Fix anything that is wrong, untick things you do not want to
          save, then press <strong>Save to inventory</strong>.
        </p>

        <div v-if="noItemsFound" class="alert alert-info" role="status" data-testid="no-items">
          We could not find any items on this receipt. You can add them yourself below.
        </div>
        <div v-if="parsed?.merchant" class="small text-body-secondary mb-2">
          Store: <strong>{{ parsed.merchant }}</strong>
        </div>
        <div v-if="totalWarning" class="alert alert-warning py-2 small" role="alert" data-testid="total-warning">
          {{ totalWarning }}
        </div>

        <div class="row g-3 mb-3">
          <div class="col-12 col-md-4">
            <label class="form-label fw-semibold" for="purchased-at">Purchase date</label>
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
            <div v-else-if="!purchasedAt" class="form-text">No date was found on the receipt (optional).</div>
          </div>
        </div>

        <div
          v-for="(row, index) in rows"
          :key="row.key"
          class="border rounded p-3 mb-3"
          :class="{ 'bg-body-tertiary': !row.include }"
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
                <label class="form-label small mb-1" :for="`name-${row.key}`">Name</label>
                <input
                  :id="`name-${row.key}`"
                  v-model="row.name"
                  type="text"
                  class="form-control"
                  :class="{ 'is-invalid': errorFor(row, 'name') }"
                  maxlength="100"
                  data-testid="name"
                  @blur="touch(row, 'name')"
                  @input="edited(row, 'name')"
                />
                <div class="invalid-feedback">{{ errorFor(row, 'name') }}</div>
              </div>
              <div class="col-4 col-md-2">
                <label class="form-label small mb-1" :for="`qty-${row.key}`">Quantity</label>
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
                <label class="form-label small mb-1" :for="`price-${row.key}`">Price</label>
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
                <label class="form-label small mb-1" :for="`storage-${row.key}`">Keep in</label>
                <select
                  :id="`storage-${row.key}`"
                  v-model="row.storage"
                  class="form-select"
                  :class="{ 'is-invalid': errorFor(row, 'storage') }"
                  data-testid="storage"
                  @change="edited(row, 'storage')"
                >
                  <option v-for="option in STORAGE_OPTIONS" :key="option" :value="option">{{ option }}</option>
                </select>
                <div class="invalid-feedback">{{ errorFor(row, 'storage') }}</div>
              </div>
              <div class="col-6 col-md-4">
                <label class="form-label small mb-1" :for="`expires-${row.key}`">Use by</label>
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
            </div>
          </fieldset>
        </div>

        <datalist id="unit-options">
          <option v-for="unit in UNIT_SUGGESTIONS" :key="unit" :value="unit" />
        </datalist>

        <button type="button" class="btn btn-outline-secondary btn-sm mb-3" data-testid="add-row" @click="addRow">
          + Add an item
        </button>

        <div v-if="tooMany" class="alert alert-danger py-2" role="alert">
          You can save at most {{ MAX_ITEMS }} items at a time. Untick or remove some.
        </div>
        <div v-if="saveError" class="alert alert-danger py-2" role="alert" data-testid="save-error">
          {{ saveError }}
        </div>

        <div class="d-flex flex-wrap gap-2 align-items-center">
          <button type="submit" class="btn btn-success" :disabled="!canSave" data-testid="save">
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
