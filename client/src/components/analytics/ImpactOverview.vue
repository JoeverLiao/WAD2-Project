<script setup>
import { computed, useId } from 'vue'

const props = defineProps({
  totals: { type: Object, required: true },
  animatedTotals: Object,
  periodChange: Function,
  demo: Boolean,
})
const headingId = useId()
const animatedTotals = computed(() => props.animatedTotals ?? props.totals)
const currency = new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD' })
</script>

<template>
    <section class="panel panel-tint impact-overview" :aria-labelledby="headingId">
      <div class="d-flex align-items-start justify-content-between gap-3 mb-3">
        <div>
          <h2 :id="headingId" class="panel-title">Your impact at a glance</h2>
          <p class="panel-sub">Small habits. Good food. A little less waste.</p>
          <p v-if="demo" class="panel-sub"><small>Demo data</small></p>
        </div>
        <p class="scrawl d-none d-md-block">Every little bit counts! ↘</p>
      </div>
      <div class="row g-3">
        <div class="col-6 col-lg-3">
          <article class="metric-card">
            <span class="metric-icon icon-lime"
              ><svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 19C5 10 11 5 20 4c-1 9-6 15-15 15Zm0 0 8-8" /></svg
            ></span>
            <h3 class="metric-label">Food kept from waste</h3>
            <strong class="metric-value" :aria-label="`${totals.saved.toFixed(2)} kg`"
              ><span aria-hidden="true">{{ animatedTotals.saved.toFixed(2) }} kg</span></strong
            >
            <p class="metric-note">Consumed, shared and rescued</p>
            <p
              v-if="periodChange"
              :key="periodChange('saved').text"
              class="period-change"
              :class="`change-${periodChange('saved').tone}`"
            >
              {{ periodChange('saved').text }}
            </p>
          </article>
        </div>
        <div class="col-6 col-lg-3">
          <article class="metric-card">
            <span class="metric-icon icon-coral"
              ><svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 7h16 M9 7V4h6v3 M6 7l1 14h10l1-14 M10 11v6 M14 11v6" /></svg
            ></span>
            <h3 class="metric-label">Food discarded</h3>
            <strong class="metric-value" :aria-label="`${totals.discarded.toFixed(2)} kg`"
              ><span aria-hidden="true">{{ animatedTotals.discarded.toFixed(2) }} kg</span></strong
            >
            <p
              class="discarded-cost"
              :aria-label="`${currency.format(totals.discardedValue)} discarded food value`"
            >
              <span aria-hidden="true">{{ currency.format(animatedTotals.discardedValue) }}</span>
              in food value
            </p>
            <p class="metric-note">Opportunities to reduce waste</p>
            <p
              v-if="periodChange"
              :key="periodChange('discarded').text"
              class="period-change"
              :class="`change-${periodChange('discarded').tone}`"
            >
              {{ periodChange('discarded').text }}
            </p>
          </article>
        </div>
        <div class="col-6 col-lg-3">
          <article class="metric-card">
            <span class="metric-icon icon-yellow"
              ><svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M15 8h-4a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4H9 M12 6v12" /></svg
            ></span>
            <h3 class="metric-label">Food value preserved</h3>
            <strong class="metric-value" :aria-label="currency.format(totals.value)"
              ><span aria-hidden="true">{{ currency.format(animatedTotals.value) }}</span></strong
            >
            <p class="metric-note">Recorded value of food kept from waste</p>
            <p
              v-if="periodChange"
              :key="periodChange('value').text"
              class="period-change"
              :class="`change-${periodChange('value').tone}`"
            >
              {{ periodChange('value').text }}
            </p>
          </article>
        </div>
        <div class="col-6 col-lg-3">
          <article class="metric-card">
            <span class="metric-icon icon-aqua"
              ><svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"
                /></svg
            ></span>
            <h3 class="metric-label">Community activity</h3>
            <strong class="metric-value" :aria-label="String(totals.community)"
              ><span aria-hidden="true">{{ Math.round(animatedTotals.community) }}</span></strong
            >
            <p class="metric-note">Sharing and rescue events</p>
            <p
              v-if="periodChange"
              :key="periodChange('community').text"
              class="period-change"
              :class="`change-${periodChange('community').tone}`"
            >
              {{ periodChange('community').text }}
            </p>
          </article>
        </div>
      </div>
    </section>
</template>

<style scoped>
.impact-overview {
  --line: #9acbc3;
  --lime: #dcef9a;
  --yellow-sticky: #fff6dc;
  --aqua-soft: #d4f0ec;
  color: var(--ink, #173d39);
  box-shadow: 6px 8px 0 var(--ink, #173d39);
}
.impact-overview .panel-title { font-family: var(--font-display); }
.metric-icon svg { fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.panel {
  background: #fff;
  border: 2px solid var(--ink);
  border-radius: 20px;
  box-shadow: var(--shadow-paper);
  padding: 1.5rem;
}
.impact-overview.panel-tint {
  background: #fff;
}
.panel-title {
  margin: 0;
  font-size: 1.7rem;
  font-weight: 700;
}
.panel-sub {
  margin: 0;
  color: var(--muted);
}
.scrawl {
  margin: 0;
  color: var(--muted);
  font-family: var(--font-display);
  font-size: 1.4rem;
  transform: rotate(-4deg);
}
.metric-card {
  height: 100%;
  padding: 1.2rem;
  border: 1.5px solid var(--line);
  border-radius: 16px;
  background: #fff;
}
.metric-icon {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  margin-bottom: 1rem;
  border-radius: 14px;
  transform: rotate(-4deg);
}
.metric-icon svg {
  width: 27px;
  height: 27px;
}
.icon-lime {
  background: var(--lime);
}
.icon-coral {
  background: #fde0dc;
  color: #9a3a2e;
}
.icon-yellow {
  background: var(--yellow-sticky);
}
.icon-aqua {
  background: var(--aqua-soft);
}
.metric-label {
  margin: 0 0 0.4rem;
  font-family: var(--font-sans);
  font-size: 1.05rem;
  font-weight: 400;
  color: var(--muted);
}
.metric-value {
  font-variant-numeric: tabular-nums;
  display: block;
  font-size: clamp(1.5rem, 3vw, 2rem);
  line-height: 1.2;
  margin-bottom: 0.4rem;
}
.metric-note {
  margin: 0;
  color: var(--muted);
  font-size: 0.9rem;
}
.discarded-cost {
  margin: 0.35rem 0;
  font-size: 1.15rem;
  font-weight: 700;
  color: #9a3a2e;
}
.period-change {
  display: inline-block;
  margin: 0.8rem 0 0;
  padding: 4px 9px;
  border-radius: 10px;
  font-size: 0.85rem;
}
.change-good {
  color: #24633f;
  background: #e5f3df;
}
.change-bad {
  color: #9a3a2e;
  background: #fde0dc;
}
.change-neutral {
  color: var(--muted);
  background: #eef4f2;
}
@media (max-width: 575px) {
  .panel { padding: 1rem; }
  .metric-card { padding: .8rem; }
}
</style>
