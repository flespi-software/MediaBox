<template>
  <WebrtcPlayer v-if="isWebrtc" ref="webrtc" :options="options" style="width:100%;height:100%"
    @ready="$emit('ready')" />
  <div v-else ref="playerContainer" style="width:100%;height:100%"></div>
</template>

<script>
import videojs from 'video.js'
import 'video.js/dist/video-js.css'
import '../../../utils/videojs-mpegts-tech'
import WebrtcPlayer from './webrtc-player.vue'
import { WEBRTC_MIME } from '../../../utils/media-url'

// WebRTC never reaches video.js - it is played by WebrtcPlayer below
const WEBRTC_TYPES = [WEBRTC_MIME, 'video/webrtc']
const HLS_TYPES = ['application/x-mpegURL', 'application/vnd.apple.mpegurl']
const FLV_TYPES = ['video/x-flv', 'video/flv']

// Latency catch-up settings per stream type
const LATENCY = {
  flv: { target: 0.5, threshold: 1.0, max: 5 },
  hls: { target: 2.0, threshold: 2.0, max: 10 }
}
const CATCHUP_RATE_MIN = 1.05
const CATCHUP_RATE_MAX = 2.0
const STALL_TIMEOUT = 1500

const FLV_MPEGTS_CONFIG = {
  enableStashBuffer: false,
  stashInitialSize: 64,
  autoCleanupSourceBuffer: true,
  autoCleanupMaxBackwardDuration: 60,
  autoCleanupMinBackwardDuration: 30,
  lazyLoad: false,
  lazyLoadMaxDuration: 0,
  lazyLoadRecoverDuration: 0,
  seekType: 'range',
  enableWorker: true
}

// Build the mpegts.js tech config for an FLV source. mpegts.js auto-detects
// tracks by default, but a stream with no audio track is not always detected
// correctly and fails to start — so when the source explicitly declares
// hasAudio === false we tell mpegts there is no audio track up front.
function buildFlvConfig (options) {
  const flvSource = (options.sources || []).find(s => FLV_TYPES.includes(s.type))
  const mediaDataSource = {
    type: 'flv',
    isLive: true
  }
  if (flvSource && flvSource.hasAudio === false) {
    mediaDataSource.hasAudio = false
    mediaDataSource.hasVideo = true
  }
  return {
    mediaDataSource,
    config: FLV_MPEGTS_CONFIG
  }
}

function isLiveSource (options) {
  return options.autoplay && options.sources && options.sources.some(s =>
    FLV_TYPES.includes(s.type) || HLS_TYPES.includes(s.type)
  )
}

// Control-bar toggle: follow the live edge (catch up) or stop and watch from
// where you are. Added only to players that have a live edge (live stream or a
// growing EVENT playback). Registered once at module load.
const VjsButton = videojs.getComponent('Button')
class CatchupToggle extends VjsButton {
  handleClick () {
    if (this.options_.onToggle) this.options_.onToggle()
  }

  // reflect state: highlighted while following, dimmed while paused-from-edge
  setFollowing (on) {
    this.toggleClass('vjs-following', on)
    this.controlText(on ? 'Following live — click to stop catching up' : 'Catch up to live')
  }
}
if (!videojs.getComponent('CatchupToggle')) {
  videojs.registerComponent('CatchupToggle', CatchupToggle)
}

function isFlvSource (options) {
  return options.sources && options.sources.some(s => FLV_TYPES.includes(s.type))
}

function isHlsSource (options) {
  return options.sources && options.sources.some(s => HLS_TYPES.includes(s.type))
}

function buildOptions (options) {
  if (isFlvSource(options)) {
    return {
      ...options,
      techOrder: ['Mpegts', 'html5'],
      Mpegts: buildFlvConfig(options)
    }
  }
  if (isHlsSource(options) && options.autoplay) {
    return {
      ...options,
      liveui: true,
      liveTracker: {
        trackingThreshold: 0.5,
        liveTolerance: 5
      },
      html5: {
        vhs: {
          overrideNative: true,
          limitRenditionByPlayerDimensions: false,
          experimentalLLHLS: true,
          backBufferLength: 30
        }
      }
    }
  }
  return options
}

function isWebrtcSource (options) {
  return (options.sources || []).some(s => WEBRTC_TYPES.includes(s.type))
}

