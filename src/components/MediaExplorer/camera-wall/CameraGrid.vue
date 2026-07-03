<template>
  <div class="cg-root" ref="root">
    <q-resize-observer @resize="onResize" />
    <div v-if="!channels.length" class="column flex-center text-grey-6" style="height:100%">
      <q-icon name="mdi-video-off-outline" size="64px" style="opacity:.45" class="q-mb-md" />
      <div class="text-subtitle1 text-grey-5">No video or image channels for this day</div>
    </div>
    <div v-else class="cg-grid" :style="focusedChannel !== null ? '' : gridStyle">
      <div v-for="ch in channels" :key="ch" class="cg-tile" @click="toggleFocus(ch)"
        :class="{ 'cg-tile-focused': focusedChannel === ch, 'cg-tile-hidden': focusedChannel !== null && focusedChannel !== ch }">
        <CameraCell :channel="ch" :segments="lanes[ch]" :t="t" :playing="playing" :rate="rate"
          :focused="focusedChannel === ch" :audio-on="audioChannel === ch"
          @toggle-focus="toggleFocus(ch)" @toggle-audio="toggleAudio(ch)" />
      </div>
    </div>
  </div>
</template>

<script>
import { defineComponent } from 'vue'
import CameraCell from './CameraCell.vue'

const GAP = 8
const PAD = 8
const ASPECT = 16 / 9

export default defineComponent({
  name: 'CameraGrid',
  components: { CameraCell },
  props: {
    channels: { type: Array, default: () => [] },
    lanes: { type: Object, default: () => ({}) },
    t: { type: Number, required: true },
    playing: { type: Boolean, default: false },
    rate: { type: Number, default: 1 },
    // channel to start expanded (when the camera wall is opened from a specific file)
    initialFocus: { type: [String, Number], default: null }
  },
  emits: ['focus-change'],
  data () {
    const focus = this.initialFocus != null ? String(this.initialFocus) : null
    return {
      focusedChannel: focus,
      audioChannel: focus, // opening/expanding a channel gives it sound
      cw: 0,
      ch: 0
    }
  },
  computed: {
    // pick the column/row split that makes the biggest 16:9 tiles while fitting
    // everything inside the container — so the grid never needs to scroll
    layout () {
      const n = this.channels.length
      if (!n || !this.cw || !this.ch) return { cols: 1, rows: 1 }
      const availW = this.cw - PAD * 2
      const availH = this.ch - PAD * 2
      let best = { cols: 1, rows: n, size: -1 }
      for (let cols = 1; cols <= n; cols++) {
        const rows = Math.ceil(n / cols)
        const cellW = (availW - GAP * (cols - 1)) / cols
        const cellH = (availH - GAP * (rows - 1)) / rows
        if (cellW <= 0 || cellH <= 0) continue
        // largest 16:9 box that fits this cell
        const w = Math.min(cellW, cellH * ASPECT)
        if (w > best.size) best = { cols, rows, size: w }
      }
      return best
    },
    gridStyle () {
      return `grid-template-columns: repeat(${this.layout.cols}, minmax(0, 1fr));` +
        `grid-template-rows: repeat(${this.layout.rows}, minmax(0, 1fr));`
    }
  },
  watch: {
    channels (val) {
      if (this.focusedChannel !== null && !val.includes(this.focusedChannel)) {
        this.focusedChannel = null
      }
    },
    focusedChannel (val) {
      this.$emit('focus-change', val)
      this.audioChannel = val // expand → that channel plays sound; collapse → silence
    }
  },
  mounted () {
    if (this.focusedChannel !== null) this.$emit('focus-change', this.focusedChannel)
  },
  methods: {
    onResize (size) {
      this.cw = size.width
      this.ch = size.height
    },
    // app-level expand (same idea as StreamWall): promote one tile to fill the grid
    toggleFocus (ch) {
      this.focusedChannel = this.focusedChannel === ch ? null : ch
    },
    // solo audio: unmute this cell (mute the rest); press again to mute it too
    toggleAudio (ch) {
      this.audioChannel = this.audioChannel === ch ? null : ch
    }
  }
})
</script>

<style lang="sass" scoped>
.cg-root
  position: relative
  height: 100%
  width: 100%
  overflow: hidden

.cg-grid
  display: grid
  gap: 8px
  padding: 8px
  height: 100%
  width: 100%
  place-items: center

.cg-tile
  position: relative
  width: 100%
  height: 100%
  max-width: 100%
  max-height: 100%
  aspect-ratio: 16 / 9
  background: #000
  border: 1px solid rgba(255, 255, 255, .08)
  border-radius: 8px
  overflow: hidden
  cursor: pointer

.cg-tile-hidden
  display: none

// expanded: fill the whole tiles block (the grid area), click again to collapse
.cg-tile-focused
  position: absolute
  inset: 0
  z-index: 5
  aspect-ratio: auto
  max-width: none
  max-height: none
  border: none
  border-radius: 0
</style>
