<script setup>
import { computed, watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import EggLoader from './components/EggLoader.vue'
import { eggDialogue } from './data/eggDialogue.js'
import EggCompanion from './components/analytics/VegetableCompanions.vue'
import { pageIsLoading, pageLoadingLabel } from './utils/pageLoading.js'
import AppDialog from './components/AppDialog.vue'
import AppNavbar from './components/AppNavbar.vue'
import LoginPrompt from './components/LoginPrompt.vue'
import { useAuthStore } from './stores/auth.js'
import { dismissDialog } from './utils/dialog.js'

const auth = useAuthStore()
const route = useRoute()
const needsLogin = computed(() => !route.meta.public && auth.checked && !auth.isAuthenticated)
const pagesWithCompanion = new Set(['dashboard', 'analytics', 'scanning'])
const showCompanion = computed(() => Boolean(route.name) && route.name !== 'home' &&
  (needsLogin.value || !pagesWithCompanion.has(route.name)))
const companionMessages = computed(() => needsLogin.value ? eggDialogue.login : eggDialogue[route.name])

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
    <EggCompanion v-if="showCompanion" :key="route.name" always-happy :messages="companionMessages" />
  </main>
  <AppDialog />
  <EggLoader :visible="pageIsLoading" :label="pageLoadingLabel" />
</template>
