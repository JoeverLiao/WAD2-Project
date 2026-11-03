import { computed, ref, watch, onScopeDispose } from 'vue'

export const navigating = ref(true)
export const navbarBusy = ref(false)
const tasks = ref(new Map())
export const pageIsLoading = computed(() => navigating.value || tasks.value.size > 0)
export const pageLoadingLabel = computed(() => navigating.value ? 'Loading page' : [...tasks.value.values()].at(-1) || 'Loading')

export function usePageLoading(source, label = 'Loading') {
  const key = Symbol(label)
  const clear = () => { const next = new Map(tasks.value); next.delete(key); tasks.value = next }
  watch(source, busy => {
    if (busy) { const next = new Map(tasks.value); next.set(key, label); tasks.value = next }
    else clear()
  }, { immediate: true, flush: 'sync' })
  onScopeDispose(clear)
}
