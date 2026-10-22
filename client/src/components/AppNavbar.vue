<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'
import NavIcon from './NavIcon.vue'

const auth = useAuthStore()
const route = useRoute()
const navbar = ref(null)
const navItems = ref(null)
const hovered = ref(false)
const openGroup = ref(null)
const highlight = ref(null)
const ripple = ref(null)
const menuLeft = ref(0)
let resizeObserver
let measureFrame
let rippleTimer
let rippleId = 0

const routes = useRouter().getRoutes()
const topLinks = routes.filter((item) => item.meta.navLabel && !item.meta.navGroup)
const groups = [...new Set(routes.map((item) => item.meta.navGroup).filter(Boolean))].map(
  (label, index) => ({
    label,
    id: `navbar-group-${index}`,
    children: routes.filter((item) => item.meta.navGroup === label),
  }),
)
const activeKey = computed(() =>
  openGroup.value
    ? `group:${openGroup.value}`
    : route.meta.navGroup
      ? `group:${route.meta.navGroup}`
      : `route:${String(route.name)}`,
)
const highlightStyle = computed(() =>
  highlight.value
    ? {
        width: `${highlight.value.width}px`,
        transform: `translateX(${highlight.value.x}px)`,
      }
    : {},
)

function findItem(key) {
  return [...(navbar.value?.querySelectorAll('[data-nav-key]') || [])].find(
    (item) => item.dataset.navKey === key,
  )
}

function measure() {
  if (!navbar.value) return
  const active = findItem(activeKey.value)
  if (active) {
    const parent = navbar.value.getBoundingClientRect()
    const rect = active.getBoundingClientRect()
    const width = Math.min(rect.width + 48, parent.width - 32)
    const center = rect.left - parent.left + rect.width / 2
    highlight.value = {
      x: Math.max(16, Math.min(center - width / 2, parent.width - width - 16)),
      width,
    }
  } else {
    highlight.value = null
  }

  if (openGroup.value) {
    const button = findItem(`group:${openGroup.value}`)
    const menu = document.getElementById(button?.getAttribute('aria-controls'))
    if (button && menu) {
      const parent = navbar.value.getBoundingClientRect()
      const left = Math.max(
        16,
        Math.min(button.getBoundingClientRect().left, window.innerWidth - menu.offsetWidth - 16),
      )
      menuLeft.value = left - parent.left
    }
  }
}

function revealSelection() {
  const active = findItem(activeKey.value)
  if (!active || !navItems.value) return
  const track = navItems.value.getBoundingClientRect()
  const rect = active.getBoundingClientRect()
  navItems.value.scrollLeft += rect.left + rect.width / 2 - track.left - track.width / 2
}

function queueMeasure() {
  if (!navbar.value) return
  cancelAnimationFrame(measureFrame)
  measureFrame = requestAnimationFrame(measure)
}

function finishExpansion(event) {
  if (event.propertyName !== 'grid-template-columns') return
  revealSelection()
  queueMeasure()
}

function moveLight(event) {
  if (event.pointerType === 'touch') return
  const rect = navbar.value.getBoundingClientRect()
  navbar.value.style.setProperty('--light-x', `${event.clientX - rect.left}px`)
  navbar.value.style.setProperty('--light-y', `${event.clientY - rect.top}px`)
  hovered.value = true
}

function clickEffect(event) {
  const target = event.target.closest('a, button')
  if (!target || !navbar.value.contains(target)) return
  const parent = navbar.value.getBoundingClientRect()
  const rect = target.getBoundingClientRect()
  ripple.value = {
    id: ++rippleId,
    x: (event.detail ? event.clientX : rect.left + rect.width / 2) - parent.left,
    y: (event.detail ? event.clientY : rect.top + rect.height / 2) - parent.top,
  }
  clearTimeout(rippleTimer)
  rippleTimer = setTimeout(() => {
    ripple.value = null
  }, 650)
}

function closeMenu(restoreFocus = false) {
  const label = openGroup.value
  openGroup.value = null
  if (restoreFocus && label) findItem(`group:${label}`)?.focus()
}

async function openMenu(label, focusFirst = false) {
  openGroup.value = label
  await nextTick()
  measure()
  if (focusFirst) {
    const button = findItem(`group:${label}`)
    document.getElementById(button.getAttribute('aria-controls'))?.querySelector('a')?.focus()
  }
}

function outsideClick(event) {
  if (!navbar.value?.contains(event.target)) closeMenu()
}

function focusOut(event) {
  if (!navbar.value.contains(event.relatedTarget)) closeMenu()
}

watch(
  () => route.fullPath,
  () => closeMenu(),
)

watch(activeKey, async () => {
  await nextTick()
  revealSelection()
  measure()
})

