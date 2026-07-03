<template>
  <div class="q-mx-md">
    <q-resize-observer @resize="onResize" ref="resize" debounce="300" />
    <q-virtual-scroll v-if="!nopreviews" ref="mediaList" :items="visibleIntervals" class="q-mb-xs" virtual-scroll-horizontal>
      <template v-slot="{ item, index }">
        <div class="row items-center q-px-xs q-py-md" v-intersection="onIntersection" :data-created="item.created">
          <MediaItem :media="item" :item="device" :highlighted="current && current.uuid === item.uuid"
            @click="itemClick(item, index)" @embed="(uuid) => $emit('embed', uuid)" style="max-height:100px;" />
        </div>
      </template>
    </q-virtual-scroll>

    <div v-if="fromto" class="mb-tl-lanes relative-position" ref="lanes"
      :class="{ 'mb-tl-interactive': scrubbable || zoomable }"
      @pointerdown="onLanesDown" @pointermove="onLanesMove" @pointerup="onLanesUp"
      @pointercancel="onLanesUp" @click.capture="onLanesClickCapture">

      <div v-for="(intrvl, tl) in timelineIntervals" :key="tl" ref="timeline"
        :style="`margin-bottom:3px;height:16px;width:100%; overflow:hidden;${intrvl.length ? 'border: 1px solid rgba(255,255,255,.10);' : 'border:1px dashed rgba(255,255,255,.18)'}`"
        :class="['rounded-borders', 'relative-position', 'mb-tl-track', { 'mb-tl-dim': highlightChannel != null && String(tl) !== String(highlightChannel) }]"
        title="Click and hold to request media">
        <template v-if="available && available[tl]">
          <div v-for="(tmln, index) of available[tl]" :key="tmln.begin + (index / 10000)"
            :class="`available-interval absolute bg-green-1 rounded-borders`"
            :style="`width:${((tmln.end - tmln.begin) || 1) / secbyperc}%; top:6px; left:${(tmln.begin - viewFromSec) / secbyperc}%; right:initial;`"
            :title="formatUnix(tmln.begin) + ' - ' + formatUnix(tmln.end)" />
        </template>
        <div v-if="!scrubbable" class="absolute-full" v-touch-hold.mouse="(e) => touchHold(e, tl)" @click="(e) => timelineClick(e, tl)">
        </div>
        <div v-for="(interval, index) of intrvl" :key="interval.created + (index / 10000)"
          :class="`interval absolute-top absolute-bottom bg-${interval.meta.type === 'video' ? 'red' : interval.meta.type === 'image' ? 'blue' : 'grey'}-4 ${current && current.uuid === interval.uuid ? 'interval-highlighted' : ''}`"
          :style="`width:${(interval.meta.duration || 1) / secbyperc}%; left:${(interval.created - viewFromSec) / secbyperc}%; right:initial;`"
          :title="formatUnix(interval.created) + ' - ' + formatUnix(interval.created + (interval.meta.duration || 1))"
          @click.stop="onBarClick(interval)" @touchstart.stop @mousedown.stop />
        <div v-if="intrvl.length === 0" :class="`fit text-center text-grey text-bold`" style="font-size:10px">NO DATA
        </div>
      </div>
      <div :style="`height:5px;width:100%;overflow:hidden;`" :class="`relative-position mb-tl-track`"
        title="Click and hold to request media">
        <div v-if="inView.length > 0" class="interval-viewport-upper absolute-top absolute-bottom"
          :style="`width:${(inView[inView.length - 1] - inView[0] || 1) / secbyperc}%; left:${(inView[0] - viewFromSec) / secbyperc}%; right:initial;`">
        </div>
      </div>
      <div class="relative-position text-overline" style="height:20px;line-height:1rem;">
        <div v-for="l in labels" :key="'label' + l" :style="labelStyle(l)" class="absolute-bottom">
          {{ formatUnixTime(viewFromSec + (secbyperc * l)) }}
        </div>
      </div>

      <!-- moving playhead (camera wall / playback modes) -->
      <div v-if="playhead != null && playheadLeft >= 0" class="mb-tl-playhead" :style="`left:${playheadLeft}%`" />
      <!-- drag-select band while choosing a zoom range -->
      <div v-if="selecting" class="mb-tl-select" :style="`left:${selLeft}px;width:${selWidth}px`" />
    </div>

    <div v-if="zoomable && zoomed" class="mb-tl-reset">
      <q-btn dense flat no-caps size="sm" color="teal-4" icon="mdi-magnify-minus-outline"
        label="Reset zoom" @click="resetZoom" />
    </div>
  </div>
</template>

<script lang="js">
// import Vue from 'vue'

