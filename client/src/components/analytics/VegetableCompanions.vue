<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { vegetableMessages, vegetableMood } from '../../utils/analyticsMascots.js'

const props = defineProps({ events: { type: Array, required: true } })
const mood = computed(() => vegetableMood(props.events))
const expressions = ['happy', 'smiling', 'sad', 'crying']
const characters = [
  { name: 'Carrot', row: 0 },
  { name: 'Broccoli', row: 1 },
  { name: 'Bell pepper', row: 2 },
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
  const choices = vegetableMessages[mood.value.expression].filter(text => text !== lastMessages.get(index))
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
  <aside class="vegetable-companions" aria-label="Your food impact companions" :data-mood="mood.expression" @keydown.esc="dismissSpeech">
    <div v-for="(character, index) in characters" :key="character.name" class="companion" :class="`companion-${index}`">
      <div class="companion-speech" role="status" aria-live="polite" aria-atomic="true">
        <span v-if="activeCharacter === index">{{ message }}</span>
      </div>
      <button type="button" class="vegetable-button" :class="{ reacting: reacting[index], gloomy: ['sad', 'crying'].includes(mood.expression) }"
        :aria-label="`Talk to ${character.name}, feeling ${mood.expression}`"
        @click="interact(index)" @animationend.self="reacting[index] = false">
        <span class="vegetable-sprite" aria-hidden="true" :style="{ backgroundPosition: `${expressions.indexOf(mood.expression) * 100 / 3}% ${character.row * 100 / 3}%` }"></span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.vegetable-companions { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); justify-items:center; gap:20px; padding:32px 0; }
.companion { position:relative; width:min(100%, clamp(169px, 20.8vw, 416px)); }
.companion-speech { position:absolute; bottom:calc(100% - 28px); left:50%; transform:translateX(-50%); width:min(100%, 260px); z-index:2; pointer-events:none; }
.companion-speech span { position:relative; display:block; padding:12px 16px; border:2px solid #6c9172; border-radius:20px; background:#fffff3; color:#294b3d; box-shadow:3px 4px 0 #57755122; font-size:clamp(14px, 1.1vw, 18px); font-weight:600; line-height:1.4; text-align:center; }
.companion-speech span::after { content:''; position:absolute; left:50%; bottom:-9px; width:15px; height:15px; border-right:2px solid #6c9172; border-bottom:2px solid #6c9172; background:#fffff3; transform:translateX(-50%) rotate(45deg); }
.vegetable-button { display:block; width:100%; aspect-ratio:1; padding:0; border:0; background:transparent; cursor:pointer; border-radius:40%; touch-action:manipulation; }
.vegetable-button:focus-visible { outline:3px solid #36776a; outline-offset:4px; }
.vegetable-button:hover .vegetable-sprite { filter:drop-shadow(0 7px 5px #365c3733); }
.vegetable-sprite { display:block; width:100%; height:100%; background-image:url('/images/analytics/food-companions-expressions.png'); background-size:400% 400%; background-repeat:no-repeat; animation:vegetable-sway 4.2s ease-in-out infinite; transform-origin:50% 90%; }
.companion-1 .vegetable-sprite { animation-delay:-2.1s; }
.companion-1 .vegetable-sprite { clip-path:inset(3% 0 0); }
.companion-2 .vegetable-sprite { animation-delay:-1s; clip-path:inset(0 0 8%); }
.companion-3 .vegetable-sprite { animation-delay:-3s; }
.vegetable-button.reacting { animation:vegetable-bounce .7s ease-in-out; }
.vegetable-button.reacting.gloomy { animation:vegetable-shake .6s ease-in-out; }
@media(min-width:1200px) {
  .vegetable-companions { padding:0; }
  .companion { position:fixed; z-index:15; }
  .companion-0,.companion-1 { left:1vw; }
  .companion-2,.companion-3 { right:1vw; }
  .companion-0,.companion-2 { top:12vh; }
  .companion-1,.companion-3 { top:56vh; }
}
@keyframes vegetable-sway { 0%,100% { transform:rotate(-4deg); } 50% { transform:rotate(4deg); } }
@keyframes vegetable-bounce { 0%,100% { transform:translateY(0); } 25%,65% { transform:translateY(-24px); } 45%,85% { transform:translateY(0); } }
@keyframes vegetable-shake { 0%,100% { transform:translateX(0); } 20%,60% { transform:translateX(-8px) rotate(-4deg); } 40%,80% { transform:translateX(8px) rotate(4deg); } }
@media(prefers-reduced-motion:reduce) { .vegetable-sprite,.vegetable-button.reacting,.vegetable-button.reacting.gloomy { animation:none; } }
</style>