onMounted(async () => {
  revealSelection()
  measure()
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(queueMeasure)
    resizeObserver.observe(navbar.value)
    navbar.value.querySelectorAll('[data-nav-key]').forEach((item) => resizeObserver.observe(item))
  }
  window.addEventListener('resize', queueMeasure)
  document.addEventListener('pointerdown', outsideClick)
  document.fonts?.ready.then(queueMeasure)
  try {
    await auth.checkAuth()
  } catch {
    // Keep navigation available if the backend cannot be reached.
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  cancelAnimationFrame(measureFrame)
  clearTimeout(rippleTimer)
  window.removeEventListener('resize', queueMeasure)
  document.removeEventListener('pointerdown', outsideClick)
})
</script>

<template>
  <nav
    ref="navbar"
    class="app-navbar"
    :class="{ 'is-hovered': hovered }"
    aria-label="Main navigation"
    @pointermove="moveLight"
    @pointerleave="hovered = false"
    @click="clickEffect"
    @focusout="focusOut"
    @keydown.esc.stop.prevent="closeMenu(true)"
  >
    <svg
      v-if="highlight"
      class="nav-highlight"
      :style="highlightStyle"
      viewBox="0 0 160 28"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d="M0 0 C24 0 24 28 56 28 H104 C136 28 136 0 160 0 Z" />
    </svg>
    <div class="nav-effects" aria-hidden="true">
      <div class="nav-light"></div>
      <span
        v-if="ripple"
        :key="ripple.id"
        class="nav-ripple"
        :style="{ left: `${ripple.x}px`, top: `${ripple.y}px` }"
      ></span>
    </div>
    <RouterLink :to="{ name: 'home' }" class="nav-brand" @click="closeMenu()"
      >Full Circle</RouterLink
    >
    <ul ref="navItems" class="nav-items" @scroll="queueMeasure" @transitionend="finishExpansion">
      <li v-for="link in topLinks" :key="link.name">
        <RouterLink
          :to="{ name: link.name }"
          class="nav-option"
          :class="{ 'is-selected': activeKey === `route:${String(link.name)}` }"
          :data-nav-key="`route:${String(link.name)}`"
          :aria-label="link.meta.navLabel"
          :title="link.meta.navLabel"
          @click="closeMenu()"
          ><span class="nav-label"
            ><NavIcon :name="String(link.name)" /><span class="nav-text"
              ><span>{{ link.meta.navLabel }}</span></span
            ></span
          ></RouterLink
        >
      </li>
      <li v-for="group in groups" :key="group.id" class="nav-group">
        <button
          type="button"
          class="nav-option nav-group-toggle"
          :class="{ 'is-selected': activeKey === `group:${group.label}` }"
          :data-nav-key="`group:${group.label}`"
          :aria-label="group.label"
          :title="group.label"
          :aria-expanded="openGroup === group.label"
          :aria-controls="group.id"
          @click="openGroup === group.label ? closeMenu() : openMenu(group.label)"
          @keydown.down.prevent="openMenu(group.label, true)"
        >
          <span class="nav-label">
            <NavIcon :name="group.label.toLowerCase()" />
            <span class="nav-text"
              ><span>
                {{ group.label }}
                <svg
                  class="nav-chevron"
                  :class="{ 'is-open': openGroup === group.label }"
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  aria-hidden="true"
                >
                  <path
                    d="m4 6 4 4 4-4"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.7"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg> </span
            ></span>
          </span>
        </button>
      </li>
    </ul>
    <Transition v-for="group in groups" :key="group.id" name="nav-menu">
      <ul
        v-show="openGroup === group.label"
        :id="group.id"
        class="nav-submenu"
        :style="{ left: `${menuLeft}px` }"
      >
        <li v-for="child in group.children" :key="child.name">
          <RouterLink :to="{ name: child.name }" @click="closeMenu()">
            <NavIcon :name="String(child.name)" />
            {{ child.meta.navLabel }}
          </RouterLink>
        </li>
      </ul>
    </Transition>
  </nav>
</template>

<style scoped>
.app-navbar {
  --light-x: 50%;
  --light-y: 50%;
  --selection-duration: 560ms;
  display: grid;
  grid-template-columns: 130px minmax(0, 1fr) 130px;
  align-items: center;
  position: relative;
  z-index: 100;
  isolation: isolate;
  margin: 16px auto 52px;
  width: calc(100% - 48px);
  max-width: 960px;
  padding: 0 10px;
  border-radius: 20px;
  background: #164b35;
  filter: drop-shadow(0 8px 12px rgb(16 58 41 / 14%));
  color: #fff;
  font:
    500 12px/1.4 system-ui,
    sans-serif;
}

.nav-brand {
  grid-column: 1;
  position: relative;
  flex-shrink: 0;
  padding: 14px 16px;
  color: #fff;
  font-size: 18px;
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
}
.nav-brand:hover {
  color: #d9f1de;
}

.nav-effects {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: inherit;
  pointer-events: none;
}

.nav-light {
  position: absolute;
  inset: 0;
  background: radial-gradient(
    circle 125px at var(--light-x) var(--light-y),
    rgb(210 255 225 / 24%),
    rgb(210 255 225 / 7%) 45%,
    transparent 75%
  );
  opacity: 0;
  transition: opacity 180ms ease;
}

.is-hovered .nav-light {
  opacity: 1;
}

