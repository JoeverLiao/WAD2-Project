<script setup>
import { ref, onMounted } from 'vue'
import { useAuthStore } from '../../stores/auth.js'
import { apiRequest } from '../../services/api.js'

const auth = useAuthStore()
const dashboard = ref(null)
const loading = ref(true)
const error = ref('')

onMounted(async () => {
  if (!auth.isAuthenticated) {
    loading.value = false
    return
  }
  try {
    dashboard.value = await apiRequest('/dashboard')
  } catch (e) {
    error.value = e.message || 'Failed to load dashboard'
  } finally {
    loading.value = false
  }
})

function formatDate(date) {
  if (!date) return ''
  const d = new Date(date)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
</script>

<template>
  <section aria-label="Dashboard" v-if="auth.isAuthenticated">
    <h1>Dashboard</h1>
    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <div v-if="dashboard" class="summary-cards">
      <div class="card">
        <span class="card-value">{{ dashboard.totalItems }}</span>
        <span class="card-label">Total Items</span>
      </div>
      <div class="card">
        <span class="card-value">{{ dashboard.categories }}</span>
        <span class="card-label">Categories</span>
      </div>
      <div class="card card-urgent">
        <span class="card-value">{{ dashboard.urgentCount }}</span>
        <span class="card-label">Urgent</span>
      </div>
      <div class="card">
        <span class="card-value">{{ dashboard.storageBreakdown.fridge }}</span>
        <span class="card-label">Fridge</span>
      </div>
      <div class="card">
        <span class="card-value">{{ dashboard.storageBreakdown.freezer }}</span>
        <span class="card-label">Freezer</span>
      </div>
      <div class="card">
        <span class="card-value">{{ dashboard.storageBreakdown.pantry }}</span>
        <span class="card-label">Pantry</span>
      </div>
    </div>

    <div v-if="dashboard && dashboard.expiringToday.length" class="alerts">
      <h2>Expiring Today</h2>
      <ul>
        <li v-for="item in dashboard.expiringToday" :key="item._id">
          <strong>{{ item.name }}</strong>
          <span v-if="item.quantity"
            >({{ item.quantity }}<span v-if="item.unit"> {{ item.unit }}</span
            >)</span
          >
          <span> &mdash; {{ item.storage }}</span>
        </li>
      </ul>
    </div>

    <div v-if="dashboard && dashboard.expired.length" class="alerts alerts-expired">
      <h2>Expired</h2>
      <ul>
        <li v-for="item in dashboard.expired" :key="item._id">
          <strong>{{ item.name }}</strong>
          <span v-if="item.quantity"
            >({{ item.quantity }}<span v-if="item.unit"> {{ item.unit }}</span
            >)</span
          >
          <span> &mdash; expired {{ formatDate(item.expiresAt) }}</span>
        </li>
      </ul>
    </div>

    <div v-if="loading" class="loading">Loading dashboard...</div>
  </section>
  <section v-else aria-label="Dashboard">
    <h1>Dashboard</h1>
    <p>Please <RouterLink :to="{ name: 'login' }">log in</RouterLink> to view your dashboard.</p>
  </section>
</template>

<style scoped>
section {
  max-width: 800px;
  margin: 2rem auto;
}
.summary-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  margin-bottom: 2rem;
}
.card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1.5rem;
  background: #f5f5f5;
  border-radius: 8px;
  border: 1px solid #ddd;
}
.card-urgent {
  background: #fff0f0;
  border-color: #ecc;
}
.card-value {
  font-size: 2rem;
  font-weight: 700;
  color: #164b35;
}
.card-urgent .card-value {
  color: #c33;
}
.card-label {
  font-size: 0.85rem;
  color: #666;
  margin-top: 0.25rem;
}
.alerts {
  margin-top: 1.5rem;
}
.alerts h2 {
  font-size: 1.1rem;
  margin-bottom: 0.5rem;
}
.alerts ul {
  padding-left: 1.5rem;
}
.alerts li {
  margin-bottom: 0.25rem;
}
.alerts-expired li {
  color: #c33;
}
.loading {
  color: #666;
  font-style: italic;
}
.error {
  color: #c00;
  font-weight: 500;
}
</style>
