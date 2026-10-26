<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import NavIcon from './NavIcon.vue'
import { useAuthStore } from '../stores/auth.js'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const routes = router.getRoutes()
const segmentColors = {
  home: '#d9f1de',
  dashboard: '#cce7fa',
  scanning: '#ffe3a5',
  fridge: '#c9f1eb',
  'freshness-recipes': '#e6efa9',
  'food-rescue': '#ffd1c8',
  analytics: '#dfd2f4',
  profile: '#f3d2e6',
}
const entries = [
  ...routes
    .filter((item) => item.meta.navLabel && !item.meta.navGroup)
    .map((item) => ({
      key: String(item.name),
      label: item.meta.navLabel,
      name: item.name,
    })),
  ...[...new Set(routes.map((item) => item.meta.navGroup).filter(Boolean))].map((label) => ({
    key: label.toLowerCase(),
    label,
    children: routes.filter((item) => item.meta.navGroup === label),
  })),
]
const navbar = ref(null)
const toggle = ref(null)
const opened = ref(false)
const accountOpen = ref(false)
const hovered = ref(false)
const tooltip = ref(null)
const glows = ref([])
const loggingOut = ref(false)
const logoutError = ref('')
let glowId = 0
let autoCloseTimer
let hoverCloseTimer
let clickAnimation

function animateIcon(key) {
  clickAnimation?.cancel()
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  const option = [...navbar.value.querySelectorAll('[data-nav-key]')].find(
    (item) => item.dataset.navKey === key,
  )
  const icon = option?.querySelector('.nav-icon')
  if (!icon?.animate) return
  clickAnimation = icon.animate(
    [
      { transform: 'scale(1) rotate(0deg)' },
      { transform: 'scale(.8) rotate(-10deg)', offset: 0.2 },
      { transform: 'scale(1.2) rotate(8deg)', offset: 0.55 },
      { transform: 'scale(1) rotate(0deg)' },
    ],
    { duration: 480, easing: 'cubic-bezier(.22, 1, .36, 1)' },
  )
}

function cancelHoverClose() {
  clearTimeout(hoverCloseTimer)
  hoverCloseTimer = undefined
}
function openMenu() {
  cancelHoverClose()
  if (opened.value) return
  opened.value = true
}
function openOnHover(event) {
  if (event.pointerType === 'mouse') openMenu()
}
function trackHover(event) {
  if (event.pointerType !== 'mouse' || !opened.value) return
  const rect = navbar.value.querySelector('.radial-panel').getBoundingClientRect()
  const x = (event.clientX - rect.left - rect.width / 2) / (rect.width / 2)
  const y = (event.clientY - rect.top - rect.height / 2) / (rect.height / 2)
  const insideDonut = x * x + y * y <= 1
  const button = toggle.value.getBoundingClientRect()
  const insideToggleBridge =
    event.clientX >= button.left - 16 &&
    event.clientX <= button.right + 16 &&
    event.clientY >= button.top &&
    event.clientY <= rect.top + 32
  if (insideDonut || insideToggleBridge) return cancelHoverClose()
  if (hoverCloseTimer) return
  hoverCloseTimer = setTimeout(() => {
    closeMenu(navbar.value?.contains(document.activeElement))
  }, 180)
}

function cancelAutoClose() {
  clearTimeout(autoCloseTimer)
}
function selectDestination(event, key) {
  tooltip.value = null
  // Leave modified link clicks to the browser (for example, opening a new tab).
  if (event?.ctrlKey || event?.metaKey || event?.shiftKey || event?.altKey) return
  animateIcon(key)
  selectedKey.value = key
  accountOpen.value = false
  cancelAutoClose()
  function finishSelection() {
    closeMenu(navbar.value?.contains(document.activeElement))
  }
  autoCloseTimer = setTimeout(finishSelection, 1200)
}
function selectEntry(item, event) {
  tooltip.value = null
  if (!item.children) return selectDestination(event, item.key)
  animateIcon(item.key)
  logoutError.value = ''
  selectedKey.value = item.key
  cancelAutoClose()
  accountOpen.value = !accountOpen.value
}

