<script setup>
defineProps({ visible: Boolean, label: { type: String, default: 'Loading' } })
</script>
<template>
  <Teleport to="body">
            <div v-if="visible" class="shifting-food-overlay" role="status" aria-live="polite" :aria-label="label">
                <div class="shifting-food-card">
                    <img class="shifting-egg" src="/images/analytics/egg-waiting.png"
                        alt="" aria-hidden="true" width="180" height="190">
                    <strong>{{ label }}<span class="shifting-dots">…</span></strong>
                </div>
            </div>
  </Teleport>
</template>
<style scoped>
.shifting-food-overlay { position:fixed; inset:0; z-index:11000; display:grid; place-items:center; background:#e9faf655; backdrop-filter:blur(2px); cursor:progress; }
.shifting-food-card { display:flex; flex-direction:column; align-items:center; padding:18px 32px 26px; border:2px solid #234d50; border-radius:24px; background:#f6fffc; box-shadow:5px 6px 0 #234d5033; color:#234d50; }
.shifting-egg { width:180px; height:190px; object-fit:contain; transform-origin:50% 90%; }
.shifting-food-card strong { font-size:24px; }
@media (prefers-reduced-motion: no-preference) {
  .shifting-egg { animation: egg-waiting 2.4s ease-in-out infinite; }
  .shifting-dots { display:inline-block; animation: waiting-dots 1.2s ease-in-out infinite; }
}
@keyframes egg-waiting {
  0%, 100% { transform:rotate(-2deg); }
  50% { transform:translateY(-3px) rotate(2deg); }
}
@keyframes waiting-dots {
  0%, 100% { opacity:.35; }
  50% { opacity:1; }
}
</style>