import { computed, ref } from 'vue'
import { useAppearanceStore } from '../../../stores/appearance'

import moment from 'moment'
// import { mapState } from 'vuex'
import MediaItem from '../item.vue'

export default {
  name: 'MediaTimeline',
  components: {
    MediaItem
  },
  props: {
    device: null,
    intervals: null,
    timeline: null,
    date: null,
    current: null,
    nopreviews: null,
    // when set (unix seconds), draw a moving playhead line across the lanes
    playhead: { type: Number, default: null },
    // when true, dragging on the lanes emits a raw time via `seek` (free scrub)
    // instead of the snap-to-file `itemClick`/`requestPlayback` behavior
    scrubbable: { type: Boolean, default: false },
    // when true, dragging selects a time range to zoom into (rescales the view,
    // filters the preview list) and emits `zoom-change` ({from,to} or null);
    // click still seeks. A "Reset zoom" button returns to the full day.
    zoomable: { type: Boolean, default: false },
    // start already zoomed to this range ({from,to} unix seconds) — set when the
    // camera wall is opened for a specific clip. Does not emit zoom-change.
    initialZoom: { type: Object, default: null },
    // when a channel is expanded in the camera wall, dim the other channels' lanes
    highlightChannel: { type: [String, Number], default: null }
  },
  setup () {
    const appearance = useAppearanceStore()
    const color = computed(() => appearance.color)
    const labels = ref([0, 25, 50, 75, 100])
    const inView = ref([])
    return {
      color,
      labels,
      inView
    }
  },

  data () {
    return {
      size: { height: 50 },
      scrubbing: false,
      // zoom range (unix seconds) or null for the full day
      zoomStart: null,
      zoomEnd: null,
      // drag-select state
      selecting: false,
      selLeft: 0,
      selWidth: 0,
      downX: 0,
      downTime: 0,
      moved: false,
      pointerDown: false,
      suppressClick: false
    }
  },
  computed: {
    // visible range in unix seconds — the zoom window if set, else the whole day
    viewFromSec () {
      return this.zoomStart != null ? this.zoomStart : this.fromto[0].getTime() / 1000
    },
    viewToSec () {
      return this.zoomEnd != null ? this.zoomEnd : this.fromto[1].getTime() / 1000
    },
    zoomed () {
      return this.zoomStart != null && this.zoomEnd != null
    },
    // files intersecting the visible range (drives the preview list when zoomed)
    visibleIntervals () {
      if (!this.zoomed) return this.intervals
      const from = this.viewFromSec
      const to = this.viewToSec
      return (this.intervals || []).filter((i) => {
        const start = i.created
        const end = i.created + ((i.meta && i.meta.duration) || 1)
        return end > from && start < to
      })
    },
    playheadLeft () {
      if (this.playhead == null || !this.fromto) return -1
      return Math.min(100, Math.max(0, (this.playhead - this.viewFromSec) / this.secbyperc))
    },
    // ...mapState({
    //   color: state => state.color
    // }),
    secbyperc () {
      return (this.viewToSec - this.viewFromSec) / 100
    },
    fromto () {
      const start = new Date(this.date || undefined)
      start.setHours(0, 0, 0, 0)
      const end = new Date(this.date || undefined)
      end.setHours(23, 59, 59, 999)

      return [start, end]
    },
    timelineIntervals () {
      const obj = {}
      this.intervals.forEach((interval) => {
        let tl = null
        if (interval.meta && interval.meta.channel) {
          tl = interval.meta.channel
        } else if (interval.meta && interval.meta.type === 'tacho') {
          tl = 'tacho'
        }
        if (tl !== null) {
          if (!obj[tl]) {
            obj[tl] = []
          }
          obj[tl].push(interval)
        }
      })
      return obj
    },
    available () {
      const obj = {}
      if (this.timeline) {
        this.timeline.forEach((tlel) => {
          if (tlel && tlel.channel) {
            if (!obj[tlel.channel]) {
              obj[tlel.channel] = []
            }
            obj[tlel.channel].push(tlel)
          }
        })
      }
      return obj
    }
  },
  watch: {
    date () {
      this.inView = []
      if (this.zoomed) this.resetZoom() // a new day starts un-zoomed
    },
    initialZoom () {
      this.applyInitialZoom()
    }
  },
  mounted () {
    // console.log(this.$refs.mediaList)
    this.$refs.resize.trigger()
    if (this.$refs.mediaList) {
      this.$refs.mediaList.$el.addEventListener('wheel', (evt) => {
        evt.preventDefault()
        this.$refs.mediaList.$el.scrollLeft += evt.deltaY + evt.deltaX
      })
      if (this.current) {
        this.scrollToTimestamp(this.current.created)
      }
    }
    this.applyInitialZoom()
  },
  beforeUnmount () {
  },
  methods: {
    onResize (size) {
      this.size = size
      this.$emit('resizeTimeline', size)
    },
    // keep the first/last scale labels inside the track instead of hanging off
    // the edges (the middle ones are centered under their tick)
    labelStyle (l) {
      if (l <= 0) return 'left: 0;'
      if (l >= 100) return 'left: auto; right: 0;'
      return `left: calc(${l}% - 16px);`
    },
    // --- scrub + zoom-select (camera wall / playback modes) ---
    // map a clientX to a unix time within the visible range
    timeFromClientX (clientX) {
      const rect = this.$refs.lanes.getBoundingClientRect()
      const x = Math.min(Math.max(clientX - rect.left, 0), rect.width)
      return this.viewFromSec + (x / rect.width) * (this.viewToSec - this.viewFromSec)
    },
    scrubTime (e) {
      return this.timeFromClientX(e.clientX)
    },
    applyZoom (from, to) {
      this.zoomStart = from
      this.zoomEnd = to
      this.$emit('zoom-change', { from, to })
    },
    // set the zoom from the initialZoom prop without emitting (the parent already
    // knows — this just syncs the timeline's view to a programmatic zoom)
    applyInitialZoom () {
      if (this.initialZoom && this.initialZoom.from != null && this.initialZoom.to != null) {
        this.zoomStart = this.initialZoom.from
        this.zoomEnd = this.initialZoom.to
      }
    },
    resetZoom () {
      this.zoomStart = null
      this.zoomEnd = null
      this.$emit('zoom-change', null)
    },
    // Pointer handling on the lanes container serves both modes without an
    // overlay, so the explorer's per-track click (snap-to-file) still works:
    //  - drag  -> select a range to zoom (when zoomable)
    //  - click -> seek (camera wall) or fall through to the track handler (explorer)
    onLanesDown (e) {
      if (!(this.scrubbable || this.zoomable)) return
      this.suppressClick = false
      this.pointerDown = true
      this.downX = e.clientX
      this.downTime = this.timeFromClientX(e.clientX)
      this.moved = false
      if (this.scrubbable && !this.zoomable) {
        // plain scrub mode (drag = seek)
        this.scrubbing = true
        if (this.$refs.lanes.setPointerCapture) this.$refs.lanes.setPointerCapture(e.pointerId)
        this.$emit('scrub-start')
        this.$emit('seek', this.downTime)
      }
    },
    onLanesMove (e) {
      if (!this.pointerDown) return
      if (this.scrubbing) {
        this.$emit('seek', this.scrubTime(e))
        return
      }
      if (!this.zoomable) return
      if (Math.abs(e.clientX - this.downX) > 4) this.moved = true
      if (this.moved) {
        if (!this.selecting) {
          this.selecting = true
          if (this.$refs.lanes.setPointerCapture) this.$refs.lanes.setPointerCapture(e.pointerId)
        }
        const rectLeft = this.$refs.lanes.getBoundingClientRect().left
        this.selLeft = Math.min(this.downX, e.clientX) - rectLeft
        this.selWidth = Math.abs(e.clientX - this.downX)
      }
    },
    onLanesUp (e) {
      if (!this.pointerDown) return
      this.pointerDown = false
      if (this.scrubbing) {
        this.scrubbing = false
        this.$emit('seek', this.scrubTime(e))
        this.$emit('scrub-end')
        return
      }
      if (this.selecting) {
        this.selecting = false
        this.selWidth = 0
        const from = Math.min(this.downTime, this.timeFromClientX(e.clientX))
        const to = Math.max(this.downTime, this.timeFromClientX(e.clientX))
        if (to - from >= 5) this.applyZoom(from, to) // ignore tiny drags
        this.suppressClick = true // swallow the click that follows a drag
        return
      }
      // plain click: seek in camera wall; let it fall through to snap-to-file in explorer
      if (this.scrubbable) {
        this.$emit('seek', this.downTime)
        this.suppressClick = true
      }
    },
    onLanesClickCapture (e) {
      if (this.suppressClick) {
        e.stopPropagation()
        this.suppressClick = false
      }
    },
    onBarClick (interval) {
      if (this.scrubbable) this.$emit('seek', interval.created)
      else this.itemClick(interval)
    },
    touchHold (e, tl) {
      // use the pointer's client x against the track rect (zoom-aware via
      // timeFromClientX) — e.evt.offsetX is measured against the event target,
      // which gives the wrong time (day-relative) when zoomed / on touch
      const x = (e.position && e.position.left != null) ? e.position.left : (e.evt && e.evt.clientX) || 0
      this.$emit('requestPlayback', { channel: parseInt(tl), timestamp: Math.floor(this.timeFromClientX(x)) })
    },
    timelineClick (e, tl) {
      const tlIndex = Object.keys(this.timelineIntervals).indexOf(tl.toString())
      const tlEl = this.$refs.timeline[tlIndex] || this.$refs.timeline[0]
      const time = this.viewFromSec + Math.floor((e.offsetX / (tlEl.clientWidth / 100)) * this.secbyperc)
      const bigger = this.timelineIntervals[tl].findIndex((element) => element.created > time)
      if (bigger > 0) {
        if ((this.timelineIntervals[tl][bigger].created - time) < (time - this.timelineIntervals[tl][bigger - 1].created)) {
          this.$emit('itemClick', this.timelineIntervals[tl][bigger])
          this.scrollToTimestamp(this.timelineIntervals[tl][bigger].created)
        } else {
          this.$emit('itemClick', this.timelineIntervals[tl][bigger - 1])
          this.scrollToTimestamp(this.timelineIntervals[tl][bigger - 1].created)
        }
      } else if (bigger === 0) {
        this.$emit('itemClick', this.timelineIntervals[tl][bigger])
        this.scrollToTimestamp(this.timelineIntervals[tl][bigger].created)
      } else {
        this.$emit('itemClick', this.timelineIntervals[tl][this.timelineIntervals[tl].length - 1])
        if (this.timelineIntervals[tl][bigger - 1]) {
          this.scrollToTimestamp(this.timelineIntervals[tl][bigger - 1].created)
        }
      }
    },
    itemClick (interval, index) {
      // console.log(index)
      this.scrollToTimestamp(interval.created)
      this.$emit('itemClick', interval)
    },
    scrollToTimestamp (timestamp) {
      if (this.$refs.mediaList) {
        const index = this.intervals.findIndex(el => el.created === timestamp) || 0
        this.$refs.mediaList.scrollTo(index)
      }
    },
    formatUnix (unixtime) {
      return moment.unix(parseFloat(unixtime)).format('YYYY-MM-DD HH:mm:ss')
    },
    formatUnixTime (unixtime) {
      return moment.unix(parseFloat(unixtime)).format('HH:mm')
    },
    formatUnixUTCTZ (unixtime) {
      return moment.unix(parseFloat(unixtime)).utc().format()
    },
    onIntersection (entry) {
      // console.log(entry)
      if (entry.isIntersecting === true) {
        this.add(entry.target.dataset.created)
      } else {
        this.remove(entry.target.dataset.created)
      }
    },
    add (i) {
      this.remove(i)
      this.inView.push(i)
      this.inView.sort(this.sortAtoi)
    },
    remove (i) {
      let index
      while ((index = this.inView.indexOf(i)) > -1) {
        this.inView.splice(index, 1)
        this.inView.sort(this.sortAtoi)
      }
    },
    sortAtoi (a, b) {
      return a - b
    }
  }
}
</script>

