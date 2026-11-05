<script setup>
import { computed } from "vue";
import { CATEGORY_OPTIONS } from "@/services/rescueCategories.js";
import { toLocalInput } from "@/services/rescueForm.js";

// This section displays parent-owned state and emits user actions.
const props = defineProps({
  editing: { type: Boolean, required: true },
  form: { type: Object, required: true },
  linked: { type: Boolean, required: true },
  linkedExpiry: { type: String, required: true },
  maxShareQuantity: { type: Number, required: true },
  minDatetime: { type: String, required: true },
});

const emit = defineEmits(["update-field"]);

const fieldTitle = computed({
  get() {
    return props.form.title;
  },
  set(value) {
    emit("update-field", "title", value);
  },
});

const fieldCategory = computed({
  get() {
    return props.form.category;
  },
  set(value) {
    emit("update-field", "category", value);
  },
});

const fieldQuantity = computed({
  get() {
    return props.form.quantity;
  },
  set(value) {
    emit("update-field", "quantity", value);
  },
});

const fieldUnit = computed({
  get() {
    return props.form.unit;
  },
  set(value) {
    emit("update-field", "unit", value);
  },
});

const fieldExpiresAt = computed({
  get() {
    return props.form.expiresAt;
  },
  set(value) {
    emit("update-field", "expiresAt", value);
  },
});

const fieldDescription = computed({
  get() {
    return props.form.description;
  },
  set(value) {
    emit("update-field", "description", value);
  },
});
</script>

<template>
  <section
    class="editor-section rounded-4 p-3 p-md-4"
    aria-labelledby="food-details-heading"
  >
    <h3 id="food-details-heading" class="mb-3">1. What are you sharing?</h3>

    <div class="row g-3">
      <!-- Name and category -->
      <div class="col-12 col-md-8">
        <label class="form-label" for="listing-title">Food name *</label>

        <input
          id="listing-title"
          v-model="fieldTitle"
          class="form-control"
          maxlength="120"
          required
          placeholder="e.g. Apples"
        />
      </div>

      <div class="col-12 col-md-4">
        <label class="form-label" for="listing-category">Category</label>

        <select
          id="listing-category"
          v-model="fieldCategory"
          class="form-select"
        >
          <option
            v-for="option in CATEGORY_OPTIONS"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </div>

      <!-- Quantity, unit and expiry -->
      <div class="col-6 col-md-3">
        <label class="form-label" for="listing-quantity">Quantity *</label>

        <input
          id="listing-quantity"
          v-model.number="fieldQuantity"
          class="form-control"
          type="number"
          min="1"
          :max="linked && !editing ? maxShareQuantity : 1000000"
          step="1"
          :readonly="linked && editing"
          required
        />
      </div>

      <div class="col-6 col-md-3">
        <label class="form-label" for="listing-unit">Unit *</label>

        <input
          id="listing-unit"
          v-model="fieldUnit"
          class="form-control"
          maxlength="40"
          list="listing-unit-options"
          :readonly="linked"
          required
          placeholder="pieces"
        />

        <datalist id="listing-unit-options">
          <option value="pieces" />
          <option value="cartons" />
          <option value="containers" />
          <option value="bags" />
          <option value="kg" />
          <option value="g" />
          <option value="litres" />
        </datalist>
      </div>

      <div class="col-12 col-md-6">
        <label class="form-label" for="listing-expiry">Use-by date *</label>

        <input
          id="listing-expiry"
          v-model="fieldExpiresAt"
          class="form-control"
          type="date"
          :min="minDatetime.slice(0, 10)"
          :max="
            linkedExpiry ? toLocalInput(linkedExpiry).slice(0, 10) : undefined
          "
          required
        />

        <p class="small text-muted mb-0 mt-2">
          All dates and pickup times use Singapore time (SGT).
        </p>
      </div>

      <!-- Description -->
      <div class="col-12">
        <label class="form-label" for="listing-description"
          >Short description</label
        >

        <textarea
          id="listing-description"
          v-model="fieldDescription"
          class="form-control"
          rows="2"
          maxlength="1000"
          placeholder="Condition, packaging, allergens or anything useful to know…"
        ></textarea>
      </div>
    </div>
  </section>
</template>
