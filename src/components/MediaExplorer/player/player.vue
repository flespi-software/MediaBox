<template>
  <div ref="playerContainer" style="width:100%;height:100%"></div>
</template>

<script>
import videojs from 'video.js'
import 'video.js/dist/video-js.css'
import '../../../utils/videojs-mpegts-tech'

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

export default {
  name: 'VideoPlayer',
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
  data () {
    return {
      player: null,
      chaserInterval: null,
      latencySettings: null,
      latencyTarget: 0,
      stallTimer: null
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
      const el = document.createElement('video')
      el.className = 'video-js'
      el.preload = 'none'
      this.$refs.playerContainer.appendChild(el)

      const opts = { fill: true, ...buildOptions(this.options) }
      const live = isLiveSource(this.options)
      this.player = videojs(el, opts, () => {
        this.player.log('onPlayerReady', this)
        if (live) {
          this.startLatencyChaser()
          this.player.on('waiting', () => {
            const s = this.latencySettings || LATENCY.flv
            this.latencyTarget = Math.min(this.latencyTarget + 0.3, s.max * 0.6)
            this.player.playbackRate(1.0)
            this.tryRecoverStall()
          })
          this.player.on('playing', () => {
            this.clearStallTimer()
          })
        }
      })
    },
    destroyPlayer () {
      this.stopLatencyChaser()
      this.clearStallTimer()
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
    play () {
      if (this.player) this.player.play()
    },
    pause () {
      if (this.player) this.player.pause()
    }
  }
}
</script>
