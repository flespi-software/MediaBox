<template>
  <q-dialog v-model="open" persistent position="bottom" @hide="stop">
    <q-card class="ac-card">
      <q-card-section class="row items-center no-wrap q-py-sm">
        <q-icon :name="modeIcon" :color="modeMeta.color" size="22px" class="q-mr-sm" />
        <div class="column" style="min-width:0">
          <div class="row items-center no-wrap" :class="{ 'ac-switch': canSwitch }">
            <div class="text-subtitle1 text-weight-medium ellipsis">{{ modeLabel }}</div>
            <q-icon v-if="canSwitch" name="mdi-chevron-down" size="18px" color="blue-grey-4" class="q-ml-xs" />
            <q-menu v-if="canSwitch" auto-close anchor="bottom left" self="top left">
              <q-list dense style="min-width:210px">
                <q-item-label header class="q-py-xs">Audio sessions</q-item-label>
                <q-item v-for="s in sessions" :key="s.uuid" clickable @click="pick(s)">
                  <q-item-section avatar style="min-width:32px">
                    <q-icon :name="audioMode(s.mode).icon" :color="audioMode(s.mode).color" size="20px" />
                  </q-item-section>
                  <q-item-section>
                    <q-item-label>{{ audioMode(s.mode).label }} · CH {{ s.channel }}</q-item-label>
                    <q-item-label caption>{{ sessionAge(s) }}</q-item-label>
                  </q-item-section>
                  <q-item-section side v-if="s.uuid === uuid">
                    <q-icon name="mdi-check" size="16px" color="teal-4" />
                  </q-item-section>
                </q-item>
              </q-list>
            </q-menu>
          </div>
          <div class="text-caption text-grey-5">CH {{ channel }}</div>
        </div>
        <q-space />
        <div class="row items-center no-wrap">
          <span class="ac-dot" :class="stateClass" />
          <span class="text-caption text-grey-4">{{ stateLabel }}</span>
          <q-btn v-if="canTalk" flat round dense size="sm" icon="mdi-cog-outline" color="blue-grey-4"
            class="q-ml-sm">
            <q-tooltip>Echo suppression while you talk</q-tooltip>
            <q-menu anchor="bottom right" self="top right">
              <div class="q-pa-md" style="width:280px">
                <div class="text-caption text-grey-4">While transmitting</div>
                <q-slider v-model="duck" :min="0" :max="100" :step="10" dense color="teal-4" class="q-mt-sm" />
                <div class="text-caption text-grey-6">
                  {{ duck === 0 ? 'vehicle muted' : `vehicle at ${duck}%` }} - louder means you may
                  hear your own voice back through the device speaker
                </div>
                <div class="text-caption text-grey-4 q-mt-md">Release tail</div>
                <q-slider v-model="echoTail" :min="0" :max="2000" :step="50" dense color="teal-4" class="q-mt-sm" />
                <div class="text-caption text-grey-6">
                  {{ echoTail }} ms - how long the suppression is held after you let go, to cover
                  the audio still in flight
                </div>
              </div>
            </q-menu>
          </q-btn>
          <q-btn flat round dense size="sm" icon="mdi-close" color="blue-grey-4" class="q-ml-sm"
            @click="open = false">
            <q-tooltip>Close the panel - the session keeps running on the device</q-tooltip>
          </q-btn>
        </div>
      </q-card-section>

      <q-separator color="blue-grey-9" />

      <q-card-section class="q-pa-md">
        <q-banner v-if="downgraded" dense rounded class="bg-blue-grey-8 text-white q-mb-md text-caption">
          <template #avatar><q-icon name="mdi-headphones" color="white" /></template>
          Someone else holds the intercom on this session.
          <div class="text-grey-4">You hear the vehicle only - the other operator's voice is not
            mixed in, and you cannot talk until they hang up.</div>
        </q-banner>
        <q-banner v-else-if="micError" dense rounded class="bg-orange-9 text-white q-mb-md text-caption">
          <template #avatar><q-icon name="mdi-microphone-off" color="white" /></template>
          {{ micError }}
        </q-banner>

        <!-- loudness over the last seconds: the vehicle up, our microphone down -->
        <div v-if="receives || canTalk" class="row items-center no-wrap q-mb-md">
          <div class="column q-mr-sm">
            <q-icon v-if="receives" name="mdi-volume-high" size="16px" color="cyan-4" />
            <q-icon v-if="canTalk" name="mdi-microphone" size="16px" color="red-5" />
          </div>
          <canvas ref="scope" class="ac-scope col" />
          <q-btn v-if="receives" flat round dense size="sm" class="q-ml-sm" :color="muted ? 'blue-grey-5' : 'teal-4'"
            :icon="muted ? 'mdi-volume-off' : 'mdi-volume-high'" @click="muted = !muted">
            <q-tooltip>{{ muted ? 'Unmute' : 'Mute' }}</q-tooltip>
          </q-btn>
        </div>

        <div v-if="receives && boosted" class="row items-center no-wrap q-mb-md">
          <q-icon name="mdi-tune" size="16px" color="blue-grey-4" class="q-mr-sm">
            <q-tooltip>Boost the incoming audio - device microphones are often quiet</q-tooltip>
          </q-icon>
          <q-slider v-model="boost" :min="100" :max="400" :step="25" dense color="teal-4"
            class="col q-mr-sm" />
          <div class="text-caption text-grey-5" style="width:42px;text-align:right">{{ boost }}%</div>
        </div>

        <template v-if="canTalk">
          <q-btn class="full-width ac-talk" :class="{ 'ac-talking': talking }" no-caps unelevated
            :color="talking ? 'red-6' : 'teal-7'" :disable="!connected || !micTrack"
            :icon="talking ? 'mdi-microphone' : 'mdi-microphone-outline'"
            :label="openMic ? (talking ? 'Open mic - transmitting' : 'Open mic') : (talking ? 'Transmitting…' : 'Hold to talk')"
            @pointerdown="startTalk" />
          <div class="row items-center q-mt-sm">
            <q-toggle v-model="openMic" dense size="sm" color="teal-4" label="Open mic" />
            <q-space />
            <span class="text-caption text-grey-6">hold the button, or keep the mic open</span>
          </div>
        </template>
      </q-card-section>

      <q-separator color="blue-grey-9" />

      <q-card-actions align="right" class="q-px-md">
        <q-btn flat no-caps label="Hang up" color="red-4" icon="mdi-phone-hangup" @click="hangUp">
          <q-tooltip>End the session on the device</q-tooltip>
        </q-btn>
      </q-card-actions>

      <audio ref="audio" autoplay />
    </q-card>
  </q-dialog>
