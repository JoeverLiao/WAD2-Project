<script setup>
import { ref } from 'vue'
import ReceiptUpload from '../../components/ReceiptUpload.vue'

// Raw OCR result: { rawText, lines, confidence }.
// TODO (Tarunikaa): parse this into items, then show the correction form and save to inventory.
const ocrResult = ref(null)

function onOcrComplete(result) {
  ocrResult.value = result
}
</script>

<template>
  <section class="container py-4" aria-label="Receipt &amp; Product Scanning">
    <h1 class="h3 mb-4">Receipt &amp; Product Scanning</h1>
    <ReceiptUpload @ocr-complete="onOcrComplete" />
  </section>
</template>
