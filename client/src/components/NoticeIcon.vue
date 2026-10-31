<script setup>
// Line icons from the FreshKeep Figma file, used for alerts and notices.
defineProps({ name: { type: String, required: true } })

const icons = {
  bell: 'M5 17h14l-2-4V8a5 5 0 0 0-10 0v5l-2 4ZM10 21h4',
  clock: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  sparkle:
    'm12 3 1.3 3.2L16.5 8l-3.2 1.4L12 13l-1.3-3.6L7.5 8l3.2-1.8L12 3Zm-7 11 .8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14Z',
}
</script>

<template>
  <svg
    class="notice-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="icons[name]" />
  </svg>
</template>

<style scoped>
.notice-icon {
  display: inline-block;
  flex: none;
  width: 1.2em;
  height: 1.2em;
  vertical-align: -0.22em;
}
</style>
