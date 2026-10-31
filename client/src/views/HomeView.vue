<script setup>
import { usePageLoading } from '../utils/pageLoading.js'
import { ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import HomeFridge from '../components/HomeFridge.vue'
import { useAuthStore } from '../stores/auth.js'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)
usePageLoading(loading, 'Logging in')

const funFacts = [
  'Did you know a banana is a berry, but a strawberry isn’t? Isn’t that totally bananas?',
  'Roughly a third of all food produced in the world is lost or wasted. That’s like buying three bags of groceries and leaving one at the shop!',
  'If food waste were a country, it would be the third-largest greenhouse gas emitter, right behind China and the USA.',
  'Most food waste happens at home, not in restaurants or supermarkets. Your fridge is the front line!',
  '“Best before” is about quality, not safety. That yoghurt might still be perfectly fine a day later, so look and sniff before you toss.',
  'Honey basically never spoils. Archaeologists have found pots of it in ancient Egyptian tombs that were still edible!',
  'Limp celery or carrots? Soak them in ice-cold water for 30 minutes and they’ll crisp right back up.',
  'Spotty brown bananas aren’t trash. They’re banana bread waiting to happen, and they’re sweeter too.',
  'Stale bread makes the best croutons, breadcrumbs and French toast. Old bread, new tricks!',
]

function pickFact(current) {
  let next
  do {
    next = funFacts[Math.floor(Math.random() * funFacts.length)]
  } while (next === current)
  return next
}

const fact = ref(pickFact())

