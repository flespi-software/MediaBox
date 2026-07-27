<template>
  <WallShell @close="$emit('close')">
    <template #header-left>
      <q-icon name="mdi-view-grid-plus" color="teal-4" size="22px" class="q-mr-sm" />
      <div class="text-white text-subtitle1">Camera wall</div>
      <q-badge v-if="channels.length" color="teal-7" class="q-ml-sm">{{ channels.length }} ch</q-badge>
      <div class="text-caption text-blue-grey-4 q-ml-md">{{ date }}</div>
    </template>
    <template #header-right>
      <q-btn v-if="visibleChannels.length" flat dense no-caps color="teal-4" icon="mdi-view-grid"
        label="All channels" class="q-mr-sm" @click="showAllChannels">
        <q-tooltip>Show all channels ({{ visibleChannels.length }} selected)</q-tooltip>
      </q-btn>
      <q-btn flat round dense :color="showPreviews ? 'teal-4' : 'white'"
        :icon="showPreviews ? 'mdi-image-multiple' : 'mdi-image-multiple-outline'"
        @click="showPreviews = !showPreviews">
        <q-tooltip>{{ showPreviews ? 'Hide previews' : 'Show previews' }}</q-tooltip>
      </q-btn>
      <q-btn flat round dense :color="showTrack ? 'teal-4' : 'white'" icon="mdi-map-marker-path"
        @click="toggleTrack">
        <q-tooltip>{{ showTrack ? 'Hide device track' : 'Show device track' }}</q-tooltip>
      </q-btn>
    </template>

    <div class="cw-body row no-wrap col">
      <WallGrid class="col" :items="gridChannels" :get-key="(ch) => ch" v-model:focus="focusedChannel">
        <template #empty>
          <div class="column flex-center text-grey-6" style="height:100%">
            <q-icon name="mdi-video-off-outline" size="64px" style="opacity:.45" class="q-mb-md" />
            <div class="text-subtitle1 text-grey-5">No video or image channels for this day</div>
          </div>
        </template>
        <template #default="{ item, focused, toggleFocus }">
          <CameraCell :channel="item" :segments="lanes[item]" :t="t" :playing="playing" :rate="rate"
            :focused="focused" :active="String(activeChannel) === String(item)" :audio-on="audioChannel === item"
            @toggle-focus="toggleFocus" @toggle-audio="toggleAudio(item)" />
        </template>
      </WallGrid>
      <TrackMap v-if="showTrack" class="cw-track" :t="t" :track="track" :loading="trackLoading"
        :playing="playing" :range-from="boundStart" :range-to="boundEnd" :coverage="videoCoverage"
        :position="livePosition" @seek="onSeek" @seek-play="onSeekPlay" />
    </div>

    <MediaTimeline ref="wallTimeline" class="cw-timeline" :device="device" :intervals="wallEvents" :date="date"
      :playhead="t" scrubbable zoomable :initial-zoom="initialZoom" :highlight-channel="activeChannel"
      :highlight-channels="timelineDimSet"
      :nopreviews="!showPreviews"
      @seek="onSeek" @scrub-start="onScrubStart" @scrub-end="onScrubEnd" @select-channel="onSelectChannel"
      @itemClick="onPreviewClick" @zoom-change="onZoomChange" />

    <CameraControls :playing="playing" :rate="rate" :skip-gaps="skipGaps" :t="t"
      @toggle-play="toggle" @set-rate="setRate" @toggle-skip="v => skipGaps = v"
      @prev="gotoClip(-1)" @next="gotoClip(1)" />
  </WallShell>
</template>

<script>
import { defineComponent, defineAsyncComponent, computed, watch } from 'vue'
import { LocalStorage } from 'quasar'
import throttle from 'lodash/throttle'

const TRACK_PREF = 'mediabox.cameraWall.showTrack'
import { fileKind } from '../../../utils/file-type'
import { useMasterClock } from '../../../composables/useMasterClock'
import { buildCameraModel } from '../../../composables/useCameraChannels'
import { useLivePosition } from '../../../composables/useLivePosition'
import WallShell from '../wall/WallShell.vue'
import WallGrid from '../wall/WallGrid.vue'
import CameraCell from './CameraCell.vue'
import MediaTimeline from '../timeline/timeline.vue'
import CameraControls from './CameraControls.vue'

