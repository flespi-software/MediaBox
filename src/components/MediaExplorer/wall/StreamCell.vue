<template>
  <div class="sc-cell">
    <MediaPlayer :options="playerOptions" class="sc-player bg-black" />
    <WallOverlay :label="label" :focused="focused" @toggle-focus="$emit('toggle-focus')">
      <template #lead>
        <span class="sc-live" :class="{ 'sc-ended': stream.ended, 'sc-playback': stream.playback }"><span class="sc-dot" />{{ badge }}</span>
      </template>
      <template #actions>
        <q-btn flat round dense size="sm" color="white" icon="mdi-share-variant"
          @click.stop="$emit('embed', stream.meta.mediastream.uuid)">
          <q-tooltip>Share</q-tooltip>
        </q-btn>
        <q-btn v-if="stream.ended" flat round dense size="sm" color="white" icon="mdi-close"
          @click.stop="$emit('remove', stream.meta.mediastream.uuid)">
          <q-tooltip>Close</q-tooltip>
        </q-btn>
        <q-btn v-else flat round dense size="sm" color="red-4" icon="mdi-stop"
          @click.stop="stop">
          <q-tooltip>Stop stream</q-tooltip>
        </q-btn>
      </template>
    </WallOverlay>
  </div>
</template>

<script>
import { defineComponent } from 'vue'
import MediaPlayer from '../player/player.vue'
import WallOverlay from './WallOverlay.vue'
import { streamSrcUrl, streamMimeType } from '../../../utils/media-url'

// One stream tile: a video.js player on the mediastream + the shared overlay
// (LIVE/PLAYBACK/ENDED badge, share, stop). An ended tile keeps playing what
// the server stored.
export default defineComponent({
  name: 'StreamCell',
  components: { MediaPlayer, WallOverlay },
  props: {
    stream: { type: Object, required: true },
    focused: { type: Boolean, default: false }
  },
  emits: ['toggle-focus', 'embed', 'stop', 'remove'],
  computed: {
    badge () {
      if (this.stream.ended) return 'ENDED'
      return this.stream.playback ? 'PLAYBACK' : 'LIVE'
    },
    label () {
      const ms = this.stream.meta.mediastream
      const ch = ms.channel || (this.stream.meta && this.stream.meta.channel)
      return ch ? `CH ${ch}` : 'Live'
    },
    playerOptions () {
      const ms = this.stream.meta.mediastream
      return {
        autoplay: true,
        controls: true,
        muted: true,
        sources: [
          {
            src: streamSrcUrl(ms),
            type: streamMimeType(ms),
            hasAudio: this.streamHasAudio(ms),
            codec: ms.video_codec
          }
        ],
        poster: streamSrcUrl(ms, 'preview=jpeg')
      }
    }
  },
  methods: {
    // stopped by the user -> drop the tile instead of keeping it as ended
    stop () {
      this.$emit('stop', this.stream.connectionId || this.stream.id)
      this.$emit('remove', this.stream.meta.mediastream.uuid)
    },
    streamHasAudio (ms) {
      const flags = [ms.has_audio, ms.audio]
      if (flags.some((v) => v === false)) return false
      if (flags.some((v) => v === true)) return true
      return undefined
    }
  }
})
</script>

<style lang="sass" scoped>
.sc-cell
  position: relative
  width: 100%
  height: 100%

.sc-player
  width: 100%
  height: 100%

.sc-live
  display: inline-flex
  align-items: center
  gap: 5px
  margin-right: 4px
  color: #fff
  font-size: 11px
  font-weight: 700
  letter-spacing: .5px

.sc-dot
  width: 8px
  height: 8px
  border-radius: 50%
  background: #2ecc71
  box-shadow: 0 0 0 0 rgba(46, 204, 113, .6)
  animation: sc-pulse 1.6s infinite

.sc-playback .sc-dot
  background: #e57373
  animation: none

.sc-ended
  color: #b0bec5
  .sc-dot
    background: #78909c
    animation: none

@keyframes sc-pulse
  0%
    box-shadow: 0 0 0 0 rgba(46, 204, 113, .6)
  70%
    box-shadow: 0 0 0 7px rgba(46, 204, 113, 0)
  100%
    box-shadow: 0 0 0 0 rgba(46, 204, 113, 0)
</style>
