import { apiRequest } from './api.js'
import { normaliseItem } from '../utils/inventoryModel.js'

export async function fetchInventory(options) {
  const data = await apiRequest('/inventory', options)
  return (Array.isArray(data) ? data : data.items || []).map(normaliseItem)
}

export async function saveInventoryItem(id, body) {
  const data = await apiRequest(id ? `/inventory/${encodeURIComponent(id)}` : '/inventory', {
    method: id ? 'PATCH' : 'POST',
    body,
  })
  return normaliseItem(data.item || data)
}

export function deleteInventoryItem(id, body) {
  return apiRequest(`/inventory/${encodeURIComponent(id)}`, { method: 'DELETE', body })
}
