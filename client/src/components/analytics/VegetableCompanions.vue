<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { vegetableMessages, vegetableMood } from '../../utils/analyticsMascots.js'

const props = defineProps({ events: { type: Array, default: () => [] }, alwaysHappy: Boolean, messages: Array })
const layoutKey = 'full-circle-egg-layout'
const hidden = ref(false)
const layout = ref({ x: 0, y: 0, size: 100 })
try {
  hidden.value = localStorage.getItem('full-circle-egg-hidden') === 'true'
  const saved = JSON.parse(localStorage.getItem(layoutKey))
  if (saved && [saved.x, saved.y, saved.size].every(Number.isFinite)) {
    layout.value = { ...saved, size: Math.max(50, Math.min(150, saved.size)) }
  }
} catch { /* Browser storage can be unavailable. */ }

function saveLayout() {
  try { localStorage.setItem(layoutKey, JSON.stringify(layout.value)) } catch { /* Keep current settings. */ }
}

let gesture
let dragged = false
const held = ref(false)
const dragTilt = ref(0)
let swingFrame
function swingEgg(now) {
  if (!gesture || !held.value) return
  const dt = Math.min(.025, (now - (gesture.frameTime ?? now)) / 1000)
  gesture.frameTime = now
  const { angle, ax, ay } = gesture
  // Gravity pulls the egg down while acceleration at the grip swings it outward.
  const torque = ax * Math.cos(angle) - (30 - ay) * Math.sin(angle)
  gesture.spin = (gesture.spin + torque * dt) * Math.exp(-2.2 * dt)
  gesture.angle += gesture.spin * dt
  gesture.ax *= Math.exp(-14 * dt)
  gesture.ay *= Math.exp(-14 * dt)
  dragTilt.value = gesture.angle * 180 / Math.PI
  swingFrame = requestAnimationFrame(swingEgg)
}
onBeforeUnmount(() => cancelAnimationFrame(swingFrame))
const facingLeftSide = ref(false)
const eggButton = ref(null)
function updateFacing() {
  const bounds = eggButton.value?.[0]?.getBoundingClientRect()
  if (bounds) facingLeftSide.value = bounds.left + bounds.width / 2 < window.innerWidth / 2
}
function keepEggOnScreen() {
  const button = eggButton.value?.[0]
  if (!button || hidden.value) return
  const bounds = button.getBoundingClientRect()
  const fit = (start, end, limit) => Math.max(8 - start, Math.min(0, limit - 8 - end))
  layout.value.x += fit(bounds.left, bounds.right, window.innerWidth)
  layout.value.y += fit(bounds.top, bounds.bottom, window.innerHeight)
}
async function setEggHidden(value) {
  hidden.value = value
  if (value) dismissSpeech()
  try { localStorage.setItem('full-circle-egg-hidden', String(value)) } catch { /* Keep current visibility. */ }
  if (!value) {
    await nextTick()
    keepEggOnScreen()
  }
}
onMounted(() => {
  keepEggOnScreen()
  updateFacing()
  window.addEventListener('resize', keepEggOnScreen)
})
onBeforeUnmount(() => window.removeEventListener('resize', keepEggOnScreen))
watch(layout, updateFacing, { deep: true, flush: 'post' })
function grabEgg(event) {
  if (event.button !== 0) return
  dragged = false
  gesture = { id: event.pointerId, x: event.clientX, y: event.clientY,
    lastX: event.clientX, lastY: event.clientY, lastTime: event.timeStamp,
    vx: 0, vy: 0, ax: 0, ay: 0, angle: 0, spin: 0 }
  event.currentTarget.setPointerCapture(event.pointerId)
}
function moveEgg(event) {
  if (gesture?.id !== event.pointerId) return
  const dx = event.clientX - gesture.x
  const dy = event.clientY - gesture.y
  if (!dragged && Math.hypot(dx, dy) < 5) return
  dragged = true
  held.value = true
  const elapsed = Math.max(8, event.timeStamp - gesture.lastTime)
  const vx = (event.clientX - gesture.lastX) / elapsed
  const vy = (event.clientY - gesture.lastY) / elapsed
  const force = delta => Math.max(-180, Math.min(180, delta * 1100 / elapsed))
  gesture.ax = gesture.ax * .55 + force(vx - gesture.vx)
  gesture.ay = gesture.ay * .55 + force(vy - gesture.vy)
  gesture.vx = vx
  gesture.vy = vy
  gesture.lastX = event.clientX
  gesture.lastY = event.clientY
  gesture.lastTime = event.timeStamp
  if (swingFrame === undefined && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    swingFrame = requestAnimationFrame(swingEgg)
  }
  const bounds = event.currentTarget.getBoundingClientRect()
  const centerX = Math.max(bounds.width / 2, Math.min(window.innerWidth - bounds.width / 2, event.clientX))
  layout.value.x += centerX - bounds.left - bounds.width / 2
  // The grip point sits just inside the sprite's transparent top margin.
  const gripY = bounds.top + bounds.height * .1
  layout.value.y += event.clientY - gripY
}
function releaseEgg(event) {
  if (gesture?.id !== event.pointerId) return
  gesture = null
  held.value = false
  cancelAnimationFrame(swingFrame)
  swingFrame = undefined
  dragTilt.value = 0
  if (dragged) { keepEggOnScreen(); saveLayout() }
}
let resizeGesture
function startResize(event) {
  if (event.button !== 0) return
  event.currentTarget.setPointerCapture(event.pointerId)
  const width = eggButton.value[0].getBoundingClientRect().width
  resizeGesture = { id: event.pointerId, pointerX: event.clientX, pointerY: event.clientY, width, ...layout.value }
}
function resizeEgg(event) {
  if (resizeGesture?.id !== event.pointerId) return
  const start = resizeGesture
  const change = (event.clientY - start.pointerY - (event.clientX - start.pointerX)) / 2
  const size = Math.round(Math.max(50, Math.min(150, start.size * (1 + change / start.width))))
  const growth = start.width * (size / start.size - 1)
  layout.value = { size, x: start.x - growth / 2, y: start.y + growth / 2 }
}
function finishResize(event) {
  if (resizeGesture?.id !== event.pointerId) return
  resizeGesture = null
  saveLayout()
}
function resizeWithKey(event) {
  const changes = { ArrowUp: 5, ArrowRight: 5, ArrowDown: -5, ArrowLeft: -5 }
  if (!(event.key in changes)) return
  event.preventDefault()
  layout.value.size = Math.max(50, Math.min(150, layout.value.size + changes[event.key]))
  saveLayout()
}
const mood = computed(() => props.alwaysHappy ? { expression: 'happy' } : vegetableMood(props.events))
const receiptMessages = [
  'Keep the whole receipt inside the photo.',
  'Check quantities and dates before saving your groceries.',
  'No receipt handy? You can enter foods manually.',
  'Ready when you are! Let’s scan that receipt.',
  'Give your receipt good lighting for a clearer scan!',
  'Take a peek at the scanned items before adding them.',
]
const expressions = ['happy', 'smiling', 'sad', 'crying']
const characters = [
  { name: 'Egg mascot', row: 3 },
]
const reacting = ref(characters.map(() => false))
const activeCharacter = ref(null)
const message = ref('')
const lastMessages = new Map()
let speechTimer
function dismissSpeech() {
  clearTimeout(speechTimer)
  activeCharacter.value = null
  message.value = ''
}
watch(() => mood.value.expression, () => {
  reacting.value = characters.map(() => false)
  dismissSpeech()
})
let chatterTimer
onMounted(() => {
  chatterTimer = setInterval(() => {
    if (document.hidden || hidden.value || gesture || resizeGesture || message.value) return
    const bounds = eggButton.value?.[0]?.getBoundingClientRect()
    if (bounds && bounds.bottom > 0 && bounds.top < window.innerHeight) speak(0)
  }, 30000)
})
onBeforeUnmount(() => {
  clearInterval(chatterTimer)
  dismissSpeech()
})
function interact(index) {
  if (dragged) { dragged = false; return }
  speak(index)
}
async function speak(index) {
  dismissSpeech()
  const messages = props.messages || (props.alwaysHappy ? receiptMessages : vegetableMessages[mood.value.expression])
  const choices = messages.filter(text => text !== lastMessages.get(index))
  const pool = choices.length ? choices : messages
  if (!pool.length) return
  message.value = pool[Math.floor(Math.random() * pool.length)]
  lastMessages.set(index, message.value)
  activeCharacter.value = index
  speechTimer = setTimeout(dismissSpeech, 6000)
  reacting.value[index] = false
  await nextTick()
  reacting.value[index] = true
}
</script>

