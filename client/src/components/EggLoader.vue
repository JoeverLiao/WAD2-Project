<script setup>
import CartoonEgg from './CartoonEgg.vue'

defineProps({ visible: Boolean, label: { type: String, default: 'Loading' } })
</script>
<template>
  <Teleport to="body">
            <div v-if="visible" class="shifting-food-overlay" role="status" aria-live="polite" :aria-label="label">
                <div class="shifting-food-card">
                    <CartoonEgg />
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
</style>
