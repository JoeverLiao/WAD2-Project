<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { vegetableMessages, vegetableMood } from '../../utils/analyticsMascots.js'

const props = defineProps({ events: { type: Array, default: () => [] }, alwaysHappy: Boolean })
const mood = computed(() => props.alwaysHappy ? { expression: 'happy' } : vegetableMood(props.events))
const receiptMessages = [
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
onBeforeUnmount(dismissSpeech)
async function interact(index) {
  dismissSpeech()
  const messages = props.alwaysHappy ? receiptMessages : vegetableMessages[mood.value.expression]
  const choices = messages.filter(text => text !== lastMessages.get(index))
  message.value = choices[Math.floor(Math.random() * choices.length)]
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
    <div v-for="(character, index) in characters" :key="character.name" class="companion" :class="`companion-${character.row}`">
      <div class="companion-speech" role="status" aria-live="polite" aria-atomic="true">
        <span v-if="activeCharacter === index">{{ message }}</span>
      </div>
      <button type="button" class="vegetable-button" :class="{ reacting: reacting[index], gloomy: ['sad', 'crying'].includes(mood.expression) }"
        :aria-label="`Talk to ${character.name}, feeling ${mood.expression}`"
        @click="interact(index)" @animationend.self="reacting[index] = false">
        <span class="vegetable-sprite" aria-hidden="true">
          <span
            v-for="(expression, column) in expressions"
            :key="expression"
            class="expression-frame"
            :class="{ 'is-current': mood.expression === expression }"
            :style="{ backgroundPosition: `${column * 100 / 3}% ${character.row * 100 / 3}%` }"
          ></span>
        </span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.vegetable-companions { display:grid; justify-items:center; padding:32px 0; }
.companion { position:relative; width:min(100%, clamp(169px, 20.8vw, 416px)); }
.companion-speech { position:absolute; bottom:calc(100% - 28px); left:50%; transform:translateX(-50%); width:min(100%, 260px); z-index:2; pointer-events:none; }
.companion-speech span { position:relative; display:block; padding:12px 16px; border:2px solid #6c9172; border-radius:20px; background:#fffff3; color:#294b3d; box-shadow:3px 4px 0 #57755122; font-size:clamp(14px, 1.1vw, 18px); font-weight:600; line-height:1.4; text-align:center; }
.companion-speech span::after { content:''; position:absolute; left:50%; bottom:-9px; width:15px; height:15px; border-right:2px solid #6c9172; border-bottom:2px solid #6c9172; background:#fffff3; transform:translateX(-50%) rotate(45deg); }
.vegetable-button { display:block; width:100%; aspect-ratio:1; padding:0; border:0; background:transparent; cursor:pointer; border-radius:40%; touch-action:manipulation; }
.vegetable-button:focus-visible { outline:3px solid #36776a; outline-offset:4px; }
.vegetable-button:hover .vegetable-sprite { filter:drop-shadow(0 7px 5px #365c3733); }
.vegetable-sprite { position:relative; display:block; width:100%; height:100%; animation:vegetable-sway 4.2s ease-in-out infinite; transform-origin:50% 90%; }
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
@media(min-width:1200px) {
  .vegetable-companions { padding:0; }
  .companion { position:fixed; z-index:15; }
  .companion-3 { right:1vw; top:56vh; }
}
@media(max-width:767.98px) {
  .vegetable-companions { padding:0; }
  .companion-3 {
    position:fixed;
    right:max(8px, env(safe-area-inset-right));
    bottom:max(8px, env(safe-area-inset-bottom));
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
}
</style>
