<template>
  <div class="wp-wrap" @dblclick="toggleFullscreen">
    <video ref="video" class="wp-video" playsinline autoplay :muted="muted" :poster="options.poster"
      :controls="options.controls !== false && connected" />

    <div v-if="!connected" class="wp-state column flex-center q-pa-md text-center">
      <template v-if="codecProblem">
        <q-icon name="mdi-video-box-off" size="42px" color="amber-5" />
        <div class="text-caption text-grey-3 q-mt-sm">{{ codecTitle }}</div>
        <div class="wp-hint text-caption text-grey-5 q-mt-xs">{{ codecHint }}</div>
      </template>
      <template v-else-if="status === 'failed'">
        <q-icon name="mdi-video-off-outline" size="42px" color="red-4" />
        <div class="text-caption text-grey-4 q-mt-sm">Stream unavailable</div>
        <q-btn class="q-mt-md" size="sm" outline no-caps color="teal-4" icon="mdi-refresh"
          label="Retry" @click.stop="retryNow" />
      </template>
      <template v-else>
        <q-spinner-oval size="36px" color="teal-4" />
        <div class="text-caption text-grey-5 q-mt-sm">Connecting…</div>
      </template>
    </div>
  </div>
</template>

<script>
import { defineComponent } from 'vue'
import { openWebrtcStream, isWebrtcSupported, canDecodeCodec } from '../../../utils/webrtc'

// h264 -> H.264, hevc/h265 -> H.265
function codecLabel (codec) {
  if (!codec) return 'video'
  const m = /^h\.?(26[45])$/i.exec(codec)
  if (m) return `H.${m[1]}`
  if (/^hevc$/i.test(codec)) return 'H.265'
  return codec.toUpperCase()
}

function isFirefox () {
  return /firefox/i.test(navigator.userAgent)
}

const MAX_RETRIES = 3
const RETRY_DELAY = 2000
const FREEZE_CHECK = 2000
const FREEZE_LIMIT = 4 // checks without a new frame before we renegotiate
// codec trouble is terminal - reconnecting cannot fix a missing decoder
const CODEC_PROBLEMS = ['unsupported', 'nodecode']

