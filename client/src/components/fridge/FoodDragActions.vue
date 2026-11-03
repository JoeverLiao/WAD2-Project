<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  visible: Boolean,
  position: { type: Object, default: null },
  anchor: { type: Object, default: null },
  reaction: { type: String, default: '' },
  pending: Boolean,
  storageAction: { type: String, default: 'pantry' },
})
const emit = defineEmits(['action-drop'])
const face = ref(null)
const bin = ref(null)
const pantry = ref(null)
const hovered = ref('')
// Keep a vertical dock outside the source side, stable throughout the drag.
const dockPosition = computed(() => {
  if (!props.anchor || props.anchor.touch) return {}
  const width = window.innerWidth <= 480 ? 100 : 130
  const height = Math.min(window.innerHeight - 16, window.innerWidth <= 480 ? 400 : 480)
  const edge = props.anchor.edge ?? props.anchor.x
  const left = props.anchor.side === 'right' ? edge + 16 : edge - width - 16
  return {
    width: `${width}px`,
    left: `${Math.max(8, Math.min(window.innerWidth - width - 8, left))}px`,
    top: `${Math.max(8, Math.min(window.innerHeight - height - 8, props.anchor.y - height / 2))}px`,
    bottom: 'auto', transform: 'none',
  }
})
function near(element) {
  if (!props.position || !element) return false
  const rect = element.getBoundingClientRect()
  return props.position.x >= rect.left - 65 && props.position.x <= rect.right + 65
    && props.position.y >= rect.top - 80 && props.position.y <= rect.bottom + 30
}
const hungry = computed(() => hovered.value === 'consume' || near(face.value))
const binOpen = computed(() => hovered.value === 'discard' || near(bin.value))
const pantryOpen = computed(() => hovered.value === props.storageAction || near(pantry.value))
function drop(action, event) {
  hovered.value = ''
  if (!props.pending) emit('action-drop', action, event)
}
function leave(event) {
  if (!event.currentTarget.contains(event.relatedTarget)) hovered.value = ''
}
</script>