function showAnotherFact() {
  fact.value = pickFact(fact.value)
}

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
    const isInternal =
      typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//')
    router.push(isInternal ? redirect : { name: 'dashboard' })
  } catch (e) {
    error.value = e.message || 'Login failed'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="home-page" aria-label="Home">
    <div class="home-shell">
      <div class="home-hero">
        <div class="hero-copy">
          <div v-if="auth.isAuthenticated" class="login-card">
            <h1>Welcome back, {{ auth.user.username }}</h1>
            <p class="login-subtitle">You&rsquo;re already signed in.</p>
            <RouterLink :to="{ name: 'dashboard' }" class="home-button button-scan"
              >Go to my dashboard</RouterLink
            >
          </div>
          <form v-else class="login-card" aria-label="Login" @submit.prevent="handleLogin">
            <h1>Login</h1>
            <p class="login-subtitle">Sign in to your Full Circle account.</p>
            <p v-if="error" class="login-error" role="alert">{{ error }}</p>
            <div class="login-field">
              <label for="email">Email:</label>
              <input id="email" v-model="email" type="email" required autocomplete="email" />
            </div>
            <div class="login-field">
              <label for="password">Password:</label>
              <input
                id="password"
                v-model="password"
                type="password"
                required
                autocomplete="current-password"
              />
            </div>
            <button type="submit" class="home-button button-scan" :disabled="loading">
              {{ loading ? 'Logging in...' : 'Login' }}
            </button>
            <p class="login-register">
              Don&rsquo;t have an account?
              <RouterLink :to="{ name: 'register', query: route.query }">Register</RouterLink>
            </p>
          </form>
        </div>
        <div class="hero-illustration"><HomeFridge /></div>
      </div>

      <aside class="fun-fact" aria-live="polite">
        <span class="fun-fact-icon" aria-hidden="true">💡</span>
        <div>
          <p class="fun-fact-label">Fun food fact</p>
          <p class="fun-fact-text">{{ fact }}</p>
        </div>
        <button type="button" class="fun-fact-next" @click="showAnotherFact">Another fact</button>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.home-page {
  min-height: 100svh;
  padding: clamp(80px, 5vw, 96px) clamp(24px, 4.4vw, 80px) 24px;
  color: var(--ink);
  background: transparent;
  font-family: var(--font-sans);
}
:global(body:has(.home-page)) {
  padding-bottom: 0;
}
.home-shell {
  max-width: 1640px;
  margin: 0 auto;
}
.home-hero {
  display: grid;
  grid-template-columns: 1.06fr 1fr;
  align-items: center;
  gap: 4vw;
}
.hero-copy {
  position: relative;
  z-index: 1;
}
.login-card {
  display: flex;
  flex-direction: column;
  gap: 22px;
  max-width: 560px;
  padding: clamp(28px, 3vw, 44px);
  border: 3px solid var(--ink);
  border-radius: 26px;
  background: #fff;
  box-shadow: 6px 8px 0 var(--ink);
}
.home-page svg {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex-shrink: 0;
}
h1 {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: clamp(2.4rem, 3.6vw, 3.6rem);
  line-height: 1;
  letter-spacing: -0.03em;
}
.login-subtitle {
  margin: -8px 0 0;
  font-size: 1.15rem;
  color: #366e6a;
}
.login-field label {
  display: block;
  margin-bottom: 8px;
  font-size: 1.1rem;
  font-weight: 700;
}
.login-field input {
  width: 100%;
  padding: 14px 16px;
  border: 3px solid var(--ink);
  border-radius: 12px;
  background: #f6fdfc;
  font: inherit;
  font-size: 1.1rem;
  color: var(--ink);
}
.login-field input:focus-visible {
  outline: 3px solid #1f7d74;
  outline-offset: 3px;
}
.login-error {
  margin: 0;
  padding: 12px 16px;
  border: 2px solid var(--ink);
  border-radius: 12px;
  background: #ffd2ca;
  font-weight: 600;
}
.login-register {
  margin: 0;
  font-size: 1.05rem;
  color: #366e6a;
}
.login-register a {
  color: var(--ink);
  font-weight: 700;
}
.home-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 68px;
  padding: 15px 27px;
  border: 3px solid var(--ink);
  border-radius: 16px;
  box-shadow: 4px 5px 0 var(--ink);
  text-decoration: none;
  font: inherit;
  font-size: 1.25rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    transform 160ms ease,
    box-shadow 160ms ease;
}
.home-button svg {
  width: 24px;
  height: 24px;
}
.button-scan {
  background: #0fa89c;
  color: #fff;
}
.button-donate {
  background: #ffe16a;
  color: var(--ink);
}
.button-scan:hover {
  color: #fff;
  background: #0b968b;
}
.button-donate:hover {
  color: var(--ink);
  background: #ffdb4f;
}
.home-button:hover {
  transform: translate(2px, 2px);
  box-shadow: 2px 3px 0 var(--ink);
}
.home-button:disabled {
  opacity: 0.6;
  cursor: wait;
}
.home-button:active {
  transform: translate(4px, 5px);
  box-shadow: none;
}
.fun-fact {
  display: flex;
  align-items: center;
  gap: 22px;
  margin-top: clamp(56px, 5vw, 88px);
  padding: 24px 28px;
  border: 3px solid var(--ink);
  border-radius: 26px;
  background: #e7f5ac;
  box-shadow: 6px 8px 0 var(--ink);
  transform: rotate(-0.5deg);
}
.fun-fact-icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 56px;
  height: 56px;
  border: 2px solid var(--ink);
  border-radius: 50%;
  background: #fff;
  font-size: 1.8rem;
}
.fun-fact-label {
  margin: 0 0 6px;
  font-size: 0.95rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.fun-fact-text {
  margin: 0;
  font-size: clamp(1.1rem, 1.3vw, 1.35rem);
  line-height: 1.5;
}
.fun-fact-next {
  flex-shrink: 0;
  margin-left: auto;
  padding: 10px 18px;
  border: 2px solid var(--ink);
  border-radius: 12px;
  background: #fff;
  box-shadow: 2px 3px 0 var(--ink);
  color: var(--ink);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  transition:
    transform 160ms ease,
    box-shadow 160ms ease;
}
.fun-fact-next:hover {
  transform: translate(1px, 1px);
  box-shadow: 1px 2px 0 var(--ink);
}
.home-button:focus-visible,
.fun-fact-next:focus-visible {
  outline: 3px solid #1f7d74;
  outline-offset: 7px;
}
@media (max-width: 1100px) {
  .home-hero {
    gap: 24px;
  }
  .home-button {
    padding: 13px 18px;
    font-size: 1.1rem;
    min-height: 60px;
  }
}
@media (max-width: 850px) {
  .home-hero {
    grid-template-columns: 1fr;
  }
  .login-card {
    max-width: none;
  }
  .hero-illustration {
    max-width: 560px;
    width: 100%;
    margin: 10px auto 0;
  }
  .fun-fact {
    flex-wrap: wrap;
    margin-top: 38px;
  }
}
@media (max-width: 480px) {
  .home-page {
    padding: 86px 22px 24px 18px;
  }
  .login-card {
    padding: 24px 20px;
  }
  .fun-fact {
    padding: 20px;
    gap: 16px;
  }
  .fun-fact-next {
    width: 100%;
  }
}
@media (prefers-reduced-motion: reduce) {
  .home-button,
  .fun-fact-next {
    transition: none;
  }
}
</style>
