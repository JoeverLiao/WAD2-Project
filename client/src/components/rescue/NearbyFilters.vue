<script setup>
import { computed } from 'vue'
import { CATEGORY_OPTIONS } from '@/services/rescueCategories.js'

// This section displays parent-owned state and emits user actions.
const props = defineProps({
  category: { type: String, required: true },
  distance: { type: String, required: true },
  pickupDay: { type: String, required: true },
  search: { type: String, required: true },
  searchMode: { type: String, required: true },
})

const emit = defineEmits(['update:search', 'update:category', 'update:distance', 'update:pickupDay'])

const search = computed({
  get() {
    return props.search
  },
  set(value) {
    emit('update:search', value)
  },
})

const category = computed({
  get() {
    return props.category
  },
  set(value) {
    emit('update:category', value)
  },
})

const distance = computed({
  get() {
    return props.distance
  },
  set(value) {
    emit('update:distance', value)
  },
})

const pickupDay = computed({
  get() {
    return props.pickupDay
  },
  set(value) {
    emit('update:pickupDay', value)
  },
})
</script>

<template>
  <div class="explore-filters d-flex align-items-center flex-wrap">
    <label class="search-field">
      <span class="visually-hidden">
        Search food names
      </span>

      <input class="form-control"
        v-model="search"
        type="search"
        maxlength="80"
        placeholder="What are you hungry for?"
      />
    </label>

    <label>
      <span class="visually-hidden">
        Food category
      </span>

      <select class="form-select" v-model="category">
        <option value="all">
          All categories
        </option>

        <option
          v-for="option in CATEGORY_OPTIONS"
          :key="option.value"
          :value="option.value"
        >
          {{ option.label }}
        </option>
      </select>
    </label>

    <label>
      <span class="visually-hidden">
        Maximum distance from the search centre
      </span>

      <select class="form-select"
        v-model="distance"
        :disabled="searchMode === 'viewport'"
      >
        <option value="0.5">Within 500 m</option>
        <option value="1">Within 1 km</option>
        <option value="2">Within 2 km</option>
        <option value="5">Within 5 km</option>
        <option value="10">Within 10 km</option>
        <option value="25">Within 25 km</option>
      </select>
    </label>

    <label>
      <span class="visually-hidden">
        Pickup day
      </span>

      <select class="form-select" v-model="pickupDay">
        <option value="any">Any time</option>
        <option value="today">Today</option>
        <option value="tomorrow">Tomorrow</option>
      </select>
    </label>
  </div>
</template>
