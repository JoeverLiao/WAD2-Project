<script setup>
import { ref } from 'vue'
import ReceiptReviewForm from '../../components/ReceiptReviewForm.vue'
import ReceiptUpload from '../../components/ReceiptUpload.vue'
import '../../styles/scanning-theme.css'

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
  <section class="container py-4 fc-scope" aria-label="Receipt &amp; Product Scanning">
    <header class="fc-hero">
      <!-- decorative leaf -->
      <svg class="fc-hero-leaf" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
        <path d="M14 106C10 52 46 14 108 12c2 60-30 96-86 98" fill="#b9e0a5" stroke="#4f8a64" stroke-width="4" stroke-linejoin="round" />
        <path d="M14 106C42 78 66 54 96 28M52 72l-2-24M70 56l16 2M38 88l-18-4" fill="none" stroke="#4f8a64" stroke-width="4" stroke-linecap="round" />
      </svg>
      <p class="fc-eyebrow">Full Circle · Add to inventory</p>
      <h1 class="fc-hero-title">Scan it, sort it, stash it.</h1>
      <p class="fc-hero-sub">Snap your receipt or type items in, and we'll sort out where each one belongs.</p>

      <ul class="fc-tabs" role="tablist" aria-label="How do you want to add items?">
        <li role="presentation">
          <button
            type="button"
            class="fc-tab"
            role="tab"
            :aria-selected="mode === 'scan'"
            data-testid="mode-scan"
            @click="switchMode('scan')"
          >
            Scan a receipt
          </button>
        </li>
        <li role="presentation">
          <button
            type="button"
            class="fc-tab"
            role="tab"
            :aria-selected="mode === 'manual'"
            data-testid="mode-manual"
            @click="switchMode('manual')"
          >
            Add items manually
          </button>
        </li>
      </ul>
    </header>

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