<template>
  <aside class="vegetable-companions" aria-label="Your egg companion" :data-mood="mood.expression" @keydown.esc="dismissSpeech">
    <button v-if="hidden" type="button" class="egg-restore" aria-label="Show Lil fella" @click="setEggHidden(false)">Lil fella</button>
    <div v-for="(character, index) in characters" v-show="!hidden" :key="character.name" class="companion" :class="`companion-${character.row}`"
      :style="{ transform: `translate(${layout.x}px, ${layout.y}px) scale(${layout.size / 100})` }">
      <button type="button" class="egg-close" aria-label="Hide egg companion" @click="setEggHidden(true)">×</button>
      <div class="companion-speech" role="status" aria-live="polite" aria-atomic="true">
        <span v-if="activeCharacter === index">{{ message }}</span>
      </div>
      <button ref="eggButton" type="button" class="vegetable-button" :class="{ held, mirrored: facingLeftSide, reacting: reacting[index], gloomy: ['sad', 'crying'].includes(mood.expression) }"
        :aria-label="`Talk to ${character.name}, feeling ${mood.expression}`"
        @pointerdown="grabEgg" @pointermove="moveEgg" @pointerup="releaseEgg" @pointercancel="releaseEgg" @lostpointercapture="releaseEgg"
        @click="interact(index)" @animationend.self="reacting[index] = false">
        <span class="vegetable-sprite" aria-hidden="true">
          <img v-show="held" class="egg-picked-up" :style="{ '--drag-tilt': (facingLeftSide ? -dragTilt : dragTilt) + 'deg' }"
            src="/images/analytics/egg-picked-up.png" alt="" draggable="false">
          <span
            v-for="(expression, column) in expressions"
            :key="expression"
            class="expression-frame"
            :class="{ 'is-current': mood.expression === expression && !held }"
            :style="{ backgroundPosition: `${column * 100 / 3}% ${character.row * 100 / 3}%` }"
          ></span>
        </span>
      </button>
      <button type="button" class="egg-resize-handle" role="slider" aria-label="Egg size"
        :aria-valuenow="layout.size" aria-valuemin="50" aria-valuemax="150"
        :aria-valuetext="layout.size + '%'"
        @pointerdown="startResize" @pointermove="resizeEgg" @pointerup="finishResize"
        @pointercancel="finishResize" @lostpointercapture="finishResize" @keydown="resizeWithKey">
        <span aria-hidden="true">⤢</span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.vegetable-companions { padding:0; }
