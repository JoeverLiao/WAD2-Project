import { ref, computed, nextTick } from 'vue'

// Door behavior shared by the full page and dashboard fridge.
export function useFridgeDoor({ kitchenStage }) {
  const doorAngle = ref(0)

  const doorGesture = ref(null)

  let ignoreDoorClick = false

  const fridgeDoorOpen = computed({
    get: () => doorAngle.value > 85,
    set: (open) => {
      doorAngle.value = open ? 170 : 0
    },
  })

  const fridgeLightOn = computed(() => doorAngle.value > 25)

  function startDoorGesture(event) {
    if (
      !event.isPrimary ||
      event.button !== 0 ||
      event.target.closest('.door-bin, .fridge-close-button, [draggable="true"]')
    )
      return
    ignoreDoorClick = false
    doorGesture.value = {
      x: event.clientX,
      angle: doorAngle.value,
      width: event.currentTarget.closest('.fridge-body').getBoundingClientRect().width,
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveDoorGesture(event) {
    const gesture = doorGesture.value
    if (!gesture) return
    const delta = event.clientX - gesture.x
    if (Math.abs(delta) > 6) gesture.moved = true
    if (gesture.moved)
      doorAngle.value = Math.max(
        0,
        Math.min(170, gesture.angle + (delta / Math.max(gesture.width, 1)) * 170),
      )
  }

  function endDoorGesture(event, cancelled = false) {
    const gesture = doorGesture.value
    if (!gesture) return
    doorGesture.value = null
    ignoreDoorClick = gesture.moved
    if (gesture.moved) doorAngle.value = cancelled ? gesture.angle : doorAngle.value >= 60 ? 170 : 0
    if (event.currentTarget.hasPointerCapture?.(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
    if (!cancelled && gesture.moved && gesture.angle <= 85 && fridgeDoorOpen.value) centerFridge()
  }

  function toggleDoor() {
    if (ignoreDoorClick) {
      ignoreDoorClick = false
      return
    }
    fridgeDoorOpen.value = !fridgeDoorOpen.value
    if (fridgeDoorOpen.value) centerFridge()
  }

  async function centerFridge() {
    await nextTick()
    const cabinet = kitchenStage.value?.querySelector('.fridge-cabinet')
    cabinet?.scrollIntoView?.({
      block: 'center',
      inline: 'nearest',
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    })
  }

  return {
    doorAngle,
    doorGesture,
    fridgeDoorOpen,
    fridgeLightOn,
    startDoorGesture,
    moveDoorGesture,
    endDoorGesture,
    toggleDoor,
  }
}