const routeKey = computed(
  () =>
    route.meta.navGroup?.toLowerCase() ||
    (route.name === 'recipe-detail' ? 'freshness-recipes' : String(route.name)),
)
// Selection persists independently of whether the account dropdown is open.
// Closing it must not briefly rotate back to the previous page before routing.
const selectedKey = ref(routeKey.value)
const selectedIndex = computed(() =>
  Math.max(
    0,
    entries.findIndex((item) => item.key === selectedKey.value),
  ),
)
const account = entries.find((item) => item.children)
const accountLinks = computed(
  () =>
    account?.children.filter((item) =>
      auth.isAuthenticated ? item.name === 'profile' : ['login', 'register'].includes(item.name),
    ) || [],
)

async function logout(event) {
  if (loggingOut.value) return
  loggingOut.value = true
  logoutError.value = ''
  cancelAutoClose()
  try {
    await auth.logout()
    selectDestination(event, account.key)
    await router.push({ name: 'login' })
  } catch (error) {
    logoutError.value = error.message || 'Could not log out. Please try again.'
  } finally {
    loggingOut.value = false
  }
}

const selectedEntry = computed(() => entries[selectedIndex.value])
const highlightAngle = ref((selectedIndex.value * 360) / entries.length)
watch(selectedIndex, (index) => {
  const target = (index * 360) / entries.length
  // Move the outline by the shortest arc, including between Profile and Home.
  const difference = ((((target - highlightAngle.value) % 360) + 540) % 360) - 180
  highlightAngle.value += difference
})
const centerPage = computed(() =>
  selectedKey.value === routeKey.value && route.meta.navLabel
    ? { label: route.meta.navLabel, key: String(route.name) }
    : selectedEntry.value,
)
function polar(angle, radius, scale = 1) {
  const radians = (angle * Math.PI) / 180
  return [(0.5 + Math.sin(radians) * radius) * scale, (0.5 - Math.cos(radians) * radius) * scale]
}
function sectorPath(index, scale = 1) {
  const step = 360 / entries.length
  const start = index * step - step / 2
  const end = start + step
  const a = polar(start, 0.498, scale)
  const b = polar(end, 0.498, scale)
  const c = polar(end, 0.19, scale)
  const d = polar(start, 0.19, scale)
  return `M${a} A${0.498 * scale},${0.498 * scale} 0 0 1 ${b} L${c} A${0.19 * scale},${0.19 * scale} 0 0 0 ${d} Z`
}
function iconPosition(index) {
  const [x, y] = polar((index * 360) / entries.length, 0.345)
  return { left: `${x * 100}%`, top: `${y * 100}%` }
}
function closeMenu(restoreFocus = false) {
  cancelHoverClose()
  tooltip.value = null
  cancelAutoClose()
  opened.value = false
  accountOpen.value = false
  if (restoreFocus) toggle.value?.focus()
}
function toggleMenu() {
  if (opened.value) return closeMenu(true)
  openMenu()
}
function moveLight(event) {
  if (event.pointerType === 'touch') return
  const rect = navbar.value.querySelector('.radial-panel').getBoundingClientRect()
  navbar.value.style.setProperty('--light-x', `${event.clientX - rect.left}px`)
  navbar.value.style.setProperty('--light-y', `${event.clientY - rect.top}px`)
  hovered.value = true
}
function showTooltip(event, item, index) {
  if (!opened.value || selectedIndex.value === index) return
  if (event.pointerType === 'touch') return
  if (event.type === 'focus' && !event.currentTarget.matches(':focus-visible')) return
  const rect = event.currentTarget.querySelector('.sector-content').getBoundingClientRect()
  tooltip.value = {
    key: item.key,
    label: item.label,
    x: Math.max(102, Math.min(rect.left + rect.width / 2, window.innerWidth - 102)),
    y: Math.min(rect.bottom + 10, window.innerHeight - 72),
  }
}
function handlePageClick(event) {
  const rect = event.target instanceof Element ? event.target.getBoundingClientRect() : null
  const x = event.detail || !rect ? event.clientX : rect.left + rect.width / 2
  const y = event.detail || !rect ? event.clientY : rect.top + rect.height / 2
  glows.value = [...glows.value.slice(-7), { id: ++glowId, x, y }]
  if (!navbar.value?.contains(event.target)) closeMenu()
}
function removeGlow(id) {
  glows.value = glows.value.filter((glow) => glow.id !== id)
}
function escapeMenu(event) {
  if (event.key !== 'Escape' || !opened.value) return
  event.preventDefault()
  if (accountOpen.value) {
    accountOpen.value = false
    navbar.value?.querySelector('[data-nav-key="profile"]')?.focus()
  } else closeMenu(true)
}
async function focusAccount(event) {
  event.preventDefault()
  cancelAutoClose()
  selectedKey.value = account.key
  accountOpen.value = true
  await nextTick()
  navbar.value?.querySelector('.account-menu a')?.focus()
}
function moveAccountFocus(event) {
  const directions = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']
  if (!directions.includes(event.key)) return
  const actions = [...navbar.value.querySelectorAll('.account-menu a, .account-menu button')]
  const current = actions.indexOf(document.activeElement)
  if (current < 0) return
  event.preventDefault()
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? actions.length - 1
        : (current + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1) + actions.length) %
          actions.length
  actions[next]?.focus()
}
function moveFocus(event, index) {
  let next
  if (event.key === 'ArrowRight') next = (index + 1) % entries.length
  if (event.key === 'ArrowLeft') next = (index - 1 + entries.length) % entries.length
  if (event.key === 'Home') next = 0
  if (event.key === 'End') next = entries.length - 1
  if (next === undefined) return
  event.preventDefault()
  navbar.value?.querySelectorAll('.orbit-option')[next]?.focus()
}
watch(routeKey, (key) => {
  selectedKey.value = key
})
watch(
  () => route.fullPath,
  () => {
    accountOpen.value = false
  },
)
onMounted(() => {
  document.addEventListener('click', handlePageClick, true)
  document.addEventListener('keydown', escapeMenu)
  document.addEventListener('pointermove', trackHover, { passive: true })
})
onBeforeUnmount(() => {
  clickAnimation?.cancel()
  cancelHoverClose()
  cancelAutoClose()
  document.removeEventListener('click', handlePageClick, true)
  document.removeEventListener('keydown', escapeMenu)
  document.removeEventListener('pointermove', trackHover)
})
</script>

