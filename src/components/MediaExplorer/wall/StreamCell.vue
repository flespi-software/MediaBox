<template>
  <div class="sc-cell">
    <MediaPlayer :options="playerOptions" class="sc-player bg-black" />
    <WallOverlay :label="label" :focused="focused" @toggle-focus="$emit('toggle-focus')">
      <template #lead>
        <span class="sc-live"><span class="sc-dot" />LIVE</span>
      </template>
      <template #actions>
        <q-btn flat round dense size="sm" color="white" icon="mdi-share-variant"
          @click.stop="$emit('embed', stream.meta.mediastream.uuid)">
          <q-tooltip>Share</q-tooltip>
        </q-btn>
        <q-btn flat round dense size="sm" color="red-4" icon="mdi-stop"
          @click.stop="$emit('stop', stream.connectionId || stream.id)">
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

// One live stream tile: a video.js player on the mediastream + the shared
// overlay (LIVE badge, share, stop). No time axis - the stream is live.
export default defineComponent({
  name: 'StreamCell',
  components: { MediaPlayer, WallOverlay },
  props: {
    stream: { type: Object, required: true },
    focused: { type: Boolean, default: false }
  },
  emits: ['toggle-focus', 'embed', 'stop'],
  computed: {
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

@keyframes sc-pulse
  0%
    box-shadow: 0 0 0 0 rgba(46, 204, 113, .6)
  70%
    box-shadow: 0 0 0 7px rgba(46, 204, 113, 0)
  100%
    box-shadow: 0 0 0 0 rgba(46, 204, 113, 0)
</style>
