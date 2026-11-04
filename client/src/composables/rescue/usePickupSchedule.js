import { computed, ref } from 'vue'
import { singaporeDateKey } from '@/services/rescueDates.js'

// The parent form owns the saved timestamps; this module handles day and time choices.
export function usePickupSchedule(form) {
  const pickupToday = singaporeDateKey()

  const tomorrow = new Date(`${pickupToday}T12:00:00+08:00`)
  tomorrow.setTime(tomorrow.getTime() + 24 * 60 * 60 * 1000)

  const pickupTomorrow = singaporeDateKey(tomorrow)

  const pickupDay = ref(
    form.pickupStart.slice(0, 10) || pickupToday,
  )

  // Existing listings show their saved times immediately.
  const pickupDaySelected = ref(Boolean(form.pickupStart))
  const pickupPreset = ref(form.pickupStart ? 'custom' : '')

  const showPickupCalendar = ref(
    ![pickupToday, pickupTomorrow].includes(pickupDay.value),
  )

  const pickupTimeOptions = [
    {
      id: 'morning',
      label: 'Morning',
      timeLabel: '9 am–12 pm',
      start: '09:00',
      end: '12:00',
    },
    {
      id: 'afternoon',
      label: 'Afternoon',
      timeLabel: '12–5 pm',
      start: '12:00',
      end: '17:00',
    },
    {
      id: 'evening',
      label: 'Evening',
      timeLabel: '5–9 pm',
      start: '17:00',
      end: '21:00',
    },
  ]

  // The time inputs read and update the same fields used by save().
  const pickupStartTime = computed({
    get() {
      return form.pickupStart.slice(11, 16)
    },
    set(time) {
      form.pickupStart = time
        ? `${pickupDay.value}T${time}`
        : ''
    },
  })

  const pickupEndTime = computed({
    get() {
      return form.pickupEnd.slice(11, 16)
    },
    set(time) {
      form.pickupEnd = time
        ? `${pickupDay.value}T${time}`
        : ''
    },
  })

  function pickupDayAllowed(day) {
    return Boolean(
      day &&
      day >= singaporeDateKey() &&
      (!form.expiresAt || day <= form.expiresAt.slice(0, 10)),
    )
  }

  // Return a usable window, or null when it has ended.
  // Windows already in progress begin at the next 15-minute slot.
  function pickupPresetWindow(option) {
    const day = pickupDay.value

    if (!pickupDayAllowed(day)) return null

    let start = Date.parse(`${day}T${option.start}:00+08:00`)
    const end = Date.parse(`${day}T${option.end}:00+08:00`)

    const quarterHour = 15 * 60 * 1000
    const nextSlot =
      (Math.floor(Date.now() / quarterHour) + 1) * quarterHour

    start = Math.max(start, nextSlot)

    if (start >= end) return null

    // Convert the adjusted start back to Singapore HH:mm.
    const startTime = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Singapore',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(start))

  return {
    start: `${day}T${startTime}`,
    end: `${day}T${option.end}`,
  }
}

function selectPickupPreset(option) {
  const window = pickupPresetWindow(option)

  if (!window) return

  pickupPreset.value = option.id
  form.pickupStart = window.start
  form.pickupEnd = window.end
}

function selectPickupDay(day) {
  if (!pickupDayAllowed(day)) return

  pickupDaySelected.value = true

  const startTime = pickupStartTime.value
  const endTime = pickupEndTime.value

  pickupDay.value = day

  const option = pickupTimeOptions.find(
    (item) => item.id === pickupPreset.value,
  )

  if (option) {
    const window = pickupPresetWindow(option)

    if (window) {
      selectPickupPreset(option)
      return
    }

    // Ask for another window if this preset has already ended.
    pickupPreset.value = 'custom'
    form.pickupStart = ''
    form.pickupEnd = ''
    return
  }

  form.pickupStart = startTime ? `${day}T${startTime}` : ''
  form.pickupEnd = endTime ? `${day}T${endTime}` : ''
}

const pickupSummary = computed(() => {
  if (!form.pickupStart || !form.pickupEnd) return ''

  const start = new Date(`${form.pickupStart}:00+08:00`)
  const end = new Date(`${form.pickupEnd}:00+08:00`)

  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    end <= start
  ) {
    return ''
  }

  const dayLabel = new Intl.DateTimeFormat('en-SG', {
    timeZone: 'Asia/Singapore',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(start)

  const timeFormatter = new Intl.DateTimeFormat('en-SG', {
    timeZone: 'Asia/Singapore',
    hour: 'numeric',
    minute: '2-digit',
  })

  return `${dayLabel}, ${timeFormatter.format(start)}–${timeFormatter.format(end)}`
})


  return {
    pickupToday,
    pickupTomorrow,
    pickupDay,
    pickupDaySelected,
    pickupPreset,
    showPickupCalendar,
    pickupTimeOptions,
    pickupStartTime,
    pickupEndTime,
    pickupDayAllowed,
    pickupPresetWindow,
    selectPickupPreset,
    selectPickupDay,
    pickupSummary,
  }
}
