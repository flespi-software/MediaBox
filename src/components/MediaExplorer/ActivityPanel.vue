<template>
<div>
  <template v-for="(c) in connections" :key="c.id">
    <q-item :clickable="!!c.meta" @click="() => { if (isStream(c)) onConnClick(c); else if (c.meta) $emit('openMedia', c.meta) }">
      <q-item-section avatar style="padding-right:10px;min-width:30px;">
        <q-icon name="mdi-video-wireless" v-if="isStream(c)" />
        <q-icon name="mdi-multimedia" v-else-if="c.secondary" />
        <q-icon name="mdi-developer-board" v-else />
      </q-item-section>
      <q-item-section>
        <q-item-label overline v-if="isStream(c)">Stream started
          <q-badge :color="getStreamTypeColor(streamsOf(c)[0].mediastream || streamsOf(c)[0].stream_type)" class="q-ml-xs stream-type-badge">{{ getStreamTypeLabel(streamsOf(c)[0].mediastream || streamsOf(c)[0].stream_type) }}</q-badge>
          <span v-if="streamsOf(c).length > 1" class="q-ml-xs text-blue-grey-4">· {{ streamsOf(c).length }} ch</span>
        </q-item-label>
        <q-item-label overline v-else-if="c.secondary">Media
          uploading</q-item-label>
        <q-item-label overline v-else>Device connected</q-item-label>
        <q-item-label caption :title="formatUnix(c.established)" v-if="tick > 0">{{ formatAgo(c.established ||
          0) }}</q-item-label>
      </q-item-section>
      <q-item-section side v-if="isStream(c)" style="padding-left:10px;min-width:30px;">
        <q-btn size="sm" color="white" flat dense round icon="mdi-play" title="Play stream"
          @click.stop="onConnClick(c)" />
      </q-item-section>
      <q-item-section side style="padding-left:10px;min-width:30px;">
        <q-btn size="sm" color="red-4" flat dense round icon="mdi-network-off-outline" title="Drop connection"
          @click.stop="dropConnection(c.id)" />
      </q-item-section>
    </q-item>
    <div v-if="isStream(c)" class="q-px-md q-pb-sm">
      <div class="mb-conn-streams" :class="{ 'mb-conn-streams-multi': streamsOf(c).length > 1 }">
        <div v-for="ms in streamsOf(c)" :key="ms.uuid" class="mb-conn-stream">
          <img :src="streamSrcUrl(ms, 'preview=jpeg')" class="mb-conn-preview" @click="playStream(ms)" />
          <div class="mb-conn-streambar row items-center no-wrap">
            <span class="text-caption text-blue-grey-4" v-if="ms.channel != null">CH {{ ms.channel }}</span>
            <q-space />
            <q-btn size="sm" color="white" flat dense round icon="mdi-share" title="Share"
              @click.stop="$emit('embed', ms.uuid)" />
          </div>
        </div>
      </div>
    </div>
  </template>
  <q-list v-if="recentCommands.length > 0" class="commands-list">
    <div class="mb-section-title row items-center no-wrap">
      <q-icon name="mdi-history" size="16px" class="q-mr-xs" />Requests
    </div>
    <template v-for="(cmd) in recentCommands" :key="cmd.id">

      <q-item dense class="command-item"
        :clickable="canApplyTimeline(cmd) || canOpenAsFile(cmd)" @click="onCommandItemClick(cmd)">
        <q-item-section avatar class="mb-cmd-avatar">
          <q-icon :name="getCommandIcon(cmd.name)" :color="getCommandIconColor(cmd.name)" size="20px" />
        </q-item-section>
        <q-item-section>
          <q-item-label class="command-label row items-center no-wrap">
            <span class="ellipsis">{{ getCommandLabel(cmd.name) }}</span>
            <q-badge v-if="cmd.response && ['start_videostream', 'playback_video', 'start_videostream_batch', 'playback_video_batch'].includes(cmd.name) && getResponseStreamType(cmd.response)"
              :color="getStreamTypeColor(getResponseStreamType(cmd.response))" class="stream-type-badge q-ml-xs">{{ getStreamTypeLabel(getResponseStreamType(cmd.response)) }}</q-badge>
            <span v-if="Array.isArray(cmd.response) && cmd.response.length > 1" class="q-ml-xs text-blue-grey-4" style="font-size:.68rem">{{ cmd.response.length }} ch</span>
          </q-item-label>
          <q-item-label caption class="ellipsis"
            :title="cmd.properties.duration ? (formatUnix(cmd.properties.from) + ' - ' + formatUnix(cmd.properties.from + cmd.properties.duration)) : formatUnix(cmd.timestamp)">
            <span v-if="typeof cmd.properties.channel !== 'undefined'">CH {{ cmd.properties.channel }} · </span>
            <template v-if="cmd.properties.duration">{{ formatUnixTime(cmd.properties.from) }} +{{ cmd.properties.duration }}s</template>
            <template v-else>{{ formatAgo(cmd.timestamp) }}</template>
          </q-item-label>
        </q-item-section>
        <q-item-section side v-if="streamConnection(cmd)" class="mb-cmd-side">
          <q-btn size="sm" color="white" flat dense round icon="mdi-play" title="Play live stream"
            @click.stop="playCommand(cmd)" />
        </q-item-section>
        <q-item-section side v-if="cmd.action === 'queued' || cmd.action === 'sent'" style="padding-left:5px;min-width:30px;">
          <q-btn size="sm" color="red" flat dense round icon="mdi-close-circle"
            @click.stop="cancelCommand(cmd.id)" title="Cancel request" />
        </q-item-section>
        <q-item-section side v-if="cmd.name === 'video_timeline' && Array.isArray(cmd.response)" style="padding-left:10px;min-width:30px;">
          <q-btn size="sm" color="white" flat dense round icon="mdi-magnify"
            @click.stop="$refs.timelineViewer.open(cmd)" title="View details" />
        </q-item-section>
        <q-item-section side>
          <q-badge :color="getStatusColor(cmd.action)" :label="getStatusLabel(cmd.action)" class="status-badge">
            <q-spinner-dots v-if="cmd.action === 'queued' || cmd.action === 'sent'" size="12px" class="q-ml-xs" />
            <q-icon v-else-if="cmd.action === 'processed'" name="mdi-check" size="12px" class="q-ml-xs" />
            <q-icon v-else-if="cmd.action === 'canceled'" name="mdi-close" size="12px" class="q-ml-xs" />
            <q-icon v-else-if="cmd.action === 'expire'" name="mdi-timer-off" size="12px" class="q-ml-xs" />
          </q-badge>
        </q-item-section>
      </q-item>
    </template>

  </q-list>
  <TimelineResultViewer ref="timelineViewer"
    @requestPlayback="(p) => $emit('requestPlayback', p)"
    @openMedia="(p) => $emit('openMedia', p)" />
