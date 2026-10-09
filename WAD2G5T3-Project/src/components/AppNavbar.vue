<script setup>
import { RouterLink, useRouter } from 'vue-router'

const links = useRouter()
  .getRoutes()
  .filter((route) => route.meta.navLabel)
</script>

<template>
  <nav aria-label="Main navigation">
    <ul>
      <li v-for="link in links" :key="link.name">
        <RouterLink :to="{ name: link.name }">{{ link.meta.navLabel }}</RouterLink>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
nav {
  background-color: #164b35;
  border-radius: 6px;
  padding: 8px 12px;
  font-family: system-ui, sans-serif;
  font-size: 14px;
}

ul {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

a {
  display: block;
  padding: 10px 12px;
  border-radius: 4px;
  color: #fff;
  font-weight: 500;
  text-decoration: none;
  transition: background-color 150ms ease;
}

a:hover,
a:focus-visible {
  background-color: #103a29;
}

a:focus-visible {
  outline: 2px solid #fff;
  outline-offset: -2px;
}

@media (prefers-reduced-motion: reduce) {
  a {
    transition: none;
  }
}
</style>
