<script setup>
import { onMounted, ref } from 'vue'
import ReceiptReviewForm from '../../components/ReceiptReviewForm.vue'
import ReceiptUpload from '../../components/ReceiptUpload.vue'
import '../../styles/scanning-theme.css'

// 'scan' = upload a receipt photo; 'manual' = type the items in (for people without a receipt).
const mode = ref('scan')
const inventoryItems = ref([])
onMounted(async () => {
  try {
    const response = await fetch('/api/inventory', { credentials: 'include' })
    if (!response.ok) return
    const data = await response.json()
    inventoryItems.value = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : []
  } catch {
    // Locally saved storage names and the first fridge remain available offline.
  }
})

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
    <h1 class="h3 mb-3">Add to your inventory</h1>

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

    <template v-if="mode === 'scan'">
      <ReceiptUpload :key="`upload-${scanKey}`" @ocr-complete="onOcrComplete" />
      <ReceiptReviewForm
        v-if="ocrResult"
        :key="`review-${scanKey}-${resultCount}`"
        :parsed="ocrResult.parsed"
        :inventory-items="inventoryItems"
        @reset="startOver"
      />
    </template>
    <ReceiptReviewForm v-else :key="`manual-${scanKey}`" manual :inventory-items="inventoryItems" @reset="startOver" />
  </section>
</template>
