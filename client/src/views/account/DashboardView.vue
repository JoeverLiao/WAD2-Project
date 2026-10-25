<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'

import { useInventoryStore, storageAreas, isInArea } from '../../stores/inventory.js'
import { sampleRecipes } from '../../data/freshnessDemo.js'
import { getDaysRemaining, getExpiryStatus } from '../../utils/expiryUtils.js'
import { matchRecipes } from '../../utils/recipeUtils.js'
import { useAuthStore } from '../../stores/auth.js'

const authStore = useAuthStore()
const { user, isAuthenticated } = storeToRefs(authStore)

// Same items + area names as the Smart Fridge page
const { items } = storeToRefs(useInventoryStore())

// Every item tagged with its area title and days left, most urgent first
const allExpiryItems = computed(() => {
  const now = new Date()

  return items.value
    .map((item) => {
      const area = storageAreas.find((a) => isInArea(item, a))
      const days = getDaysRemaining(item.expiresAt, now)
      return { ...item, storageLabel: area?.title ?? item.storage, daysRemaining: days, status: getExpiryStatus(days) }
    })
    .sort((a, b) => {
      if (a.daysRemaining === null) return 1
      if (b.daysRemaining === null) return -1
      return a.daysRemaining - b.daysRemaining
    })
})

// Not expired yet, soonest first: still worth cooking
const urgentItems = computed(() => allExpiryItems.value.filter((i) => i.status === 'eat-soon' || i.status === 'fresh').slice(0, 3))

// Per-area summary for the storage cards
const areaSummaries = computed(() =>
  storageAreas.map((area) => {
    const areaItems = allExpiryItems.value.filter((i) => isInArea(i, area))
    const healthy = areaItems.filter((i) => i.status === 'fresh').length
    return {
      ...area,
      count: areaItems.length,
      healthyPercent: areaItems.length ? Math.round((healthy / areaItems.length) * 100) : null,
      expiringSoon: areaItems.filter((i) => i.status === 'eat-soon' || i.status === 'expired'),
    }
  }),
)

const recipes = computed(() => {
  const inventory = allExpiryItems.value.map((i) => ({
    name: i.name,
    quantity: i.quantity || 1,
    daysRemaining: i.daysRemaining,
    status: i.status,
  }))
  return matchRecipes(sampleRecipes, inventory)
})

// Pill copy + colour for the "time left" cards and expiry list
function useByLabel(days) {
  if (days === null) return 'No date'
  if (days < 0) return 'Expired'
  if (days === 0) return 'Use by today'
  if (days === 1) return 'Use by tomorrow'
  return `Use by in ${days} days`
}

function pillClass(days) {
  if (days === null) return 'pill-muted'
  return days <= 1 ? 'pill-coral' : 'pill-lime'
}
</script>

