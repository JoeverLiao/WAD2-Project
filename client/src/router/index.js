
import { createRouter, createWebHistory } from 'vue-router'

export const routes = [
  {
    path: '/',
    name: 'home',
    component: () => import('../views/HomeView.vue'),
    meta: { navLabel: 'Home' },
  },
  {
    path: '/dashboard',
    name: 'dashboard',
    component: () => import('../views/account/DashboardView.vue'),
    meta: { navLabel: 'Dashboard' },
  },
  {
    path: '/scanning',
    name: 'scanning',
    component: () => import('../views/scanning/ScanningView.vue'),
    meta: { navLabel: 'Receipt & Product Scanning' },
  },
  {
    path: '/fridge',
    name: 'fridge',
    component: () => import('../views/fridge/FridgeView.vue'),
    meta: { navLabel: 'Smart Fridge' },
  },
  {
    path: '/freshness-recipes',
    name: 'freshness-recipes',
    component: () => import('../views/freshness/FreshnessRecipesView.vue'),
    meta: { navLabel: 'Freshness & Recipes' },
  },

  // NEW: Full recipe details page
  {
    path: '/freshness/recipes/:id',
    name: 'recipe-detail',
    component: () => import('../views/freshness/RecipeDetailView.vue'),
  },

  {
    path: '/food-rescue',
    name: 'food-rescue',
    component: () => import('../views/rescue/FoodRescueView.vue'),
    meta: { navLabel: 'Neighbour Food Rescue' },
  },
  {
    path: '/analytics',
    name: 'analytics',
    component: () => import('../views/analytics/AnalyticsView.vue'),
    meta: { navLabel: 'Food Waste Analytics' },
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/account/LoginView.vue'),
    meta: { navLabel: 'Login', navGroup: 'Profile' },
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('../views/account/RegisterView.vue'),
    meta: { navLabel: 'Register', navGroup: 'Profile' },
  },
  {
    path: '/profile',
    name: 'profile',
    component: () => import('../views/account/ProfileView.vue'),
    meta: { navLabel: 'Profile', navGroup: 'Profile' },
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

export default router
