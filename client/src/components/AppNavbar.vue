<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import NavIcon from './NavIcon.vue'

const route = useRoute()
const routes = useRouter().getRoutes()
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
const angles = ref(entries.map((_, index) => slotAngle(index, 0)))
let frame
let glowId = 0
let motionPreference
let previousIndex = 0
let autoCloseTimer
let rotating = false

function cancelAutoClose() {
  clearTimeout(autoCloseTimer)
}
function selectDestination(event) {
  tooltip.value = null
  // Leave modified link clicks to the browser (for example, opening a new tab).
  if (event?.ctrlKey || event?.metaKey || event?.shiftKey || event?.altKey) return
  accountOpen.value = false
  cancelAutoClose()
  function finishSelection() {
    if (rotating) {
      autoCloseTimer = setTimeout(finishSelection, 100)
      return
    }
    closeMenu(navbar.value?.contains(document.activeElement))
  }
  autoCloseTimer = setTimeout(finishSelection, 1200)
}
function selectEntry(item, event) {
  tooltip.value = null
  if (!item.children) return selectDestination(event)
  cancelAutoClose()
  accountOpen.value = !accountOpen.value
}

const routeKey = computed(
  () =>
    route.meta.navGroup?.toLowerCase() ||
    (route.name === 'recipe-detail' ? 'freshness-recipes' : String(route.name)),
)
const selectedKey = computed(() => (accountOpen.value ? 'profile' : routeKey.value))
const selectedIndex = computed(() =>
  Math.max(
    0,
    entries.findIndex((item) => item.key === selectedKey.value),
  ),
)
const account = entries.find((item) => item.children)

