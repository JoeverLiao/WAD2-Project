<script setup>
import { ref } from 'vue'
import ReceiptReviewForm from '../../components/ReceiptReviewForm.vue'
import ReceiptUpload from '../../components/ReceiptUpload.vue'

// 'scan' = upload a receipt photo; 'manual' = type the items in (for people without a receipt).
const mode = ref('scan')

// OCR result: { rawText, lines, confidence, lowConfidence, parsed }.
// `parsed` holds the items, quantities and date found in the text; the review form lets the
// user correct them and saves them to the inventory.
const ocrResult = ref(null)
// Changing the key throws away both components and starts a fresh scan.
const scanKey = ref(0)
// A new scan result must start a fresh form, or the previous receipt's rows would stay on screen.
const resultCount = ref(0)

function onOcrComplete(result) {
  ocrResult.value = result
  resultCount.value += 1
}

function startOver() {
  ocrResult.value = null
  scanKey.value += 1
}

function switchMode(next) {
  if (mode.value === next) return
  mode.value = next
  startOver()
}
</script>

<template>
  <section class="container py-4" aria-label="Receipt &amp; Product Scanning">
    <h1 class="h3 mb-3">Add to your inventory</h1>

    <ul class="nav nav-pills mb-4" role="tablist" aria-label="How do you want to add items?">
      <li class="nav-item" role="presentation">
        <button
          type="button"
          class="nav-link"
          :class="{ active: mode === 'scan' }"
          role="tab"
          :aria-selected="mode === 'scan'"
          data-testid="mode-scan"
          @click="switchMode('scan')"
        >
          Scan a receipt
        </button>
      </li>
      <li class="nav-item" role="presentation">
        <button
          type="button"
          class="nav-link"
          :class="{ active: mode === 'manual' }"
          role="tab"
          :aria-selected="mode === 'manual'"
          data-testid="mode-manual"
          @click="switchMode('manual')"
        >
          Add items manually
        </button>
      </li>
    </ul>

    <template v-if="mode === 'scan'">
      <ReceiptUpload :key="`upload-${scanKey}`" @ocr-complete="onOcrComplete" />
      <ReceiptReviewForm
        v-if="ocrResult"
        :key="`review-${scanKey}-${resultCount}`"
        :parsed="ocrResult.parsed"
        @reset="startOver"
      />
    </template>
    <ReceiptReviewForm v-else :key="`manual-${scanKey}`" manual @reset="startOver" />
  </section>
</template>
