<script setup>
import { RouterLink } from 'vue-router'
import HomeFridge from '../components/HomeFridge.vue'
</script>

<template>
  <section class="home-page" aria-label="Home">
    <div class="home-shell">
      <div class="home-hero">
        <div class="hero-copy">
          <p class="kitchen-tag">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="m15 3 1.5 4.5L21 9l-4.5 1.5L15 15l-1.5-4.5L9 9l4.5-1.5ZM6 13l1 3 3 1-3 1-1 3-1-3-3-1 3-1Z"
              /></svg
            >Your kitchen sidekick
          </p>
          <h1>
            <span>Eat fresh.</span><span class="underlined">Waste less.</span
            ><span>Share the rest.</span>
          </h1>
          <p class="hero-description">
            Keep track of what’s in the fridge, cook before it expires, and pass extras to a
            neighbour who can use them.
          </p>
          <div class="hero-actions">
            <RouterLink :to="{ name: 'scanning' }" class="home-button button-scan">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 6h4l2-3h4l2 3h4a1 1 0 0 1 1 1v13H3V7a1 1 0 0 1 1-1Z" />
                <circle cx="12" cy="12" r="4" />
              </svg>
              Scan my groceries
            </RouterLink>
            <RouterLink :to="{ name: 'food-rescue' }" class="home-button button-donate">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 21 3.8 12.8C-2 7 6 0 12 7c6-7 14 0 8.2 5.8Z" />
              </svg>
              Donate extra food
            </RouterLink>
          </div>
        </div>
        <div class="hero-illustration"><HomeFridge /></div>
      </div>

      <div class="snapshot" aria-label="Example kitchen snapshot">
        <RouterLink :to="{ name: 'fridge' }" class="snapshot-card snapshot-soon">
          <span class="snapshot-icon"
            ><svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="8" />
              <path d="M12 7v5l3 2" /></svg
          ></span>
          <div>
            <strong class="snapshot-number">4</strong>
            <p><b>use soon</b><span> · before Friday</span></p>
          </div>
        </RouterLink>
        <RouterLink :to="{ name: 'analytics' }" class="snapshot-card snapshot-saved">
          <span class="snapshot-icon"
            ><svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 19C5 10 11 5 20 4c-1 9-6 15-15 15Zm0 0 8-8" /></svg
          ></span>
          <div>
            <strong class="snapshot-number">8.4 kg</strong>
            <p><b>food saved</b><span> · this month</span></p>
          </div>
        </RouterLink>
        <RouterLink :to="{ name: 'food-rescue' }" class="snapshot-card snapshot-community">
          <span class="snapshot-icon"
            ><svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M10 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm9-1a3 3 0 0 1-3 3 M2 21v-3a5 5 0 0 1 10 0v3m3-7a5 5 0 0 1 5 5v2"
              /></svg
          ></span>
          <div>
            <strong class="snapshot-number">38</strong>
            <p><b>local rescuers</b><span> · in your area</span></p>
          </div>
        </RouterLink>
      </div>
    </div>
  </section>
</template>

