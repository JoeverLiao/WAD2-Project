<script setup>
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import AppNavbar from './components/AppNavbar.vue'
import LoginPrompt from './components/LoginPrompt.vue'
import { useAuthStore } from './stores/auth.js'

const auth = useAuthStore()
const route = useRoute()
const needsLogin = computed(() => !route.meta.public && auth.checked && !auth.isAuthenticated)
</script>

<template>
  <AppNavbar />
  <main class="site-content">
    <LoginPrompt
      v-if="needsLogin"
      :feature="route.meta.promptLabel || route.meta.navLabel || 'this page'"
    />
    <RouterView v-else />
  </main>
</template>