</template>

<script>
import { defineComponent } from 'vue'
import { openWebrtcStream, isWebrtcSupported } from '../../utils/webrtc'
import { LocalStorage } from 'quasar'
import { audioMode, LISTENING, BROADCAST } from '../../utils/audio-mode'

// the device audio stays muted this long past release, so the tail of our own
// voice - played by the device speaker back into its microphone - does not loop
const ECHO_TAIL = 300
const LEVEL_DECAY = 0.6
// one bar per SCOPE_MS, BAR px wide - together about ten seconds of history
const SCOPE_MS = 80
const BAR = 3
const SCOPE_KEEP = 400
// the scope floor: quiet speech should still show, so bars are drawn in dB
const SCOPE_FLOOR_DB = -60
const BOOST_PREF = 'mediabox.audioCall.boost'
const DUCK_PREF = 'mediabox.audioCall.duck'
const TAIL_PREF = 'mediabox.audioCall.tail'

export default defineComponent({
  name: 'AudioCall',
  emits: ['stop', 'switch'],
  props: {
    // every live audio session on the device, for the header switcher
    sessions: {
      type: Array,
      default: () => []
    }
  },
  data () {
    return {
      open: false,
      url: null,
      uuid: null,
      connectionId: null,
      mode: LISTENING,
      channel: 1,
      session: null,
      status: 'new',
      micTrack: null,
      micStream: null,
      micError: null,
      openMic: false,
      boost: LocalStorage.getItem(BOOST_PREF) || 100,
      // how much of the vehicle audio survives while we transmit, 0 = muted
      duck: LocalStorage.getItem(DUCK_PREF) === null ? 0 : LocalStorage.getItem(DUCK_PREF),
      echoTail: LocalStorage.getItem(TAIL_PREF) === null ? ECHO_TAIL : LocalStorage.getItem(TAIL_PREF),
      boosted: false,
      outGain: null,
      echoMuted: false,
      // what the server agreed to: null until the answer is applied
      allowed: null,
      talking: false,
      muted: false,
      level: 0,
      levels: [],
      micLevel: 0,
      micLevels: [],
      lastSample: 0,
      audioCtx: null,
      analyser: null,
      micAnalyser: null,
      levelRaf: null,
      echoTimer: null
    }
  },
  computed: {
    connected () {
      return this.status === 'connected'
    },
    // switching leaves the other sessions running on the device
    canSwitch () {
      return this.sessions.length > 1
    },
    // the negotiated direction wins over the requested mode - the server
    // downgrades every client but the one holding the intercom
    receives () {
      if (this.allowed) return this.allowed.recv
      return this.mode !== BROADCAST
    },
    canTalk () {
      if (this.allowed) return this.allowed.send
      return this.mode !== LISTENING
    },
    // asked to talk, but the intercom is held by someone else
    downgraded () {
      return this.mode !== LISTENING && !!this.allowed && !this.allowed.send
    },
    // a downgraded intercom is a listening session in all but name
    modeMeta () {
      return audioMode(this.downgraded ? LISTENING : this.mode)
    },
    modeLabel () {
      return this.modeMeta.label
    },
    modeIcon () {
      return this.modeMeta.icon
    },
    stateLabel () {
      if (this.connected) return 'connected'
      if (this.status === 'failed') return 'failed'
      if (this.status === 'mic') return 'waiting for microphone…'
      return 'connecting…'
    },
    stateClass () {
      if (this.connected) return 'ac-dot-on'
      return this.status === 'failed' ? 'ac-dot-bad' : 'ac-dot-wait'
    }
  },
  watch: {
    muted () {
      this.applyOutput()
    },
    boost (v) {
      LocalStorage.set(BOOST_PREF, v)
      this.applyOutput()
    },
    duck (v) {
      LocalStorage.set(DUCK_PREF, v)
      this.applyOutput()
    },
    echoTail (v) {
      LocalStorage.set(TAIL_PREF, v)
    },
    openMic (v) {
      // open mic keeps the track on the sender; PTT hands it over only while held
      if (!this.session) return
      this.setTalking(v)
    }
  },
  created () {
    this.onPointerUp = () => { if (!this.openMic) this.setTalking(false) }
  },
  beforeUnmount () {
    this.stop()
  },
  methods: {
    // start a session: url from the mediastream, mode/channel from the command
    start ({ url, mode, channel, connectionId, uuid }) {
      this.stop()
      this.url = url
      this.uuid = uuid || null
      this.connectionId = connectionId || null
      this.mode = typeof mode === 'number' ? mode : LISTENING
      this.channel = channel || 1
      this.open = true
      this.$nextTick(() => this.connect())
    },
    audioMode,
    // sessions can share a channel, so the list also says how old each one is
    sessionAge (s) {
      if (!s.established) return ''
      const secs = Math.max(0, Math.floor(Date.now() / 1000 - s.established))
      if (secs < 60) return `started ${secs}s ago`
      if (secs < 3600) return `started ${Math.floor(secs / 60)}m ago`
      return `started ${Math.floor(secs / 3600)}h ago`
    },
    pick (session) {
      if (session.uuid === this.uuid) return
      this.$emit('switch', session.entry)
    },
    async connect () {
      if (!isWebrtcSupported()) {
        this.status = 'failed'
        return
      }
      // the browser asks for permission here, so say what we are waiting for
      if (this.canTalk) this.status = 'mic'
      const mic = this.canTalk ? await this.getMic() : null
      // no microphone in an intercom session still lets us listen
      if (!mic && this.mode === BROADCAST) {
        this.status = 'failed'
        return
      }
      this.status = 'signaling'
      this.session = openWebrtcStream(this.url, {
        video: false,
        mic,
        onStream: (stream) => this.attach(stream),
        onState: (s) => { this.status = s }
      })
      // hand the microphone over to PTT only once the answer is applied, so the
      // negotiation sees the track exactly as the device expects it
      this.session.ready.then(() => {
        this.allowed = this.session.negotiated()
        if (this.downgraded) this.releaseMic()
        else this.setTalking(this.openMic)
        if (this.micStream) this.micAnalyser = this.analyserFor(this.micStream)
        // broadcast gets no incoming audio, so nothing else starts the loop
        if (!this.analyser) this.meter(null)
      }).catch(() => {})
      window.addEventListener('pointerup', this.onPointerUp)
      window.addEventListener('pointercancel', this.onPointerUp)
    },
    async getMic () {
      try {
        this.micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        })
        this.micTrack = this.micStream.getAudioTracks()[0] || null
        this.micError = null
        return this.micTrack
      } catch (e) {
        this.micTrack = null
        this.micError = this.mode === BROADCAST
          ? `Broadcast needs a microphone: ${e.name}`
          : `No microphone (${e.name}) - you can listen, but not talk.`
        return null
      }
    },
    attach (stream) {
      const el = this.$refs.audio
      if (!el || !this.receives) return
      // the element keeps the stream pumping; the sound itself goes out through
      // the WebAudio chain, which is the only way to push past 100% volume
      el.srcObject = stream
      el.muted = this.boosted
      const p = el.play()
      if (p && p.catch) p.catch(() => { this.micError = 'Click anywhere to enable sound.' })
      this.buildOutput(stream)
      this.meter(stream)
    },
    ctx () {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return null
      if (!this.audioCtx) this.audioCtx = new Ctx()
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume().catch(() => {})
      return this.audioCtx
    },
    // source -> compressor -> gain -> analyser -> speakers. The compressor lifts
    // quiet speech (the device microphones are weak) without clipping the peaks,
    // and the analyser sits last so the scope shows what is actually heard.
    buildOutput (stream) {
      try {
        const ctx = this.ctx()
        if (!ctx) return
        const src = ctx.createMediaStreamSource(stream)
        const comp = ctx.createDynamicsCompressor()
        comp.threshold.value = -30
        comp.knee.value = 20
        comp.ratio.value = 6
        comp.attack.value = 0.005
        comp.release.value = 0.2
        this.outGain = ctx.createGain()
        // catches the peaks the make-up gain would otherwise push into clipping
        const limiter = ctx.createDynamicsCompressor()
        limiter.threshold.value = -3
        limiter.knee.value = 0
        limiter.ratio.value = 20
        limiter.attack.value = 0.001
        limiter.release.value = 0.1
        this.analyser = ctx.createAnalyser()
        this.analyser.fftSize = 512
        src.connect(comp)
        comp.connect(this.outGain)
        this.outGain.connect(limiter)
        limiter.connect(this.analyser)
        this.analyser.connect(ctx.destination)
        this.boosted = true
        this.applyOutput()
        const el = this.$refs.audio
        if (el) el.muted = true
      } catch (e) {
        // no WebAudio - fall back to plain element playback, without the boost
        this.boosted = false
        const el = this.$refs.audio
        if (el) el.muted = this.muted
      }
    },
    // one place deciding what actually reaches the speakers
    applyOutput () {
      const level = this.muted ? 0 : (this.echoMuted ? this.duck / 100 : 1)
      if (this.boosted && this.outGain) {
        this.outGain.gain.value = level * this.boost / 100
        return
      }
      // without WebAudio the element can only be on or off
      const el = this.$refs.audio
      if (el) el.muted = level === 0
    },
    // an analyser on a stream, sharing one audio context
    analyserFor (stream) {
      const ctx = this.ctx()
      if (!ctx || !stream) return null
      const node = ctx.createAnalyser()
      node.fftSize = 512
      ctx.createMediaStreamSource(stream).connect(node)
      return node
    },
    // levels for the scope: what the vehicle sends, and what we send back
    meter (stream) {
      try {
        if (this.levelRaf) return // already running
        if (stream && !this.analyser) this.analyser = this.analyserFor(stream)
        const buf = new Uint8Array((this.analyser || this.micAnalyser || { frequencyBinCount: 256 }).frequencyBinCount)
        const micBuf = new Uint8Array(buf.length)
        const tick = (now) => {
          if (!this.analyser && !this.micAnalyser) return
          this.level = Math.max(this.peakOf(this.analyser, buf), this.level * LEVEL_DECAY)
          // only what actually leaves for the device counts as our own signal
          const sending = this.talking ? this.peakOf(this.micAnalyser, micBuf) : 0
          this.micLevel = Math.max(sending, this.micLevel * LEVEL_DECAY)
          if (!this.lastSample || now - this.lastSample >= SCOPE_MS) {
            this.lastSample = now
            this.push(this.levels, this.level)
            this.push(this.micLevels, this.micLevel)
            this.drawScope()
          }
          this.levelRaf = requestAnimationFrame(tick)
        }
        this.levelRaf = requestAnimationFrame(tick)
      } catch (e) { /* no meter, the call still works */ }
    },
    // linear peaks put quiet speech in the bottom pixel, so draw them in dB
    scale (v) {
      if (!v) return 0
      const db = 20 * Math.log10(v)
      if (db <= SCOPE_FLOOR_DB) return 0
      return Math.min(1, (db - SCOPE_FLOOR_DB) / -SCOPE_FLOOR_DB)
    },
    peakOf (node, buf) {
      if (!node) return 0
      node.getByteTimeDomainData(buf)
      let peak = 0
      for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128) / 128)
      return peak
    },
    push (arr, v) {
      arr.push(v)
      if (arr.length > SCOPE_KEEP) arr.splice(0, arr.length - SCOPE_KEEP)
    },
    // bars run right to left: newest at the right edge, older ones fading out
    drawScope () {
      const c = this.$refs.scope
      if (!c) return
      const w = c.clientWidth
      const h = c.clientHeight
      if (!w || !h) return
      const dpr = window.devicePixelRatio || 1
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr)
        c.height = Math.round(h * dpr)
      }
      const ctx = c.getContext('2d')
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const count = Math.floor(w / BAR)
      const mid = Math.round(h / 2)
      const half = mid - 1
      ctx.fillStyle = 'rgba(255, 255, 255, .12)'
      ctx.fillRect(0, mid, w, 1)
      const trace = (levels, color, up) => {
        const start = Math.max(0, levels.length - count)
        ctx.fillStyle = color
        for (let i = start; i < levels.length; i++) {
          const bh = Math.max(levels[i] > 0.005 ? 1 : 0, this.scale(levels[i]) * half)
          if (!bh) continue
          const x = w - (levels.length - i) * BAR
          ctx.globalAlpha = 0.3 + 0.7 * ((i - start) / Math.max(1, count))
          ctx.fillRect(x, up ? mid - bh : mid + 1, BAR - 1, bh)
        }
        ctx.globalAlpha = 1
      }
      trace(this.levels, '#26c6da', true)
      trace(this.micLevels, '#ef5350', false)
    },
    startTalk () {
      if (this.openMic || !this.connected) return
      this.setTalking(true)
    },
    // hand the mic to the sender and hold back the device audio while we talk
    setTalking (on) {
      if (!this.session || !this.session.canTalk()) return
      this.talking = on
      this.session.setMic(on ? this.micTrack : null)
      if (this.openMic) return
      this.clearEcho()
      if (on) {
        this.echoMuted = true
        this.applyOutput()
      } else {
        this.echoTimer = setTimeout(() => {
          this.echoMuted = false
          this.applyOutput()
          this.echoTimer = null
        }, this.echoTail)
      }
    },
    // leaving the panel only drops our end; hanging up ends the session, so the
    // device does not keep an open microphone until the command TTL runs out
    hangUp () {
      if (this.connectionId) this.$emit('stop', this.connectionId)
      this.open = false
    },
    // give the microphone back when we turn out to be a listener, so the browser
    // stops showing this tab as recording
    releaseMic () {
      this.talking = false
      this.micAnalyser = null
      if (this.session) this.session.setMic(null)
      if (this.micStream) {
        this.micStream.getTracks().forEach(t => t.stop())
        this.micStream = null
      }
      this.micTrack = null
      this.micError = null
    },
    clearEcho () {
      if (this.echoTimer) {
        clearTimeout(this.echoTimer)
        this.echoTimer = null
      }
    },
    stop () {
      window.removeEventListener('pointerup', this.onPointerUp)
      window.removeEventListener('pointercancel', this.onPointerUp)
      this.clearEcho()
      if (this.levelRaf) {
        cancelAnimationFrame(this.levelRaf)
        this.levelRaf = null
      }
      this.analyser = null
      this.micAnalyser = null
      this.outGain = null
      this.boosted = false
      this.echoMuted = false
      if (this.audioCtx) {
        this.audioCtx.close().catch(() => {})
        this.audioCtx = null
      }
      if (this.session) {
        this.session.close()
        this.session = null
      }
      if (this.micStream) {
        this.micStream.getTracks().forEach(t => t.stop())
        this.micStream = null
      }
      const el = this.$refs.audio
      if (el) el.srcObject = null
      this.micTrack = null
      this.uuid = null
      this.allowed = null
      this.talking = false
      this.level = 0
      this.levels = []
      this.micLevel = 0
      this.micLevels = []
      this.lastSample = 0
      this.status = 'new'
    }
  }
})
</script>

<style lang="sass" scoped>
.ac-card
  width: 420px
  max-width: 100%
  margin-bottom: 24px
  background: #1b2026

.ac-switch
  cursor: pointer
  &:hover .text-subtitle1
    color: #4dd0e1

.ac-dot
  width: 8px
  height: 8px
  border-radius: 50%
  margin-right: 6px
  background: #607d8b

.ac-dot-on
  background: #2ecc71

.ac-dot-bad
  background: #e74c3c

.ac-dot-wait
  background: #f0b429

.ac-scope
  height: 36px
  border-radius: 4px
  background: rgba(255, 255, 255, .04)

.ac-talk
  height: 56px
  font-size: 15px
  letter-spacing: .3px
  touch-action: none
  user-select: none

.ac-talking
  box-shadow: 0 0 0 3px rgba(231, 76, 60, .35)
</style>