<template>
  <section aria-label="Dashboard" class="dashboard container-xl py-4">
      <!-- ================= HERO ================= -->
      <header class="hero row align-items-center g-4 mb-5">
        <div class="col-lg-7">
          <p class="eyebrow">
              ✿ {{ isAuthenticated && user?.name ? `${user.name.toUpperCase()}'S` : 'YOUR' }} KITCHEN AT A GLANCE
          </p>
          <h1 class="hero-title">
            Good food, <span class="scribble">well kept.</span>
          </h1>
          <p class="hero-sub">
            See what's in your storage, what needs eating soon,<br class="d-none d-md-inline" />
            and what you can cook with it tonight.
          </p>
        </div>

        <div class="col-lg-5 d-flex align-items-center justify-content-lg-end gap-4 flex-wrap">
          <div class="stamp">
            <svg class="stamp-heart" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" /></svg>
            <p class="stamp-title">{{ allExpiryItems.length }} items tracked.</p>
            <p class="stamp-sub">across {{ storageAreas.length }} storage areas</p>
          </div>
          <RouterLink :to="{ name: 'fridge' }" class="btn-cta">
            <span aria-hidden="true">+</span> Add food
          </RouterLink>
        </div>
      </header>

      <!-- ================= TIME LEFT PANEL ================= -->
      <section class="panel panel-tint mb-5" aria-labelledby="time-left-heading">
        <div class="d-flex align-items-start justify-content-between gap-3 mb-3">
          <div class="d-flex align-items-center gap-3">
            <span class="clock-badge" aria-hidden="true">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.5 1.5" /></svg>
            </span>
            <div>
              <h2 id="time-left-heading" class="panel-title">Quick Bites. Use them before they're gone!</h2>
              <p class="panel-sub">From your storage · Use them up first</p>
            </div>
          </div>
          <p class="scrawl d-none d-md-block">Let's save these! ↘</p>
        </div>

        <div v-if="urgentItems.length" class="row g-3">
          <div v-for="item in urgentItems" :key="item.id" class="col-md-4">
            <article class="item-card">
              <span class="item-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M5 19C5 10 11 5 20 4c-1 9-6 15-15 15Zm0 0 8-8" /></svg>
              </span>
              <div class="flex-grow-1 min-w-0">
                <h3 class="item-name">{{ item.name }}</h3>
                <p class="item-meta">Qty {{ item.quantity }}{{ item.unit ? ` ${item.unit}` : '' }} · {{ item.storageLabel }}</p>
                <span class="pill" :class="pillClass(item.daysRemaining)">{{ useByLabel(item.daysRemaining) }}</span>
              </div>
              <RouterLink :to="{ name: 'freshness-recipes', query: { search: item.name } }" class="link-arrow">
                Cook <span aria-hidden="true">→</span>
              </RouterLink>
            </article>
          </div>
        </div>
        <p v-else class="empty">Nothing urgent. Your fridge is in great shape!</p>
      </section>

      <div class="row g-4">
        <!-- ================= LEFT COLUMN ================= -->
        <div class="col-lg-7 d-flex flex-column gap-4">
          <h2 class="section-title">Your storage units</h2>

          <article v-for="area in areaSummaries" :key="area.id" class="panel storage-card">
            <div class="d-flex gap-3">
              <div class="preview-box" aria-hidden="true">{{ area.icon }}</div>

              <div class="flex-grow-1">
                <div class="d-flex justify-content-between align-items-start gap-2 mb-2">
                  <div>
                    <h3 class="storage-name">{{ area.title }}</h3>
                    <p class="area-meta">{{ area.count }} {{ area.count === 1 ? 'item' : 'items' }} · {{ area.subtitle }}</p>
                  </div>
                  <span v-if="area.healthyPercent !== null" class="pill pill-aqua">Healthy {{ area.healthyPercent }}%</span>
                </div>

                <p class="label">Expiring soon</p>
                <div v-if="area.expiringSoon.length" class="d-flex flex-wrap gap-2">
                  <RouterLink
                    v-for="item in area.expiringSoon"
                    :key="item.id"
                    :to="{ name: 'freshness-recipes', query: { search: item.name } }"
                    class="pill pill-coral pill-link"
                  >
                    {{ item.name }}
                  </RouterLink>
                </div>
                <p v-else class="empty m-0">{{ area.count ? 'None. Nice work!' : 'Empty for now.' }}</p>
              </div>
            </div>

            <div class="storage-foot">
              <RouterLink :to="{ name: 'fridge' }" class="link-arrow">
                Open {{ area.title }} <span aria-hidden="true">→</span>
              </RouterLink>
            </div>
          </article>

          <!-- Popular Recipes Block -->
          <section class="panel" aria-labelledby="recipes-heading">
            <h2 id="recipes-heading" class="panel-title mb-2">Popular recipes</h2>
            <ul class="recipe-list">
              <li v-for="recipe in recipes.slice(0, 3)" :key="recipe.id">
                <div>
                  <strong class="recipe-name">{{ recipe.name }}</strong>
                  <span class="recipe-meta">made by 5.2K</span>
                </div>
                <RouterLink :to="{ name: 'freshness-recipes', query: { id: recipe.id } }" class="link-arrow">
                  View <span aria-hidden="true">→</span>
                </RouterLink>
              </li>
            </ul>
          </section>
        </div>

        <!-- ================= RIGHT COLUMN ================= -->
        <div class="col-lg-5 d-flex flex-column gap-4">
          <h2 class="section-title">Expiry list</h2>

          <div class="panel p-0 expiry-wrap">
            <table class="expiry-table">
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">Storage</th>
                  <th scope="col">Qty</th>
                  <th scope="col"><span class="visually-hidden">Status</span></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in allExpiryItems" :key="item.id">
                  <td class="fw-bold">{{ item.name }}</td>
                  <td class="muted">{{ item.storageLabel }}</td>
                  <td>{{ item.quantity }}</td>
                  <td><span class="pill pill-sm" :class="pillClass(item.daysRemaining)">{{ useByLabel(item.daysRemaining) }}</span></td>
                </tr>
                <tr v-if="!allExpiryItems.length">
                  <td colspan="4" class="text-center py-4 muted">Your fridge is empty. Add some food to start tracking.</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Donation callout -->
          <section class="donate" aria-labelledby="donate-heading">
            <svg class="donate-heart" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" /></svg>
            <h2 id="donate-heading" class="donate-title">A little extra? <span class="scribble">Pass it on.</span></h2>
            <p class="donate-sub">Good food deserves a home, not a bin.</p>
            <RouterLink :to="{ name: 'food-rescue' }" class="btn-cta">
              Neighbour rescue <span aria-hidden="true">→</span>
            </RouterLink>
          </section>
        </div>
      </div>
  </section>
