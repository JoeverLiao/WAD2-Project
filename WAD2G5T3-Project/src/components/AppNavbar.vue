<script setup>
import { ref, onMounted } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'

const auth = useAuthStore()
const authReady = ref(false)

onMounted(async () => {
  try {
    await auth.checkAuth()
  } catch {
    // Network unavailable — stay logged out
  }
  authReady.value = true
})

const routes = useRouter().getRoutes()

const topLinks = routes.filter((r) => r.meta.navLabel && !r.meta.navGroup)

const groups = {}
routes
  .filter((r) => r.meta.navGroup)
  .forEach((r) => {
    const g = r.meta.navGroup
    if (!groups[g]) groups[g] = { label: g, children: [] }
    groups[g].children.push(r)
  })
</script>

<template>
  <nav aria-label="Main navigation">
    <ul>
      <li v-for="link in topLinks" :key="link.name">
        <RouterLink :to="{ name: link.name }">{{ link.meta.navLabel }}</RouterLink>
      </li>
      <li v-for="(group, label) in groups" :key="label" class="dropdown">
        <button class="dropdown-toggle" aria-haspopup="true" aria-expanded="false">
          {{ label }}
        </button>
        <ul class="dropdown-menu">
          <li v-for="child in group.children" :key="child.name">
            <RouterLink :to="{ name: child.name }">{{ child.meta.navLabel }}</RouterLink>
          </li>
        </ul>
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

ul a,
.dropdown-toggle {
  display: block;
  padding: 10px 12px;
  border-radius: 4px;
  color: #fff;
  font-weight: 500;
  text-decoration: none;
  transition: background-color 150ms ease;
}

a:hover,
a:focus-visible,
.dropdown-toggle:hover,
.dropdown-toggle:focus-visible {
  background-color: #103a29;
}

a:focus-visible,
.dropdown-toggle:focus-visible {
  outline: 2px solid #fff;
  outline-offset: -2px;
}

.dropdown-toggle {
  background: none;
  border: none;
  cursor: pointer;
  font: inherit;
  display: flex;
  align-items: center;
  gap: 4px;
}

.dropdown-toggle::after {
  content: '';
  display: inline-block;
  width: 0;
  height: 0;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 5px solid #fff;
  margin-left: 4px;
}

.dropdown {
  position: relative;
}

.dropdown-menu {
  display: none;
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 100;
  flex-direction: column;
  background-color: #1e5a3e;
  border-radius: 4px;
  padding: 4px 0;
  min-width: 160px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.dropdown:hover .dropdown-menu,
.dropdown-toggle:focus-visible + .dropdown-menu,
.dropdown:focus-within .dropdown-menu {
  display: flex;
}

.dropdown-menu a {
  padding: 8px 16px;
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  a,
  .dropdown-toggle {
    transition: none;
  }
}
</style>