export default {
  name: 'VideoPlayer',
  components: { WebrtcPlayer },
  emits: ['ready'],
  props: {
    options: {
      type: Object,
      default () {
        return {}
      }
    }
  },
  watch: {
    options (val, old) {
      if (JSON.stringify(val) !== JSON.stringify(old)) {
        this.destroyPlayer()
        this.createPlayer()
      }
    }
  },
  computed: {
    isWebrtc () {
      return isWebrtcSource(this.options)
    }
  },
  data () {
    return {
      player: null,
      chaserInterval: null,
      latencySettings: null,
      latencyTarget: 0,
      stallTimer: null,
      // whether live controls have been set up (skipped for finite VOD playback)
      liveStarted: false,
      // whether we're actively chasing the live edge (user-toggleable)
      catchupEnabled: false,
      // the control-bar toggle instance (live-edge players only)
      catchupBtn: null
    }
  },
  mounted () {
    this.createPlayer()
  },
  beforeUnmount () {
    this.destroyPlayer()
  },
  methods: {
    createPlayer () {
      if (this.isWebrtc) return // handled by WebrtcPlayer
      const el = document.createElement('video')
      el.className = 'video-js'
      el.preload = 'none'
      this.$refs.playerContainer.appendChild(el)

      const opts = { fill: true, ...buildOptions(this.options) }
      this.player = videojs(el, opts, () => {
        this.player.log('onPlayerReady', this)
        this.$emit('ready')
        if (!isLiveSource(this.options)) return
        // FLV here is always a live stream -> follow the live edge by default.
        // HLS may be a live stream OR a recorded playback. Both a live and an
        // EVENT-playback manifest report an infinite duration; only a finite VOD
        // has no live edge. So defer until the manifest loads: skip finite VOD,
        // and for the rest default to following only when it's a true live stream
        // (a playback starts from EXT-X-START and doesn't chase unless asked).
        if (isFlvSource(this.options)) {
          this.enableLiveControls(true)
        } else {
          const setup = () => {
            if (this.liveStarted || !this.player) return
            if (this.player.duration() !== Infinity) return // finite VOD: play from start
            this.enableLiveControls(this.isLiveHls())
          }
          this.player.on('loadedmetadata', setup)
          this.player.on('durationchange', setup)
        }
      })
    },
    // Distinguish a live HLS stream from a recorded playback (VOD). The gateway
    // marks playback manifests with EXT-X-PLAYLIST-TYPE (VOD/EVENT) and EXT-X-START
    // (RFC 8216) — so read the parsed manifest: a declared playlistType or a
    // closed playlist (EXT-X-ENDLIST) means playback. Only a bare sliding-window
    // playlist (neither) is a true live stream. Duration is a fallback: an EVENT
    // playback still reports an infinite duration, so the manifest check must win.
    isLiveHls () {
      try {
        const tech = this.player.tech(true)
        const vhs = tech && (tech.vhs || tech.hls)
        const media = vhs && vhs.playlists && vhs.playlists.media && vhs.playlists.media()
        if (media) return !(media.playlistType || media.endList)
      } catch (e) { /* fall through to the duration heuristic */ }
      return this.player.duration() === Infinity
    },
    // set up live-edge controls: the catch-up toggle + stall recovery. `defaultFollow`
    // decides the initial state (true live -> follow; EVENT playback -> off). Stall
    // recovery only kicks in while following, so a paused-from-edge view stays put.
    enableLiveControls (defaultFollow) {
      if (this.liveStarted || !this.player) return
      this.liveStarted = true
      this.player.on('waiting', () => {
        if (!this.catchupEnabled) return
        const s = this.latencySettings || LATENCY.flv
        this.latencyTarget = Math.min(this.latencyTarget + 0.3, s.max * 0.6)
        this.player.playbackRate(1.0)
        this.tryRecoverStall()
      })
      this.player.on('playing', () => {
        this.clearStallTimer()
      })
      this.addCatchupToggle()
      this.setCatchup(defaultFollow)
    },
    // add the follow-live toggle to the control bar, before the fullscreen button
    addCatchupToggle () {
      const bar = this.player && this.player.controlBar
      if (!bar || this.catchupBtn) return
      this.catchupBtn = bar.addChild('CatchupToggle', {
        className: 'vjs-catchup-toggle',
        onToggle: () => this.setCatchup(!this.catchupEnabled)
      })
      const fs = bar.getChild('fullscreenToggle')
      if (fs && fs.el() && fs.el().parentNode) {
        fs.el().parentNode.insertBefore(this.catchupBtn.el(), fs.el())
      }
    },
    // turn live-edge chasing on/off (user toggle). Off: stop chasing, drop back to
    // 1x and let the viewer stay where they are (scrub/pause the buffered window).
    setCatchup (on) {
      this.catchupEnabled = on
      if (on) {
        this.startLatencyChaser()
      } else {
        this.stopLatencyChaser()
        this.clearStallTimer()
        if (this.player) this.player.playbackRate(1.0)
      }
      if (this.catchupBtn) this.catchupBtn.setFollowing(on)
    },
    destroyPlayer () {
      this.stopLatencyChaser()
      this.clearStallTimer()
      this.liveStarted = false
      this.catchupEnabled = false
      this.catchupBtn = null // disposed together with the player below
      if (this.player) {
        this.player.dispose()
        this.player = null
      }
    },
    getLatency () {
      if (!this.player) return 0
      // for HLS use seekable end (real live edge from manifest)
      const seekable = this.player.seekable()
      if (seekable && seekable.length > 0) {
        return seekable.end(seekable.length - 1) - this.player.currentTime()
      }
      // fallback to buffered end (FLV / no seekable)
      const buffered = this.player.buffered()
      if (buffered.length === 0) return 0
      return buffered.end(buffered.length - 1) - this.player.currentTime()
    },
    calcCatchupRate (latency) {
      const s = this.latencySettings
      const excess = latency - this.latencyTarget
      const range = s.max - this.latencyTarget
      const t = Math.min(excess / range, 1)
      return CATCHUP_RATE_MIN + t * (CATCHUP_RATE_MAX - CATCHUP_RATE_MIN)
    },
    startLatencyChaser () {
      this.stopLatencyChaser()
      const isHls = isHlsSource(this.options)
      this.latencySettings = isHls ? LATENCY.hls : LATENCY.flv
      this.latencyTarget = this.latencySettings.target
      const s = this.latencySettings
      this.chaserInterval = setInterval(() => {
        if (!this.player || this.player.paused()) return
        const latency = this.getLatency()
        const current = this.player.playbackRate()
        if (latency > s.max) {
          this.seekToLiveEdge()
          if (current !== 1.0) this.player.playbackRate(1.0)
        } else if (latency > this.latencyTarget + s.threshold) {
          const target = this.calcCatchupRate(latency)
          if (Math.abs(target - current) > 0.1) this.player.playbackRate(target)
        } else if (current !== 1.0) {
          this.player.playbackRate(1.0)
        }
        if (this.latencyTarget > s.target) {
          this.latencyTarget = Math.max(this.latencyTarget - 0.05, s.target)
        }
      }, 500)
    },
    stopLatencyChaser () {
      if (this.chaserInterval) {
        clearInterval(this.chaserInterval)
        this.chaserInterval = null
      }
    },
    clearStallTimer () {
      if (this.stallTimer) {
        clearTimeout(this.stallTimer)
        this.stallTimer = null
      }
    },
    seekToLiveEdge () {
      if (!this.player) return
      const seekable = this.player.seekable()
      if (seekable && seekable.length > 0) {
        this.player.currentTime(seekable.end(seekable.length - 1) - this.latencyTarget)
        return
      }
      const buffered = this.player.buffered()
      if (buffered.length > 0) {
        this.player.currentTime(buffered.end(buffered.length - 1) - this.latencyTarget)
      }
    },
    tryRecoverStall () {
      if (!this.player) return
      const buffered = this.player.buffered()
      const currentTime = this.player.currentTime()
      // skip gap if there's buffered data ahead
      for (let i = 0; i < buffered.length; i++) {
        if (buffered.start(i) > currentTime + 0.1) {
          this.player.currentTime(buffered.start(i) + 0.1)
          return
        }
      }
      // if no data ahead, schedule a seek to live edge
      this.clearStallTimer()
      this.stallTimer = setTimeout(() => {
        if (this.player && !this.player.paused()) {
          this.seekToLiveEdge()
        }
      }, STALL_TIMEOUT)
    },
    // the webrtc child exposes the same API - forward to it when it is active
    delegate (method, ...args) {
      const w = this.$refs.webrtc
      return w ? w[method](...args) : undefined
    },
    play () {
      if (this.isWebrtc) return this.delegate('play')
      if (this.player) this.player.play()
    },
    pause () {
      if (this.isWebrtc) return this.delegate('pause')
      if (this.player) this.player.pause()
    },
    // --- imperative helpers for external (synchronized) time control ---
    // Additive only; used by the camera wall to drive recorded
    // playback. Recorded mp4 is never a live source, so the latency chaser
    // above never runs and these do not affect live-stream behavior.
    seek (t) {
      if (this.isWebrtc) return
      if (this.player) this.player.currentTime(t)
    },
    getCurrentTime () {
      if (this.isWebrtc) return this.delegate('getCurrentTime') || 0
      return this.player ? this.player.currentTime() : 0
    },
    getDuration () {
      if (this.isWebrtc) return 0
      return this.player ? this.player.duration() : 0
    },
    isPaused () {
      if (this.isWebrtc) return this.delegate('isPaused')
      return this.player ? this.player.paused() : true
    },
    setRate (r) {
      if (this.isWebrtc) return
      if (this.player) this.player.playbackRate(r)
    },
    setMuted (m) {
      if (this.isWebrtc) return this.delegate('setMuted', m)
      if (this.player) this.player.muted(m)
    },
    isReady () {
      if (this.isWebrtc) return !!this.delegate('isReady')
      return !!this.player
    }
  }
}
</script>

<style lang="sass">
// follow-live toggle in the video.js control bar (live / EVENT-playback only)
.vjs-catchup-toggle
  cursor: pointer
  .vjs-icon-placeholder::before
    content: '\2193' // downwards arrow = "jump to live edge"
    font-size: 1.5em
    line-height: 1.67
  // dimmed while not chasing the edge; teal while following
  opacity: .7
  &.vjs-following
    opacity: 1
    color: #26c6da
</style>