.companion {
  position:fixed; right:max(12px, env(safe-area-inset-right)); bottom:max(12px, env(safe-area-inset-bottom));
  width:clamp(100px, 14vw, 200px); z-index:30;
}
.egg-close,.egg-restore {
  border:1px solid #6c9172; background:#f7fffa; color:#173d39;
  cursor:pointer;
}
.egg-close {
  position:absolute; top:0; right:0; z-index:3;
  width:28px; height:28px; padding:0; border-radius:50%; line-height:1;
}
.egg-restore {
  position:fixed; top:max(12px, env(safe-area-inset-top)); right:max(12px, env(safe-area-inset-right));
  z-index:30; border-radius:12px; padding:4px 9px; font-size:.8rem;
}
.companion-speech { position:absolute; bottom:calc(100% - 28px); left:50%; transform:translateX(-50%); width:min(100%, 260px); z-index:2; pointer-events:none; }
.companion-speech span { position:relative; display:block; padding:12px 16px; border:2px solid #6c9172; border-radius:20px; background:#fffff3; color:#294b3d; box-shadow:3px 4px 0 #57755122; font-size:clamp(14px, 1.1vw, 18px); font-weight:600; line-height:1.4; text-align:center; }
.companion-speech span::after { content:''; position:absolute; left:50%; bottom:-9px; width:15px; height:15px; border-right:2px solid #6c9172; border-bottom:2px solid #6c9172; background:#fffff3; transform:translateX(-50%) rotate(45deg); }
.vegetable-button { display:block; width:100%; aspect-ratio:1; padding:0; border:0; background:transparent; cursor:pointer; border-radius:40%; touch-action:manipulation; }
.vegetable-button:focus-visible { outline:3px solid #36776a; outline-offset:4px; }
.vegetable-button:hover .vegetable-sprite { filter:drop-shadow(0 7px 5px #365c3733); }
.companion .vegetable-button { touch-action:none; cursor:grab; }
.companion .vegetable-button:active { cursor:grabbing; }
.egg-resize-handle {
  position:absolute; left:0; bottom:0; z-index:3;
  display:grid; place-items:center; width:30px; height:30px; padding:0;
  border:2px solid #173d39; border-radius:50%; background:#f7fffa; color:#173d39;
  font-size:18px; line-height:1; cursor:nesw-resize; touch-action:none;
}
.egg-resize-handle:focus-visible { outline:2px solid #173d39; outline-offset:3px; }
.companion:not(:hover):not(:focus-within) :is(.egg-close,.egg-resize-handle) {
  opacity:0;
  pointer-events:none;
}
.egg-picked-up { position:absolute; inset:0; width:100%; height:100%; object-fit:contain; object-position:top center; scale:-1 1; pointer-events:none; }
@media (prefers-reduced-motion: no-preference) {
  .egg-picked-up {
    transform-origin:50% 10%;
    rotate:var(--drag-tilt, 0deg);
  }
}
.vegetable-button.held .expression-frame { transition:none; }
.vegetable-sprite { position:relative; display:block; width:100%; height:100%; animation:vegetable-sway 4.2s ease-in-out infinite; transform-origin:50% 90%; }
.vegetable-button .vegetable-sprite { transition:scale .28s ease, translate .2s ease, rotate .2s ease, filter .2s ease; }
.vegetable-button.mirrored .vegetable-sprite { scale:-1 1; }
.vegetable-button.held .vegetable-sprite {
  animation:none;
  filter:drop-shadow(0 16px 8px #173d3966);
}
.companion:has(.vegetable-button.held) { z-index:30; }
.expression-frame {
  position:absolute;
  inset:0;
  background:url('/images/analytics/food-companions-expressions.png') no-repeat;
  /* The egg's raised hand extends above the last quarter of the sheet. */
  background-size:400% 384%;
  opacity:0;
  transition:opacity 320ms ease-in-out;
}
.expression-frame.is-current { opacity:1; }
.companion-3 .vegetable-sprite { animation-delay:-3s; }
.vegetable-button.reacting { animation:vegetable-bounce .7s ease-in-out; }
.vegetable-button.reacting.gloomy { animation:vegetable-shake .6s ease-in-out; }
@media(max-width:767.98px) {
  .vegetable-companions { padding:0; }
  .companion-3 {
    width:clamp(80px, 23vw, 120px);
    z-index:15;
  }
  .companion-speech {
    right:0;
    left:auto;
    width:min(240px, calc(100vw - 24px));
    transform:none;
  }
  .companion-speech span::after { left:auto; right:28px; }
}
@keyframes vegetable-sway { 0%,100% { transform:rotate(-4deg); } 50% { transform:rotate(4deg); } }
@keyframes vegetable-bounce { 0%,100% { transform:translateY(0); } 25%,65% { transform:translateY(-24px); } 45%,85% { transform:translateY(0); } }
@keyframes vegetable-shake { 0%,100% { transform:translateX(0); } 20%,60% { transform:translateX(-8px) rotate(-4deg); } 40%,80% { transform:translateX(8px) rotate(4deg); } }
@media(prefers-reduced-motion:reduce) {
  .vegetable-sprite,.vegetable-button.reacting,.vegetable-button.reacting.gloomy { animation:none; }
  .expression-frame { transition:none; }
  .vegetable-button .vegetable-sprite { transition:none; }
}
</style>
