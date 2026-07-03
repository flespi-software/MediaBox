import { ref } from 'vue'

// Master playback clock for the camera wall.
//
// It is the single source of truth for playback time. Grid cells, the timeline
// and (later) a GPS-track map all read `t` and drive it through `seek()` — no
// component owns time except this clock.
//
// `t` is a unix timestamp in seconds (float). While playing, it is derived from
// a performance.now() anchor rather than accumulated per-frame, so it never
// drifts from wall-clock speed.
//
// Playback is bounded by [boundStart, boundEnd] (defaults to the whole day). A
// zoom selection narrows those bounds and enables looping, so playback repeats
// within the chosen range.
export function useMasterClock ({ dayStart, dayEnd }) {
  const t = ref(dayStart)
  const playing = ref(false)
  const rate = ref(1)
  const boundStart = ref(dayStart)
  const boundEnd = ref(dayEnd)
  const loop = ref(false)

  let anchorT = dayStart // t value at the moment we last (re)anchored
  let anchorPerf = 0 // performance.now() at that moment
  let raf = null

  const clamp = (v) => Math.min(Math.max(v, boundStart.value), boundEnd.value)

  function reanchor () {
    anchorT = t.value
    anchorPerf = performance.now()
  }

  function tick () {
    const elapsed = (performance.now() - anchorPerf) / 1000
    const next = anchorT + elapsed * rate.value
    if (next >= boundEnd.value) {
      if (loop.value) {
        t.value = boundStart.value
        reanchor()
        raf = requestAnimationFrame(tick)
        return
      }
      t.value = boundEnd.value
      pause()
      return
    }
    t.value = next
    raf = requestAnimationFrame(tick)
  }

  function play () {
    if (playing.value) return
    if (t.value >= boundEnd.value) t.value = boundStart.value // restart at the end
    playing.value = true
    reanchor()
    raf = requestAnimationFrame(tick)
  }

  function pause () {
    if (!playing.value) {
      reanchor()
      return
    }
    playing.value = false
    if (raf) cancelAnimationFrame(raf)
    raf = null
    reanchor()
  }

  function toggle () {
    playing.value ? pause() : play()
  }

  // Authoritative time change (from timeline scrub or a future map click).
  function seek (target) {
    t.value = clamp(target)
    reanchor()
  }

  function setRate (r) {
    rate.value = r
    reanchor() // keep t continuous across the rate change
  }

  // Narrow playback to [start, end] and (optionally) loop within it.
  function setRange (start, end, loopOn) {
    boundStart.value = start
    boundEnd.value = end
    loop.value = !!loopOn
    if (t.value < start || t.value >= end) {
      t.value = start
      reanchor()
    }
  }

  // Back to the full day, no looping.
  function resetRange () {
    setRange(dayStart, dayEnd, false)
  }

  function dispose () {
    if (raf) cancelAnimationFrame(raf)
    raf = null
    playing.value = false
  }

  return {
    t,
    playing,
    rate,
    boundStart,
    boundEnd,
    loop,
    play,
    pause,
    toggle,
    seek,
    setRate,
    setRange,
    resetRange,
    dispose
  }
}
