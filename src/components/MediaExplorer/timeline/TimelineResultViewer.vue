<template>
  <q-dialog v-model="show" :maximized="maximized">
    <q-card v-if="command" class="bg-grey-10 text-white column"
      :style="maximized ? '' : 'width: 900px; max-width: 95vw; height: 600px; max-height: 90vh;'">
      <q-card-section class="row items-center q-py-sm">
        <div class="text-h6">Timeline result</div>
        <q-space />
        <q-btn dense flat round :icon="maximized ? 'mdi-fullscreen-exit' : 'mdi-fullscreen'"
          @click="maximized = !maximized" :title="maximized ? 'Restore' : 'Fullscreen'" />
        <q-btn dense flat round icon="mdi-close" v-close-popup />
      </q-card-section>
      <q-separator dark />
      <q-card-section class="q-py-sm">
        <div class="row q-gutter-md text-caption">
          <div>Range: <b>{{ formatUnix(from) }} — {{ formatUnix(to) }}</b></div>
          <div>Duration: <b>{{ formatDuration(to - from) }}</b></div>
          <div>Intervals: <b>{{ command.response.length }}</b></div>
          <div>Channels: <b>{{ groupedByChannel.map(g => g.channel).join(', ') || '—' }}</b></div>
          <div>Covered: <b>{{ formatDuration(totalCoveredSeconds) }}</b></div>
        </div>
      </q-card-section>
      <q-separator dark />
      <q-card-section class="col q-pa-md scroll">
        <div v-if="!groupedByChannel.length" class="text-grey">No intervals in response.</div>
        <template v-else>
          <div class="relative-position q-mb-sm" style="height:24px;">
            <div v-for="m in dayMarks" :key="m.timestamp"
              class="absolute-top absolute-bottom"
              :style="`left:${m.percent}%;border-left:1px dashed #666;`" />
            <div v-for="m in dayMarks" :key="'l' + m.timestamp"
              class="absolute text-caption text-grey-5"
              :style="`left:calc(${m.percent}% + 4px);bottom:0;`">
              {{ m.label }}
            </div>
          </div>
          <div v-for="ch in groupedByChannel" :key="ch.channel" class="q-mb-md">
            <div class="row items-center q-mb-xs">
              <div class="text-subtitle2 q-mr-md">Channel {{ ch.channel }}</div>
              <div class="text-caption text-grey-5">
                {{ ch.intervals.length }} clips · {{ formatDuration(ch.totalDuration) }}
                <span v-if="(downloadedByChannel[ch.channel] || []).length">
                  · {{ (downloadedByChannel[ch.channel] || []).length }} downloaded
                </span>
              </div>
            </div>
            <div class="relative-position rounded-borders bg-grey-9" style="height:36px;">
              <div v-for="m in dayMarks" :key="'cm' + ch.channel + m.timestamp"
                class="absolute-top absolute-bottom"
                :style="`left:${m.percent}%;border-left:1px dashed #555;pointer-events:none;`" />
              <div v-for="(it, i) in ch.intervals" :key="'a' + i"
                class="absolute bg-green-3 cursor-pointer interval-cell"
                :style="`top:4px;height:14px;left:${intervalLeft(it)}%;width:${intervalWidth(it)}%;`"
                @click="onIntervalClick(ch.channel, it)">
                <q-tooltip anchor="top middle" self="bottom middle" :delay="200" class="bg-grey-9 text-white q-pa-sm">
                  <div class="text-caption text-green-3 text-uppercase">Available</div>
                  <div><b>Channel:</b> {{ ch.channel }}</div>
                  <div><b>Begin:</b> {{ formatUnix(it.begin) }}</div>
                  <div><b>End:</b> {{ formatUnix(it.end) }}</div>
                  <div><b>Duration:</b> {{ formatDuration(it.end - it.begin) }}</div>
                  <div v-if="it.filename"><b>File:</b> {{ it.filename }}</div>
                  <div class="q-mt-xs text-italic text-grey-5">Click to request video</div>
                </q-tooltip>
              </div>
              <div v-for="(d, i) in (downloadedByChannel[ch.channel] || [])" :key="'d' + i"
                class="absolute bg-red-4 cursor-pointer interval-cell"
                :style="`bottom:4px;height:14px;left:${downloadedLeft(d)}%;width:${downloadedWidth(d)}%;`"
                @click="onDownloadedClick(d)">
                <q-tooltip anchor="bottom middle" self="top middle" :delay="200" class="bg-grey-9 text-white q-pa-sm">
                  <div class="text-caption text-red-4 text-uppercase">Downloaded</div>
                  <div v-if="d.meta && (d.meta.type === 'video' || d.meta.type === 'image')" class="q-mb-xs">
                    <img :src="mediaFileUrl(d, 'preview=jpeg')" loading="lazy" style="max-width:200px;max-height:120px;" />
                  </div>
                  <div v-if="d.name"><b>Name:</b> {{ d.name }}</div>
                  <div><b>Channel:</b> {{ ch.channel }}</div>
                  <div><b>Created:</b> {{ formatUnix(d.created) }}</div>
                  <div v-if="d.meta && d.meta.duration"><b>Duration:</b> {{ formatDuration(d.meta.duration) }}</div>
                  <div v-if="d.mime"><b>Type:</b> {{ d.mime }}</div>
                  <div v-if="d.size"><b>Size:</b> {{ formatBytes(d.size) }}</div>
                  <div class="q-mt-xs text-italic text-grey-5">Click to open</div>
                </q-tooltip>
              </div>
            </div>
          </div>
        </template>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script lang="js">
