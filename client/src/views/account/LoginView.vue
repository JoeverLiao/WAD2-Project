<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth.js'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function handleLogin() {
  error.value = ''
  if (!email.value.trim() || !password.value) {
    error.value = 'Email and password are required'
    return
  }
  loading.value = true
  try {
    await auth.login(email.value.trim(), password.value)
    // Return to the page the user originally asked for, if it was an in-app path.
    const redirect = route.query.redirect
    const isInternal = typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//')
    router.push(isInternal ? redirect : { name: 'dashboard' })
  } catch (e) {
    error.value = e.message || 'Login failed'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section aria-label="Login">
    <h1>Login</h1>
    <form @submit.prevent="handleLogin">
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <div>
        <label for="email">Email</label>
        <input id="email" v-model="email" type="email" required autocomplete="email" />
      </div>
      <div>
        <label for="password">Password</label>
        <input
          id="password"
          v-model="password"
          type="password"
          required
          autocomplete="current-password"
        />
      </div>
      <button type="submit" :disabled="loading">{{ loading ? 'Logging in...' : 'Login' }}</button>
    </form>
    <p>Don&rsquo;t have an account? <RouterLink :to="{ name: 'register' }">Register</RouterLink></p>
  </section>
</template>

<style scoped>
section {
  max-width: 400px;
  margin: 2rem auto;
}
form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
label {
  display: block;
  font-weight: 600;
  margin-bottom: 0.25rem;
}
input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
}
button {
  padding: 0.5rem 1.5rem;
  background: #164b35;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
button:disabled {
  opacity: 0.6;
}
.error {
  color: #c00;
  font-weight: 500;
}
</style>