</div>
</template>

<script lang="js">
// import Vue from 'vue'
import { defineComponent } from 'vue'
import { mapState, mapActions } from 'pinia'
import moment from 'moment'
// import { mapState } from 'vuex'
// import MediaPlayer from './player/player.vue'
import { useAuthStore } from '../../stores/auth'
import { useMediaStore } from '../../stores/media'
import { streamSrcUrl } from '../../utils/media-url'
import TimelineResultViewer from './timeline/TimelineResultViewer.vue'

export default defineComponent({
  name: 'ActivityPanel',
  components: {
    TimelineResultViewer
  },
  props: {
    item: null
  },
  emits: ['openMedia', 'embed', 'startStream', 'requestPlayback', 'openStreams'],
  data () {
    return {
      interval: null,
      tick: 1
    }
  },
  computed: {
    ...mapState(useAuthStore, {
      region: state => state.region,
      token: state => state.token
    }),
    ...mapState(useMediaStore, {
      connections: state => {
        return Object.entries(state.connections).map(([id, c]) => ({ ...c, id })).sort((a, b) => {
          return a.established - b.established
        })
      },
      commands: store => store.commands,
      recentCommands: store => store.recentCommands,
      media: store => store.media
    })
  },
  beforeMount () {
    this.interval = setInterval(() => { this.tick++ }, 30000)
  },
  beforeUnmount () {
    clearInterval(this.interval)
  },
  methods: {
    ...mapActions(useMediaStore, ['applyTimelineResponse']),
    canApplyTimeline (cmd) {
      return cmd.name === 'video_timeline' && Array.isArray(cmd.response)
    },
    // streams carried by a connection (batch: meta.mediastreams; single: mediastream)
    streamsOf (c) {
      if (!c || !c.meta) return []
      if (Array.isArray(c.meta.mediastreams) && c.meta.mediastreams.length) return c.meta.mediastreams
      return c.meta.mediastream ? [c.meta.mediastream] : []
    },
    isStream (c) {
      return this.streamsOf(c).length > 0
    },
    // one preview -> that stream fullscreen
    playStream (ms) {
      this.$emit('openMedia', { mediastream: ms })
    },
    // header play / row -> the wall showing just this connection's streams
    onConnClick (c) {
      this.$emit('openStreams', c.id)
    },
    // live connection matching a stream command's response (single or batch array),
    // or null once the stream ended and its connection is gone
    streamConnection (cmd) {
      const resp = cmd.response
      if (!resp) return null
      const uuids = (Array.isArray(resp) ? resp : [resp]).map(r => r && r.uuid).filter(Boolean)
      if (!uuids.length) return null
      return this.connections.find(c => this.streamsOf(c).some(ms => uuids.includes(ms.uuid))) || null
    },
    playCommand (cmd) {
      const conn = this.streamConnection(cmd)
      if (conn) this.$emit('openStreams', conn.id)
    },
    canOpenAsFile (cmd) {
      return (cmd.name === 'request_video' || cmd.name === 'request_tachograph_file') &&
        cmd.action === 'processed' &&
        cmd.response && cmd.response.uuid
    },
    findMediaByUuid (uuid) {
      if (!uuid) return null
      for (const dateKey of Object.keys(this.media)) {
        const found = (this.media[dateKey] || []).find(el => el.uuid === uuid)
        if (found) return found
      }
      return null
    },
    onCommandItemClick (cmd) {
      if (this.canApplyTimeline(cmd)) {
        this.applyTimelineResponse(cmd)
      } else if (this.canOpenAsFile(cmd)) {
        const file = this.findMediaByUuid(cmd.response.uuid) || cmd.response
        this.$emit('openMedia', file)
      }
    },
    streamSrcUrl,
    formatAgo (unixtime) {
      // compact relative time (e.g. "now", "5s ago", "3m ago") so it fits the
      // narrow activity panel — moment's fromNow() ("a few seconds ago") is too long
      const secs = moment().diff(moment.unix(parseFloat(unixtime)), 'seconds')
      if (secs < 5) return 'now'
      if (secs < 60) return secs + 's ago'
      if (secs < 3600) return Math.floor(secs / 60) + 'm ago'
      if (secs < 86400) return Math.floor(secs / 3600) + 'h ago'
      return Math.floor(secs / 86400) + 'd ago'
    },
    formatUnix (unixtime) {
      return moment.unix(parseFloat(unixtime)).format('YYYY-MM-DD HH:mm:ss')
    },
    formatUnixTime (unixtime) {
      return moment.unix(parseFloat(unixtime)).format('HH:mm:ss')
    },
    formatUnixUTCTZ (unixtime) {
      return moment.unix(parseFloat(unixtime)).utc().format()
    },
    cons (e) {
      // console.log(e)
    },
    startStream (data) {
      this.$emit('startStream', data)
    },
    dropConnection (id) {
      this.$q.dialog({
        title: 'Confirm',
        message: 'Do you want to kill this connection?',
        ok: 'Yes',
        cancel: 'No'
      }).onOk(() => {
        this.$connector.http.delete(`gw/devices/${this.item.id}/connections/${id}`).then((response) => {
          // that.onError(response)
        }, (response) => {
          // that.onError(response.response)
        })
      })
    },
    async toggleProtected (uuid, protect) {
      let response
      try {
        response = await this.$connector.http.put(`gw/devices/${this.item.id}/media`, JSON.stringify({ uuid, protected: protect }))
      } catch (e) {
        if (e.response) {
          response = e.response
        }
      }
      this.cons(response)
    },
    openToolbox (timestamp) {
      const start = moment.unix(timestamp).startOf('day').unix(),
        end = moment.unix(timestamp).endOf('day').unix()
      const url = `${this.region.rest || ''}/toolbox/#/devices/${this.item.id}?token=${this.token}&fullscreen=1&noselect=all&logs=%7B%22from%22%3A${start},%22to%22%3A${end}.999999,%22scroll%22%3A${timestamp}%7D&messages=%7B%22from%22%3A${start},%22to%22%3A${end}.999999,%22scroll%22%3A${timestamp},"selected"%3A%5B${timestamp}%5D%7D`
      this.$root.$emit('openTools', { url, title: 'Toolbox device', subtitle: `d#${this.item.id}` })
    },
    async cancelCommand (commandId) {
      try {
        await this.$connector.http.delete(`gw/devices/${this.item.id}/commands-queue/${commandId}`)
      } catch (e) {
        console.error('Failed to cancel command', e)
      }
    },
    getCommandLabel (name) {
      const labels = {
        start_videostream: 'Live Stream',
        playback_video: 'Playback',
        request_video: 'Video Request',
        take_photo: 'Photo',
        video_timeline: 'Timeline',
        request_tachograph_file: 'Tachograph',
        start_videostream_batch: 'Live Stream (batch)',
        playback_video_batch: 'Playback (batch)'
      }
      return labels[name] || name
    },
    getCommandIcon (name) {
      const icons = {
        start_videostream: 'mdi-video-wireless',
        playback_video: 'mdi-video-wireless',
        request_video: 'mdi-video',
        take_photo: 'mdi-camera',
        video_timeline: 'mdi-chart-timeline',
        request_tachograph_file: 'mdi-file-document',
        start_videostream_batch: 'mdi-video-wireless',
        playback_video_batch: 'mdi-video-wireless'
      }
      return icons[name] || 'mdi-remote'
    },
    getCommandIconColor (name) {
      const colors = {
        start_videostream: 'green',
        playback_video: 'red',
        request_video: 'red',
        take_photo: 'blue',
        video_timeline: 'grey-5',
        request_tachograph_file: 'purple',
        start_videostream_batch: 'green',
        playback_video_batch: 'red'
      }
      return colors[name] || 'white'
    },
    getStatusColor (action) {
      const colors = {
        queued: 'orange',
        sent: 'blue',
        processed: 'green',
        canceled: 'grey',
        expire: 'red'
      }
      return colors[action] || 'grey'
    },
    getStreamTypeLabel (type) {
      if (!type) return 'HLS'
      const labels = { flv: 'FLV', hls: 'HLS', webrtc: 'WebRTC' }
      return labels[type] || type.toUpperCase()
    },
    getStreamTypeColor (type) {
      const colors = { flv: 'deep-orange', hls: 'teal', webrtc: 'light-blue' }
      return colors[type] || 'teal'
    },
    getResponseStreamType (response) {
      const r = Array.isArray(response) ? response[0] : response
      if (!r) return null
      if (r.mediastream) return r.mediastream
      if (r.stream_type) return r.stream_type
      if (r.flv) return 'flv'
      if (r.hls) return 'hls'
      if (r.url) return 'hls'
      return null
    },
    getStatusLabel (action) {
      const labels = {
        queued: 'Queued',
        sent: 'Sent',
        processed: 'Done',
        canceled: 'Canceled',
        expire: 'Expired'
      }
      return labels[action] || action
    }
  }
})
</script>

