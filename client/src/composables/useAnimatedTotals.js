import { ref, watch, onMounted, onBeforeUnmount } from 'vue'

export function useAnimatedTotals(totals) {
  const animated = ref({ ...totals.value })
  let frame
  let preference
  let mounted = false
  function update(target = totals.value) {
    cancelAnimationFrame(frame)
    if (!mounted || preference?.matches) {
      animated.value = { ...target }
      return
    }
    const from = { ...animated.value }
    const started = performance.now()
    function tick(now) {
      const progress = Math.min((now - started) / 650, 1)
      const eased = 1 - (1 - progress) ** 3
      animated.value = Object.fromEntries(
        Object.keys(target).map((key) => [key, from[key] + (target[key] - from[key]) * eased]),
      )
      if (progress < 1) frame = requestAnimationFrame(tick)
      else animated.value = { ...target }
    }
    frame = requestAnimationFrame(tick)
  }
  function motionChanged() {
    if (preference.matches) update()
  }
  watch(totals, update)
  onMounted(() => {
    mounted = true
    preference = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    preference?.addEventListener('change', motionChanged)
  })
  onBeforeUnmount(() => {
    mounted = false
    cancelAnimationFrame(frame)
    preference?.removeEventListener('change', motionChanged)
  })
  return animated
}
