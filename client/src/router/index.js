
import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'

export const routes = [
  {
    path: '/',
    name: 'home',
    component: () => import('../views/HomeView.vue'),
    meta: { navLabel: 'Home', public: true },
  },
  
  {
    path: '/dashboard',
    name: 'dashboard',
    component: () => import('../views/account/DashboardView.vue'),
    meta: { navLabel: 'Dashboard' },
  },
  {
    path: '/fridge',
    name: 'fridge',
    component: () => import('../views/fridge/FridgeView.vue'),
    meta: { navLabel: 'Smart Fridge' },
  },
  {
    path: '/analytics',
    name: 'analytics',
    component: () => import('../views/analytics/AnalyticsView.vue'),
    meta: { navLabel: 'Food Waste Analytics' },
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
    meta: { promptLabel: 'Recipes' },
  },

  {
    path: '/food-rescue',
    name: 'food-rescue',
    component: () => import('../views/rescue/FoodRescueView.vue'),
    meta: { navLabel: 'Neighbour Food Rescue' },
  },
  {
    path: '/scanning',
    name: 'scanning',
    component: () => import('../views/scanning/ScanningView.vue'),
    meta: { navLabel: 'Receipt & Product Scanning' },
  },
  {
    path: '/login',
    name: 'login',
    // The login form lives on the home page; /login keeps working for nav links and redirects.
    component: () => import('../views/HomeView.vue'),
    meta: { navLabel: 'Login', navGroup: 'Profile', public: true },
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('../views/account/RegisterView.vue'),
    meta: { navLabel: 'Register', navGroup: 'Profile', public: true },
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

// Pages without meta.public show a login prompt to guests (see App.vue).
// Checking the session before the first page renders avoids flashing that prompt.
export async function authGuard() {
  const auth = useAuthStore()
  if (!auth.checked) await auth.checkAuth()
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

router.beforeEach(authGuard)

export default router
