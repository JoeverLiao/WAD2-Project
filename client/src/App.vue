<script setup>
import { computed, watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import AppDialog from './components/AppDialog.vue'
import AppNavbar from './components/AppNavbar.vue'
import LoginPrompt from './components/LoginPrompt.vue'
import { useAuthStore } from './stores/auth.js'
import { dismissDialog } from './utils/dialog.js'

const auth = useAuthStore()
const route = useRoute()
const needsLogin = computed(() => !route.meta.public && auth.checked && !auth.isAuthenticated)

// A dialog left open across navigation (e.g. browser Back) must not act on the page behind it.
watch(() => route.fullPath, dismissDialog)
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
  <AppDialog />
</template>
