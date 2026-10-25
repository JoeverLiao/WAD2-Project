<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth.js'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const username = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const error = ref('')
const loading = ref(false)

async function handleRegister() {
  error.value = ''
  if (!username.value.trim() || !email.value.trim() || !password.value) {
    error.value = 'All fields are required'
    return
  }
  if (password.value.length < 8) {
    error.value = 'Password must be at least 8 characters'
    return
  }
  if (password.value !== confirmPassword.value) {
    error.value = 'Passwords do not match'
    return
  }
  loading.value = true
  try {
    await auth.register(username.value.trim(), email.value.trim(), password.value)
    // Return to the page the user originally asked for, if it was an in-app path.
    const redirect = route.query.redirect
    const isInternal = typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//')
    router.push(isInternal ? redirect : { name: 'dashboard' })
  } catch (e) {
    error.value = e.message || 'Registration failed'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section aria-label="Register">
    <h1>Register</h1>
    <form @submit.prevent="handleRegister">
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <div>
        <label for="username">Username</label>
        <input id="username" v-model="username" type="text" required autocomplete="username" />
      </div>
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
          autocomplete="new-password"
          minlength="8"
        />
      </div>
      <div>
        <label for="confirm-password">Confirm Password</label>
        <input
          id="confirm-password"
          v-model="confirmPassword"
          type="password"
          required
          autocomplete="new-password"
        />
      </div>
      <button type="submit" :disabled="loading">
        {{ loading ? 'Creating account...' : 'Register' }}
      </button>
    </form>
    <p>Already have an account? <RouterLink :to="{ name: 'login' }">Login</RouterLink></p>
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
