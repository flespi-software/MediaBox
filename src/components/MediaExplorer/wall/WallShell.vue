<template>
  <div class="wall-shell column bg-black">
    <div class="wall-header row items-center no-wrap q-px-md">
      <slot name="header-left" />
      <q-space />
      <slot name="header-right" />
      <q-btn flat round dense icon="mdi-close" color="white" @click="$emit('close')">
        <q-tooltip>Close</q-tooltip>
      </q-btn>
    </div>
    <slot />
  </div>
</template>

<script>
import { defineComponent } from 'vue'

// Full-screen overlay shell shared by the live (StreamWall) and recorded
// (CameraWall) walls: a fixed backdrop + a 48px header with a close button.
// Header content is supplied via the header-left / header-right slots.
export default defineComponent({
  name: 'WallShell',
  emits: ['close']
})
</script>

<style lang="sass" scoped>
.wall-shell
  // fixed (not absolute) so it anchors to the viewport, not the containerized
  // q-layout which is ~10px wider and would push content off the right edge
  position: fixed
  inset: 0
  height: 100%
  width: 100%

.wall-header
  height: 48px
  flex: 0 0 auto
  border-bottom: 1px solid rgba(255, 255, 255, .08)
</style>
