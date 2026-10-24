<script setup>
import { ref } from 'vue'
import ReceiptReviewForm from '../../components/ReceiptReviewForm.vue'
import ReceiptUpload from '../../components/ReceiptUpload.vue'

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
</script>

<template>
  <section class="container py-4" aria-label="Receipt &amp; Product Scanning">
    <h1 class="h3 mb-4">Receipt &amp; Product Scanning</h1>
    <ReceiptUpload :key="`upload-${scanKey}`" @ocr-complete="onOcrComplete" />
    <ReceiptReviewForm
      v-if="ocrResult"
      :key="`review-${scanKey}-${resultCount}`"
      :parsed="ocrResult.parsed"
      @reset="startOver"
    />
  </section>
</template>
