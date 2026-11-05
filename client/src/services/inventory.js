import { http } from './http.js'
import { normaliseItem } from '../utils/inventoryModel.js'

export async function fetchInventory(options) {
  const { data } = await http.get('/inventory', options)
  return (Array.isArray(data) ? data : data.items || []).map(normaliseItem)
}

export async function saveInventoryItem(id, body) {
  const { data } = id
    ? await http.patch(`/inventory/${encodeURIComponent(id)}`, body)
    : await http.post('/inventory', body)
  return normaliseItem(data.item || data)
}

export async function deleteInventoryItem(id, body) {
  const response = await http.delete(`/inventory/${encodeURIComponent(id)}`, { data: body })
  return response.status === 204 ? null : response.data
}
