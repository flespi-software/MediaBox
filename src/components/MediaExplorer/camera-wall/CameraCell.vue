<template>
  <div class="cc-cell" :class="{ 'cc-focused': focused }">
    <MediaPlayer v-if="videoOptions" ref="player" :options="videoOptions"
      @ready="onPlayerReady" class="cc-media bg-black" />
    <img v-else-if="imgSrc" :src="imgSrc" class="cc-media cc-img" />
    <div v-else class="cc-media cc-empty column flex-center">
      <q-icon name="mdi-timer-sand-empty" size="26px" style="opacity:.35" color="grey-7" />
      <div class="text-caption text-grey-8 q-mt-xs">no data</div>
    </div>

    <WallOverlay :label="label" :focused="focused" @toggle-focus="$emit('toggle-focus')">
      <template #actions>
        <q-btn v-if="videoOptions" flat round dense size="sm" :color="audioOn ? 'teal-4' : 'white'"
          :icon="audioOn ? 'mdi-volume-high' : 'mdi-volume-off'" @click.stop="$emit('toggle-audio')">
          <q-tooltip>{{ audioOn ? 'Mute' : 'Play sound (mutes the others)' }}</q-tooltip>
        </q-btn>
      </template>
    </WallOverlay>
  </div>
</template>

<script>
import { defineComponent } from 'vue'
import throttle from 'lodash/throttle'
import MediaPlayer from '../player/player.vue'
import WallOverlay from '../wall/WallOverlay.vue'
import { mediaFileUrl } from '../../../utils/media-url'

const DRIFT = 0.3 // seconds of tolerated drift before we seek to correct
const CORRECT_MS = 250 // ~4 Hz correction/boundary-check rate

export default defineComponent({
  name: 'CameraCell',
  components: { MediaPlayer, WallOverlay },
  props: {
    channel: { type: [String, Number], required: true },
    // resolved, non-overlapping segment lane for this channel
    segments: { type: Array, default: () => [] },
    t: { type: Number, required: true },
    playing: { type: Boolean, default: false },
    rate: { type: Number, default: 1 },
    focused: { type: Boolean, default: false },
    // this cell is the one playing sound (all others muted)
    audioOn: { type: Boolean, default: false }
  },
  emits: ['toggle-focus', 'toggle-audio'],
  data () {
    return {
      videoOptions: null,
      imgSrc: null,
      currentUuid: null,
      currentSeg: null,
      inGap: false
    }
  },
  computed: {
    label () {
      return `CH ${this.channel}`
    }
  },
  watch: {
    t () { this.syncThrottled() },
    playing () { this.applyPlayState() },
    rate (r) {
      const p = this.$refs.player
      if (p && p.isReady()) p.setRate(r)
    },
    audioOn () {
      this.applyMute()
    },
    segments () {
      // lane changed (new data / date) - force a clean resolve
      this.currentUuid = null
      this.syncNow()
    }
  },
  created () {
    this.syncThrottled = throttle(this.syncNow, CORRECT_MS, { leading: true, trailing: true })
  },
  mounted () {
    this.syncNow()
  },
  beforeUnmount () {
    if (this.syncThrottled) this.syncThrottled.cancel()
  },
  methods: {
    // binary search the resolved lane for the segment containing time t
    activeAt (t) {
      const segs = this.segments
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
    },
    syncNow () {
      const seg = this.activeAt(this.t)
      if (!seg) {
        // gap / nothing to play: show a black screen (not the last frame of the
        // finished clip) and drop the media so its decoder is released
        this.inGap = true
        this.videoOptions = null
        this.imgSrc = null
        this.currentUuid = null
        this.currentSeg = null
        return
      }
      this.inGap = false
      if (seg.uuid !== this.currentUuid) {
        this.currentUuid = seg.uuid
        this.currentSeg = seg
        if (seg.kind === 'video') {
          this.imgSrc = null
          this.videoOptions = {
            autoplay: false,
            controls: false,
            muted: true,
            sources: [{ src: mediaFileUrl(seg.file), type: seg.file.mime || 'video/mp4' }],
            poster: mediaFileUrl(seg.file, 'preview=jpeg')
          }
          // seek + play happen once the (re)created player emits 'ready'
        } else {
          this.videoOptions = null
          this.imgSrc = mediaFileUrl(seg.file)
        }
        return
      }
      // same file still active - correct video drift
      if (seg.kind === 'video') this.correctVideo(seg)
    },
    correctVideo (seg) {
      const p = this.$refs.player
      if (!p || !p.isReady()) return
      const expected = this.t - seg.file.created
      if (Math.abs(p.getCurrentTime() - expected) > DRIFT) p.seek(Math.max(0, expected))
      p.setRate(this.rate)
      this.applyPlayState()
    },
    applyPlayState () {
      const p = this.$refs.player
      if (!p || !p.isReady() || this.inGap) return
      if (this.playing && p.isPaused()) p.play()
      if (!this.playing && !p.isPaused()) p.pause()
    },
    pauseVideo () {
      const p = this.$refs.player
      if (p && p.isReady() && !p.isPaused()) p.pause()
    },
    onPlayerReady () {
      const seg = this.currentSeg
      if (!seg || seg.kind !== 'video') return
      const p = this.$refs.player
      p.setRate(this.rate)
      p.seek(Math.max(0, this.t - seg.file.created))
      this.applyMute()
      if (this.playing) p.play()
    },
    // exactly one cell plays sound (audioOn); the rest stay muted. Cells autoplay
    // muted for browser policy, then the audio cell is unmuted here.
    applyMute () {
      const p = this.$refs.player
      if (p && p.isReady()) p.setMuted(!this.audioOn)
    }
  }
})
</script>

<style lang="sass" scoped>
.cc-cell
  position: relative
  width: 100%
  height: 100%
  background: #000

.cc-media
  width: 100%
  height: 100%

.cc-img
  object-fit: contain

// letterbox the video at any tile size / aspect (grid or expanded) instead of stretching
.cc-media :deep(video),
.cc-media :deep(.vjs-tech)
  object-fit: contain

.cc-empty
  width: 100%
  height: 100%
  background: #000
</style>
