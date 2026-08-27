// WHEP-style WebRTC signaling for flespi media streams: POST the SDP offer as
// JSON to the stream URL, get the answer back in the same shape.

const ICE_GATHER_TIMEOUT = 3000

// Adaptive jitter buffer. WebRTC has no media buffer to chase like HLS/FLV -
// latency lives in the receiver jitter buffer, so we keep it at the floor and
// only pay latency when the link actually misbehaves, then walk it back down.
const ADAPT_INTERVAL = 3000
const ADAPT_STEP = 150 // ms added after a bad window
const ADAPT_DECAY = 50 // ms given back after a clean streak
const ADAPT_MAX = 600
const CLEAN_WINDOWS = 5 // clean windows before we start lowering again
const BAD_JITTER = 0.03 // 30 ms of rtp jitter is a rough link
const BAD_LOSS = 0.02 // 2% packet loss
const NO_DECODE_WINDOWS = 2 // stats windows with packets but no decoded frame

// Both names are the same knob: playoutDelayHint is the older Chrome one,
// jitterBufferTarget (ms) the standardized one.
function setJitterTarget (pc, target) {
  pc.getReceivers().forEach((r) => {
    try {
      r.playoutDelayHint = target / 1000
      r.jitterBufferTarget = target
    } catch (e) { /* not supported - the browser picks its own target */ }
  })
}

async function inboundVideoStats (pc) {
  const report = await pc.getStats()
  let out = null
  // older Safari reports mediaType instead of kind
  report.forEach((s) => { if (s.type === 'inbound-rtp' && (s.kind || s.mediaType) === 'video') out = s })
  return out
}

// a window is bad if the picture froze, packets were lost or jitter is high
function isBadWindow (cur, prev) {
  const freezes = (cur.freezeCount || 0) - (prev.freezeCount || 0)
  const lost = (cur.packetsLost || 0) - (prev.packetsLost || 0)
  const got = (cur.packetsReceived || 0) - (prev.packetsReceived || 0)
  const loss = got + lost > 0 ? lost / (got + lost) : 0
  return freezes > 0 || loss > BAD_LOSS || (cur.jitter || 0) > BAD_JITTER
}

// wait for ICE gathering, but do not hang forever if a candidate never resolves
function waitForIceGathering (pc) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      pc.removeEventListener('icegatheringstatechange', check)
      clearTimeout(timer)
      resolve()
    }
    const check = () => {
      if (pc.iceGatheringState === 'complete') finish()
    }
    const timer = setTimeout(finish, ICE_GATHER_TIMEOUT)
    pc.addEventListener('icegatheringstatechange', check)
  })
}

export function isWebrtcSupported () {
  return typeof window !== 'undefined' && typeof window.RTCPeerConnection === 'function'
}

function codecKey (name) {
  return String(name).toLowerCase().replace('video/', '').replace(/[^a-z0-9]/g, '')
}

/**
 * Can this browser decode the codec the stream is encoded with? Firefox ships
 * H.264 as a separate OpenH264 plugin, so it can be missing while WebRTC itself
 * works. Returns true when we cannot tell.
 */
export function canDecodeCodec (codec) {
  if (!codec || typeof RTCRtpReceiver === 'undefined' || !RTCRtpReceiver.getCapabilities) return true
  const caps = RTCRtpReceiver.getCapabilities('video')
  if (!caps || !caps.codecs || !caps.codecs.length) return true
  const want = codecKey(codec)
  return caps.codecs.some((c) => codecKey(c.mimeType) === want)
}

/**
 * Open a receive-only WebRTC session on `url`.
 * onStream(MediaStream), onState(state) - state is the pc connection state
 * plus 'signaling' while negotiating and 'failed' on a signaling error.
 * `mic` (optional MediaStreamTrack) turns the audio transceiver into sendrecv
 * for talkback; without it audio is recvonly.
 * Returns a handle with close().
 */
export function openWebrtcStream (url, { onStream, onState, iceServers, mic, jitterTarget = 0 } = {}) {
  const pc = new RTCPeerConnection({ sdpSemantics: 'unified-plan', iceServers: iceServers || [] })
  const remote = new MediaStream()
  let closed = false
  let controller = null
  let adaptTimer = null
  let target = jitterTarget
  let clean = 0
  let prevStats = null
  let noDecode = 0

  const adapt = async () => {
    const cur = await inboundVideoStats(pc)
    if (!cur) return
    // video is arriving but nothing comes out of the decoder -> no codec support
    if ((cur.packetsReceived || 0) > 0 && !(cur.framesDecoded || 0)) {
      if (++noDecode >= NO_DECODE_WINDOWS) state('nodecode')
    } else {
      noDecode = 0
    }
    const prev = prevStats
    prevStats = cur
    if (!prev) return
    let next = target
    if (isBadWindow(cur, prev)) {
      clean = 0
      next = Math.min(target + ADAPT_STEP, ADAPT_MAX)
    } else if (++clean >= CLEAN_WINDOWS) {
      clean = 0
      next = Math.max(target - ADAPT_DECAY, jitterTarget)
    }
    if (next === target) return
    target = next
    setJitterTarget(pc, target)
  }

  const state = (s) => { if (!closed && onState) onState(s) }

  pc.addEventListener('track', (evt) => {
    const track = evt.track
    if (remote.getTracks().includes(track)) return
    remote.addTrack(track)
    if (onStream) onStream(remote)
  })
  pc.addEventListener('connectionstatechange', () => state(pc.connectionState))
  pc.addEventListener('iceconnectionstatechange', () => {
    // some browsers stall on connectionstatechange - mirror the ice state too
    if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
      state(pc.iceConnectionState)
    }
  })

  pc.addTransceiver('video', { direction: 'recvonly' })
  if (mic) {
    pc.addTransceiver(mic, { direction: 'sendrecv' })
  } else {
    pc.addTransceiver('audio', { direction: 'recvonly' })
  }

  const negotiate = async () => {
    state('signaling')
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    await waitForIceGathering(pc)
    if (closed) return
    controller = new AbortController()
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sdp: pc.localDescription.sdp, type: pc.localDescription.type }),
      signal: controller.signal
    })
    if (!response.ok) throw new Error(`signaling failed: ${response.status} ${response.statusText}`)
    const answer = await response.json()
    if (closed) return
    await pc.setRemoteDescription(answer)
    setJitterTarget(pc, target)
    adaptTimer = setInterval(() => { adapt().catch(() => {}) }, ADAPT_INTERVAL)
  }

  const ready = negotiate().catch((e) => {
    if (closed) return
    console.error('WebRTC signaling failed', e)
    state('failed')
    throw e
  })

  return {
    pc,
    stream: remote,
    ready,
    // current jitter buffer target in ms (adapts to the link)
    jitterTarget: () => target,
    close () {
      if (closed) return
      closed = true
      if (adaptTimer) clearInterval(adaptTimer)
      if (controller) controller.abort()
      try {
        pc.getTransceivers().forEach((t) => { if (t.stop) t.stop() })
      } catch (e) { /* older browsers: no transceiver.stop */ }
      remote.getTracks().forEach((t) => t.stop())
      pc.close()
    }
  }
}