<style lang="sass">
.mb-conn-preview
  width: 100%
  display: block
  border-radius: 6px
  border: 1px solid rgba(255, 255, 255, .08)
  cursor: pointer

.mb-conn-streams
  display: flex
  flex-wrap: wrap
  gap: 6px

.mb-conn-stream
  flex: 1 1 100%
  min-width: 0

// multistream: two equal previews per row (no grow, so a lone last one stays 50%)
.mb-conn-streams-multi .mb-conn-stream
  flex: 0 0 calc(50% - 3px)

.mb-conn-streambar
  padding: 2px 2px 0

.media-highlighted
  border: 1px dotted white
  box-shadow: 0px 0px 10px yellow

.media-viewer>.absolute-full>.scroll
  overflow: unset!important
.media-viewer>.absolute-full>.scroll>.q-layout
  height: 100%

.photo-title
  padding-top: 11px
  padding-left: 16px
  padding-right: 5px
  padding-bottom: 20px
  width: calc(100%)
  align-self: start
  font-size: 18px
  letter-spacing: 1px
  position: absolute
  top: 0
  left: 0
  color: white
  background-image: linear-gradient(rgba(0, 0, 0, 0.300), rgba(0, 0, 0, 0))
.q-calendar-weekly__day.q-current-day .q-btn__wrapper:before
  border: inherit

.commands-list
  .command-item
    min-height: 40px
    padding-top: 3px
    padding-bottom: 3px
    // tighter horizontal padding: the 300px activity panel is too narrow for
    // the default 16px, which clipped the status badge (e.g. "Processed")
    padding-left: 8px
    padding-right: 8px
    border-bottom: 1px solid rgba(255, 255, 255, 0.07)
    &:last-child
      border-bottom: none
  .command-item .q-item__section--side
    padding-left: 4px
  .mb-cmd-avatar
    min-width: 28px
    padding-right: 8px
  .mb-cmd-side
    min-width: 26px
    padding-left: 6px
  .command-label
    font-weight: 500
    font-size: 0.85rem
    line-height: 1.2
  .status-badge
    font-size: 0.68rem
    padding: 1px 5px
  .stream-type-badge
    font-size: 0.62rem
    padding: 1px 4px
    vertical-align: middle
</style>