</template>

<style scoped>
.dashboard {
  max-width: 1200px;
}

svg {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* ---------- shared bits ---------- */
.panel {
  background: #fff;
  border: 2px solid var(--ink);
  border-radius: 20px;
  box-shadow: var(--shadow-paper);
  padding: 1.5rem;
}
.panel-tint {
  background: #e3f3ee;
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

.section-title {
  margin: 0;
  font-size: 2rem;
  font-weight: 700;
}

.label {
  margin: 0 0 6px;
  color: var(--muted);
  font-size: 0.95rem;
}
.empty {
  color: var(--muted);
}
.muted {
  color: var(--muted);
}

.pill {
  display: inline-block;
  padding: 3px 12px;
  border-radius: 999px;
  font-size: 0.95rem;
  line-height: 1.4;
  white-space: nowrap;
}
.pill-sm {
  padding: 1px 10px;
  font-size: 0.85rem;
}
.pill-coral {
  background: #fde0dc;
  color: #9a3a2e;
}
.pill-lime {
  background: var(--lime);
  color: #3f5a12;
}
.pill-aqua {
  background: var(--aqua-soft);
  color: #1f6e66;
}
.pill-muted {
  background: #eef1f0;
  color: var(--muted);
}
.pill-link {
  text-decoration: none;
  transition: transform 120ms ease;
}
.pill-link:hover {
  transform: translateY(-1px);
}

.link-arrow {
  color: #1f7d74;
  font-size: 1.1rem;
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
}
.link-arrow span {
  display: inline-block;
  transition: transform 150ms ease;
}
.link-arrow:hover span {
  transform: translateX(3px);
}

.btn-cta {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 14px 28px;
  border: 2px solid var(--ink);
  border-radius: 14px;
  background: #3e9a8e;
  color: #fff;
  font-size: 1.35rem;
  text-decoration: none;
  box-shadow: var(--shadow-paper);
  transition: transform 120ms ease, box-shadow 120ms ease;
}
.btn-cta:hover {
  color: #fff;
  transform: translate(2px, 3px);
  box-shadow: var(--shadow-small);
}
.btn-cta span:first-child {
  font-size: 1.8rem;
  line-height: 1;
}

.scribble {
  position: relative;
  white-space: nowrap;
}
.scribble::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -0.05em;
  height: 0.22em;
  border-radius: 999px;
  background: #9fdcd3;
  z-index: -1;
}

/* ---------- hero ---------- */
.hero {
  position: relative;
  isolation: isolate;
}
.eyebrow {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 0.5rem;
  color: #1f6e66;
  font-size: 1.05rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.eyebrow svg {
  width: 22px;
  height: 22px;
}
.hero-title {
  margin: 0 0 1rem;
  font-size: clamp(2.6rem, 6vw, 4.2rem);
  font-weight: 700;
}
.hero-sub {
  margin: 0;
  color: var(--muted);
  font-size: 1.35rem;
}

.stamp {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 260px;
  height: 190px;
  padding: 1rem;
  border: 2px dashed var(--line);
  border-radius: 50%;
  text-align: center;
  transform: rotate(-4deg);
}
.stamp-heart {
  width: 40px;
  height: 40px;
  color: #3e9a8e;
}
.stamp-title {
  margin: 0.25rem 0 0;
  font-family: var(--font-display);
  font-size: 1.6rem;
  font-weight: 700;
  line-height: 1.1;
}
.stamp-sub {
  margin: 0;
  color: var(--muted);
}

/* ---------- time-left panel ---------- */
.clock-badge {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 56px;
  height: 56px;
  border: 2px solid var(--ink);
  border-radius: 50%;
  background: var(--yellow);
}
.clock-badge svg {
  width: 28px;
  height: 28px;
}
.scrawl {
  margin: 0;
  color: var(--muted);
  font-family: var(--font-display);
  font-size: 1.4rem;
  transform: rotate(-4deg);
}

.item-card {
  display: flex;
  align-items: center;
  gap: 16px;
  height: 100%;
  padding: 1.1rem;
  border: 1.5px solid var(--line);
  border-radius: 16px;
  background: #fff;
}
.item-icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 72px;
  height: 72px;
  border-radius: 20px;
  background: var(--lime);
  color: var(--ink);
  transform: rotate(-4deg);
}
.item-icon svg {
  width: 38px;
  height: 38px;
}
.item-name {
  margin: 0;
  font-family: var(--font-sans);
  font-size: 1.4rem;
}
.item-meta {
  margin: 0 0 6px;
  color: var(--muted);
}
.min-w-0 {
  min-width: 0;
}

/* ---------- storage cards ---------- */
.storage-card {
  padding: 1.25rem;
}
.preview-box {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 96px;
  height: 96px;
  border: 1.5px solid var(--line);
  border-radius: 16px;
  background: var(--aqua-soft);
  color: #1f6e66;
}
.preview-box {
  font-size: 2.6rem;
}
.area-meta {
  margin: 0;
  color: var(--muted);
  font-size: 0.95rem;
}
.storage-name {
  margin: 0;
  font-family: var(--font-sans);
  font-size: 1.45rem;
}
.storage-foot {
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1.5px dashed var(--line);
  text-align: right;
}

/* ---------- recipes ---------- */
.recipe-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.recipe-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 0.7rem 0;
  border-bottom: 1.5px dashed var(--line);
}
.recipe-list li:last-child {
  border-bottom: none;
}
.recipe-name {
  font-size: 1.2rem;
}
.recipe-meta {
  margin-left: 8px;
  color: var(--muted);
}

