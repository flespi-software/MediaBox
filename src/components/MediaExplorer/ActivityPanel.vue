<template>
<div>
  <template v-for="(c) in connections" :key="c.id">
    <q-item :clickable="!!c.meta" @click="() => { if (c.meta) $emit('openMedia', c.meta) }">
      <q-item-section avatar style="padding-right:10px;min-width:30px;">
        <q-icon name="mdi-video-wireless" v-if="c.meta && c.meta.mediastream" />
        <q-icon name="mdi-multimedia" v-else-if="c.secondary" />
        <q-icon name="mdi-developer-board" v-else />
      </q-item-section>
      <q-item-section>
        <q-item-label overline v-if="c.meta && c.meta.mediastream">Stream
          started
          <q-badge :color="getStreamTypeColor(c.meta.mediastream.mediastream || c.meta.mediastream.stream_type)" class="q-ml-xs stream-type-badge">{{ getStreamTypeLabel(c.meta.mediastream.mediastream || c.meta.mediastream.stream_type) }}</q-badge>
        </q-item-label>
        <q-item-label overline v-else-if="c.secondary">Media
          uploading</q-item-label>
        <q-item-label overline v-else>Device connected</q-item-label>
        <q-item-label caption :title="formatUnix(c.established)" v-if="tick > 0">{{ formatAgo(c.established ||
          0) }}</q-item-label>
      </q-item-section>
      <q-item-section side v-if="c.meta && c.meta.mediastream" style="padding-left:10px;min-width:30px;">
        <q-btn size="sm" color="white" flat dense round icon="mdi-play" title="Play stream"
          @click.stop="$emit('openMedia', c.meta)" />
      </q-item-section>
      <q-item-section side v-if="c.meta && c.meta.mediastream" style="padding-left:10px;min-width:30px;">
        <q-btn size="sm" color="white" flat dense round icon="mdi-share" title="Share"
          @click.stop="$emit('embed', c.meta.mediastream.uuid)" />
      </q-item-section>
      <q-item-section side style="padding-left:10px;min-width:30px;">
        <q-btn size="sm" color="red-4" flat dense round icon="mdi-network-off-outline" title="Drop connection"
          @click.stop="dropConnection(c.id)" />
      </q-item-section>
    </q-item>
    <div v-if="c.meta && c.meta.mediastream" class="q-px-md q-pb-sm">
      <img :src="streamSrcUrl(c.meta.mediastream, 'preview=jpeg')"
        class="mb-conn-preview" @click="$emit('openMedia', c.meta)" />
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
            <q-badge v-if="cmd.response && (cmd.name === 'start_videostream' || cmd.name === 'playback_video') && getResponseStreamType(cmd.response)"
              :color="getStreamTypeColor(getResponseStreamType(cmd.response))" class="stream-type-badge q-ml-xs">{{ getStreamTypeLabel(getResponseStreamType(cmd.response)) }}</q-badge>
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
            @click.stop="$emit('openMedia', streamConnection(cmd).meta)" />
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
  emits: ['openMedia', 'embed', 'startStream', 'requestPlayback'],
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
    // The live connection matching a stream command's response, or null. Used to
    // show the Play button only while the stream is still running — once it ends
    // its connection is gone, so playing it is no longer relevant.
    streamConnection (cmd) {
      const uuid = cmd.response && cmd.response.uuid
      if (!uuid || !(cmd.response.url || cmd.response.hls || cmd.response.flv)) return null
      return this.connections.find(c => c.meta && c.meta.mediastream && c.meta.mediastream.uuid === uuid) || null
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
        request_tachograph_file: 'Tachograph'
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
        request_tachograph_file: 'mdi-file-document'
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
        request_tachograph_file: 'purple'
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
      const labels = { flv: 'FLV', hls: 'HLS' }
      return labels[type] || type.toUpperCase()
    },
    getStreamTypeColor (type) {
      const colors = { flv: 'deep-orange', hls: 'teal' }
      return colors[type] || 'teal'
    },
    getResponseStreamType (response) {
      if (!response) return null
      if (response.mediastream) return response.mediastream
      if (response.stream_type) return response.stream_type
      if (response.flv) return 'flv'
      if (response.hls) return 'hls'
      if (response.url) return 'hls'
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
