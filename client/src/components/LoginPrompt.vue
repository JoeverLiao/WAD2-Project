<script setup>
import { RouterLink, useRoute } from 'vue-router'
import NavIcon from './NavIcon.vue'

defineProps({ feature: { type: String, default: 'this page' } })

const route = useRoute()
</script>

<template>
  <section class="login-prompt fc-page-heading" aria-label="Login required">
    <span class="prompt-icon"><NavIcon name="login" /></span>
    <h1>Please login to access your {{ feature }}</h1>
    <p>Sign in to your Full Circle account to continue.</p>
    <div class="prompt-actions">
      <RouterLink :to="{ name: 'login', query: { redirect: route.fullPath } }" class="btn-primary"
        >Login</RouterLink
      >
      <RouterLink :to="{ name: 'register', query: { redirect: route.fullPath } }" class="btn-ghost"
        >Register</RouterLink
      >
    </div>
  </section>
</template>

<style scoped>
.login-prompt {
  max-width: 440px;
  margin: 2rem auto;
  padding: 2rem 1.75rem;
  border: 2px solid var(--ink);
  border-radius: 20px;
  background: var(--paper-bright);
  box-shadow: var(--shadow-paper);
  text-align: center;
}
.prompt-icon {
  display: inline-flex;
  padding: 12px;
  border-radius: 50%;
  background: var(--aqua-soft);
  color: #164b35;
}
.prompt-icon :deep(.nav-icon) {
  width: 28px;
  height: 28px;
}
h1 {
  margin: 1rem 0 0.5rem;
  font-family: var(--font-display);
  font-size: 1.6rem;
  font-weight: 700;
}
p {
  color: var(--muted);
}
.prompt-actions {
  display: flex;
  justify-content: center;
  gap: 0.75rem;
  margin-top: 1.25rem;
}
.prompt-actions a {
  padding: 0.5rem 1.5rem;
  border: 2px solid #164b35;
  border-radius: 4px;
  text-decoration: none;
}
.btn-primary {
  background: #164b35;
  color: #fff;
}
.btn-ghost {
  color: #164b35;
}
@media (max-width: 600px) {
  .login-prompt {
    margin: 1rem 16px;
  }
}
</style>