// All destinations remain on the visible lower arc. Wrapped items travel around
// the upper side of the ellipse, like chambers rotating through a revolver.
function slotAngle(index, selected) {
  const offset =
    ((index - selected + entries.length / 2 + entries.length) % entries.length) - entries.length / 2
  return offset * 21
}
function rotateTo(selected, animate = true) {
  tooltip.value = null
  cancelAnimationFrame(frame)
  rotating = false
  let steps = selected - previousIndex
  if (steps > entries.length / 2) steps -= entries.length
  if (steps < -entries.length / 2) steps += entries.length
  previousIndex = selected
  const starts = angles.value.map((angle) => ((((angle + 180) % 360) + 360) % 360) - 180)
  const ends = entries.map((_, index) => {
    let target = slotAngle(index, selected)
    if (steps > 0 && target > starts[index] + 1) target -= 360
    if (steps < 0 && target < starts[index] - 1) target += 360
    return target
  })
  if (!animate || motionPreference?.matches) {
    angles.value = entries.map((_, index) => slotAngle(index, selected))
    return
  }
  const start = performance.now()
  rotating = true
  function tick(now) {
    const progress = Math.min((now - start) / 760, 1)
    const eased = 1 - (1 - progress) ** 3
    angles.value = starts.map((angle, index) => angle + (ends[index] - angle) * eased)
    if (progress < 1) frame = requestAnimationFrame(tick)
    else {
      angles.value = entries.map((_, index) => slotAngle(index, selected))
      rotating = false
    }
  }
  frame = requestAnimationFrame(tick)
}
function position(index) {
  const radians = (angles.value[index] * Math.PI) / 180
  return { '--orbit-x': Math.sin(radians), '--orbit-y': Math.cos(radians) }
}
function closeMenu(restoreFocus = false) {
  tooltip.value = null
  cancelAutoClose()
  opened.value = false
  accountOpen.value = false
  if (restoreFocus) toggle.value?.focus()
}
async function toggleMenu() {
  if (opened.value) return closeMenu(true)
  opened.value = true
  rotateTo(selectedIndex.value, false)
  await nextTick()
}
function moveLight(event) {
  if (event.pointerType === 'touch') return
  const rect = navbar.value.getBoundingClientRect()
  navbar.value.style.setProperty('--light-x', `${event.clientX - rect.left}px`)
  navbar.value.style.setProperty('--light-y', `${event.clientY - rect.top + 215}px`)
  hovered.value = true
}
function showTooltip(event, item, index) {
  if (!opened.value || selectedIndex.value === index || rotating) return
  if (event.pointerType === 'touch') return
  if (event.type === 'focus' && !event.currentTarget.matches(':focus-visible')) return
  const rect = event.currentTarget.getBoundingClientRect()
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
  accountOpen.value = true
  await nextTick()
  navbar.value?.querySelector('.account-menu a')?.focus()
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
watch(selectedIndex, (index) => rotateTo(index, opened.value))
watch(
  () => route.fullPath,
  () => {
    accountOpen.value = false
  },
)
function motionChanged() {
  if (motionPreference.matches) rotateTo(selectedIndex.value, false)
}
onMounted(() => {
  motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
  motionPreference.addEventListener('change', motionChanged)
  rotateTo(selectedIndex.value, false)
  document.addEventListener('click', handlePageClick, true)
  document.addEventListener('keydown', escapeMenu)
})
onBeforeUnmount(() => {
  cancelAutoClose()
  cancelAnimationFrame(frame)
  motionPreference?.removeEventListener('change', motionChanged)
  document.removeEventListener('click', handlePageClick, true)
  document.removeEventListener('keydown', escapeMenu)
})
</script>

<template>
  <nav
    ref="navbar"
    class="orbit-navbar"
    :class="{ 'is-open': opened, 'is-hovered': hovered }"
    aria-label="Main navigation"
    @pointermove="moveLight"
    @pointerleave="hovered = false"
  >
    <div id="radial-navigation" class="radial-panel" :inert="!opened" :aria-hidden="!opened">
      <svg width="0" height="0" class="ring-definition" aria-hidden="true">
        <defs>
          <clipPath id="navbar-donut" clipPathUnits="objectBoundingBox">
            <path
              clip-rule="evenodd"
              d="M1 .5 A.5 .5 0 1 0 0 .5 A.5 .5 0 1 0 1 .5 Z M.8 .5 A.3 .233 0 1 0 .2 .5 A.3 .233 0 1 0 .8 .5 Z"
            />
          </clipPath>
        </defs>
      </svg>
      <div class="nav-surface" aria-hidden="true"><div class="nav-light"></div></div>
      <ul class="orbit-items">
        <li
          v-for="(item, index) in entries"
          :key="item.key"
          class="orbit-slot"
          :style="position(index)"
        >
          <component
            :is="item.children ? 'button' : RouterLink"
            :to="item.children ? undefined : { name: item.name }"
            :type="item.children ? 'button' : undefined"
            class="orbit-option"
            :class="{ 'is-selected': selectedIndex === index }"
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
            <NavIcon :name="item.key" />
            <span class="orbit-label" aria-hidden="true">{{ item.label }}</span>
          </component>
        </li>
      </ul>
      <Transition name="account">
        <ul v-if="accountOpen && account" id="account-navigation" class="account-menu">
          <li v-for="child in account.children" :key="child.name">
            <RouterLink :to="{ name: child.name }" @click="selectDestination"
              ><NavIcon :name="String(child.name)" />{{ child.meta.navLabel }}</RouterLink
            >
          </li>
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
  position: fixed;
  z-index: 1000;
  top: 0;
  left: 50%;
  width: min(640px, calc(100% - 16px));
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
  height: 215px;
  opacity: 0;
  visibility: hidden;
  transform: translateY(-50px) scale(0.16);
  transform-origin: 50% 36px;
  transition:
    transform 560ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 260ms ease,
    visibility 560ms;
}
.is-open .radial-panel {
  opacity: 1;
  visibility: visible;
  transform: translateY(0) scale(1);
}
.nav-surface {
  position: absolute;
  top: -215px;
  width: 100%;
  height: 430px;
  clip-path: url(#navbar-donut);
  overflow: hidden;
  background: #164b35;
  pointer-events: auto;
}
.ring-definition {
  position: absolute;
}
.nav-light {
  position: absolute;
  inset: 0;
  opacity: 0;
  background: radial-gradient(
    circle 135px at var(--light-x) var(--light-y),
    rgb(207 255 223 / 28%),
    transparent 76%
  );
  transition: opacity 180ms ease;
}
.is-hovered .nav-light {
  opacity: 1;
}
.orbit-items {
  margin: 0;
  padding: 0;
  list-style: none;
}
.orbit-slot {
  position: absolute;
  left: calc(50% + var(--orbit-x) * 42%);
  top: calc(19px + var(--orbit-y) * 132px);
  width: 48px;
  height: 48px;
  transform: translate(-50%, -50%);
}
.orbit-option {
  position: relative;
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 50%;
  background: transparent;
  color: #fff;
  cursor: pointer;
  text-decoration: none;
  pointer-events: auto;
  transition:
    background-color 220ms ease,
    color 220ms ease,
    border-color 220ms ease;
}
.orbit-option .nav-icon {
  width: 23px;
  height: 23px;
  transition: transform 560ms cubic-bezier(0.22, 1, 0.36, 1);
}
.orbit-option:hover {
  background: rgb(0 20 9 / 24%);
  color: #fff;
}
.orbit-option.is-selected {
  background: #d9f1de;
  color: #164b35;
  border-color: rgb(255 255 255 / 60%);
  box-shadow: 0 0 24px rgb(186 255 206 / 15%);
}
.orbit-option.is-selected .nav-icon {
  transform: scale(1.15);
}
.orbit-label {
  position: absolute;
  top: 55px;
  left: 50%;
  width: 156px;
  transform: translate(-50%, -5px);
  color: #e4f7e9;
  font-size: 11px;
  font-weight: 600;
  text-align: center;
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 260ms ease,
    transform 560ms ease;
}
.is-selected .orbit-label {
  opacity: 1;
  transform: translate(-50%, 0);
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
.orbit-option:focus-visible,
.nav-toggle:focus-visible,
.account-menu a:focus-visible {
  outline: 2px solid #b3e9c4;
  outline-offset: 4px;
}
.account-menu {
  position: absolute;
  top: 229px;
  left: 50%;
  transform: translateX(-50%);
  width: 190px;
  margin: 0;
  padding: 7px;
  list-style: none;
  border: 1px solid rgb(255 255 255 / 15%);
  border-radius: 16px;
  background: #164b35;
  box-shadow: 0 10px 26px rgb(10 42 29 / 22%);
  pointer-events: auto;
}
.account-menu a {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 12px;
  border-radius: 10px;
  color: #fff;
  text-decoration: none;
}
.account-menu a:hover {
  background: #103b2a;
}
.account-menu a.router-link-exact-active {
  background: #d9f1de;
  color: #164b35;
}
.account-enter-active,
.account-leave-active {
  transition:
    opacity 200ms ease,
    translate 200ms ease;
}
.account-enter-from,
.account-leave-to {
  opacity: 0;
  translate: 0 -8px;
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
@media (max-width: 480px) {
  .orbit-option,
  .orbit-slot {
    width: 44px;
    height: 44px;
  }
  .orbit-option .nav-icon {
    width: 21px;
    height: 21px;
  }
  .orbit-label {
    top: 51px;
    width: 142px;
  }
}
@media (prefers-reduced-motion: reduce) {
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
