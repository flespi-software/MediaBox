<template>
  <div class="cw column bg-black">
    <div class="cw-header row items-center no-wrap q-px-md">
      <q-icon name="mdi-view-grid-plus" color="teal-4" size="22px" class="q-mr-sm" />
      <div class="text-white text-subtitle1">Camera wall</div>
      <q-badge v-if="channels.length" color="teal-7" class="q-ml-sm">{{ channels.length }} ch</q-badge>
      <div class="text-caption text-blue-grey-4 q-ml-md">{{ date }}</div>
      <q-space />
      <q-btn flat round dense :color="showPreviews ? 'teal-4' : 'white'"
        :icon="showPreviews ? 'mdi-image-multiple' : 'mdi-image-multiple-outline'"
        @click="showPreviews = !showPreviews">
        <q-tooltip>{{ showPreviews ? 'Hide previews' : 'Show previews' }}</q-tooltip>
      </q-btn>
      <q-btn flat round dense icon="mdi-close" color="white" @click="$emit('close')">
        <q-tooltip>Close</q-tooltip>
      </q-btn>
    </div>

    <div class="cw-body col">
      <CameraGrid :channels="channels" :lanes="lanes" :t="t" :playing="playing" :rate="rate"
        :initial-focus="initialFocus" @focus-change="focusedChannel = $event" />
    </div>

    <MediaTimeline ref="wallTimeline" class="cw-timeline" :device="device" :intervals="wallEvents" :date="date"
      :playhead="t" scrubbable zoomable :initial-zoom="initialZoom" :highlight-channel="focusedChannel"
      :nopreviews="!showPreviews"
      @seek="onSeek" @scrub-start="onScrubStart" @scrub-end="onScrubEnd"
      @itemClick="onPreviewClick" @zoom-change="onZoomChange" />

    <CameraControls :playing="playing" :rate="rate" :skip-gaps="skipGaps" :t="t"
      @toggle-play="toggle" @set-rate="setRate" @toggle-skip="v => skipGaps = v"
      @prev="gotoClip(-1)" @next="gotoClip(1)" />
  </div>
</template>

<script>
import { defineComponent, computed, watch } from 'vue'
import throttle from 'lodash/throttle'
import { fileKind } from '../../../utils/file-type'
import { useMasterClock } from '../../../composables/useMasterClock'
import { buildCameraModel } from '../../../composables/useCameraChannels'
import CameraGrid from './CameraGrid.vue'
import MediaTimeline from '../timeline/timeline.vue'
import CameraControls from './CameraControls.vue'

export default defineComponent({
  name: 'CameraWall',
  components: { CameraGrid, MediaTimeline, CameraControls },
  props: {
    device: { type: Object, default: () => ({}) },
    events: { type: Array, default: () => [] },
    date: { type: String, required: true },
    // when opened from a specific file: expand that channel, start at its time
    initialFocus: { type: [String, Number], default: null },
    initialTime: { type: Number, default: null },
    autoplay: { type: Boolean, default: false },
    // frame the timeline + loop playback to this range ({from,to} unix seconds)
    initialZoom: { type: Object, default: null }
  },
  emits: ['close'],
  setup (props) {
    const d = new Date(props.date)
    d.setHours(0, 0, 0, 0)
    const dayStart = Math.floor(d.getTime() / 1000)
    const dayEnd = dayStart + 24 * 3600

    const clock = useMasterClock({ dayStart, dayEnd })
    const model = computed(() => buildCameraModel(props.events, { dayStart, dayEnd }))

    // skip-gaps: while playing, if every channel is empty at t, jump to the next
    // segment start (or pause if none remain). Throttled so it rides the clock.
    const skipCheck = throttle(() => {
      if (!clock.playing.value) return
      const m = model.value
      if (m.allChannelsInGap(clock.t.value)) {
        const next = m.nextSegmentStartAfter(clock.t.value)
        if (next != null && next < clock.boundEnd.value) clock.seek(next)
        else if (clock.loop.value) clock.seek(clock.boundStart.value) // wrap within zoom range
        else clock.pause()
      }
    }, 200)

    watch(clock.t, () => { skipCheck() })

    return { dayStart, dayEnd, model, ...clock, skipCheck }
  },
  data () {
    return {
      skipGaps: true,
      showPreviews: false,
      focusedChannel: null,
      wasPlayingBeforeScrub: false
    }
  },
  computed: {
    channels () { return this.model.channels },
    lanes () { return this.model.lanes },
    // video+image only, so the shared timeline's lanes match the grid channels
    wallEvents () {
      return (this.events || []).filter((f) => {
        const k = fileKind(f)
        return k === 'video' || k === 'image'
      })
    }
  },
  watch: {
    // keep the skip-gaps guard in sync with the toggle: re-run the check when re-enabled
    skipGaps (on) { if (on) this.skipCheck() }
  },
  mounted () {
    // frame + loop playback to the opened clip's range, if given
    if (this.initialZoom) this.setRange(this.initialZoom.from, this.initialZoom.to, true)
    // start at the opened file's time if given, else at the first available content
    if (this.initialTime != null) {
      this.seek(this.initialTime)
    } else {
      const first = this.firstContentStart()
      if (first != null) this.seek(first)
    }
    if (this.autoplay) this.play()
  },
  beforeUnmount () {
    if (this.skipCheck) this.skipCheck.cancel()
    this.dispose()
  },
  methods: {
    firstContentStart () {
      let min = null
      this.channels.forEach((ch) => {
        const seg = this.lanes[ch][0]
        if (seg && (min === null || seg.start < min)) min = seg.start
      })
      return min
    },
    onSeek (t) {
      this.seek(t)
      if (this.skipGaps) this.skipCheck()
    },
    onScrubStart () {
      this.wasPlayingBeforeScrub = this.playing
      if (this.playing) this.pause()
    },
    onScrubEnd () {
      if (this.wasPlayingBeforeScrub) this.play()
    },
    // clicking a preview thumbnail jumps the playhead to that file's start
    onPreviewClick (file) {
      if (file && file.created != null) this.onSeek(file.created)
    },
    // jump to the previous/next clip start (within the focused channel, or across
    // all channels in the grid view). Leaving a single-clip zoom first so we can move.
    gotoClip (dir) {
      const rt = this.$refs.wallTimeline
      if (rt && rt.zoomed) rt.resetZoom()
      const target = dir > 0
        ? this.model.nextClipStart(this.t, this.focusedChannel)
        : this.model.prevClipStart(this.t, this.focusedChannel)
      if (target != null) this.seek(target)
    },
    // zoom range selected on the timeline → loop playback within it (null = reset)
    onZoomChange (range) {
      if (range) {
        this.setRange(range.from, range.to, true)
        this.seek(range.from)
      } else {
        this.resetRange()
      }
    }
  }
})
</script>

<style lang="sass" scoped>
.cw
  // anchor to the viewport (not the containerized q-layout, which is ~10px wider
  // than the viewport and would push content off the right edge)
  position: fixed
  inset: 0
  height: 100%
  width: 100%

.cw-header
  height: 48px
  flex: 0 0 auto
  border-bottom: 1px solid rgba(255, 255, 255, .08)

.cw-body
  overflow: hidden

.cw-timeline
  flex: 0 0 auto
  // cancel the component's q-mx-md so the timeline is full-bleed (no black side
  // strips) and align its inner content with the grid's 8px padding
  margin-left: 0
  margin-right: 0
  padding: 6px 8px
  background: #14171c
  border-top: 1px solid rgba(255, 255, 255, .08)
  max-height: 40vh
  overflow-y: auto
  overflow-x: hidden
</style>