<template>
  <Teleport to="body">
    <Transition name="dock">
      <div v-if="visible" class="food-action-dock" :class="{ 'touch-action-dock': anchor?.touch }" :style="dockPosition" :aria-label="`Drop food to consume, discard or put in ${storageAction}`">
        <p class="dock-instruction" role="status">{{ pending ? 'Updating your inventory…' : reaction ? 'Inventory updated!' : 'Drop your food here' }}</p>
        <div class="dock-targets">
          <div ref="face" class="food-drop-target consume-target" :class="{ approaching: hungry, celebrating: reaction === 'consume', waiting: pending }"
            data-food-action="consume" @dragover.prevent="hovered = 'consume'" @dragenter.prevent="hovered = 'consume'" @dragleave="leave" @drop.prevent.stop="drop('consume', $event)">
            <svg viewBox="0 0 120 120" aria-hidden="true" class="target-art">
              <circle cx="60" cy="60" r="51" fill="#ffda67" stroke="#473d2b" stroke-width="4" />
              <ellipse cx="31" cy="67" rx="10" ry="6" fill="#f4a079" />
              <ellipse cx="89" cy="67" rx="10" ry="6" fill="#f4a079" />
              <path d="M34 44 Q41 35 48 44 M72 44 Q79 35 86 44" fill="none" stroke="#473d2b" stroke-width="5" stroke-linecap="round" />
              <g class="face-mouth">
                <path class="smile" d="M35 69 Q60 99 85 69" fill="#803e39" stroke="#473d2b" stroke-width="3" />
                <ellipse class="open-mouth" cx="60" cy="77" rx="25" ry="23" fill="#633633" stroke="#473d2b" stroke-width="3" />
                <ellipse class="tongue" cx="60" cy="91" rx="13" ry="6" fill="#ed8d8c" />
              </g>
            </svg>
            <strong>Consume</strong><small>{{ hungry ? 'Yum! Drop to eat' : 'Feed me your food' }}</small>
          </div>
          <div ref="bin" class="food-drop-target discard-target" :class="{ approaching: binOpen, celebrating: reaction === 'discard', waiting: pending }"
            data-food-action="discard" @dragover.prevent="hovered = 'discard'" @dragenter.prevent="hovered = 'discard'" @dragleave="leave" @drop.prevent.stop="drop('discard', $event)">
            <svg viewBox="0 0 120 120" aria-hidden="true" class="target-art">
              <path d="M28 43 H92 L85 107 Q60 116 35 107Z" fill="#b9d7d0" stroke="#354c48" stroke-width="4" />
              <path d="M47 55 L49 98 M60 55 V100 M73 55 L71 98" stroke="#6d9990" stroke-width="4" stroke-linecap="round" />
              <g class="bin-lid"><path d="M24 39 Q60 29 96 39 V45 H24Z" fill="#76aaa0" stroke="#354c48" stroke-width="4" stroke-linejoin="round" /><path d="M49 33 V24 Q60 18 71 24 V33" fill="none" stroke="#354c48" stroke-width="4" /></g>
            </svg>
            <strong>Discard</strong><small>{{ binOpen ? 'Drop into the bin' : 'Unsavable food only' }}</small>
          </div>
          <div ref="pantry" class="food-drop-target pantry-target" :class="{ approaching: pantryOpen, celebrating: reaction === storageAction, waiting: pending, 'fridge-target': storageAction === 'fridge' }"
            :data-food-action="storageAction" @dragover.prevent="hovered = storageAction" @dragenter.prevent="hovered = storageAction" @dragleave="leave" @drop.prevent.stop="drop(storageAction, $event)">
            <svg v-if="storageAction === 'fridge'" viewBox="0 0 120 120" aria-hidden="true" class="target-art">
              <rect x="22" y="10" width="76" height="100" rx="9" fill="#89b8cb" stroke="#355a71" stroke-width="4" />
              <path d="M28 43 H92 M28 76 H92" stroke="#e4f8ff" stroke-width="5" />
              <rect x="35" y="54" width="17" height="19" rx="4" fill="#b8ce8d" />
              <g class="pantry-door"><rect x="25" y="13" width="70" height="94" rx="6" fill="#d5edf5" stroke="#355a71" stroke-width="3" /><path d="M26 44 H94" stroke="#355a71" stroke-width="3" /><path d="M81 25 V35 M81 56 V74" stroke="#355a71" stroke-width="5" stroke-linecap="round" /></g>
            </svg>
            <svg v-else viewBox="0 0 120 120" aria-hidden="true" class="target-art">
              <rect x="20" y="15" width="80" height="94" rx="8" fill="#b88755" stroke="#57432f" stroke-width="4" />
              <path d="M25 48 H95 M25 79 H95" stroke="#ead3ad" stroke-width="5" />
              <rect x="34" y="28" width="17" height="18" rx="4" fill="#e5ac79" />
              <rect x="65" y="59" width="18" height="18" rx="4" fill="#b8ce8d" />
              <g class="pantry-door"><rect x="23" y="18" width="74" height="88" rx="6" fill="#edcc96" stroke="#57432f" stroke-width="3" /><path d="M34 30 H85 V92 H34Z" fill="none" stroke="#d1a96e" stroke-width="3" /><path d="M81 57 V69" stroke="#57432f" stroke-width="5" stroke-linecap="round" /></g>
            </svg>
            <strong>Put in {{ storageAction }}</strong><small>{{ pantryOpen ? 'Drop to store it' : storageAction === 'fridge' ? 'Move to the shelves' : 'Save it on the shelf' }}</small>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.food-action-dock { position:fixed; bottom:max(16px,env(safe-area-inset-bottom)); left:50%; transform:translateX(-50%); z-index:2000; width:min(440px,100%); max-height:calc(100dvh - 16px); overflow-y:auto; pointer-events:none; color:#243e37; text-align:center; }
.dock-instruction { display:inline-block; margin:0 0 5px; padding:5px 8px; background:#fffffff2; border-radius:30px; box-shadow:0 2px 15px #16382e20; font-size:16px; font-weight:800; }
.dock-targets { display:flex; flex-direction:column; align-items:center; gap:14px; }
.food-drop-target { display:flex; flex-direction:column; align-items:center; justify-content:flex-end; width:100%; box-sizing:border-box; padding:6px; border-radius:50%; pointer-events:auto; transition:background .2s,filter .2s; }
.target-art { width:72px; height:72px; overflow:visible; filter:drop-shadow(0 5px 6px #16382e30); animation:target-wiggle .7s ease-in-out infinite alternate; }
.food-drop-target strong { padding:3px 13px; border-radius:20px; background:#fff; font-size:16px; }
.food-drop-target small { margin-top:3px; padding:2px 6px; background:#fffffff0; border-radius:12px; font-size:14px; }
.approaching { background:#fff8ccbb; filter:drop-shadow(0 0 12px #e6be4e); }
.discard-target.approaching { background:#d5eee9bb; }
.pantry-target.approaching { background:#f6e1bbbb; }
.fridge-target.approaching { background:#d6f0ffbb; }
.pantry-door { transform-origin:23px 62px; transition:transform .25s ease; }
.pantry-target.approaching .pantry-door { transform:perspective(160px) rotateY(-65deg); }
.pantry-target.celebrating .pantry-door { animation:pantry-close .7s ease; }
.open-mouth,.tongue { opacity:0; transition:opacity .15s; }
.approaching .open-mouth,.approaching .tongue { opacity:1; }
.approaching .smile { opacity:0; }
.bin-lid { transform-origin:27px 43px; transition:transform .25s ease; }
.approaching .bin-lid { transform:rotate(-38deg) translateY(-4px); }
.celebrating .target-art { animation:happy-bounce .7s ease; }
.consume-target.celebrating .face-mouth { transform-origin:60px 78px; animation:chew .18s ease-in-out 5 alternate; }
.consume-target.celebrating .open-mouth,.consume-target.celebrating .tongue { opacity:1; }
.consume-target.celebrating .smile { opacity:0; }
.discard-target.celebrating .bin-lid { animation:bin-close .65s ease; }
.waiting { opacity:.8; }
.dock-enter-active,.dock-leave-active { transition:opacity .2s,translate .2s; }
.dock-enter-from,.dock-leave-to { opacity:0; translate:0 35px; }
@keyframes target-wiggle { from { transform:rotate(-4deg) translateY(-2px); } to { transform:rotate(4deg) translateY(2px); } }
@keyframes chew { from { transform:scaleY(1); } to { transform:scaleY(.25); } }
@keyframes happy-bounce { 0%,100% { transform:translateY(0); } 40% { transform:translateY(-14px) rotate(-5deg); } 70% { transform:translateY(-5px) rotate(5deg); } }
@keyframes bin-close { 0% { transform:rotate(-38deg); } 55% { transform:rotate(8deg); } 75% { transform:rotate(-8deg); } 100% { transform:rotate(0); } }
@keyframes pantry-close { 0% { transform:perspective(160px) rotateY(-65deg); } 70% { transform:perspective(160px) rotateY(8deg); } 100% { transform:perspective(160px) rotateY(0); } }
@media(max-width:480px) { .target-art { width:56px; height:56px; } .dock-targets { gap:10px; } .dock-instruction { font-size:13px; } .food-drop-target strong { font-size:14px; } .food-drop-target small { font-size:12px; } }
@media(prefers-reduced-motion:reduce) { *,*::before,*::after { animation:none!important; transition:none!important; } }
.touch-action-dock .dock-targets { flex-direction:row; align-items:stretch; gap:4px; }
.touch-action-dock .food-drop-target { flex:1; min-width:0; }
.touch-action-dock .target-art { width:44px; height:44px; }
.touch-action-dock .food-drop-target small { display:none; }
</style>
