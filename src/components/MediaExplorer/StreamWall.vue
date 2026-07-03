<template>
  <WallShell @close="$emit('close')">
    <template #header-left>
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
    </template>
    <template #header-right>
      <q-btn flat round dense :color="showMap ? 'teal-4' : 'white'" icon="mdi-map-marker-radius"
        @click="toggleMap">
        <q-tooltip>{{ showMap ? 'Hide live map' : 'Show live map' }}</q-tooltip>
      </q-btn>
    </template>

    <div class="sw-body row no-wrap col">
      <WallGrid class="col" :items="streams" :get-key="(s) => s.id" :click-to-expand="false"
        v-model:focus="focusedId">
        <template #empty>
          <div class="column flex-center text-grey-6" style="height:100%">
            <q-icon name="mdi-video-off-outline" size="64px" style="opacity:.45" class="q-mb-md" />
            <div class="text-subtitle1 text-grey-5">No active streams</div>
            <div class="text-caption text-grey-7">Start a live stream from the device to see it here</div>
          </div>
        </template>
        <template #default="{ item, focused, toggleFocus }">
          <StreamCell :stream="item" :focused="focused" @toggle-focus="toggleFocus"
            @embed="(uuid) => $emit('embed', uuid)" @stop="(id) => $emit('stop', id)" />
        </template>
      </WallGrid>

      <TrackMap v-if="showMap" class="sw-track" live :position="livePosition" />
    </div>
  </WallShell>
</template>

<script>
import { defineComponent, defineAsyncComponent } from 'vue'
import { LocalStorage } from 'quasar'
import WallShell from './wall/WallShell.vue'
import WallGrid from './wall/WallGrid.vue'
import StreamCell from './wall/StreamCell.vue'
import { useLivePosition } from '../../composables/useLivePosition'

// the map (with leaflet) loads only when shown
const TrackMap = defineAsyncComponent(() => import('./wall/TrackMap.vue'))

const MAP_PREF = 'mediabox.streamWall.showMap'

export default defineComponent({
  name: 'StreamWall',
  components: { WallShell, WallGrid, StreamCell, TrackMap },
  props: {
    streams: {
      type: Array,
      default: () => []
    },
    device: {
      type: Object,
      default: () => ({})
    }
  },
  emits: ['close', 'stop', 'embed'],
  setup (props) {
    // realtime device position over MQTT (for the live map)
    const livePosition = useLivePosition(props.device && props.device.id)
    return { livePosition }
  },
  data () {
    const pref = LocalStorage.getItem(MAP_PREF)
    return {
      focusedId: null,
      showMap: pref === null ? true : pref
    }
  },
  computed: {
    focusedStream () {
      return this.streams.find((s) => s.id === this.focusedId) || null
    }
  },
  methods: {
    toggleMap () {
      this.showMap = !this.showMap
      LocalStorage.set(MAP_PREF, this.showMap)
    },
    streamLabel (s) {
      const ms = s.meta.mediastream
      const ch = ms.channel || (s.meta && s.meta.channel)
      return ch ? `CH ${ch}` : 'Live'
    }
  }
})
</script>

<style lang="sass" scoped>
.sw-body
  overflow: hidden

.sw-track
  flex: 0 0 40%
  max-width: 560px
  min-width: 300px
  border-left: 1px solid rgba(255, 255, 255, .08)
</style>
