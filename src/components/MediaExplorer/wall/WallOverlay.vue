<template>
  <div class="wall-ov row items-center no-wrap" :class="{ 'wall-ov-pinned': focused }">
    <slot name="lead" />
    <span class="wall-ov-label ellipsis">{{ label }}</span>
    <q-space />
    <slot name="actions" />
    <q-btn flat round dense size="sm" color="white"
      :icon="focused ? 'mdi-arrow-collapse' : 'mdi-arrow-expand'" @click.stop="$emit('toggle-focus')">
      <q-tooltip>{{ focused ? 'Back to grid' : 'Expand' }}</q-tooltip>
    </q-btn>
  </div>
</template>

<script>
import { defineComponent } from 'vue'

// Hover-reveal control bar shared by wall cells: a top gradient strip with a
// label + expand/collapse button, plus lead/actions slots for mode-specific
// controls (LIVE badge, share/stop, audio-solo). Must sit inside a `.wall-tile`.
export default defineComponent({
  name: 'WallOverlay',
  props: {
    label: { type: String, default: '' },
    focused: { type: Boolean, default: false }
  },
  emits: ['toggle-focus']
})
</script>

<style lang="sass">
// not scoped: the reveal keys off hovering the WallGrid `.wall-tile` ancestor,
// which lives in a different component's scope
.wall-ov
  position: absolute
  left: 0
  right: 0
  top: 0
  z-index: 3
  padding: 4px 6px 14px
  background: linear-gradient(rgba(0, 0, 0, .65), rgba(0, 0, 0, 0))
  opacity: 0
  transition: opacity .15s ease
  pointer-events: none
  .q-btn
    pointer-events: auto

// pointer devices reveal controls on hover; touch devices have no hover so the
// controls stay visible at all times
@media (hover: hover)
  .wall-tile:hover .wall-ov
    opacity: 1
@media (hover: none)
  .wall-ov
    opacity: 1

.wall-ov-pinned
  opacity: 1

.wall-ov-label
  color: #fff
  font-size: 12px
  font-weight: 500
</style>
