<script setup>
  import {ref, onMounted} from 'vue';
  import { storeToRefs } from 'pinia';
  import { useAuthStore } from '../../stores/auth.js'
  import FoodIcon from '../FoodIcon.vue'

const authStore = useAuthStore()
const { user, isAuthenticated } = storeToRefs(authStore)
</script>


<template>
    <div class="container py-4">
    <div class="bulletin-board-container my-4">
        <div class="tape-strip"></div>
        <div class="row align-items-center gy-4">
            <div class="col-12 col-lg-7 col-xl-6">
                <div class="eyebrow mb-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-heart" viewBox="0 0 16 16">
                        <path d="m8 2.748-.717-.737C5.6.281 2.514.878 1.4 3.053c-.523 1.023-.641 2.5.314 4.385.92 1.815 2.834 3.989 6.286 6.357 3.452-2.368 5.365-4.542 6.286-6.357.955-1.886.838-3.362.314-4.385C13.486.878 10.4.28 8.717 2.01zM8 15C-7.333 4.868 3.279-3.04 7.824 1.143q.09.083.176.171a3 3 0 0 1 .176-.17C12.72-3.042 23.333 4.867 8 15"/>
                    </svg>
                    {{ isAuthenticated && user?.name ? `${user.name.toUpperCase()}'S` : 'YOUR' }} COMMUNITY BOARD
                </div>
                <h1 class="hero-title mb-3" style="font-size: clamp(38px, 4.5vw, 60px);">
                    Got extra food?<br />
                    <span class="highlight-text">Share with your neighbours.</span>
                </h1>
                <p class="fs-5 text-muted mb-4">
                    Too much groceries or extra cooked food? Share with neighbours just down the block.
                </p>
                <div class="d-flex flex-wrap align-items-center gap-3">
                <button class="primary-button" @click="openModal('post')">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" class="bi bi-plus" viewBox="0 0 16 16">
                        <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4"/>
                    </svg>
                    Post item on board
                </button>
                <a href="#explore-map" class="secondary-button text-decoration-none">See what's nearby ↓</a>
                </div>
          </div>

          <div class="col-12 col-lg-12 col-xl-5 offset-xl-1 ">
            <div class="sticky-note-card">
              <div class="push-pin"></div>
              <div class="d-flex justify-content-between align-items-center mb-2">
              <h3 class="fs-4 fw-bold m-0" style="font-family: var(--font-display);">Expiring Today</h3>
              <span class="urgency-badge">2 Items Found</span>
            </div>
            
            <p class="small text-muted mb-3">These items urgently need rescuing near {street} right now:</p>

            <div class="d-flex flex-column gap-2 mb-3">
              <div class="p-2 bg-white rounded border border-dark d-flex align-items-center justify-content-between">
                <div>
                  <strong class="d-block small"><FoodIcon food="Sourdough" /> Fresh Sourdough Loaf</strong>
                  <span class="small text-muted">0.3 km away</span>
                </div>
                <button class="primary-button" @click="claimItem('Sourdough Loaf')">Quick Claim</button>
              </div>

              <div class="p-2 bg-white rounded border border-dark d-flex align-items-center justify-content-between">
                <div>
                  <strong class="d-block small"><FoodIcon food="Spinach" /> Fresh Spinach Bag</strong>
                  <span class="small text-muted">0.5 km away</span>
                </div>
                <button class="primary-button" @click="claimItem('Spinach Bag')">Quick Claim</button>
              </div>
            </div>

            <div class="p-2 bg-light border border-dark rounded text-center small fw-bold">
              Rescuing these would save {n} kg from the trash!
            </div>
          </div>

          </div>
        </div>
    </div>
    </div>
</template>



<style scoped>
   
    /* Hero Bulletin Board Container */
    .bulletin-board-container {
      background: var(--paper);
      border: 3px solid var(--ink);
      border-radius: 24px;
      padding: 36px;
      box-shadow: var(--shadow-paper);
      position: relative;
    }
    .tape-strip {
      position: absolute;
      top: -14px;
      left: 50%;
      transform: translateX(-50%) rotate(-3deg);
      width: 90px;
      height: 24px;
      background: rgba(255, 255, 255, 0.85);
      border: 1px dashed var(--muted);
      backdrop-filter: blur(2px);
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
      z-index: 10;
    }

    .push-pin {
      position: absolute;
      top: -12px;
      left: 50%;
      transform: translateX(-50%);
      width: 22px;
      height: 22px;
      background: var(--coral);
      border: 2px solid var(--ink);
      border-radius: 50%;
      box-shadow: 1px 2px 0 rgba(0,0,0,0.25);
      z-index: 10;
    }
    .push-pin::after {
      content: "";
      position: absolute;
      top: 3px;
      left: 4px;
      width: 6px;
      height: 6px;
      background: white;
      border-radius: 50%;
      opacity: 0.8;
    }

    .urgency-badge {
      background: #ff6b6b;
      color: white;
      border: 1.5px solid var(--ink);
      border-radius: 20px;
      padding: 2px 10px;
      font-size: 12px;
      font-weight: bold;
      animation: pulse 1.5s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.8; transform: scale(1.05); }
    }

    .sticky-note-card {
      background: var(--yellow-sticky);
      border: 3px solid var(--ink);
      border-radius: 20px;
      padding: 24px;
      box-shadow: 6px 8px 0 var(--ink);
      position: relative;
      animation: subtleFloat 6s ease-in-out infinite;
      transition: transform 250ms ease, box-shadow 250ms ease;
    }
    .sticky-note-card:hover {
      animation-play-state: paused;
      transform: rotate(0deg) translateY(-4px);
      box-shadow: 6px 10px 0 rgba(18, 63, 59, 0.2);
    }

    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      color: #11847b;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }
    .highlight-text {
      position: relative;
      white-space: nowrap;
      z-index: 0;
    }
    .highlight-text::after {
      content: "";
      position: absolute;
      bottom: 6px;
      left: -6px;
      right: -6px;
      height: 14px;
      background: #8ce0d4;
      z-index: -1;
      transform: rotate(-1.5deg);
      border-radius: 50%;
    }

    /* Buttons */
    .primary-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 9px;
      padding: 13px 26px;
      border: 2px solid var(--ink);
      border-radius: 14px 11px 16px 10px;
      background: var(--aqua);
      color: white;
      font-size: 19px;
      font-weight: 800;
      box-shadow: var(--shadow-small);
      transition: transform 150ms ease, box-shadow 150ms ease;
      cursor: pointer;
      text-decoration: none;
    }

    .sticky-note-card .primary-button {
        font-size: 14px;
        padding: 8px 18px;
    }

    .primary-button:hover:not(:disabled) {
      box-shadow: 1px 2px 0 var(--ink);
      transform: translate(2px, 2px);
      background: #0d968b;
      color: white;
    }
    .primary-button:disabled { opacity: 0.65; cursor: not-allowed; transform: none; box-shadow: 2px 2px 0 var(--ink); }
    .secondary-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px 22px;
      border: 2px solid var(--ink);
      border-radius: 13px;
      background: white;
      color: var(--ink);
      font-size: 17px;
      font-weight: 800;
      box-shadow: 2px 3px 0 var(--ink);
      transition: transform 150ms ease, box-shadow 150ms ease;
      cursor: pointer;
    }
    .secondary-button:hover:not(:disabled) {
      box-shadow: 1px 2px 0 var(--ink);
      transform: translate(1px, 1px);
      background: #fdfdfd;
    }
    .compact-btn { padding: 8px 16px; font-size: 15px; }
</style>
