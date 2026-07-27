import { fileKind } from '../utils/file-type'

// Builds the channel/segment model for the camera wall.
//
// Input: the day's media files (media store `currentEvents`) and the day's
// [dayStart, dayEnd] range in unix seconds.
//
// Output per channel: a resolved, NON-OVERLAPPING lane of segments, each
// { file, kind, uuid, start, end }. Video segments span [created, created+dur);
// image segments span [created, next file's start) (a slideshow that advances
// with the playhead). Because several files on one channel can cover the same
// moment (re-uploads / overlapping clips), overlaps are resolved so exactly one
// file is active at any instant — the highest-priority file wins (see comparator).

const IMAGE_MIN_HOLD = 3 // seconds a lone/last image stays visible

// Higher priority wins an overlapping region: a video always beats an image, so
// a photo taken mid-clip never interrupts the video — it only shows where no
// video covers that instant. Then newest upload, newest created, uuid (stable).
function priority (a, b) {
  const av = a.kind === 'video' ? 1 : 0
  const bv = b.kind === 'video' ? 1 : 0
  if (av !== bv) return bv - av
  const fa = a.file
  const fb = b.file
  return (fb.uploaded || 0) - (fa.uploaded || 0) ||
    (fb.created || 0) - (fa.created || 0) ||
    String(fb.uuid).localeCompare(String(fa.uuid))
}

function channelKey (file) {
  const ch = file.meta && file.meta.channel
  return ch === undefined || ch === null ? (file.channel_id ?? 0) : ch
}

// Natural (pre-overlap) extent of a file on its channel.
function naturalExtent (file, sortedByCreated, idx, dayEnd) {
  const start = file.created
  const kind = fileKind(file)
  if (kind === 'video') {
    const dur = (file.meta && file.meta.duration) || 0
    return { start, end: start + dur }
  }
  // image: hold until the next file on the channel starts, else a min hold
  const next = sortedByCreated[idx + 1]
  const end = next ? Math.max(next.created, start + 1) : Math.min(start + IMAGE_MIN_HOLD, dayEnd)
  return { start, end }
}

// Resolve overlapping raw intervals into a non-overlapping lane via a boundary
// sweep: between consecutive boundary points, the highest-priority file covering
// the midpoint owns that slice; adjacent slices of the same file are merged.
//
// Continuity: while a video is already the active file, it keeps owning the
// following slices as long as it still covers them — an overlapping video only
// takes over once the current one ends. Without this a higher-priority video
// overlapping the middle of the current clip would split the lane and force a
// mid-clip source reload (a visible freeze). Images carry no reload cost, so the
// bias applies to video only; video-beats-image is still enforced by priority().
function resolveLane (raw) {
  const pts = new Set()
  raw.forEach((r) => { pts.add(r.start); pts.add(r.end) })
  const bounds = [...pts].sort((a, b) => a - b)
  const segs = []
  let prev = null // interval chosen for the previous (adjacent) slice
  for (let i = 0; i < bounds.length - 1; i++) {
    const s = bounds[i]
    const e = bounds[i + 1]
    if (e <= s) continue
    const mid = (s + e) / 2
    const covering = raw.filter((r) => r.start <= mid && mid < r.end)
    if (!covering.length) { prev = null; continue }
    covering.sort((a, b) => priority(a, b))
    let winner = covering[0]
    // stay on the previous video while it still covers this slice
    if (prev && prev.kind === 'video') {
      const cont = covering.find((r) => r.file.uuid === prev.file.uuid)
      if (cont) winner = cont
    }
    prev = winner
    const last = segs[segs.length - 1]
    if (last && last.uuid === winner.file.uuid && last.end === s) {
      last.end = e // merge adjacent slices of the same file
    } else {
      segs.push({ file: winner.file, kind: winner.kind, uuid: winner.file.uuid, start: s, end: e })
    }
  }
  return segs
}

export function buildCameraModel (events, { dayStart, dayEnd }) {
  const byChannel = {}
  ;(events || []).forEach((file) => {
    const kind = fileKind(file)
    if (kind !== 'video' && kind !== 'image') return // camera wall shows video + images only
    const key = channelKey(file)
    ;(byChannel[key] || (byChannel[key] = [])).push(file)
  })

  const lanes = {}
  Object.keys(byChannel).forEach((key) => {
    const sorted = byChannel[key].slice().sort((a, b) => a.created - b.created)
    const raw = sorted.map((file, idx) => {
      const { start, end } = naturalExtent(file, sorted, idx, dayEnd)
      return { file, kind: fileKind(file), start, end }
    }).filter((r) => r.end > r.start)
    lanes[key] = resolveLane(raw)
  })

  const channels = Object.keys(lanes)
    .filter((k) => lanes[k].length)
    .sort((a, b) => Number(a) - Number(b))

  function activeSegmentAt (channel, t) {
    const segs = lanes[channel]
    if (!segs || !segs.length) return null
    // binary search for the segment whose [start,end) contains t
    let lo = 0
    let hi = segs.length - 1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      const s = segs[mid]
      if (t < s.start) hi = mid - 1
      else if (t >= s.end) lo = mid + 1
      else return s
    }
    return null
  }

  function nextSegmentStartAfter (t) {
    let next = null
    channels.forEach((ch) => {
      const seg = lanes[ch].find((s) => s.start > t)
      if (seg && (next === null || seg.start < next)) next = seg.start
    })
    return next
  }

  function allChannelsInGap (t) {
    return channels.every((ch) => !activeSegmentAt(ch, t))
  }

  // clip navigation: next/previous segment start across all channels, or within a
  // single channel when `channel` is given (used by the camera wall's prev/next buttons)
  function channelsToScan (channel) {
    return channel != null && lanes[String(channel)] ? [String(channel)] : channels
  }
  function nextClipStart (t, channel) {
    let next = null
    channelsToScan(channel).forEach((ch) => {
      lanes[ch].forEach((s) => { if (s.start > t + 0.5 && (next === null || s.start < next)) next = s.start })
    })
    return next
  }
  function prevClipStart (t, channel) {
    let prev = null
    channelsToScan(channel).forEach((ch) => {
      lanes[ch].forEach((s) => { if (s.start < t - 0.5 && (prev === null || s.start > prev)) prev = s.start })
    })
    return prev
  }

  return { channels, lanes, activeSegmentAt, nextSegmentStartAfter, allChannelsInGap, nextClipStart, prevClipStart }
}