import { defineComponent } from 'vue'
import { mapState } from 'pinia'
import moment from 'moment'
import { useMediaStore } from '../../../stores/media'
import { mediaFileUrl } from '../../../utils/media-url'

export default defineComponent({
  name: 'TimelineResultViewer',
  emits: ['requestPlayback', 'openMedia'],
  data () {
    return {
      show: false,
      command: null,
      maximized: false
    }
  },
  computed: {
    ...mapState(useMediaStore, {
      media: state => state.media
    }),
    downloadedByChannel () {
      const result = {}
      if (!this.command) return result
      Object.values(this.media).forEach(arr => {
        arr.forEach(el => {
          if (!el || !el.meta) return
          if (el.created < this.from || el.created > this.to) return
          const ch = el.meta.channel
          if (ch === undefined || ch === null) return
          if (!result[ch]) result[ch] = []
          result[ch].push(el)
        })
      })
      return result
    },
    from () {
      return (this.command && this.command.properties && this.command.properties.from) || this.responseMin
    },
    to () {
      return (this.command && this.command.properties && this.command.properties.to) || this.responseMax
    },
    responseMin () {
      const arr = (this.command && this.command.response) || []
      return arr.length ? Math.min(...arr.map(el => el.begin)) : 0
    },
    responseMax () {
      const arr = (this.command && this.command.response) || []
      return arr.length ? Math.max(...arr.map(el => el.end)) : 0
    },
    span () {
      return Math.max(1, this.to - this.from)
    },
    groupedByChannel () {
      const arr = (this.command && this.command.response) || []
      const map = new Map()
      arr.forEach(el => {
        const ch = el.channel
        if (!map.has(ch)) map.set(ch, [])
        map.get(ch).push(el)
      })
      return [...map.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([channel, intervals]) => {
          const sorted = intervals.slice().sort((a, b) => a.begin - b.begin)
          const totalDuration = sorted.reduce((acc, el) => acc + Math.max(0, el.end - el.begin), 0)
          return { channel, intervals: sorted, totalDuration }
        })
    },
    totalCoveredSeconds () {
      return this.groupedByChannel.reduce((acc, ch) => acc + ch.totalDuration, 0)
    },
    dayMarks () {
      const marks = []
      const start = moment.unix(this.from).startOf('day')
      const end = moment.unix(this.to).startOf('day')
      const cur = start.clone()
      if (cur.unix() < this.from) cur.add(1, 'day')
      while (cur.unix() <= end.unix()) {
        const ts = cur.unix()
        if (ts >= this.from && ts <= this.to) {
          marks.push({
            timestamp: ts,
            percent: ((ts - this.from) / this.span) * 100,
            label: cur.format('MMM D')
          })
        }
        cur.add(1, 'day')
      }
      return marks
    }
  },
  methods: {
    open (cmd) {
      this.command = cmd
      this.show = true
    },
    onIntervalClick (channel, it) {
      this.$emit('requestPlayback', { channel, timestamp: it.begin, duration: Math.max(1, it.end - it.begin) })
    },
    onDownloadedClick (file) {
      this.$emit('openMedia', file)
      this.show = false
    },
    mediaFileUrl,
    formatBytes (n) {
      if (!n) return '0 B'
      const units = ['B', 'KB', 'MB', 'GB']
      let i = 0
      let v = n
      while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
      return v.toFixed(v >= 10 ? 0 : 1) + ' ' + units[i]
    },
    formatUnix (ts) {
      return moment.unix(parseFloat(ts)).format('YYYY-MM-DD HH:mm:ss')
    },
    formatDuration (secs) {
      if (!secs || secs < 0) return '0s'
      const h = Math.floor(secs / 3600)
      const m = Math.floor((secs % 3600) / 60)
      const s = Math.floor(secs % 60)
      const parts = []
      if (h) parts.push(h + 'h')
      if (m) parts.push(m + 'm')
      if (s || !parts.length) parts.push(s + 's')
      return parts.join(' ')
    },
    intervalLeft (it) {
      return Math.max(0, ((it.begin - this.from) / this.span) * 100)
    },
    intervalWidth (it) {
      const w = ((Math.max(it.end, it.begin + 1) - it.begin) / this.span) * 100
      return Math.max(0.05, w)
    },
    downloadedLeft (d) {
      return Math.max(0, ((d.created - this.from) / this.span) * 100)
    },
    downloadedWidth (d) {
      const dur = (d.meta && d.meta.duration) || 1
      return Math.max(0.05, (dur / this.span) * 100)
    }
  }
})
</script>

<style scoped>
.interval-cell {
  transition: background-color 0.1s, box-shadow 0.1s;
}
.interval-cell:hover {
  background: #fff !important;
  box-shadow: 0 0 0 1px #fff, 0 0 6px rgba(255,255,255,0.5);
  z-index: 1;
}
</style>
