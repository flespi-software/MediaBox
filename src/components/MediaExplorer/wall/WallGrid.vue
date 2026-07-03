<template>
  <div class="wall-grid-root" ref="root">
    <q-resize-observer @resize="onResize" />
    <slot name="empty" v-if="!items.length" />
    <div v-else class="wall-grid" :style="focus !== null ? '' : gridStyle">
      <div v-for="(it, i) in items" :key="getKey(it)" class="wall-tile"
        :class="{ 'wall-tile-focused': isFocused(it), 'wall-tile-hidden': focus !== null && !isFocused(it) }"
        @click="clickToExpand && toggleFocus(getKey(it))">
        <slot :item="it" :index="i" :focused="isFocused(it)" :toggle-focus="() => toggleFocus(getKey(it))" />
      </div>
    </div>
  </div>
</template>

<script>
import { defineComponent } from 'vue'

const GAP = 8
const PAD = 8
const ASPECT = 16 / 9

// Best-fit grid of 16:9 tiles with app-level focus-expand. Focus is controlled
// by the parent via v-model:focus (the focused item's key, or null). Used by
// both walls; the tile content is provided through the default (scoped) slot.
export default defineComponent({
  name: 'WallGrid',
  props: {
    items: { type: Array, default: () => [] },
    // stable key/id for an item (defaults to the item itself, e.g. a channel string)
    getKey: { type: Function, default: (it) => it },
    // focused item's key (v-model:focus); null = grid view
    focus: { default: null },
    // expand a tile when its body is clicked (off for live cells whose player
    // has its own click controls)
    clickToExpand: { type: Boolean, default: true }
  },
  emits: ['update:focus'],
  data () {
    return { cw: 0, ch: 0 }
  },
  computed: {
    // pick the column/row split that makes the biggest 16:9 tiles while fitting
    // everything inside the container - so the grid never needs to scroll
    layout () {
      const n = this.items.length
      if (!n || !this.cw || !this.ch) return { cols: 1, rows: 1 }
      const availW = this.cw - PAD * 2
      const availH = this.ch - PAD * 2
      let best = { cols: 1, rows: n, size: -1 }
      for (let cols = 1; cols <= n; cols++) {
        const rows = Math.ceil(n / cols)
        const cellW = (availW - GAP * (cols - 1)) / cols
        const cellH = (availH - GAP * (rows - 1)) / rows
        if (cellW <= 0 || cellH <= 0) continue
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
    items (val) {
      // focused item disappeared (stream ended / new data) -> back to the grid
      if (this.focus !== null && !val.some((it) => this.getKey(it) === this.focus)) {
        this.$emit('update:focus', null)
      }
    }
  },
  methods: {
    isFocused (it) {
      return this.focus !== null && this.getKey(it) === this.focus
    },
    onResize (size) {
      this.cw = size.width
      this.ch = size.height
    },
    toggleFocus (key) {
      this.$emit('update:focus', this.focus === key ? null : key)
    }
  }
})
</script>

<style lang="sass" scoped>
.wall-grid-root
  position: relative
  height: 100%
  width: 100%
  overflow: hidden

.wall-grid
  display: grid
  gap: 8px
  padding: 8px
  height: 100%
  width: 100%
  place-items: center

.wall-tile
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

.wall-tile-hidden
  display: none

// expanded: fill the whole grid area, click again to collapse
.wall-tile-focused
  position: absolute
  inset: 0
  z-index: 5
  aspect-ratio: auto
  max-width: none
  max-height: none
  border: none
  border-radius: 0
</style>