// the map (with leaflet) loads only when the track is shown
const TrackMap = defineAsyncComponent(() => import('../wall/TrackMap.vue'))

export default defineComponent({
  name: 'CameraWall',
  components: { WallShell, WallGrid, CameraCell, MediaTimeline, CameraControls, TrackMap },
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

    // realtime "now" marker, only for today
    const nowSec = Date.now() / 1000
    const livePosition = useLivePosition(props.device.id, nowSec >= dayStart && nowSec < dayEnd)

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

    return { dayStart, dayEnd, model, ...clock, skipCheck, livePosition }
  },
  data () {
    // track panel is open by default; remember if the user closes it
    const pref = LocalStorage.getItem(TRACK_PREF)
    // when opened from a specific file, start with that channel expanded + audible
    const focus = this.initialFocus != null ? String(this.initialFocus) : null
    return {
      skipGaps: true,
      showPreviews: false,
      focusedChannel: focus,
      // the "active" channel: gets sound + timeline highlight (+ the highlight
      // border in the grid). Independent of fullscreen focus, so it can be
      // switched by clicking a lane without expanding the grid.
      activeChannel: focus,
      // ctrl/cmd-clicked channels shown as a subset grid; empty = show all channels
      visibleChannels: [],
      audioChannel: focus, // exactly one cell plays sound; follows the active channel
      wasPlayingBeforeScrub: false,
      showTrack: pref === null ? true : pref,
      track: [],
      trackLoading: false,
      trackLoaded: false
    }
  },
  computed: {
    channels () { return this.model.channels },
    lanes () { return this.model.lanes },
    // channels shown in the grid: the ctrl-clicked subset, or all of them. Kept in
    // the natural channel order (filter the full list rather than the click order)
    gridChannels () {
      if (!this.visibleChannels.length) return this.channels
      const sel = this.channels.filter((ch) => this.visibleChannels.includes(String(ch)))
      return sel.length ? sel : this.channels // never show an empty grid
    },
    // channels the timeline should keep bright (dimming the rest): the fullscreen
    // channel, else the ctrl-selected subset. Empty = grid shows all -> nothing
    // dimmed (the active channel is still ringed via :highlight-channel)
    timelineDimSet () {
      if (this.focusedChannel != null) return [String(this.focusedChannel)]
      return this.visibleChannels
    },
    // video+image only, so the shared timeline's lanes match the grid channels
    wallEvents () {
      return (this.events || []).filter((f) => {
        const k = fileKind(f)
        return k === 'video' || k === 'image'
      })
    },
    // merged time ranges where any channel has video - used to highlight the
    // matching stretches of the map track (and make them clickable to play)
    videoCoverage () {
      const ivs = []
      this.channels.forEach((ch) => {
        (this.lanes[ch] || []).forEach((s) => {
          if (s.kind === 'video') ivs.push([s.start, s.end])
        })
      })
      ivs.sort((a, b) => a[0] - b[0])
      const merged = []
      ivs.forEach(([a, b]) => {
        const last = merged[merged.length - 1]
        if (last && a <= last[1]) last[1] = Math.max(last[1], b)
        else merged.push([a, b])
      })
      return merged.map(([from, to]) => ({ from, to }))
    }
  },
  watch: {
    // keep the skip-gaps guard in sync with the toggle: re-run the check when re-enabled
    skipGaps (on) { if (on) this.skipCheck() },
    // expanding a channel makes it the active one (collapsing to grid keeps it active)
    focusedChannel (val) { if (val !== null) this.activeChannel = val },
    // the active channel is the one that plays sound
    activeChannel (val) { this.audioChannel = val },
    // drop subset entries for channels that no longer exist (e.g. day changed)
    channels (list) {
      if (!this.visibleChannels.length) return
      const keys = list.map(String)
      this.visibleChannels = this.visibleChannels.filter((ch) => keys.includes(ch))
    }
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
    if (this.showTrack && !this.trackLoaded) this.fetchTrack()
    window.addEventListener('keydown', this.onKeydown)
  },
  beforeUnmount () {
    if (this.skipCheck) this.skipCheck.cancel()
    window.removeEventListener('keydown', this.onKeydown)
    this.dispose()
  },
  methods: {
    // solo audio: unmute this channel (mute the rest); press again to mute it too
    toggleAudio (ch) {
      this.audioChannel = this.audioChannel === ch ? null : ch
    },
    toggleTrack () {
      this.showTrack = !this.showTrack
      LocalStorage.set(TRACK_PREF, this.showTrack)
      if (this.showTrack && !this.trackLoaded) this.fetchTrack()
    },
    // load the device's GPS messages for the day and normalize them into a track
    async fetchTrack () {
      this.trackLoading = true
      const fields = 'timestamp,position.latitude,position.longitude,position.speed,position.direction,position.altitude'
      const data = encodeURIComponent(JSON.stringify({ from: this.dayStart, to: this.dayEnd, fields }))
      let res
      try {
        res = await this.$connector.http.get(`gw/devices/${this.device.id}/messages?data=${data}`)
      } catch (e) {
        console.error('Failed to load device track', e)
        this.trackLoading = false
        this.trackLoaded = true
        return
      }
      const rows = (res && res.data && res.data.result) || []
      this.track = rows
        .filter((m) => m['position.latitude'] != null && m['position.longitude'] != null)
        .map((m) => ({
          t: m.timestamp,
          lat: m['position.latitude'],
          lng: m['position.longitude'],
          speed: m['position.speed'],
          dir: m['position.direction'],
          alt: m['position.altitude']
        }))
        .sort((a, b) => a.t - b.t)
      this.trackLoading = false
      this.trackLoaded = true
    },
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
    // clicking a video stretch on the map: jump there and start playing
    onSeekPlay (t) {
      this.seek(t)
      if (!this.playing) this.play()
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
    // clicking a channel's lane on the timeline makes it the active channel
    // (sound + highlight); if a channel is currently expanded, switch the
    // fullscreen view to the clicked one too. Ctrl/cmd-click instead toggles the
    // channel in the subset grid (multi-camera view).
    onSelectChannel (ch, additive) {
      const key = String(ch)
      if (additive) {
        if (!this.visibleChannels.length) {
          // ctrl-click from the "all channels" view starts a subset
          if (String(this.activeChannel) === key) {
            // clicking the channel we're on = turn it off: show every other channel
            // and move the active/sound to one of them (one click, no isolate step)
            const rest = this.channels.map(String).filter((c) => c !== key)
            if (!rest.length) return // single channel — nothing to turn off to
            this.visibleChannels = rest
            this.focusedChannel = null
            this.activeChannel = rest[0]
            return
          }
          // clicking another channel = keep the one we're on and add this one
          const base = this.activeChannel != null ? [String(this.activeChannel)] : []
          this.visibleChannels = [...base, key]
          this.focusedChannel = null // reveal the subset grid, not one fullscreen cell
          this.activeChannel = key
          return
        }
        const i = this.visibleChannels.indexOf(key)
        if (i >= 0) {
          this.visibleChannels.splice(i, 1) // removing the last one -> back to all
          // if the removed channel was active, hand active to a remaining one
          if (String(this.activeChannel) === key && this.visibleChannels.length) {
            this.activeChannel = this.visibleChannels[0]
          }
        } else {
          this.visibleChannels.push(key)
          this.focusedChannel = null
          this.activeChannel = key
          // if the subset now covers every channel, treat it as "show all"
          if (this.visibleChannels.length >= this.channels.length) this.visibleChannels = []
        }
        return
      }
      this.activeChannel = key
      if (this.focusedChannel !== null) this.focusedChannel = key
    },
    // clear the ctrl-click subset -> the grid shows every channel again
    showAllChannels () {
      this.visibleChannels = []
    },
    // Esc: collapse a fullscreen channel first, then drop the subset grid
    onKeydown (e) {
      if (e.key !== 'Escape') return
      if (this.focusedChannel !== null) { this.focusedChannel = null; return }
      if (this.visibleChannels.length) this.showAllChannels()
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
    // zoom range selected on the timeline -> loop playback within it (null = reset)
    onZoomChange (range) {
      if (range) {
        // setRange keeps the playhead if it's already inside the zoom, and only
        // jumps to the start when it fell outside the selected range
        this.setRange(range.from, range.to, true)
      } else {
        this.resetRange()
      }
    }
  }
})
</script>

<style lang="sass" scoped>
.cw-body
  overflow: hidden

.cw-track
  flex: 0 0 40%
  max-width: 560px
  min-width: 300px
  border-left: 1px solid rgba(255, 255, 255, .08)

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