<template>
  <nav
    ref="navbar"
    class="orbit-navbar"
    :class="{ 'is-open': opened, 'is-hovered': hovered }"
    :style="{ '--selected-color': segmentColors[selectedEntry.key] || segmentColors.home }"
    aria-label="Main navigation"
    @pointermove="moveLight"
    @pointerleave="hovered = false"
  >
    <div id="radial-navigation" class="radial-panel" :inert="!opened" :aria-hidden="!opened">
      <svg width="0" height="0" class="ring-definition" aria-hidden="true">
        <defs>
          <clipPath
            v-for="(item, index) in entries"
            :id="`wheel-sector-${item.key}`"
            :key="item.key"
            clipPathUnits="objectBoundingBox"
          >
            <path :d="sectorPath(index)" />
          </clipPath>
        </defs>
      </svg>
      <ul class="orbit-items">
        <li v-for="(item, index) in entries" :key="item.key" class="orbit-slot">
          <component
            :is="item.children ? 'button' : RouterLink"
            :to="item.children ? undefined : { name: item.name }"
            :type="item.children ? 'button' : undefined"
            class="orbit-option"
            :class="{ 'is-selected': selectedIndex === index }"
            :style="{
              clipPath: `url(#wheel-sector-${item.key})`,
              '--segment-color': segmentColors[item.key] || segmentColors.home,
            }"
            :data-nav-key="item.key"
            :aria-label="item.label"
            :aria-describedby="tooltip?.key === item.key ? 'nav-icon-tooltip' : undefined"
            :aria-expanded="item.children ? accountOpen : undefined"
            :aria-controls="item.children ? 'account-navigation' : undefined"
            @click="selectEntry(item, $event)"
            @pointerenter="showTooltip($event, item, index)"
            @pointerleave="tooltip = null"
            @focus="showTooltip($event, item, index)"
            @blur="tooltip = null"
            @keydown="moveFocus($event, index)"
            @keydown.down="item.children && focusAccount($event)"
          >
            <span class="sector-content" :style="iconPosition(index)"
              ><span class="icon-hover"><NavIcon :name="item.key" /></span
              ><span class="orbit-label" aria-hidden="true">{{ item.label }}</span></span
            >
          </component>
        </li>
      </ul>
      <svg class="wheel-dividers" viewBox="0 0 500 500" aria-hidden="true">
        <path v-for="(item, index) in entries" :key="item.key" :d="sectorPath(index, 500)" />
        <path
          class="wheel-selection"
          :d="sectorPath(0, 500)"
          :style="{ transform: `rotate(${highlightAngle}deg)` }"
        />
      </svg>
      <div class="nav-light" aria-hidden="true"></div>
      <div
        v-show="!accountOpen"
        class="wheel-current"
        aria-live="polite"
        aria-atomic="true"
        :aria-hidden="accountOpen"
      >
        <Transition name="center-page" mode="out-in"
          ><span :key="centerPage.key" class="wheel-current-content"
            ><NavIcon :name="centerPage.key" /><span>{{ centerPage.label }}</span></span
          ></Transition
        >
      </div>
      <Transition name="account">
        <ul
          v-if="accountOpen && account"
          id="account-navigation"
          class="account-menu"
          aria-label="Account actions"
          @keydown="moveAccountFocus"
        >
          <li class="account-title">Account</li>
          <li v-for="child in accountLinks" :key="child.name">
            <RouterLink :to="{ name: child.name }" @click="selectDestination($event, account.key)"
              ><NavIcon :name="String(child.name)" />{{ child.meta.navLabel }}</RouterLink
            >
          </li>
          <li v-if="auth.isAuthenticated">
            <button type="button" :disabled="loggingOut" @click="logout">
              <NavIcon name="logout" />{{ loggingOut ? 'Logging out…' : 'Logout' }}
            </button>
          </li>
          <li v-if="logoutError" class="logout-error" role="alert">{{ logoutError }}</li>
        </ul>
      </Transition>
    </div>
    <button
      ref="toggle"
      type="button"
      class="nav-toggle"
      :aria-label="opened ? 'Close navigation' : 'Open navigation'"
      :aria-expanded="opened"
      aria-controls="radial-navigation"
      @pointerenter="openOnHover"
      @click="toggleMenu"
    >
      <span class="toggle-lines" aria-hidden="true"><span></span><span></span><span></span></span>
    </button>
  </nav>
  <Teleport to="body">
    <Transition name="tooltip">
      <span
        v-if="tooltip"
        id="nav-icon-tooltip"
        role="tooltip"
        class="nav-tooltip"
        :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }"
        >{{ tooltip.label }}</span
      >
    </Transition>
    <div class="page-click-glows" aria-hidden="true">
      <span
        v-for="glow in glows"
        :key="glow.id"
        class="page-click-glow"
        :style="{ left: `${glow.x}px`, top: `${glow.y}px` }"
        @animationend="removeGlow(glow.id)"
      ></span>
    </div>
  </Teleport>
