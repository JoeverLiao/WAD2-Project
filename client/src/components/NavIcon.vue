<script setup>
defineProps({ name: { type: String, required: true } })

const icons = {
  home: 'M3 10 12 3l9 7 M5 9v12h5v-7h4v7h5V9',
  dashboard: 'M3 3h7v7H3Z M14 3h7v7h-7Z M3 14h7v7H3Z M14 14h7v7h-7Z',
  scanning: 'M8 3H3v5 M16 3h5v5 M3 16v5h5 M21 16v5h-5 M7 7v10 M10 7v10 M14 7v10 M17 7v10 M2 12h20',
  fridge:
    'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z M5 10h14 M8 6v1 M8 13v3',
  'freshness-recipes': 'M20 3C9 2 3 7 5 14c2 7 14 5 15-11Z M4 21 15 10 M8 17v-5 M12 13h5',
  'food-rescue': 'M12 21 3.8 12.8C-2 7 6 0 12 7c6-7 14 0 8.2 5.8Z M12 10v7 M8.5 13.5h7',
  analytics: 'M3 3v18h18 M7 16v-4 M12 16V8 M17 16V5',
  profile: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-2a8 6 0 0 1 16 0v2',
  login: 'M14 3h6v18h-6 M3 12h12 M10 7l5 5-5 5',
  logout: 'M10 3H4v18h6 M9 12h12 M16 7l5 5-5 5',
  register: 'M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M2 21v-2a7 6 0 0 1 12-4 M19 13v8 M15 17h8',
}
</script>

<template>
  <svg
    class="nav-icon"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path :d="icons[name] || icons.dashboard" />
  </svg>
</template>

<style scoped>
.nav-icon {
  flex-shrink: 0;
}
</style>
