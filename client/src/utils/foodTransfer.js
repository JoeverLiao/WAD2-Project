import { onBeforeUnmount, onMounted, ref, nextTick } from 'vue'

const duration = 620
const visibleLimit = 12

// Coordinates belong to the viewport because the flight layer is teleported to body.
function center(element) {
  if (!element) return null
  const rect = element.getBoundingClientRect()
  if (!rect.width || !rect.height) return null
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}
function inViewport(point) {
  return {
    x: Math.max(24, Math.min(window.innerWidth - 24, point.x)),
    y: Math.max(24, Math.min(window.innerHeight - 24, point.y)),
  }
}
function findFood(root, id) {
  return [...(root?.querySelectorAll('[data-food-id]') || [])].find(
    (element) => element.dataset.foodId === id,
  )
}

export function useFoodTransfer(stage) {
  const flights = ref([])
  const announcement = ref('')
  const effects = new Map()
  const timers = new Set()
  let sequence = 0
  let disposed = false
  function later(callback, delay) {
    const timer = setTimeout(() => {
      timers.delete(timer)
      callback()
    }, delay)
    timers.add(timer)
  }
  function finish(id) {
    const effect = effects.get(id)
    if (!effect) return
    effect.icon?.classList.remove('food-transfer-incoming')
    effects.delete(id)
    if (![...effects.values()].some((other) => other.area === effect.area)) {
      effect.area?.classList.remove('food-transfer-arrival')
    }
    flights.value = flights.value.filter((flight) => flight.id !== id)
  }
  function clear() {
    for (const timer of timers) clearTimeout(timer)
    timers.clear()
    for (const id of [...effects.keys()]) finish(id)
  }
  function onViewportScroll(event) {
    // Shelf contents can scroll automatically when Vue removes/inserts an item.
    // Only a real viewport scroll invalidates our fixed viewport coordinates.
    if (event.target instanceof Element && ![document.documentElement, document.body].includes(event.target)) return
    clear()
  }
  onMounted(() => {
    window.addEventListener('scroll', onViewportScroll, true)
    window.addEventListener('resize', clear)
  })
  onBeforeUnmount(() => {
    disposed = true
    clear()
    window.removeEventListener('scroll', onViewportScroll, true)
    window.removeEventListener('resize', clear)
  })

  function capture(group, pointer) {
    announcement.value = ''
    const modal = stage.value
      ?.closest('.smart-fridge-page')
      ?.querySelector('.inventory-modal')
    return group.map((item) => {
      const card = findFood(modal, item.id)
      const icon = findFood(stage.value, item.id)
      const from =
        center(card?.querySelector('.food-emoji')) ||
        center(icon) ||
        (Number.isFinite(pointer?.clientX) && Number.isFinite(pointer?.clientY)
          ? { x: pointer.clientX, y: pointer.clientY }
          : null)
      return {
        item,
        from,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        fixed: Boolean(card),
      }
    })
  }

  async function play(origins, succeeded, destinationLabel) {
    await nextTick()
    if (disposed || !stage.value || !succeeded.size) return
    clear()
    const reduced = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches
    announcement.value = `Moved ${succeeded.size} food item${succeeded.size === 1 ? '' : 's'} to ${destinationLabel}.`
    const pending = []
    for (const origin of origins
      .filter((origin) => succeeded.has(origin.item.id))
      .slice(0, visibleLimit)) {
      const icon = findFood(stage.value, origin.item.id)
      const area = icon?.closest('[data-drop-zone]')
      if (!area || !origin.from) continue
      const fridge = icon.closest('.fridge-body')
      const closed = Boolean(fridge && !fridge.classList.contains('fridge-is-open'))
      const destination = closed ? area.closest('.fridge-body') : area
      const bounds = area.getBoundingClientRect()
      const iconPoint = center(icon)
      const visibleIcon =
        iconPoint &&
        !closed &&
        iconPoint.x >= bounds.left &&
        iconPoint.x <= bounds.right &&
        iconPoint.y >= bounds.top &&
        iconPoint.y <= bounds.bottom
      const to = (visibleIcon && iconPoint) || center(destination)
      if (!to) continue
      const id = ++sequence
      effects.set(id, { icon, area: destination })
      destination.classList.add('food-transfer-arrival')
      if (reduced) {
        later(() => finish(id), 800)
        continue
      }
      icon.classList.add('food-transfer-incoming')
      const from = inViewport({
        x: origin.from.x - (origin.fixed ? 0 : window.scrollX - origin.scrollX),
        y: origin.from.y - (origin.fixed ? 0 : window.scrollY - origin.scrollY),
      })
      pending.push({
        id,
        name: origin.item.name,
        from,
        to: inViewport(to),
        delay: pending.length * 35,
      })
      // Also clean up if the browser skips animationend or the user changes motion preferences.
      later(() => finish(id), duration + 500 + pending.length * 35)
    }
    flights.value = pending
  }

  return { flights, announcement, capture, play, finish }
}
