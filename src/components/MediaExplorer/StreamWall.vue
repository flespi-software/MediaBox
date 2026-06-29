<template>
  <div class="stream-wall column bg-black">
    <div class="sw-header row items-center no-wrap q-px-md">
      <template v-if="focusedStream">
        <q-btn flat round dense icon="mdi-arrow-left" color="white" class="q-mr-sm" @click="focusedId = null">
          <q-tooltip>Back to all streams</q-tooltip>
        </q-btn>
        <q-icon name="mdi-video-wireless" color="green-4" size="20px" class="q-mr-sm" />
        <div class="text-white text-subtitle1 ellipsis">{{ streamLabel(focusedStream) }}</div>
      </template>
      <template v-else>
        <q-icon name="mdi-monitor-multiple" color="green-4" size="22px" class="q-mr-sm" />
        <div class="text-white text-subtitle1">Live streams</div>
        <q-badge v-if="streams.length" color="green-7" class="q-ml-sm">{{ streams.length }}</q-badge>
      </template>
      <q-space />
      <q-btn flat round dense icon="mdi-close" color="white" @click="$emit('close')">
        <q-tooltip>Close</q-tooltip>
      </q-btn>
    </div>

    <div v-if="!streams.length" class="col column flex-center text-grey-6">
      <q-icon name="mdi-video-off-outline" size="64px" style="opacity:.45" class="q-mb-md" />
      <div class="text-subtitle1 text-grey-5">No active streams</div>
      <div class="text-caption text-grey-7">Start a live stream from the device to see it here</div>
    </div>

    <div v-else class="sw-scroll col">
      <div class="sw-grid" :style="focusedStream ? '' : gridStyle">
        <div v-for="s in streams" :key="s.id" class="sw-tile"
          :class="{ 'sw-tile-focused': focusedId === s.id, 'sw-tile-hidden': focusedId && focusedId !== s.id }">
          <MediaPlayer :options="playerOptions(s)" class="sw-player bg-black" />
          <div class="sw-overlay row items-center no-wrap" :class="{ 'sw-overlay-pinned': focusedId === s.id }">
            <span class="sw-live"><span class="sw-dot" />LIVE</span>
            <span class="sw-label ellipsis q-ml-sm">{{ streamLabel(s) }}</span>
            <q-space />
            <q-btn flat round dense size="sm" color="white" icon="mdi-share-variant"
              @click.stop="$emit('embed', s.meta.mediastream.uuid)">
              <q-tooltip>Share</q-tooltip>
            </q-btn>
            <q-btn flat round dense size="sm" color="white"
              :icon="focusedId === s.id ? 'mdi-arrow-collapse' : 'mdi-arrow-expand'"
              @click.stop="toggleFocus(s.id)">
              <q-tooltip>{{ focusedId === s.id ? 'Back to grid' : 'Expand' }}</q-tooltip>
            </q-btn>
            <q-btn flat round dense size="sm" color="red-4" icon="mdi-stop"
              @click.stop="$emit('stop', s.id)">
              <q-tooltip>Stop stream</q-tooltip>
            </q-btn>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { defineComponent } from 'vue'
import MediaPlayer from './player/player.vue'
import { streamSrcUrl, streamMimeType } from '../../utils/media-url'

export default defineComponent({
  name: 'StreamWall',
  components: { MediaPlayer },
  props: {
    streams: {
      type: Array,
      default: () => []
    }
  },
  emits: ['close', 'stop', 'embed'],
  data () {
    return {
      focusedId: null
    }
  },
  watch: {
    streams (val) {
      // if the focused stream ended, drop back to the grid
      if (this.focusedId && !val.some(s => s.id === this.focusedId)) {
        this.focusedId = null
      }
    }
  },
  computed: {
    focusedStream () {
      return this.streams.find(s => s.id === this.focusedId) || null
    },
    cols () {
      const n = this.streams.length
      // one column on phones regardless of count
      if (this.$q.screen.lt.md) return n > 1 ? 1 : 1
      if (n <= 1) return 1
      if (n <= 4) return 2
      if (n <= 9) return 3
      return 4
    },
    gridStyle () {
      return `grid-template-columns: repeat(${this.cols}, minmax(0, 1fr));`
    }
  },
  methods: {
    // App-level expand: promote one tile to fill the wall (works inside an iframe
    // without fullscreen permission); click again or "Back" returns to the grid.
    toggleFocus (id) {
      this.focusedId = this.focusedId === id ? null : id
    },
    streamHasAudio (stream) {
      const flags = [stream.has_audio, stream.audio]
      if (flags.some(v => v === false)) return false
      if (flags.some(v => v === true)) return true
      return undefined
    },
    playerOptions (s) {
      const ms = s.meta.mediastream
      return {
        autoplay: true,
        controls: true,
        muted: true,
        sources: [
          {
            src: streamSrcUrl(ms),
            type: streamMimeType(ms),
            hasAudio: this.streamHasAudio(ms)
          }
        ],
        poster: streamSrcUrl(ms, 'preview=jpeg')
      }
    },
    streamLabel (s) {
      const ms = s.meta.mediastream
      const ch = ms.channel || (s.meta && s.meta.channel)
      return ch ? `CH ${ch}` : 'Live'
    }
  }
})
</script>

<style lang="sass">
.stream-wall
  height: 100%
  width: 100%

  .sw-header
    height: 48px
    flex: 0 0 auto
    border-bottom: 1px solid rgba(255, 255, 255, .08)

  .sw-grid
    display: grid
    gap: 8px
    padding: 8px

  .sw-scroll
    overflow-y: auto
    overflow-x: hidden

  .sw-tile
    position: relative
    aspect-ratio: 16/9
    background: #14171c
    border: 1px solid rgba(255, 255, 255, .08)
    border-radius: 8px
    overflow: hidden

  .sw-player
    width: 100%
    height: 100%

  .sw-overlay
    position: absolute
    left: 0
    right: 0
    top: 0
    padding: 4px 6px 14px
    background: linear-gradient(rgba(0, 0, 0, .65), rgba(0, 0, 0, 0))
    opacity: 0
    transition: opacity .15s ease
    pointer-events: none
    .q-btn
      pointer-events: auto

  .sw-tile:hover .sw-overlay
    opacity: 1

  // app-level expand: hide the rest, promote the focused tile to fill the wall
  .sw-tile-hidden
    display: none

  .sw-tile-focused
    position: fixed
    top: 48px
    left: 0
    right: 0
    bottom: 0
    z-index: 5
    aspect-ratio: auto
    border: none
    border-radius: 0

  .sw-overlay-pinned
    opacity: 1

  .sw-label
    color: #fff
    font-size: 12px
    font-weight: 500

  .sw-live
    display: inline-flex
    align-items: center
    gap: 5px
    color: #fff
    font-size: 11px
    font-weight: 700
    letter-spacing: .5px

  .sw-dot
    width: 8px
    height: 8px
    border-radius: 50%
    background: #2ecc71
    box-shadow: 0 0 0 0 rgba(46, 204, 113, .6)
    animation: sw-pulse 1.6s infinite

@keyframes sw-pulse
  0%
    box-shadow: 0 0 0 0 rgba(46, 204, 113, .6)
  70%
    box-shadow: 0 0 0 7px rgba(46, 204, 113, 0)
  100%
    box-shadow: 0 0 0 0 rgba(46, 204, 113, 0)
</style>
