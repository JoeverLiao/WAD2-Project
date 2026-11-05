<script setup>
import PageHeaderDoodle from '../../components/PageHeaderDoodle.vue'
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
  editName.value = auth.user?.name || ''
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
    await auth.updateProfile({
      username: editName.value,
      email: editEmail.value,
    })
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
  <section class="profile-page" aria-label="Profile">
    <div v-if="auth.user" class="profile-card fc-page-heading" data-header-theme="account">
      <PageHeaderDoodle kind="account" />
      <p class="profile-tag">My account</p>
      <h1>{{ auth.user.name }}</h1>
      <p v-if="error" class="profile-alert alert-error" role="alert">{{ error }}</p>
      <p v-if="success" class="profile-alert alert-success" role="status">{{ success }}</p>

      <div v-if="!editMode" class="profile-details">
        <div class="profile-field">
          <span class="field-label">Username:</span>
          <span>{{ auth.user.name }}</span>
        </div>
        <div class="profile-field">
          <span class="field-label">Email:</span>
          <span>{{ auth.user.email }}</span>
        </div>
        <div class="profile-actions">
          <button type="button" class="profile-button button-primary" @click="startEdit">
            Edit profile
          </button>
          <button type="button" class="profile-button button-logout" @click="handleLogout">
            Logout
          </button>
        </div>
      </div>

      <form v-else class="profile-details" @submit.prevent="saveProfile">
        <div class="profile-input">
          <label for="edit-name">Username:</label>
          <input id="edit-name" v-model="editName" type="text" required autocomplete="username" />
        </div>
        <div class="profile-input">
          <label for="edit-email">Email:</label>
          <input id="edit-email" v-model="editEmail" type="email" required autocomplete="email" />
        </div>
        <div class="profile-actions">
          <button type="submit" class="profile-button button-primary">Save</button>
          <button type="button" class="profile-button button-secondary" @click="cancelEdit">
            Cancel
          </button>
        </div>
      </form>
    </div>
    <div v-else class="profile-card fc-page-heading" data-header-theme="account">
      <PageHeaderDoodle kind="account" />
      <h1>Profile</h1>
      <p>Please <RouterLink :to="{ name: 'login' }">log in</RouterLink> to view your profile.</p>
    </div>
  </section>
</template>

<style scoped>
.profile-page {
  min-height: 100svh;
  padding: clamp(110px, 9vw, 140px) clamp(16px, 4.4vw, 80px) 48px;
  color: var(--ink);
  background: transparent;
  font-family: var(--font-sans);
}
:global(body:has(.profile-page)) {
  padding-bottom: 0;
}
.profile-card {
  position: relative;
  max-width: 560px;
  margin: 0 auto;
  padding: clamp(28px, 4vw, 44px) clamp(20px, 4vw, 44px);
  border: 3px solid var(--ink);
  border-radius: 26px;
  background: #fff;
  box-shadow: 6px 8px 0 var(--ink);
  text-align: center;
}
.profile-tag {
  display: inline-block;
  margin: 0 0 14px;
  padding: 7px 14px;
  border: 2px solid var(--ink);
  border-radius: 5px;
  background: #ffe16a;
  box-shadow: 2px 2px 0 var(--ink);
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
h1 {
  margin: 0 0 26px;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: clamp(2.2rem, 4vw, 3.2rem);
  line-height: 1.05;
  letter-spacing: -0.03em;
  overflow-wrap: anywhere;
}
.profile-alert {
  margin: 0 0 20px;
  padding: 12px 16px;
  border: 2px solid var(--ink);
  border-radius: 12px;
  font-weight: 600;
}
.alert-error {
  background: #ffd2ca;
}
.alert-success {
  background: #cef3ed;
}
.profile-details {
  display: flex;
  flex-direction: column;
  gap: 16px;
  text-align: left;
}
.profile-field {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  padding: 14px 18px;
  border: 2px solid var(--ink);
  border-radius: 14px;
  background: #f6fdfc;
  font-size: 1.1rem;
  overflow-wrap: anywhere;
}
.field-label,
.profile-input label {
  font-weight: 700;
}
.profile-input label {
  display: block;
  margin-bottom: 8px;
  font-size: 1.1rem;
}
.profile-input input {
  width: 100%;
  padding: 14px 16px;
  border: 3px solid var(--ink);
  border-radius: 12px;
  background: #f6fdfc;
  font: inherit;
  font-size: 1.1rem;
  color: var(--ink);
}
.field-empty {
  color: #5b6b69;
  font-style: italic;
}
.input-hint {
  margin: 8px 0 0;
  font-size: 0.95rem;
  color: #5b6b69;
}
.profile-input input:focus-visible {
  outline: 3px solid #1f7d74;
  outline-offset: 3px;
}
.profile-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 10px;
}
.profile-button {
  flex: 1 1 160px;
  min-height: 56px;
  padding: 12px 22px;
  border: 3px solid var(--ink);
  border-radius: 16px;
  box-shadow: 4px 5px 0 var(--ink);
  color: var(--ink);
  font: inherit;
  font-size: 1.1rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    transform 160ms ease,
    box-shadow 160ms ease;
}
.profile-button:hover {
  transform: translate(2px, 2px);
  box-shadow: 2px 3px 0 var(--ink);
}
.profile-button:active {
  transform: translate(4px, 5px);
  box-shadow: none;
}
.profile-button:focus-visible {
  outline: 3px solid #1f7d74;
  outline-offset: 5px;
}
.button-primary {
  background: #0fa89c;
  color: #fff;
}
.button-primary:hover {
  background: #0b968b;
}
.button-secondary {
  background: #ffe16a;
}
.button-logout {
  background: #ffd2ca;
}
@media (prefers-reduced-motion: reduce) {
  .profile-button {
    transition: none;
  }
}
</style>