<style scoped>
.home-page {
  min-height: 100svh;
  padding: clamp(80px, 5vw, 96px) clamp(24px, 4.4vw, 80px) 24px;
  color: var(--ink);
  background-color: #eafaf7;
  background-image:
    linear-gradient(rgb(33 144 133 / 7%) 1px, transparent 1px),
    linear-gradient(90deg, rgb(33 144 133 / 7%) 1px, transparent 1px);
  background-size: 32px 32px;
  font-family: var(--font-sans);
}
:global(body:has(.home-page)) {
  padding-bottom: 0;
}
.home-shell {
  max-width: 1640px;
  margin: 0 auto;
}
.home-hero {
  display: grid;
  grid-template-columns: 1.06fr 1fr;
  align-items: center;
  gap: 4vw;
}
.hero-copy {
  position: relative;
  z-index: 1;
}
.kitchen-tag {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  margin: 0 0 26px;
  padding: 11px 17px;
  border: 2px solid var(--ink);
  border-radius: 5px;
  background: #ffe16a;
  box-shadow: 2px 2px 0 var(--ink);
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.kitchen-tag svg {
  width: 17px;
  height: 20px;
}
.home-page svg {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex-shrink: 0;
}
h1 {
  position: relative;
  isolation: isolate;
  margin: 0 0 38px;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: clamp(3.1rem, 5.4vw, 6.2rem);
  line-height: 0.98;
  letter-spacing: -0.03em;
}
h1 > span {
  display: block;
  width: fit-content;
}
.underlined {
  position: relative;
}
.underlined::after {
  content: '';
  position: absolute;
  z-index: -1;
  left: -4px;
  right: -5px;
  bottom: -0.06em;
  height: 0.16em;
  border-radius: 50%;
  background: #72d7cc;
  transform: rotate(-1deg);
}
.hero-description {
  max-width: 720px;
  margin: 0 0 40px;
  font-size: clamp(1.15rem, 1.35vw, 1.45rem);
  line-height: 1.65;
  color: #366e6a;
}
.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
}
.home-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 68px;
  padding: 15px 27px;
  border: 3px solid var(--ink);
  border-radius: 16px;
  box-shadow: 4px 5px 0 var(--ink);
  text-decoration: none;
  font-size: 1.25rem;
  font-weight: 700;
  transition:
    transform 160ms ease,
    box-shadow 160ms ease;
}
.home-button svg {
  width: 24px;
  height: 24px;
}
.button-scan {
  background: #0fa89c;
  color: #fff;
}
.button-donate {
  background: #ffe16a;
  color: var(--ink);
}
.button-scan:hover {
  color: #fff;
  background: #0b968b;
}
.button-donate:hover {
  color: var(--ink);
  background: #ffdb4f;
}
.home-button:hover {
  transform: translate(2px, 2px);
  box-shadow: 2px 3px 0 var(--ink);
}
.home-button:active {
  transform: translate(4px, 5px);
  box-shadow: none;
}
.snapshot {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 22px;
  margin-top: clamp(56px, 5vw, 88px);
}
.snapshot-card {
  display: flex;
  align-items: center;
  gap: 22px;
  min-height: 134px;
  padding: 21px 26px;
  border: 3px solid var(--ink);
  border-radius: 26px;
  box-shadow: 6px 8px 0 var(--ink);
  color: var(--ink);
  text-decoration: none;
  transition:
    translate 160ms ease,
    box-shadow 160ms ease;
}
.snapshot-card:hover {
  color: var(--ink);
  translate: 0 -3px;
  box-shadow: 6px 11px 0 var(--ink);
}
.snapshot-soon {
  background: #cef3ed;
}
.snapshot-saved {
  background: #e7f5ac;
  transform: rotate(-1deg);
}
.snapshot-community {
  background: #ffd2ca;
  transform: rotate(1deg);
}
.snapshot-icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 52px;
  height: 52px;
  border: 2px solid var(--ink);
  border-radius: 50%;
  background: #fff;
}
.snapshot-icon svg {
  width: 26px;
  height: 26px;
}
.snapshot-number {
  display: block;
  margin-bottom: 6px;
  font-family: var(--font-display);
  font-size: 2.45rem;
  line-height: 1.15;
}
.snapshot-card p {
  margin: 0;
  font-size: 1.2rem;
}
.snapshot-card p span {
  color: var(--muted);
}
.snapshot-note {
  margin: 22px 0 0;
  color: var(--muted);
  font-size: 0.85rem;
  text-align: center;
}
.home-button:focus-visible,
.snapshot-card:focus-visible {
  outline: 3px solid #1f7d74;
  outline-offset: 7px;
}
@media (max-width: 1100px) {
  .home-hero {
    gap: 24px;
  }
  .hero-actions {
    gap: 14px;
  }
  .home-button {
    padding: 13px 18px;
    font-size: 1.1rem;
    min-height: 60px;
  }
  .snapshot-card {
    gap: 14px;
    padding: 18px;
  }
  .snapshot-card p {
    font-size: 1.05rem;
  }
}
@media (max-width: 850px) {
  .home-hero {
    grid-template-columns: 1fr;
  }
  h1 {
    font-size: clamp(3.5rem, 8.5vw, 5rem);
  }
  .hero-illustration {
    max-width: 560px;
    width: 100%;
    margin: 10px auto 0;
  }
  .snapshot {
    grid-template-columns: 1fr;
    gap: 22px;
    margin-top: 38px;
  }
  .snapshot-card {
    min-height: 112px;
  }
  .snapshot-card p {
    font-size: 1.2rem;
  }
}
@media (max-width: 480px) {
  .home-page {
    padding: 86px 22px 24px 18px;
  }
  .kitchen-tag {
    font-size: 13px;
    margin-bottom: 26px;
    padding: 9px 12px;
  }
  h1 {
    font-size: clamp(2.45rem, 10.8vw, 3.5rem);
    margin-bottom: 28px;
  }
  .hero-description {
    font-size: 1.15rem;
    margin-bottom: 28px;
  }
  .hero-actions {
    flex-direction: column;
    align-items: stretch;
  }
  .home-button {
    width: 100%;
  }
  .snapshot-card {
    padding: 18px;
    gap: 18px;
  }
  .snapshot-number {
    font-size: 2.1rem;
  }
  .snapshot-card p {
    font-size: 1.1rem;
  }
}
@media (prefers-reduced-motion: reduce) {
  .home-button,
  .snapshot-card {
    transition: none;
  }
}
</style>
