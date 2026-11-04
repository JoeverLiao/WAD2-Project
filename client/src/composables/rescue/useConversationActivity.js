import { onBeforeUnmount, ref } from 'vue'
import { api } from '@/services/rescueApi.js'
import { entityId } from '@/services/rescueConversations.js'

const storageKey = 'freshkeep.rescue.seenMessages.v1'

// The existing messages endpoint supplies activity for every active thread.
// Seen message IDs are stored per user/thread in this browser, without message text.
export function useConversationActivity() {
  const activity = ref({})
  const seenMessages = ref({})
  let alive = true

  function readStorage() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '{}')
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        return saved
      }
    } catch {
      // Unread indicators still work in memory if storage is unavailable.
    }
    return {}
  }

  seenMessages.value = readStorage()

  function threadKey(request, direction) {
    const user = direction === 'received' ? request.owner : request.requester
    return `${entityId(user)}:${entityId(request)}`
  }

  function messageKey(message) {
    return entityId(message._id) || `${message.createdAt}:${entityId(message.sender)}`
  }

  function recordMessages(request, direction, messages, initialMessage) {
    if (!alive) return

    const userId = entityId(direction === 'received' ? request.owner : request.requester)
    const allMessages = initialMessage ? [initialMessage, ...messages] : messages
    const incomingIds = []
    let latestMessageAt = 0

    for (const message of allMessages) {
      const timestamp = Date.parse(message.createdAt)
      if (Number.isFinite(timestamp)) latestMessageAt = Math.max(latestMessageAt, timestamp)
      if (entityId(message.sender) !== userId) incomingIds.push(messageKey(message))
    }

    activity.value[threadKey(request, direction)] = { latestMessageAt, incomingIds }
  }

  function activityFor(request, direction) {
    const key = threadKey(request, direction)
    const thread = activity.value[key]
    const seen = new Set(Array.isArray(seenMessages.value[key]) ? seenMessages.value[key] : [])

    return {
      latestMessageAt: thread?.latestMessageAt || Date.parse(request.createdAt) || 0,
      hasUnread: Boolean(thread?.incomingIds.some((id) => !seen.has(id))),
    }
  }

  function markRead(request, direction, messages, initialMessage) {
    if (!alive) return
    const userId = entityId(direction === 'received' ? request.owner : request.requester)
    const allMessages = initialMessage ? [initialMessage, ...messages] : messages
    const key = threadKey(request, direction)

    // Merge other tabs' read state before writing our visible message IDs.
    const saved = readStorage()
    const seen = new Set([
      ...(Array.isArray(seenMessages.value[key]) ? seenMessages.value[key] : []),
      ...(Array.isArray(saved[key]) ? saved[key] : []),
    ])
    for (const message of allMessages) {
      if (entityId(message.sender) !== userId) seen.add(messageKey(message))
    }
    const merged = { ...saved }
    for (const [thread, ids] of Object.entries(seenMessages.value)) {
      const savedIds = Array.isArray(saved[thread]) ? saved[thread] : []
      merged[thread] = [...new Set([...savedIds, ...(Array.isArray(ids) ? ids : [])])]
    }
    merged[key] = [...seen]
    seenMessages.value = merged

    try {
      localStorage.setItem(storageKey, JSON.stringify(seenMessages.value))
    } catch {
      // Keep the in-memory read state even if the browser cannot persist it.
    }
  }

  async function loadThread(request, direction, signal) {
    const messages = new Map()
    let initialMessage = null
    let after = null
    let hasMore = true

    while (hasMore) {
      const params = { limit: 100 }
      if (after) params.after = after
      const { data } = await api.get(`/rescue/requests/${entityId(request)}/messages`, { params, signal })
      if (!alive || signal.aborted) return
      if (!Array.isArray(data.messages)) throw new Error('Unexpected message response.')

      for (const message of data.messages) messages.set(messageKey(message), message)
      if (data.initialMessage) initialMessage = data.initialMessage
      hasMore = Boolean(data.hasMore)
      if (hasMore && (!data.nextCursor || data.nextCursor === after)) {
        throw new Error('Invalid message cursor.')
      }
      after = data.nextCursor
    }

    recordMessages(request, direction, [...messages.values()], initialMessage)
  }

  async function loadActivity(threads, signal) {
    // Limit parallel requests. One unavailable thread must not block the inbox.
    for (let index = 0; index < threads.length; index += 3) {
      if (!alive || signal.aborted) return
      await Promise.all(threads.slice(index, index + 3).map(async ({ request, direction }) => {
        try {
          await loadThread(request, direction, signal)
        } catch {
          // Retain the previous activity until the next successful poll.
        }
      }))
    }
  }

  function syncReadState(event) {
    if (event.key === storageKey || event.key === null) seenMessages.value = readStorage()
  }

  window.addEventListener('storage', syncReadState)
  onBeforeUnmount(() => {
    alive = false
    window.removeEventListener('storage', syncReadState)
  })

  return { activityFor, recordMessages, markRead, loadActivity }
}