/* ---------- expiry table ---------- */
.expiry-wrap {
  max-height: 480px;
  overflow: auto;
}
.expiry-table {
  width: 100%;
  border-collapse: collapse;
}
.expiry-table th {
  position: sticky;
  top: 0;
  padding: 14px 16px;
  background: var(--aqua-soft);
  border-bottom: 2px solid var(--ink);
  font-family: var(--font-display);
  font-weight: 700;
  text-align: left;
}
.expiry-table td {
  padding: 12px 16px;
  border-bottom: 1px solid #e3efec;
  vertical-align: middle;
}
.expiry-table tbody tr:last-child td {
  border-bottom: none;
}
.expiry-table tbody tr:hover {
  background: #f4fbf9;
}

/* ---------- donate callout ---------- */
.donate {
  position: relative;
  isolation: isolate;
  padding: 1.75rem 1.5rem;
  border: 2px dashed var(--line);
  border-radius: 20px;
  background: var(--paper-bright);
  text-align: center;
}
.donate-heart {
  width: 36px;
  height: 36px;
  color: #3e9a8e;
}
.donate-title {
  margin: 0.25rem 0;
  font-size: 1.8rem;
  font-weight: 700;
}
.donate-sub {
  margin: 0 0 1.1rem;
  color: var(--muted);
}

@media (max-width: 575.98px) {
  .stamp {
    width: 220px;
    height: 160px;
  }
  .stamp-title {
    font-size: 1.3rem;
  }
  .item-card {
    flex-wrap: wrap;
  }
}
</style>
