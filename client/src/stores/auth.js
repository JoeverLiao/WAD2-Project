import { defineStore } from 'pinia'
import { apiRequest } from '../services/api.js'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
  }),
  getters: {
    isAuthenticated: (state) => state.user !== null,
  },
  actions: {
    async checkAuth() {
      try {
        this.user = await apiRequest('/auth/me')
      } catch {
        this.user = null
      }
    },
    async login(email, password) {
      this.user = await apiRequest('/auth/login', {
        method: 'POST',
        body: { email, password },
      })
    },
    async register(username, email, password) {
      this.user = await apiRequest('/auth/register', {
        method: 'POST',
        body: { username, email, password },
      })
    },
    async logout() {
      await apiRequest('/auth/logout', { method: 'POST' })
      this.user = null
    },
    async updateProfile(data) {
      this.user = await apiRequest('/auth/me', {
        method: 'PATCH',
        body: data,
      })
    },
  },
})