</template>

<style scoped>
.orbit-navbar {
  --light-x: 50%;
  --light-y: 50%;
  --selected-color: #d9f1de;
  --wheel-size: min(480px, calc(100vw - 24px), calc(100dvh - 120px));
  position: fixed;
  z-index: 1000;
  top: 0;
  left: 50%;
  width: var(--wheel-size);
  height: 0;
  transform: translateX(-50%);
  pointer-events: none;
  color: #fff;
  font:
    500 12px/1.4 system-ui,
    sans-serif;
}
.radial-panel {
  position: relative;
  top: 84px;
  width: 100%;
  aspect-ratio: 1;
  opacity: 0;
  visibility: hidden;
  transform: translateY(-24px) scale(0.88);
  transform-origin: 50% 0;
  filter: drop-shadow(0 12px 24px rgb(10 42 29 / 23%));
  transition:
    transform 420ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 220ms ease,
    visibility 420ms;
}
.is-open .radial-panel {
  opacity: 1;
  visibility: visible;
  transform: translateY(0) scale(1);
}
.ring-definition {
  position: absolute;
}
.orbit-items {
  margin: 0;
  padding: 0;
  list-style: none;
}
.orbit-slot {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.orbit-option {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  background: var(--segment-color);
  color: #164b35;
  font: inherit;
  cursor: pointer;
  text-decoration: none;
  pointer-events: auto;
  transition:
    background-color 220ms ease,
    color 220ms ease;
}
.orbit-option:hover {
  box-shadow: inset 0 0 0 100vmax rgb(18 63 59 / 5%);
}
.orbit-option.is-selected {
  background: var(--selected-color);
  color: #164b35;
}
.sector-content {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 7px;
  width: 100px;
  transform: translate(-50%, -50%);
}
.sector-content .nav-icon {
  width: 25px;
  height: 25px;
  flex-shrink: 0;
}
.orbit-label {
  max-width: 100px;
  font-size: 11px;
  line-height: 1.2;
  font-weight: 600;
  text-align: center;
}
.wheel-dividers {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.wheel-dividers path {
  fill: none;
  stroke: #8db5a0;
  stroke-width: 1.5;
}
.wheel-dividers .wheel-selection {
  fill: rgb(255 255 255 / 10%);
  stroke: #164b35;
  stroke-width: 4;
  transform-box: view-box;
  transform-origin: 250px 250px;
}
.is-open .wheel-selection {
  transition: transform 620ms cubic-bezier(0.22, 1, 0.36, 1);
}
.nav-light {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  pointer-events: none;
  opacity: 0;
  background: radial-gradient(
    circle 120px at var(--light-x) var(--light-y),
    rgb(218 255 230 / 26%),
    transparent 76%
  );
  transition: opacity 180ms ease;
}
.is-hovered .nav-light {
  opacity: 1;
}
.wheel-current {
  position: absolute;
  left: 50%;
  top: 50%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 9px;
  width: 38%;
  aspect-ratio: 1;
  padding: 10px;
  border: 2px solid #8db5a0;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  background: var(--selected-color);
  color: #164b35;
  text-align: center;
  pointer-events: auto;
  transition: background-color 560ms ease;
}
.wheel-current-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 9px;
  width: 100%;
}
.center-page-enter-active {
  transition:
    opacity 220ms ease,
    scale 300ms cubic-bezier(0.22, 1, 0.36, 1);
}
.center-page-leave-active {
  transition:
    opacity 140ms ease,
    scale 140ms ease;
}
.center-page-enter-from {
  opacity: 0;
  scale: 0.85;
}
.center-page-leave-to {
  opacity: 0;
  scale: 0.94;
}
.wheel-current .nav-icon {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
}
.wheel-current span {
  font-size: 12px;
  line-height: 1.2;
  font-weight: 600;
}
.orbit-option:focus-visible {
  outline: none;
}
.orbit-option:focus-visible .sector-content {
  outline: 2px solid currentColor;
  outline-offset: 5px;
  border-radius: 8px;
}
.nav-toggle {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  padding: 0;
  border: 1px solid rgb(225 255 234 / 30%);
  border-radius: 50%;
  background: #164b35;
  color: #fff;
  box-shadow: 0 5px 20px rgb(10 42 29 / 22%);
  cursor: pointer;
  pointer-events: auto;
  transition:
    background-color 200ms ease,
    box-shadow 200ms ease;
}
.nav-toggle:hover {
  background: #205e43;
  box-shadow: 0 0 22px rgb(122 220 158 / 40%);
}
.is-open .nav-toggle {
  background: #103b2a;
  box-shadow: none;
}
.toggle-lines {
  position: relative;
  width: 20px;
  height: 16px;
}
.toggle-lines span {
  position: absolute;
  left: 0;
  width: 20px;
  height: 2px;
  border-radius: 2px;
  background: currentColor;
  transition:
    transform 560ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 200ms ease;
}
.toggle-lines span:nth-child(1) {
  top: 0;
}
.toggle-lines span:nth-child(2) {
  top: 7px;
}
.toggle-lines span:nth-child(3) {
  top: 14px;
}
.is-open .toggle-lines span:nth-child(1) {
  transform: translateY(7px) rotate(45deg);
}
.is-open .toggle-lines span:nth-child(2) {
  opacity: 0;
}
.is-open .toggle-lines span:nth-child(3) {
  transform: translateY(-7px) rotate(-45deg);
}
.nav-toggle:focus-visible,
.account-menu a:focus-visible,
.account-menu button:focus-visible {
  outline: 2px solid #1f7d74;
  outline-offset: 3px;
}
.account-menu {
  position: absolute;
  z-index: 2;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-content: center;
  justify-items: center;
  gap: 8px;
  width: 38%;
  aspect-ratio: 1;
  margin: 0;
  padding: 16px;
  list-style: none;
  border: 2px solid #8db5a0;
  border-radius: 50%;
  background: var(--selected-color);
  color: #164b35;
  pointer-events: auto;
}
.account-title {
  grid-column: 1 / -1;
  font-size: 12px;
  font-weight: 700;
  text-align: center;
}
.account-menu li:not(.account-title):not(.logout-error) {
  min-width: 0;
  width: 100%;
}
.account-menu a,
.account-menu button {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 58px;
  width: 100%;
  padding: 8px 3px;
  border: 1px solid rgb(22 75 53 / 22%);
  border-radius: 18px;
  background: rgb(255 255 255 / 65%);
  color: #164b35;
  font: inherit;
  font-size: 11px;
  text-align: center;
  text-decoration: none;
  transition:
    background-color 180ms ease,
    box-shadow 180ms ease;
}
.account-menu a:hover,
.account-menu button:hover {
  background: #fff;
  box-shadow: 0 2px 9px rgb(22 75 53 / 15%);
}
.account-menu .nav-icon {
  width: 22px;
  height: 22px;
}
.account-menu button:disabled {
  opacity: 0.6;
  cursor: wait;
}
.logout-error {
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  width: 190px;
  padding: 8px 12px;
  border-radius: 12px;
  background: #fff0ec;
  color: #9a3a2e;
  box-shadow: 0 3px 10px rgb(22 75 53 / 15%);
  font-size: 12px;
}
.account-menu a.router-link-exact-active {
  background: #fff;
  border-color: #164b35;
}
.account-enter-active,
.account-leave-active {
  transition:
    opacity 220ms ease,
    scale 260ms cubic-bezier(0.22, 1, 0.36, 1);
}
.account-enter-from,
.account-leave-to {
  opacity: 0;
  scale: 0.82;
}
.page-click-glows {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  pointer-events: none;
  overflow: hidden;
}
.nav-tooltip {
  position: fixed;
  z-index: 1100;
  width: max-content;
  max-width: 180px;
  padding: 8px 12px;
  border: 1px solid rgb(22 75 53 / 16%);
  border-radius: 10px;
  background: #f1fbf4;
  color: #164b35;
  box-shadow: 0 5px 18px rgb(10 42 29 / 20%);
  font:
    600 12px/1.4 system-ui,
    sans-serif;
  text-align: center;
  transform: translateX(-50%);
  pointer-events: none;
}
.tooltip-enter-active,
.tooltip-leave-active {
  transition:
    opacity 180ms ease,
    translate 180ms ease;
}
.tooltip-enter-from,
.tooltip-leave-to {
  opacity: 0;
  translate: 0 -5px;
}
.page-click-glow {
  position: absolute;
  width: 100px;
  height: 100px;
  margin: -50px;
  border-radius: 50%;
  border: 1px solid rgb(112 215 156 / 65%);
  background: radial-gradient(
    circle,
    rgb(164 255 202 / 55%),
    rgb(63 187 122 / 20%) 45%,
    transparent 72%
  );
  animation: page-click 700ms ease-out forwards;
}
@keyframes page-click {
  from {
    transform: scale(0.15);
    opacity: 1;
  }
  to {
    transform: scale(1.5);
    opacity: 0;
  }
}
@media (max-width: 480px), (max-height: 600px) {
  .sector-content {
    width: 72px;
    gap: 5px;
  }
  .sector-content .nav-icon {
    width: 22px;
    height: 22px;
  }
  .orbit-label {
    max-width: 72px;
    font-size: 9px;
  }
  .wheel-current {
    gap: 5px;
    padding: 7px;
  }
  .wheel-current-content {
    gap: 5px;
  }
  .wheel-current .nav-icon {
    width: 25px;
    height: 25px;
  }
  .wheel-current span {
    font-size: 10px;
  }
}
@media (max-width: 480px), (max-height: 600px) {
  .account-menu {
    padding: 7px;
    gap: 4px;
  }
  .account-title {
    font-size: 9px;
  }
  .account-menu a,
  .account-menu button {
    min-height: 44px;
    border-radius: 13px;
    padding: 4px 1px;
    gap: 3px;
    font-size: 9px;
  }
  .account-menu .nav-icon {
    width: 18px;
    height: 18px;
  }
}
/* Hover motion belongs to the glyph wrapper; the sector and label stay fixed. */
.icon-hover {
  position: relative;
  display: grid;
  place-items: center;
  width: 25px;
  height: 25px;
  transform-origin: center;
}
.orbit-option[data-nav-key='home']:is(:hover, :focus-visible) .icon-hover {
  animation: home-hover 760ms ease;
}
.orbit-option[data-nav-key='dashboard']:is(:hover, :focus-visible) .icon-hover {
  animation: dashboard-hover 760ms ease;
}
.orbit-option[data-nav-key='scanning']:is(:hover, :focus-visible) .icon-hover {
  animation: scan-hover 760ms ease;
}
.orbit-option[data-nav-key='fridge']:is(:hover, :focus-visible) .icon-hover {
  animation: fridge-hover 760ms ease;
}
.orbit-option[data-nav-key='freshness-recipes']:is(:hover, :focus-visible) .icon-hover {
  animation: leaf-hover 760ms ease;
}
.orbit-option[data-nav-key='food-rescue']:is(:hover, :focus-visible) .icon-hover {
  animation: rescue-hover 760ms ease;
}
.orbit-option[data-nav-key='analytics']:is(:hover, :focus-visible) .icon-hover {
  animation: analytics-hover 760ms ease;
}
.orbit-option[data-nav-key='profile']:is(:hover, :focus-visible) .icon-hover {
  animation: profile-hover 760ms ease;
}
.orbit-option[data-nav-key='scanning'] .icon-hover::after {
  content: '';
  position: absolute;
  left: -4px;
  right: -4px;
  top: 50%;
  height: 2px;
  border-radius: 2px;
  background: currentColor;
  opacity: 0;
}
.orbit-option[data-nav-key='scanning']:is(:hover, :focus-visible) .icon-hover::after {
  animation: scan-sweep 760ms ease;
}
@keyframes home-hover {
  0%,
  100% {
    transform: translateY(0);
  }
  30% {
    transform: translateY(-5px);
  }
  55% {
    transform: translateY(1px);
  }
  75% {
    transform: translateY(-2px);
  }
}
@keyframes dashboard-hover {
  0% {
    transform: rotate(0deg) scale(1);
  }
  45% {
    transform: rotate(90deg) scale(0.88);
  }
  100% {
    transform: rotate(180deg) scale(1);
  }
}
@keyframes scan-hover {
  0%,
  100% {
    opacity: 1;
  }
  35% {
    opacity: 0.5;
  }
  65% {
    opacity: 1;
  }
}
@keyframes scan-sweep {
  0% {
    opacity: 0;
    transform: translateY(-14px);
  }
  20%,
  75% {
    opacity: 0.8;
  }
  100% {
    opacity: 0;
    transform: translateY(14px);
  }
}
@keyframes fridge-hover {
  0%,
  100% {
    transform: rotate(0deg);
  }
  20%,
  60% {
    transform: rotate(-7deg);
  }
  40%,
  80% {
    transform: rotate(7deg);
  }
}
@keyframes leaf-hover {
  0%,
  100% {
    transform: rotate(0deg);
  }
  30% {
    transform: rotate(-18deg);
  }
  65% {
    transform: rotate(12deg);
  }
}
@keyframes rescue-hover {
  0%,
  100% {
    transform: scale(1);
  }
  20%,
  55% {
    transform: scale(1.2);
  }
  35%,
  75% {
    transform: scale(0.98);
  }
}
@keyframes analytics-hover {
  0%,
  100% {
    transform: scaleY(1);
  }
  25% {
    transform: scaleY(0.65);
  }
  60% {
    transform: scaleY(1.18);
  }
}
@keyframes profile-hover {
  0%,
  100% {
    transform: rotate(0deg) scale(1);
  }
  30% {
    transform: rotate(-10deg) scale(1.08);
  }
  60% {
    transform: rotate(10deg) scale(1.08);
  }
}
@media (max-width: 480px), (max-height: 600px) {
  .icon-hover {
    width: 22px;
    height: 22px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .orbit-option[data-nav-key]:is(:hover, :focus-visible) .icon-hover,
  .orbit-option[data-nav-key='scanning']:is(:hover, :focus-visible) .icon-hover::after {
    animation: none;
  }
  .account-menu a,
  .account-menu button {
    transition: none;
  }
  .radial-panel,
  .nav-light,
  .nav-toggle,
  .toggle-lines span,
  .orbit-option,
  .orbit-option .nav-icon,
  .orbit-label,
  .tooltip-enter-active,
  .tooltip-leave-active,
  .account-enter-active,
  .account-leave-active {
    transition: none;
  }
  .is-open .wheel-selection,
  .wheel-current,
  .center-page-enter-active,
  .center-page-leave-active {
    transition: none;
  }
  .page-click-glow {
    animation: click-fade 180ms ease-out forwards;
  }
}
@keyframes click-fade {
  from {
    opacity: 0.5;
  }
  to {
    opacity: 0;
  }
}
</style>