.nav-highlight {
  position: absolute;
  bottom: -27px;
  left: 0;
  height: 28px;
  fill: #164b35;
  pointer-events: none;
  transition:
    transform var(--selection-duration) cubic-bezier(0.22, 1, 0.36, 1),
    width var(--selection-duration) cubic-bezier(0.22, 1, 0.36, 1);
}

.nav-ripple {
  position: absolute;
  width: 120px;
  height: 120px;
  margin: -60px;
  border: 1px solid rgb(255 255 255 / 45%);
  border-radius: 50%;
  background: rgb(235 255 240 / 32%);
  animation: nav-click 600ms ease-out forwards;
}

@keyframes nav-click {
  from {
    transform: scale(0);
    opacity: 0.8;
  }
  to {
    transform: scale(3);
    opacity: 0;
  }
}

.nav-items {
  grid-column: 2;
  position: relative;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
  margin: 0;
  padding: 12px 32px 18px;
  list-style: none;
}

.nav-items::-webkit-scrollbar {
  display: none;
}
.nav-items > li {
  flex-shrink: 0;
}
.nav-items > li:first-child {
  margin-left: auto;
}
.nav-items > li:last-child {
  margin-right: auto;
}

.nav-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  transform-origin: center;
  transition: transform var(--selection-duration) cubic-bezier(0.22, 1, 0.36, 1);
}

.nav-text {
  display: grid;
  grid-template-columns: 0fr;
  grid-template-rows: 0fr;
  margin-top: 0;
  opacity: 0;
  transition:
    grid-template-columns var(--selection-duration) cubic-bezier(0.22, 1, 0.36, 1),
    grid-template-rows var(--selection-duration) cubic-bezier(0.22, 1, 0.36, 1),
    margin-top var(--selection-duration) cubic-bezier(0.22, 1, 0.36, 1),
    opacity 180ms ease;
}
.nav-text > span {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
.nav-option.is-selected .nav-text {
  grid-template-columns: 1fr;
  grid-template-rows: 1fr;
  margin-top: 8px;
  opacity: 1;
}
.nav-label .nav-icon {
  transition: transform var(--selection-duration) cubic-bezier(0.22, 1, 0.36, 1);
}
.nav-option.is-selected .nav-icon {
  transform: scale(1.18);
}

.nav-option {
  display: flex;
  height: 44px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 11px 12px;
  border: 0;
  border-radius: 13px;
  background: transparent;
  color: #fff;
  font: inherit;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  transition:
    color 180ms ease,
    background-color 180ms ease;
}

.nav-option:hover {
  color: #fff;
  background-color: rgb(0 20 9 / 20%);
}
.nav-option:active {
  background-color: rgb(0 20 9 / 30%);
}
.nav-option.is-selected {
  color: #d9f1de;
}
.nav-option.is-selected .nav-label {
  transform: translateY(14px);
}
.nav-option.is-selected:hover {
  background-color: rgb(255 255 255 / 12%);
}
.nav-option:focus-visible,
.nav-brand:focus-visible,
.nav-submenu a:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 3px;
}
.nav-option.is-selected:focus-visible {
  outline-color: #d9f1de;
}
.nav-group {
  position: relative;
}
.nav-chevron {
  flex-shrink: 0;
  transition: transform 200ms ease;
}
.nav-chevron.is-open {
  transform: rotate(180deg);
}

.nav-submenu {
  position: absolute;
  top: calc(100% + 36px);
  z-index: 10;
  width: 190px;
  padding: 7px;
  margin: 0;
  list-style: none;
  border: 1px solid rgb(255 255 255 / 16%);
  border-radius: 15px;
  background: #164b35;
  box-shadow: 0 12px 30px rgb(10 40 24 / 22%);
}

.nav-submenu a {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 12px;
  border-radius: 9px;
  color: #fff;
  text-decoration: none;
  transition: background-color 160ms ease;
}
.nav-submenu a:hover {
  background-color: #103a29;
}
.nav-submenu a.router-link-exact-active {
  background-color: #d9f1de;
  color: #123f2c;
}
.nav-menu-enter-active,
.nav-menu-leave-active {
  transition:
    opacity 160ms ease,
    transform 160ms ease;
}
.nav-menu-enter-from,
.nav-menu-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@media (max-width: 600px) {
  .app-navbar {
    grid-template-columns: minmax(0, 1fr);
    width: calc(100% - 20px);
    margin-top: 10px;
    padding: 0 8px;
    border-radius: 17px;
    font-size: 12px;
  }
  .nav-items {
    grid-column: 1;
    gap: 4px;
  }
  .nav-brand {
    padding: 12px 16px 0;
    font-size: 16px;
  }
  .nav-option {
    padding: 10px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .nav-highlight,
  .nav-label,
  .nav-text,
  .nav-label .nav-icon,
  .nav-option,
  .nav-light,
  .nav-chevron,
  .nav-submenu a,
  .nav-menu-enter-active,
  .nav-menu-leave-active {
    transition: none;
  }
  .nav-ripple {
    animation: none;
    display: none;
  }
}
</style>
