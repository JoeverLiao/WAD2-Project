<script setup>
  import {ref} from 'vue';
  import Header from '@/components/rescue/RescueHeader.vue';
  import SharingCorner from '@/components/rescue/SharingCorner.vue'
  import MyListings from '@/components/rescue/MyListings.vue'
  import RescueMap from '@/components/rescue/RescueMap.vue'
</script>

<template>
    <Header />

    <div class="container py-4">
      <div class="sharing-basket my-4">
          <div class="row align-items-center gy-4">
              <div class="col-lg-4 col-xl-3">
                  <img src="/images/sharing-basket.svg" alt="">
              </div>

              <div class="col-lg-5 col-xl-6">
                  <h2>Fill the sharing basket.</h2>
                  <p>Choose food you won't finish and share it nearby</p>
                  <div class="d-flex flex-wrap gap-2">
                    <div class="expire-soon">8 expire today</div>
                    <div class="item-expiring">18 ready to choose</div>
                </div>
              </div>
              <div class="col-lg-3 col-xl-3">
                  <button class="primary-button" >
                      Choose food for my basket 
                  </button>
              </div>
          </div>
      </div>
    </div>

    <MyListings />

    <SharingCorner />

    <RescueMap />

</template>

<style scoped>
.primary-button {
      font-family: var(--font-sans);
      padding: 16px 26px;
      border: 2px solid var(--ink);
      border-radius: 14px 11px 16px 10px;
      background: var(--aqua);
      color: white;
      font-size: 18px;
      font-weight: 500;
      box-shadow: var(--shadow-small);
      transition: transform 150ms ease, box-shadow 150ms ease;
      cursor: pointer;
      text-wrap: nowrap;
}
.primary-button:hover:not(:disabled) {
      box-shadow: 1px 2px 0 var(--ink);
      transform: translate(2px, 2px);
      background: #0d968b;
      color: white;
    }

.sharing-basket{
    background: var(--aqua-soft);
    border: 3px solid var(--ink);
    border-radius: 24px;
    padding: 36px;
    box-shadow: var(--shadow-paper);
    position: relative;
    font-family: var(--font-display);
}

.row-items{
  display: flex;
}

.item-expiring, .expire-soon {
  text-align: center;
  border-radius: 9px;
  font-weight: 500;
  padding: 8px 24px;
  font-family: var(--font-sans);
}

.item-expiring {
  background-color: var(--paper-bright);
}

.expire-soon{
  background-color: #FFDD69;
  color: black;
}
</style>
