<script setup>
defineProps({ visible: Boolean, label: { type: String, default: 'Loading' } })
</script>
<template>
  <Teleport to="body">
            <div v-if="visible" class="shifting-food-overlay" role="status" aria-live="polite" :aria-label="label">
                <div class="shifting-food-card">
                    <svg class="shifting-egg" viewBox="0 0 220 230" aria-hidden="true">
                        <ellipse cx="111" cy="215" rx="57" ry="8" fill="#183d3920" />
                        <g class="egg-legs" fill="#ffc95d" stroke="#234d50" stroke-width="4" stroke-linejoin="round">
                            <path d="M90 174 L81 199 L63 205 Q53 218 90 214 L103 183" />
                            <path d="M126 177 L140 199 L159 204 Q177 217 137 214 L113 185" />
                        </g>
                        <g class="egg-body" stroke="#234d50" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M65 110 Q32 112 32 68" fill="none" />
                            <g class="egg-wave" fill="#fff8de">
                                <path d="M32 76 Q19 65 17 56 Q16 50 22 51 L29 60 L25 39 Q25 32 30 35 L38 55 L40 37 Q43 31 46 38 L47 58 Q60 46 62 54 L49 72Z" />
                            </g>
                            <path d="M159 111 Q189 134 174 157 L153 150" fill="none" />
                            <path d="M110 24 C81 24 51 91 51 135 C51 199 168 203 171 137 C174 94 140 24 110 24Z" fill="#fff8de" />
                            <path d="M87 43 Q69 67 64 89" fill="none" stroke="#fff" stroke-width="8" />
                            <path d="M58 91 H164 M65 92 L70 115 Q87 128 99 112 L104 95 H117 L123 113 Q143 128 154 111 L158 92" fill="#183d39" />
                            <path d="M78 98 L83 104 M132 98 L137 104" stroke="#d5f7f5" stroke-width="3" />
                            <ellipse cx="75" cy="133" rx="10" ry="5" fill="#ffb5a1" stroke="none" />
                            <ellipse cx="149" cy="133" rx="10" ry="5" fill="#ffb5a1" stroke="none" />
                            <path d="M94 139 Q111 158 129 137 Q116 171 94 139Z" fill="#fff" />
                        </g>
                        <g class="egg-speed" fill="none" stroke="#65bbb4" stroke-width="4" stroke-linecap="round"><path d="M14 151 H35 M8 166 H30 M182 80 H204" /></g>
                    </svg>
                    <strong>{{ label }}<span class="shifting-dots">…</span></strong>
                </div>
            </div>
  </Teleport>
</template>
<style scoped>
.shifting-food-overlay { position:fixed; inset:0; z-index:11000; display:grid; place-items:center; background:#e9faf655; backdrop-filter:blur(2px); cursor:progress; }
.shifting-food-card { display:flex; flex-direction:column; align-items:center; padding:18px 32px 26px; border:2px solid #234d50; border-radius:24px; background:#f6fffc; box-shadow:5px 6px 0 #234d5033; color:#234d50; }
.shifting-egg { width:180px; height:190px; overflow:visible; }
.shifting-food-card strong { font-size:24px; }
.egg-body { transform-origin:110px 185px; animation:egg-strut .65s ease-in-out infinite alternate; }
.egg-wave { transform-origin:36px 73px; animation:egg-wave .45s ease-in-out infinite alternate; }
.egg-legs { transform-origin:110px 184px; animation:egg-step .65s ease-in-out infinite alternate; }
.egg-speed { animation:egg-speed .8s ease-in-out infinite; }
@keyframes egg-strut { from { transform:translateY(0) rotate(-4deg); } to { transform:translateY(-7px) rotate(4deg); } }
@keyframes egg-wave { from { transform:rotate(-12deg); } to { transform:rotate(18deg); } }
@keyframes egg-step { from { transform:skewX(-9deg); } to { transform:skewX(9deg); } }
@keyframes egg-speed { 0%,100% { opacity:.2; transform:translateX(4px); } 50% { opacity:1; transform:translateX(-4px); } }
@media(prefers-reduced-motion:reduce) { .shifting-egg * { animation:none!important; } }

</style>