// Live WebRTC player: a plain <video> fed by a peer connection. No video.js -
// WebRTC has no buffer to chase, so none of the latency machinery applies.
export default defineComponent({
  name: 'WebrtcPlayer',
  emits: ['ready'],
  props: {
    options: {
      type: Object,
      default: () => ({})
    }
  },
  data () {
    return {
      session: null,
      status: 'new',
      // sound on unless the caller mutes (the wall does); autoplay may force it back
      muted: this.options.muted === true,
      retries: 0,
      retryTimer: null,
      freezeTimer: null,
      lastTime: 0,
      frozenChecks: 0
    }
  },
  computed: {
    src () {
      const sources = this.options.sources || []
      return sources.length ? sources[0].src : null
    },
    connected () {
      return this.status === 'connected'
    },
    codec () {
      const sources = this.options.sources || []
      return sources.length ? sources[0].codec : null
    },
    codecProblem () {
      return CODEC_PROBLEMS.includes(this.status)
    },
    codecTitle () {
      const name = codecLabel(this.codec)
      return this.status === 'unsupported'
        ? `This browser cannot decode ${name}`
        : `Video is arriving but ${name} is not being decoded`
    },
    codecHint () {
      const fallback = 'Open the stream in Chrome, or restart it from the device as HLS.'
      return isFirefox()
        ? `Firefox ships the H.264 decoder as a separate OpenH264 plugin - check it is installed and enabled in about:addons, Plugins. ${fallback}`
        : fallback
    }
  },
  watch: {
    src () {
      this.retryNow()
    }
  },
  mounted () {
    this.start()
  },
  beforeUnmount () {
    this.stop()
  },
  methods: {
    start () {
      if (!this.src) return
      this.muted = this.options.muted === true
      if (!isWebrtcSupported()) {
        this.status = 'failed'
        return
      }
      if (!canDecodeCodec(this.codec)) {
        this.status = 'unsupported'
        return
      }
      this.status = 'signaling'
      this.session = openWebrtcStream(this.src, {
        onStream: (stream) => {
          const el = this.$refs.video
          if (!el) return
          el.srcObject = stream
          this.autoplay()
          this.watchFreeze()
          this.$emit('ready')
        },
        onState: (s) => {
          this.status = s
          if (s === 'connected') this.retries = 0
          else if (s === 'failed') this.scheduleRetry()
        }
      })
      this.session.ready.catch(() => {})
    },
    // autoplay: try with sound when asked, fall back to muted if the browser blocks it
    autoplay () {
      const el = this.$refs.video
      if (!el) return
      el.muted = this.muted
      const p = el.play()
      if (!p || !p.catch) return
      p.catch(() => {
        if (this.muted) return
        this.muted = true
        el.muted = true
        const retry = el.play()
        if (retry && retry.catch) retry.catch(() => {})
      })
    },
    // A dead stream can leave the peer connection "connected" while frames stop
    // arriving - renegotiate when the video stops advancing.
    watchFreeze () {
      if (this.freezeTimer) return
      this.lastTime = 0
      this.frozenChecks = 0
      this.freezeTimer = setInterval(() => {
        const el = this.$refs.video
        if (!el || el.paused) return
        if (el.currentTime > this.lastTime) {
          this.lastTime = el.currentTime
          this.frozenChecks = 0
          return
        }
        this.frozenChecks += 1
        if (this.frozenChecks >= FREEZE_LIMIT) this.scheduleRetry()
      }, FREEZE_CHECK)
    },
    scheduleRetry () {
      if (this.codecProblem) return
      if (this.retryTimer || this.retries >= MAX_RETRIES) return
      this.retries += 1
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null
        this.restart()
      }, RETRY_DELAY)
    },
    stop () {
      if (this.freezeTimer) {
        clearInterval(this.freezeTimer)
        this.freezeTimer = null
      }
      if (this.retryTimer) {
        clearTimeout(this.retryTimer)
        this.retryTimer = null
      }
      if (this.session) {
        this.session.close()
        this.session = null
      }
      const el = this.$refs.video
      if (el) el.srcObject = null
      this.status = 'new'
    },
    restart () {
      this.stop()
      this.start()
    },
    retryNow () {
      this.retries = 0
      this.restart()
    },
    // safari needs the webkit names; iOS has no element fullscreen - only the video itself
    toggleFullscreen () {
      const el = this.$el
      const video = this.$refs.video
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document)
      } else if (el.requestFullscreen) {
        el.requestFullscreen()
      } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen()
      } else if (video && video.webkitEnterFullscreen) {
        video.webkitEnterFullscreen()
      }
    },
    // --- API mirroring player.vue, so call sites can treat both the same ---
    play () {
      const el = this.$refs.video
      if (el) { const p = el.play(); if (p && p.catch) p.catch(() => {}) }
    },
    pause () {
      if (this.$refs.video) this.$refs.video.pause()
    },
    seek () {},
    getCurrentTime () {
      return this.$refs.video ? this.$refs.video.currentTime : 0
    },
    getDuration () {
      return 0
    },
    isPaused () {
      return this.$refs.video ? this.$refs.video.paused : true
    },
    setRate () {},
    setMuted (m) {
      this.muted = m
      if (this.$refs.video) this.$refs.video.muted = m
    },
    isReady () {
      return this.connected
    }
  }
})
</script>

<style lang="sass" scoped>
.wp-wrap
  position: relative
  width: 100%
  height: 100%
  background: #000

.wp-video
  width: 100%
  height: 100%
  object-fit: contain
  background: #000

.wp-state
  position: absolute
  inset: 0
  background: rgba(0, 0, 0, .55)

.wp-hint
  max-width: 340px
  line-height: 1.35
</style>