<style lang="sass" scoped>
.mb-tl-track
  background: #20262b
  transition: opacity .15s ease
// dim channels that aren't the currently expanded one in the camera wall
.mb-tl-dim
  opacity: .3
.interval-viewport-upper
  height:100%
  border-color: #f00
  border-width: 0px 1px 1px 1px
  border-style: solid
  user-select: none
.interval-viewport
  height:100%
  background: #222
  box-shadow: inset 0px 0px 5px yellow
  user-select: none
.interval-highlighted
  box-shadow: 0px 0px 10px yellow
  background: yellow !important
  z-index:1

.available-interval
  height: 2px
  opacity: .2
  top: 6px
.interval
  cursor: pointer
  min-width: 1px
.interval:hover
  z-index: 9999

.mb-tl-playhead
  position: absolute
  top: 0
  bottom: 20px
  width: 2px
  margin-left: -1px
  background: #26c6da
  box-shadow: 0 0 6px rgba(38, 198, 218, .8)
  pointer-events: none
  z-index: 2
  &::before
    content: ''
    position: absolute
    top: -3px
    left: -4px
    width: 10px
    height: 10px
    border-radius: 50%
    background: #26c6da
.mb-tl-interactive
  touch-action: none
.mb-tl-select
  position: absolute
  top: 0
  bottom: 20px
  background: rgba(38, 198, 218, .18)
  border: 1px solid rgba(38, 198, 218, .7)
  pointer-events: none
  z-index: 2
.mb-tl-reset
  padding: 2px 0 0 2px
</style>
