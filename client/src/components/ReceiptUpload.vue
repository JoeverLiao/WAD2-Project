<script setup>
import { ref, computed, onBeforeUnmount } from 'vue'
import { uploadReceipt } from '../services/scanningApi.js'

// Emitted when OCR succeeds with { rawText, lines, confidence }.
const emit = defineEmits(['ocr-complete'])

const MAX_SIZE_MB = 8
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

const fileInput = ref(null)
const selectedFile = ref(null)
const previewUrl = ref('')
const isDragging = ref(false)
const isProcessing = ref(false)
const errorMessage = ref('')
const ocrResult = ref(null)

const fileLabel = computed(() =>
  selectedFile.value
    ? `${selectedFile.value.name} (${(selectedFile.value.size / 1024 / 1024).toFixed(2)} MB)`
    : '',
)

function clearPreview() {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = ''
}

function validate(file) {
  if (!ALLOWED_TYPES.includes(file.type)) return 'Please upload a JPG, PNG or WEBP image.'
  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    return `Image is too large. Maximum size is ${MAX_SIZE_MB} MB.`
  }
  return ''
}

function setFile(file) {
  errorMessage.value = ''
  ocrResult.value = null
  if (!file) return

  const problem = validate(file)
  if (problem) {
    errorMessage.value = problem
    return
  }
  clearPreview()
  selectedFile.value = file
  previewUrl.value = URL.createObjectURL(file)
}

function onFileChange(event) {
  setFile(event.target.files[0])
}

function onDrop(event) {
  isDragging.value = false
  setFile(event.dataTransfer.files[0])
}

function openPicker() {
  fileInput.value?.click()
}

function reset() {
  clearPreview()
  selectedFile.value = null
  ocrResult.value = null
  errorMessage.value = ''
  if (fileInput.value) fileInput.value.value = ''
}

async function scanReceipt() {
  if (!selectedFile.value || isProcessing.value) return

  isProcessing.value = true
  errorMessage.value = ''
  try {
    const result = await uploadReceipt(selectedFile.value)
    ocrResult.value = result
    emit('ocr-complete', result)
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    isProcessing.value = false
  }
}

onBeforeUnmount(clearPreview)
</script>

<template>
  <div class="card fc-card">
    <div class="card-body">
      <h2 class="h5 card-title mb-3">Scan a receipt</h2>

      <div
        class="drop-zone text-center p-4 rounded"
        :class="{ dragging: isDragging }"
        role="button"
        tabindex="0"
        @click="openPicker"
        @keydown.enter.prevent="openPicker"
        @dragover.prevent="isDragging = true"
        @dragleave.prevent="isDragging = false"
        @drop.prevent="onDrop"
      >
        <input
          ref="fileInput"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          class="d-none"
          data-testid="receipt-file-input"
          @click.stop
          @change="onFileChange"
        />

        <template v-if="previewUrl">
          <img :src="previewUrl" alt="Receipt preview" class="preview img-fluid rounded mb-2" />
          <p class="small text-muted mb-0">{{ fileLabel }}</p>
        </template>
        <template v-else>
          <svg class="drop-icon" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
            <path d="M14 6h36v52l-6-4-6 4-6-4-6 4-6-4-6 4z" fill="#fff" stroke="#14423c" stroke-width="3" stroke-linejoin="round" />
            <rect x="20" y="14" width="24" height="5" rx="2.5" fill="#7fcfb4" />
            <path d="M20 27h24M20 34h24M20 41h14" stroke="#14423c" stroke-width="3" stroke-linecap="round" />
            <circle cx="46" cy="44" r="9" fill="#d9f2e3" stroke="#14423c" stroke-width="3" />
            <path d="M46 49v-9m-4 4 4-4 4 4" fill="none" stroke="#14423c" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <p class="mb-1 fw-semibold">Drag &amp; drop your receipt here</p>
          <p class="small mb-2">or click to choose a photo</p>
          <span class="drop-pill">JPG, PNG, WEBP · max {{ MAX_SIZE_MB }} MB</span>
        </template>
      </div>

      <div v-if="errorMessage" class="alert alert-danger mt-3 mb-0" role="alert">
        {{ errorMessage }}
      </div>

      <div class="d-flex gap-2 mt-3">
        <button
          class="btn fc-btn"
          :disabled="!selectedFile || isProcessing"
          @click="scanReceipt"
        >
          <span
            v-if="isProcessing"
            class="spinner-border spinner-border-sm me-2"
            aria-hidden="true"
          ></span>
          {{ isProcessing ? 'Reading receipt…' : 'Scan receipt' }}
        </button>
        <button
          class="btn fc-btn-outline"
          :disabled="!selectedFile || isProcessing"
          @click="reset"
        >
          Clear
        </button>
      </div>

      <!-- Raw OCR output: handy while building the parser; hide it once parsing is wired up. -->
      <div v-if="ocrResult" class="mt-4">
        <label class="form-label fw-semibold" for="ocr-text">
          Extracted text
          <span class="badge bg-secondary ms-1">confidence {{ ocrResult.confidence }}%</span>
        </label>
        <div v-if="ocrResult.lowConfidence" class="alert alert-warning py-2 small" role="alert">
          This receipt was hard to read, so some words or prices may be wrong. Check the text
          below, or retake the photo in good light, close enough that the receipt fills most of the frame and lies flat.
        </div>
        <textarea
          id="ocr-text"
          class="form-control font-monospace"
          rows="12"
          readonly
          :value="ocrResult.rawText"
        ></textarea>
      </div>
    </div>
  </div>
</template>

<style scoped>
.drop-zone {
  border: 2px dashed #14423c;
  background: #fff;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    background-color 0.15s,
    border-color 0.15s;
}
/* lifts slightly on hover and on keyboard focus */
.drop-zone:hover,
.drop-zone:focus-visible {
  transform: translateY(-3px);
  box-shadow: 0 6px 0 rgb(20 66 60 / 18%);
  border-color: #167d68;
}
/* tinted pastel green while a file is dragged over it */
.drop-zone.dragging {
  transform: translateY(-3px);
  background-color: #d9f2e3;
  border-color: #167d68;
  box-shadow: 0 6px 0 rgb(20 66 60 / 25%);
}
.drop-icon {
  width: 72px;
  height: 72px;
  margin-bottom: 0.5rem;
}
.drop-pill {
  display: inline-block;
  padding: 0.2rem 0.75rem;
  border: 1.5px solid #14423c;
  border-radius: 999px;
  background: #e8f4ed;
  color: #14423c;
  font-size: 0.8rem;
  font-weight: 700;
}
.preview {
  max-height: 300px;
}
@media (prefers-reduced-motion: reduce) {
  .drop-zone,
  .drop-zone:hover,
  .drop-zone:focus-visible,
  .drop-zone.dragging {
    transform: none;
    transition: none;
  }
}
</style>
