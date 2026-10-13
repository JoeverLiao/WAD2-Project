<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth.js'

const auth = useAuthStore()
const router = useRouter()

const editMode = ref(false)
const editName = ref('')
const editEmail = ref('')
const error = ref('')
const success = ref('')

function startEdit() {
  editName.value = auth.user?.username || ''
  editEmail.value = auth.user?.email || ''
  editMode.value = true
  error.value = ''
  success.value = ''
}

function cancelEdit() {
  editMode.value = false
  error.value = ''
}

async function saveProfile() {
  error.value = ''
  success.value = ''
  try {
    await auth.updateProfile({ username: editName.value, email: editEmail.value })
    editMode.value = false
    success.value = 'Profile updated'
  } catch (e) {
    error.value = e.message || 'Update failed'
  }
}

async function handleLogout() {
  try {
    await auth.logout()
    router.push({ name: 'login' })
  } catch (e) {
    error.value = e.message || 'Logout failed'
  }
}
</script>

<template>
  <section aria-label="Profile" v-if="auth.user">
    <h1>Profile</h1>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="success" class="success" role="alert">{{ success }}</p>

    <div v-if="!editMode">
      <div class="field">
        <span class="label">Username</span>
        <span>{{ auth.user.username }}</span>
      </div>
      <div class="field">
        <span class="label">Email</span>
        <span>{{ auth.user.email }}</span>
      </div>
      <div class="actions">
        <button @click="startEdit">Edit Profile</button>
        <button class="btn-danger" @click="handleLogout">Logout</button>
      </div>
    </div>

    <form v-else @submit.prevent="saveProfile">
      <div>
        <label for="edit-name">Username</label>
        <input id="edit-name" v-model="editName" type="text" required />
      </div>
      <div>
        <label for="edit-email">Email</label>
        <input id="edit-email" v-model="editEmail" type="email" required />
      </div>
      <div class="actions">
        <button type="submit">Save</button>
        <button type="button" @click="cancelEdit">Cancel</button>
      </div>
    </form>
  </section>
  <section v-else aria-label="Profile">
    <h1>Profile</h1>
    <p>Please <RouterLink :to="{ name: 'login' }">log in</RouterLink> to view your profile.</p>
  </section>
</template>

<style scoped>
section {
  max-width: 480px;
  margin: 2rem auto;
}
.field {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}
.label {
  font-weight: 600;
  min-width: 80px;
}
.actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
}
button {
  padding: 0.5rem 1.5rem;
  background: #164b35;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
.btn-danger {
  background: #a33;
}
input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
}
label {
  display: block;
  font-weight: 600;
  margin-bottom: 0.25rem;
}
.error {
  color: #c00;
  font-weight: 500;
}
.success {
  color: #080;
  font-weight: 500;
}
</style>
