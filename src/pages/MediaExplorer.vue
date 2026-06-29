<template><q-page class="fit relative-position" style="overflow: hidden; height: 500px">
  <q-resize-observer @resize="onResize" ref="resize" />
  <q-layout view="hHh lpr fFf" container :class="`bg-${color}-8 absolute-full`" v-if="item">
    <MediaCommand ref="mediacommand" />
    <UploadMedia ref="uploadmedia" />
    <EmbedPlayer ref="embedplayer" />
    <q-header reveal :class="`bg-${color}-8`">
      <q-toolbar>
        <q-btn-toggle v-model="fileviewtype" class="mb-view-toggle" dense unelevated no-caps spread
          toggle-color="teal-6" text-color="blue-grey-3" :options="[
            { icon: 'mdi-format-list-bulleted-square', value: 'list', slot: 'list' },
            { icon: 'mdi-view-grid', value: 'grid', slot: 'grid' },
          ]">
          <template v-slot:list>
            <q-tooltip>List view</q-tooltip>
          </template>
          <template v-slot:grid>
            <q-tooltip>Grid view</q-tooltip>
          </template>
        </q-btn-toggle>
        <div class="mb-action-bar row items-center no-wrap q-ml-md" :class="{ 'mb-labels': $q.screen.gt.sm }"
          v-if="cmdphoto || cmdvideo || cmdstream || cmdplayback || cmdtimeline || tachoEnabled">
          <q-btn class="mb-action-btn mb-act-photo" flat dense no-caps icon="mdi-camera"
            :label="$q.screen.gt.sm ? 'Photo' : ''" title="Take a photo" v-if="cmdphoto" @click="takePhoto({})" />
          <q-btn class="mb-action-btn mb-act-video" flat dense no-caps icon="mdi-video"
            :label="$q.screen.gt.sm ? 'Video' : ''" title="Request video" v-if="cmdvideo" @click="getPlayback({}, selectedDate)" />
          <q-btn class="mb-action-btn mb-act-stream" flat dense no-caps icon="mdi-video-wireless"
            :label="$q.screen.gt.sm ? 'Live' : ''" title="Start stream" v-if="cmdstream" @click="startStream({})" />
          <q-btn class="mb-action-btn mb-act-playback" flat dense no-caps icon="mdi-history"
            :label="$q.screen.gt.sm ? 'Playback' : ''" title="Playback" v-if="cmdplayback" @click="playbackVideo({})" />
          <q-btn class="mb-action-btn mb-act-timeline" flat dense no-caps icon="mdi-chart-timeline"
            :label="$q.screen.gt.sm ? 'Timeline' : ''" title="Request timeline" v-if="cmdtimeline" @click="getTimeline({})" />
          <div class="mb-action-divider" v-if="tachoEnabled && (cmdphoto || cmdvideo || cmdstream || cmdplayback || cmdtimeline)" />
          <q-btn class="mb-action-btn mb-act-tacho" flat dense no-caps icon="mdi-smart-card-reader"
            :label="$q.screen.gt.sm ? 'Tacho' : ''" title="Request tachograph file" v-if="tachoEnabled" @click="getTacho({})" />
        </div>
        <q-btn class="mb-icon-btn q-ml-sm" flat dense round icon="mdi-upload" title="Upload media file"
          @click="$refs.uploadmedia.open(item.id)" />
        <q-space />
        <q-btn icon="mdi-calendar" :label="$q.screen.gt.xs ? selectedDate : ''" flat color="white">
          <q-menu ref="calendarpopup">
            <q-date first-day-of-week="1" minimal no-unset event-color="teal-5" color="blue-grey-6" landscape mask="YYYY-MM-DD"
              :events="events" @update:model-value="setSelectedDate" :model-value="selectedDate"
              @navigation="monthChange" />
          </q-menu>
        </q-btn>
        <q-btn v-if="streamscount" icon="mdi-monitor-multiple" color="green-4" flat round
          @click="showwall = true" title="Live streams wall">
          <q-badge color="red" floating>{{ streamscount }}</q-badge>
        </q-btn>
        <q-btn icon="mdi-dock-right" round flat color="white" @click="toggleActivity()">
          <q-tooltip>Activity — connections, requests &amp; uploads</q-tooltip>
        </q-btn>
      </q-toolbar>
    </q-header>
    <q-drawer side="right" v-model="activityOpen" bordered :width="300" :breakpoint="599"
      :behavior="$q.screen.lt.md ? 'mobile' : 'desktop'" content-class="mb-drawer">
      <div class="mb-drawer-header row items-center no-wrap q-px-md">
        <q-icon name="mdi-pulse" size="18px" color="teal-4" class="q-mr-sm" />
        <div class="text-subtitle2 text-weight-medium">Activity</div>
        <q-space />
        <q-btn flat dense round size="sm" icon="mdi-close" color="blue-grey-4" @click="activityOpen = false">
          <q-tooltip>Close</q-tooltip>
        </q-btn>
      </div>
      <q-scroll-area style="height: calc(100% - 48px)">
        <div>
          <div class="mb-section-title row items-center no-wrap">
            <q-icon name="mdi-access-point" size="16px" class="q-mr-xs" />Connections
          </div>
          <ActivityPanel v-if="item" :item="item" @openMedia="openMedia" @embed="embed" @startStream="startStream" @requestPlayback="getPlaybackByTimeline" />
          <div class="mb-section-title row items-center no-wrap">
            <q-icon name="mdi-tray-arrow-down" size="16px" class="q-mr-xs" />Last uploads
          </div>
          <q-list>
            <q-item v-for="(itm, index) in realtimeList" :key="index" clickable @click="() => {
              (playing = false),
                (current = itm),
                (showmedia = true),
                setSelectedDate(itm.__event.date);
            }
            ">
              <q-item-section avatar>
                <img v-if="hasThumbnail(itm)" :src="mediaFileUrl(itm, 'preview=jpeg')" loading="lazy" class="mb-upload-thumb" />
                <q-icon v-else :title="itm.name" :name="fileKindMeta(itm).icon"
                  :style="{ color: fileKindMeta(itm).color }" size="28px" />
              </q-item-section>
              <q-item-section>
                <q-item-label class="ellipsis" :title="itm.name"><small>{{ itm.name }}</small></q-item-label>
                <q-item-label caption>{{
                  itm.__event.date + " " + itm.__event.time
                }}</q-item-label>
              </q-item-section>
            </q-item>
            <q-item v-if="!realtimeList.length">
              <q-item-section class="text-grey-6 text-caption">No recent uploads</q-item-section>
            </q-item>
          </q-list>
        </div>
      </q-scroll-area>
    </q-drawer>

    <q-page-container>
      <q-page>
        <q-resize-observer @resize="onContentResize" />
        <template v-if="viewtype === 'filemanager'">
          <div v-if="mediaLoading" class="filemanager-skeleton scroll"
            :style="`height: ${(height || 400) - mainTimelineSize.height - 50 - 8}px;`">
            <div v-if="fileviewtype === 'grid'" class="row">
              <div v-for="n in 12" :key="n" class="q-pa-xs col-xs-6 col-sm-4 col-md-3 col-lg-2 col-xl-2">
                <q-skeleton square style="aspect-ratio:16/9; border-radius:6px" />
              </div>
            </div>
            <template v-else>
              <div v-for="n in 12" :key="n" class="row items-center no-wrap q-py-sm q-px-md mb-skel-row">
                <q-skeleton type="rect" width="56px" height="34px" class="q-mr-md" />
                <q-skeleton type="text" width="130px" class="q-mr-lg" />
                <q-skeleton type="text" width="40px" class="q-mr-lg" />
                <q-skeleton type="text" width="60px" />
                <q-space />
                <q-skeleton type="QBtn" size="28px" class="q-mr-sm" />
                <q-skeleton type="QBtn" size="28px" />
              </div>
            </template>
          </div>
          <div v-else-if="!currentEvents.length" class="column flex-center text-grey-6"
            :style="`height: ${(height || 400) - mainTimelineSize.height - 50 - 8}px;`">
            <q-icon name="mdi-folder-multiple-image" size="64px" class="q-mb-md" style="opacity:.45" />
            <div class="text-subtitle1 text-grey-5">No media for {{ selectedDate }}</div>
            <div class="text-caption q-mt-xs text-grey-7">Pick another date, or request data from the device above</div>
          </div>
          <q-table v-else :grid="fileviewtype === 'grid'" class="filemanager"
            :style="`height: ${(height || 400) - mainTimelineSize.height - 50 - 8}px;`" :rows="currentEvents"
            :columns="columns" :visible-columns="visibleColumns" row-key="uuid" virtual-scroll v-model:pagination="pagination"
            :rows-per-page-options="[0]" dense card-container-class="content-start" @row-click="rowClick">
            <template v-slot:body-cell-preview="props">
              <q-td :props="props">
                <img v-if="hasThumbnail(props.row)"
                  :title="`Name: ${props.row.name}\nUUID: ${props.row.uuid}`" :src="mediaFileUrl(props.row, 'preview=jpeg')" loading="lazy" style="height: 40px" />
                <template v-else>
                  <q-icon :title="props.row.name" :name="fileKindMeta(props.row).icon"
                    :style="{ color: fileKindMeta(props.row).color }" size="md" class="vertical-middle" />
                  <span :title="props.row.name" class="ellipsis vertical-middle inline-block q-ml-xs" style="max-width: 200px">
                    {{ props.row.name }}
                  </span>
                </template>
              </q-td>
            </template>
            <template v-slot:body-cell-created="props">
              <q-td :props="props">
                {{ props.value }}
                <q-btn color="blue-grey-4" round flat dense icon="mdi-list-box" size="sm" class="q-ml-xs"
                  @click.stop="openToolbox(props.row.created)">
                  <q-tooltip>Open in Toolbox</q-tooltip>
                </q-btn>
              </q-td>
            </template>
            <template v-slot:body-cell-share="props">
              <q-td :props="props">
                <q-btn color="blue-grey-4" round flat dense icon="mdi-share-variant" size="sm"
                  @click.stop="embed(props.row.uuid)">
                  <q-tooltip>Share / embed</q-tooltip>
                </q-btn>
              </q-td>
            </template>
            <template v-slot:body-cell-protected="props">
              <q-td :props="props">
                <q-btn :color="props.value ? 'red-4' : 'blue-grey-4'" round flat dense size="sm"
                  @click.stop="toggleProtected(props.row.uuid, !props.value)"
                  :icon="props.value ? 'mdi-lock' : 'mdi-lock-open-variant'">
                  <q-tooltip>{{ props.value ? 'Protected — click to unlock' : 'Unprotected — click to lock' }}</q-tooltip>
                </q-btn>
              </q-td>
            </template>
            <template v-slot:body-cell-delete="props">
              <q-td :props="props">
                <q-btn color="red-4" round flat dense size="sm"
                  @click.stop="deleteFile(props.value, props.row.__event.date)" icon="mdi-delete-outline">
                  <q-tooltip>Delete</q-tooltip>
                </q-btn>
              </q-td>
            </template>
            <template v-slot:item="props">
              <div class="q-pa-xs col-xs-6 col-sm-4 col-md-3 col-lg-2 col-xl-2">
                <MediaItem :media="props.row" :item="item" @embed="embed"
                  :highlighted="current && current.uuid === props.row.uuid" @click="(mediaitem) => {
                    (playing = false), (current = props.row), (showmedia = true);
                  }
                  " style="margin: 0 auto" />
              </div>
            </template>
          </q-table>
        </template>
      </q-page>
      <q-footer class="mb-footer q-pt-sm q-px-sm">
        <MediaTimeline v-if="selectedDate" :device="item" :intervals="currentEvents" :timeline="timelines"
          :date="selectedDate" @itemClick="itemClick" :current="current" @requestPlayback="getPlaybackByTimeline"
          :nopreviews="true" @resizeTimeline="mainTimelineResize" @embed="(uuid) => $emit('embed', uuid)" />
      </q-footer>
    </q-page-container>

    <transition name="mb-fade">
      <div v-if="showmedia && current && isTachographFile(current)" class="absolute-full bg-black"
        style="z-index: 2000">
        <q-btn flat round icon="mdi-close" @click="(current = undefined), (showmedia = false)"
          class="absolute-top-right" color="white" style="z-index: 2" />
        <iframe :src="tachoboxUrl(item.id, current, token, { hidepanels: 1, theme: 'dark' })"
          style="width: 100%; height: 100%; border: 0; display: block;" class="bg-black" />
      </div>
    </transition>

    <transition name="mb-fade">
    <div v-if="showmedia && current && !isTachographFile(current) && (current.mime || current.mediastream)" class="absolute-full bg-black"
      style="z-index: 2000">
      <div :style="`height: calc(100% - ${playerTimelineSize.height}px);`" class="bg-black absolute-top">
        <div class="mb-viewer-bar row items-center no-wrap absolute-top" style="z-index: 3">
          <q-icon :name="current.mediastream ? 'mdi-video-wireless' : fileKindMeta(current).icon"
            :style="{ color: current.mediastream ? '#6cc191' : fileKindMeta(current).color }" size="22px" class="q-mr-sm" />
          <div class="column" style="min-width: 0">
            <div class="text-white ellipsis" style="max-width: 60vw">
              {{ current.mediastream ? 'Live stream' : (current.name || formatUnix(current.created)) }}
            </div>
            <div class="text-caption text-grey-5 ellipsis">
              <span v-if="!current.mediastream && current.created">{{ formatUnix(current.created) }}</span>
              <span v-if="current.meta && current.meta.channel"> · CH {{ current.meta.channel }}</span>
              <span v-if="current.meta && current.meta.duration"> · {{ Math.floor(current.meta.duration) }} s</span>
              <span v-if="current.meta && typeof current.meta.has_audio !== 'undefined'">
                · <q-icon :name="current.meta.has_audio ? 'mdi-volume-high' : 'mdi-volume-variant-off'" size="13px" />
              </span>
            </div>
          </div>
          <q-space />
          <q-btn flat round icon="mdi-close" @click="(current = undefined), (showmedia = false)" color="white" />
        </div>
        <template v-if="!current.mediastream && currentEvents.length > 1">
          <q-btn flat round icon="mdi-chevron-left" color="white" size="lg" class="mb-viewer-nav left"
            :disable="viewerIndex <= 0" @click="viewerNav(-1)" />
          <q-btn flat round icon="mdi-chevron-right" color="white" size="lg" class="mb-viewer-nav right"
            :disable="viewerIndex < 0 || viewerIndex >= currentEvents.length - 1" @click="viewerNav(1)" />
        </template>
        <MediaPlayer v-if="current.mediastream" :options="{
          autoplay: true,
          controls: true,
          sources: [
            {
              src: streamSrcUrl(current.mediastream),
              type: streamMimeType(current.mediastream),
              hasAudio: streamHasAudio(current),
            },
          ],
          poster: streamSrcUrl(current.mediastream, 'preview=jpeg'),
        }" title="Live" style="width: calc(100% - 8px); height: 100%" class="bg-black" />
        <MediaPlayer v-else-if="viewerStrategy(current) === 'video'" :options="{
          autoplay: true,
          controls: true,
          sources: [
            {
              src: mediaFileUrl(current),
              type: 'video/mp4',
            },
          ],
          poster: mediaFileUrl(current, 'preview=jpeg'),
        }" :title="formatUnix(current.created)" style="width: calc(100% - 8px); height: 100%" class="bg-black" />
        <template v-else-if="viewerStrategy(current) === 'image'">
          <img :src="mediaFileUrl(current)" class="absolute-center" style="max-height: calc(100% - 8px); max-width: calc(100% - 8px)" />
        </template>
        <iframe v-else-if="viewerStrategy(current) === 'pdf' || viewerStrategy(current) === 'text'"
          :src="mediaFileUrl(current)" style="width: 100%; height: 100%; border: 0; display: block;" class="bg-white" />
        <div v-else class="fit column flex-center text-white q-pa-lg text-center">
          <q-icon :name="fileKindMeta(current).icon" :style="{ color: fileKindMeta(current).color }" size="80px" />
          <div class="text-h6 q-mt-md ellipsis" style="max-width: 90%">{{ current.name }}</div>
          <div class="text-caption text-grey-5 q-mt-xs">
            {{ fileKindMeta(current).label }}<span v-if="current.size"> · {{ formatB(current.size) }}</span>
          </div>
          <q-btn class="q-mt-lg" color="primary" outline no-caps icon="mdi-open-in-new"
            label="Open / Download" type="a" :href="mediaFileUrl(current)" target="_blank" />
        </div>
      </div>
      <MediaTimeline v-if="(showmedia || viewtype === 'calendar') && selectedDate" :device="item"
        :intervals="currentEvents" :timeline="timelines" :date="selectedDate" @itemClick="itemClick" :current="current"
        class="absolute-bottom text-white" style="left: 10px; right: 10px" @requestPlayback="getPlaybackByTimeline"
        @resizeTimeline="playerTimelineResize" @embed="embed" />
    </div>
    </transition>

    <transition name="mb-fade">
      <StreamWall v-if="showwall" :streams="activeStreams" class="absolute-full" style="z-index: 2100"
        @close="showwall = false" @stop="stopStream" @embed="embed" />
    </transition>
  </q-layout>

  <div v-else class="absolute-full column flex-center text-center q-pa-lg" style="background:#14181c">
    <template v-if="loadError">
      <q-icon name="mdi-alert-circle-outline" size="56px" color="red-4" class="q-mb-md" />
      <div class="text-subtitle1 text-grey-4">Couldn't load this device</div>
      <div class="text-caption text-grey-6 q-mt-xs" style="max-width:360px">
        Device #{{ $route.params.deviceid }} is unavailable or you don't have access to it.
      </div>
      <q-btn outline no-caps color="grey-5" icon="mdi-refresh" label="Retry" class="q-mt-lg" @click="init" />
    </template>
    <template v-else>
      <q-spinner-gears size="46px" color="blue-grey-4" />
      <div class="text-caption text-grey-6 q-mt-md">Loading device…</div>
    </template>
  </div>
</q-page></template>

<script lang="js">
import { mapState, mapActions } from 'pinia'
import { useAuthStore } from '../stores/auth'
import { useAppearanceStore } from '../stores/appearance'
import { useMediaStore } from '../stores/media'

import moment from 'moment'
import EmbedPlayer from '../components/MediaExplorer/EmbedPlayer.vue'
import MediaCommand from '../components/MediaExplorer/command/command.vue'
import UploadMedia from '../components/MediaExplorer/UploadMedia.vue'
import MediaPlayer from '../components/MediaExplorer/player/player.vue'
import MediaTimeline from '../components/MediaExplorer/timeline/timeline.vue'
import MediaItem from '../components/MediaExplorer/item.vue'
import ActivityPanel from '../components/MediaExplorer/ActivityPanel.vue'
import StreamWall from '../components/MediaExplorer/StreamWall.vue'
import { mediaFileUrl, streamSrcUrl, streamMimeType } from '../utils/media-url'
import { isTachographFile, tachoboxUrl } from '../utils/tachograph-url'
import { fileKindMeta, hasThumbnail, viewerStrategy } from '../utils/file-type'

export default {
  name: 'MediaExplorer',
  components: {
    EmbedPlayer,
    MediaPlayer,
    MediaTimeline,
    MediaItem,
    ActivityPanel,
    StreamWall,
    MediaCommand,
    UploadMedia
  },
  // props: {
  //   item: null
  // },
  // setup () {

  // },
  data () {
    return {
      item: null,
      loadError: false,

      current: null,
      showmedia: false,
      showwall: false,
      playing: false,
      height: 400,
      contentWidth: 0,

      locale: 'en-us',

      showCalendar: false,
      calendar_title: '',
      cmd: null,
      cmdphoto: null,
      cmdstream: null,
      cmdplayback: null,
      cmdvideo: null,
      cmdtacho: null,
      cmdtimeline: null,

      pagination: {
        rowsPerPage: 0
      },
      columns: [
        {
          name: 'preview',
          label: 'Preview',
          field: 'uuid',
          style: 'width:70px;text-align:left;'
        },
        // {
        //   name: 'name',
        //   required: true,
        //   label: 'Filename',
        //   align: 'left',
        //   field: row => row.name,
        //   format: val => `${val}`,
        //   sortable: true
        // },
        { name: 'created', align: 'center', label: 'Created', field: 'created', sortable: true, format: this.formatUnix },
        { name: 'channel', label: 'channel', field: 'meta', sortable: true, format: val => `${val.channel || ''}` },
        { name: 'duration', label: 'duration', field: 'meta', sortable: true, format: val => val.duration ? `${val.duration} s.` : '' },
        { name: 'size', label: 'Size', field: 'size', sortable: true, format: this.formatB },
        { name: 'type', label: 'Type', field: row => row, sortable: true, format: row => this.fileKindMeta(row).label },
        { name: 'share', label: 'Share', sortable: false },
        { name: 'protected', label: 'Protected', field: 'protected', sortable: true },
        { name: 'uploaded', align: 'center', label: 'Uploaded', field: 'uploaded', sortable: true, format: this.formatUnix },
        // { name: 'meta', label: 'meta', field: 'meta', sortable: true, format: val => `${JSON.stringify(val)}` },
        { name: 'delete', label: '', field: 'uuid' }
      ],
      fileviewtype: 'list',
      viewtype: 'filemanager',
      viewtypes: ['calendar', 'filemanager'],
      commandids: {},
      // activity drawer: open by default on wide screens, collapsed on phones/tablets
      activityOpen: this.$q ? !this.$q.screen.lt.md : true,
      mainTimelineSize: { height: 50 },
      playerTimelineSize: { height: 50 }
    }
  },
  computed: {
    ...mapState(useAuthStore, {
      region: store => store.region,
      token: store => store.token,
      connected: store => store.connected
    }),
    ...mapState(useAppearanceStore, {
      color: store => store.color
    }),
    ...mapState(useMediaStore, {
      streamscount: store => store.streamscount,
      selectedDate: store => store.selectedDate,
      start: store => store.start,
      end: store => store.end,
      realtimeList: store => store.realtimeList,
      mediaLoading: store => store.mediaLoading,
      media: store => store.media,
      events: store => Object.keys(store.media).map(e => e.replaceAll('-', '/')),
      currentEvents: store => store.currentEvents,
      timelines: store => store.timelines || [],
      commands: store => store.commands,
      connections: store => store.connections
    }),
    activeStreams () {
      return Object.entries(this.connections || {})
        .map(([id, c]) => ({ ...c, id }))
        .filter(c => c.meta && c.meta.mediastream)
        .sort((a, b) => (a.established || 0) - (b.established || 0))
    },
    tachoEnabled () {
      return !!(this.cmdtacho && this.item && this.item.configuration && this.item.configuration.tacho)
    },
    viewerIndex () {
      if (!this.current || !this.currentEvents) return -1
      return this.currentEvents.findIndex(f => f.uuid === this.current.uuid)
    },
    visibleColumns () {
      // trim columns to the actually available table width (window minus both
      // drawers), not just the screen size, so the table never overflows sideways
      const w = this.contentWidth || this.$q.screen.width
      if (w < 740) return ['preview', 'created', 'protected', 'delete']
      if (w < 1160) return ['preview', 'created', 'duration', 'type', 'protected', 'delete']
      return ['preview', 'created', 'channel', 'duration', 'size', 'type', 'share', 'protected', 'uploaded', 'delete']
    }
  },
  watch: {
    currentEvents (val) {
    },
    connected: function (val) {
      if (val) {
        this.init()
      }
    },
    '$route.params.deviceid': function () {
      this.init()
    }
  },
  mounted () {
    if (this.connected) {
      this.init()
    }
  },
  beforeUnmount () {

  },
  methods: {
    ...mapActions(useMediaStore, ['setDeviceId', 'setSelectedDate', 'setSelectedMonth', 'getMedia', 'deleteMedia']),
    mediaFileUrl,
    streamSrcUrl,
    streamMimeType,
    isTachographFile,
    tachoboxUrl,
    fileKindMeta,
    hasThumbnail,
    viewerStrategy,
    // Resolve the audio flag for a live stream. The gateway may expose it as
    // `has_audio`/`audio` either on the meta object or on its mediastream
    // descriptor. Returns false only when audio is explicitly absent;
    // undefined means "unknown" → let mpegts.js auto-detect.
    streamHasAudio (current) {
      const stream = (current && current.mediastream) || {}
      const flags = [stream.has_audio, stream.audio, current && current.has_audio, current && current.audio]
      if (flags.some(v => v === false)) return false
      if (flags.some(v => v === true)) return true
      return undefined
    },
    closeCalendar () {
      this.$refs.calendarpopup.close()
    },
    embed (uuid, url) {
      let file = (this.currentEvents || []).find(f => f && f.uuid === uuid) || null
      if (!file) {
        for (const dateKey of Object.keys(this.media || {})) {
          const found = (this.media[dateKey] || []).find(f => f && f.uuid === uuid)
          if (found) { file = found; break }
        }
      }
      if (!file) {
        file = (this.realtimeList || []).find(f => f && f.uuid === uuid) || null
      }
      this.$refs.embedplayer.open(uuid, url, { file, deviceId: this.item && this.item.id })
    },
    mainTimelineResize (size) {
      this.mainTimelineSize = size
    },
    playerTimelineResize (size) {
      this.playerTimelineSize = size
    },
    monthChange (e) {
      this.setSelectedMonth(e)
    },
    async init () {
      this.item = null
      this.loadError = false
      let item = null
      try {
        item = await this.getItem()
      } catch (e) {
        console.error('Failed to load device', e)
      }
      if (!item) {
        // device not found / no access (e.g. 403) / network error
        this.loadError = true
        return
      }
      this.item = item
      this.getCommand()
      this.setDeviceId(this.item.id)
    },
    openMedia (media) {
      this.current = media
      this.showmedia = true
    },
    viewerNav (dir) {
      const list = this.currentEvents || []
      const idx = this.viewerIndex
      if (idx < 0) return
      const next = list[idx + dir]
      if (next) {
        this.playing = false
        this.current = next
      }
    },
    async stopStream (id) {
      try {
        await this.$connector.http.delete(`gw/devices/${this.item.id}/connections/${id}`)
      } catch (e) {
        console.error('Failed to stop stream', e)
      }
    },
    toggleActivity () {
      this.activityOpen = !this.activityOpen
    },
    onResize (size) {
      this.height = size.height
    },
    onContentResize (size) {
      this.contentWidth = size.width
    },
    formatB (kb) {
      const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB']
      let u = 0, bytes = kb
      while (Math.abs(bytes) >= 1024 && u < units.length - 1) {
        bytes /= 1024
        ++u
      }
      return `${parseFloat(bytes > 10 ? bytes.toFixed(0) : bytes.toFixed(1))} ${units[u]}`
    },
    formatUnix (unixtime) {
      return moment.unix(parseFloat(unixtime)).format('YYYY-MM-DD HH:mm:ss')
    },
    formatUnixUTCTZ (unixtime) {
      return moment.unix(parseFloat(unixtime)).utc().format()
    },
    cons (e) {

    },
    rowClick (evt, row, index) {
      this.itemClick(row)
    },
    itemClick (item) {
      if (!item) return
      this.playing = false
      // tachograph files and anything with a known mime open in the in-app
      // viewer (which renders video/image/pdf/text and offers download for the
      // rest); only mime-less items fall back to opening in a new tab.
      if (isTachographFile(item) || item.mime || item.mediastream) {
        this.openMedia(item)
      } else {
        window.open(mediaFileUrl(item), '_blank')
      }
    },
    deleteFile (uuid, date) {
      const that = this
      this.$q.dialog({
        title: 'Confirm',
        message: 'Do you want to delete this media?',
        ok: 'Yes',
        cancel: 'No'
      }).onOk(() => {
        this.$connector.http.delete(`gw/devices/${this.item.id}/media`, { data: { uuid } }).then((response) => {
          // that.onError(response)
          that.deleteMedia(date, uuid)
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
    async getCommand () {
      let response
      try {
        response = await this.$connector.http.get(`gw/channel-protocols/all/device-types/${this.item.device_type_id}/?fields=commands`)
      } catch (e) {
        if (e.response) {
          response = e.response
        }
      }
      if (response && response.data && response.data.result && response.data.result[0] && response.data.result[0].commands) {
        this.cmdvideo = response.data.result[0].commands.find(com => com.name === 'request_video')
        this.cmdphoto = response.data.result[0].commands.find(com => com.name === 'take_photo')
        this.cmdstream = response.data.result[0].commands.find(com => com.name === 'start_videostream')
        this.cmdplayback = response.data.result[0].commands.find(com => com.name === 'playback_video')
        this.cmdtacho = response.data.result[0].commands.find(com => com.name === 'request_tachograph_file')
        this.cmdtimeline = response.data.result[0].commands.find(com => com.name === 'video_timeline')
      } else {
        this.cmdvideo = undefined
        this.cmdphoto = undefined
        this.cmdstream = undefined
        this.cmdplayback = undefined
        this.cmdtacho = undefined
        this.cmdtimeline = undefined
      }
    },

    async getItem () {
      let response
      try {
        response = await this.$connector.http.get(`gw/devices/${this.$route.params.deviceid}`)
      } catch (e) {
        response = e.response
      }
      return (response && response.data && response.data.result && response.data.result[0]) || null
    },
    takePhoto (data) {
      if (this.cmdphoto) {
        this.$refs.mediacommand.open(this.item.id, this.cmdphoto, data, this.setCommandID)
      }
    },
    setCommandID (id) {
      this.commandids[id] = true
    },
    getPlayback (data, date) {
      if (this.cmdvideo) {
        const d = new Date(date)
        const now = new Date()
        d.setHours(now.getHours())
        d.setMinutes(now.getMinutes())
        const duration = 10
        // this.$root.$emit('openDialogStack', { dialog_type: 'mediarequest', title: 'Send media request', back: false, item: this.item, item_type: 'devices', command: this.cmdvideo, cb: this.setCommandID, payload: { from: Math.floor(d.getTime() / 1000) } })
        this.$refs.mediacommand.open(this.item.id, this.cmdvideo, { ...data, from: (d.getTime() / 1000), duration }, this.setCommandID)
      }
    },

    getTacho (data) {
      if (this.cmdtacho) {
        // this.$root.$emit('openDialogStack', { dialog_type: 'mediarequest', title: 'Send media request', back: false, item: this.item, item_type: 'devices', command: this.cmdvideo, cb: this.setCommandID, payload: { from: Math.floor(d.getTime() / 1000) } })
        this.$refs.mediacommand.open(this.item.id, this.cmdtacho, data, this.setCommandID)
      }
    },
    getTimeline (data) {
      if (this.cmdtimeline) {
        const from = moment(this.selectedDate, 'YYYY-MM-DD').startOf('day').unix()
        const to = moment(this.selectedDate, 'YYYY-MM-DD').endOf('day').unix()
        // this.$root.$emit('openDialogStack', { dialog_type: 'mediarequest', title: 'Send media request', back: false, item: this.item, item_type: 'devices', command: this.cmdvideo, cb: this.setCommandID, payload: { from: Math.floor(d.getTime() / 1000) } })
        this.$refs.mediacommand.open(this.item.id, this.cmdtimeline, { from, to, ...data }, this.setCommandID)
      }
    },
    startStream (data) {
      if (this.cmdstream) {
        // this.$root.$emit('openDialogStack', { dialog_type: 'mediarequest', title: 'Send media request', back: false, item: this.item, item_type: 'devices', command: this.cmdvideo, cb: this.setCommandID, payload: { from: Math.floor(d.getTime() / 1000) } })
        this.$refs.mediacommand.open(this.item.id, this.cmdstream, { mediastream: 'hls', ...data }, this.setCommandID)
      }
    },

    playbackVideo (data) {
      if (this.cmdplayback) {
        // this.$root.$emit('openDialogStack', { dialog_type: 'mediarequest', title: 'Send media request', back: false, item: this.item, item_type: 'devices', command: this.cmdvideo, cb: this.setCommandID, payload: { from: Math.floor(d.getTime() / 1000) } })
        this.$refs.mediacommand.open(this.item.id, this.cmdplayback, { mediastream: 'hls', ...data }, this.setCommandID)
      }
    },
    getPlaybackByTimeline ({ channel, timestamp, duration }) {
      if (this.cmdvideo) {
        const data = { channel, from: timestamp }
        if (duration) data.duration = duration
        this.$refs.mediacommand.open(this.item.id, this.cmdvideo, data, this.setCommandID)
      }
    },

    openToolbox (timestamp) {
      const start = moment.unix(timestamp).startOf('day').unix(),
        end = moment.unix(timestamp).endOf('day').unix()
      const url = `${this.region.rest || ''}/toolbox/#/devices/${this.item.id}?token=${this.token}&fullscreen=1&noselect=all&logs=%7B%22from%22%3A${start},%22to%22%3A${end}.999999,%22scroll%22%3A${timestamp}%7D&messages=%7B%22from%22%3A${start},%22to%22%3A${end}.999999,%22scroll%22%3A${timestamp},"selected"%3A%5B${timestamp}%5D%7D`
      // this.$root.$emit('openTools', { url, title: 'Toolbox device', subtitle: `d#${this.item.id}` })
      window.open(url, '_blank')
    }
  }
}
</script>

<style lang="sass">
// container-mode layout: kill the spurious 1px vertical scrollbar caused by
// sub-pixel rounding of header+footer heights. The page table and the drawers
// have their own scroll areas, so the outer layout scroller never needs to scroll.
.q-layout-container > .absolute-full > .scroll
  overflow: hidden !important

// ...and reclaim the 10px scrollbar gutter Quasar reserves on the right
// (header/footer offsetParent), which otherwise shows the layout bg as a grey strip
.q-layout-container > .absolute-full
  right: 0 !important

// --- Right drawer (connections / uploads) ---------------------------
.mb-drawer
  background: #1b2026

.mb-drawer-header
  flex: 0 0 auto
  height: 48px
  border-bottom: 1px solid rgba(255, 255, 255, .07)

.mb-section-title
  padding: 10px 16px 6px
  font-size: 11px
  font-weight: 700
  letter-spacing: .6px
  text-transform: uppercase
  color: #8a97a6
  .q-icon
    color: #6c7a8a

.mb-upload-thumb
  width: 44px
  height: 30px
  object-fit: cover
  border-radius: 4px
  border: 1px solid rgba(255, 255, 255, .08)

// --- Footer (timeline) ----------------------------------------------
.mb-footer
  background: #14181c
  border-top: 1px solid rgba(255, 255, 255, .07)

// --- Media viewer overlay -------------------------------------------
.mb-fade-enter-active,
.mb-fade-leave-active
  transition: opacity .18s ease

.mb-fade-enter-from,
.mb-fade-leave-to
  opacity: 0

.mb-viewer-bar
  left: 0
  right: 0
  padding: 8px 10px 20px
  background: linear-gradient(rgba(0, 0, 0, .72), rgba(0, 0, 0, 0))
  pointer-events: none
  .q-btn
    pointer-events: auto

.mb-viewer-nav
  position: absolute
  top: 50%
  transform: translateY(-50%)
  z-index: 2
  background: rgba(0, 0, 0, .35)
  transition: background-color .15s ease, opacity .15s ease
  &.left
    left: 12px
  &.right
    right: 12px
  &:hover
    background: rgba(0, 0, 0, .6)
  &.disabled
    opacity: .25

// --- Loading skeleton -----------------------------------------------
.filemanager-skeleton
  overflow: hidden
  .mb-skel-row
    border-bottom: 1px solid rgba(255, 255, 255, .05)
  .q-skeleton
    background: rgba(255, 255, 255, .06)

// --- List / grid view toggle ----------------------------------------
.mb-view-toggle
  background: rgba(255, 255, 255, .05)
  border: 1px solid rgba(255, 255, 255, .09)
  border-radius: 10px
  padding: 3px
  .q-btn
    border-radius: 7px
    min-height: 30px
    min-width: 40px
    transition: background-color .15s ease, color .15s ease
    .q-icon
      font-size: 19px
  .q-btn--active
    box-shadow: none

// --- Action bar (device command panel) ------------------------------
.mb-action-bar
  background: rgba(255, 255, 255, .05)
  border: 1px solid rgba(255, 255, 255, .09)
  border-radius: 10px
  padding: 3px
  gap: 2px

.mb-action-btn
  border-radius: 7px
  min-height: 34px
  padding: 0 9px
  color: #b9c2cc
  font-size: 13px
  font-weight: 500
  letter-spacing: .2px
  transition: background-color .15s ease, color .15s ease
  .q-icon
    font-size: 20px
  &:hover
    background: rgba(255, 255, 255, .08)
    color: #fff

// show a little space between icon and label only when labels are visible
.mb-action-bar.mb-labels .mb-action-btn .q-icon
  margin-right: 6px

// muted, desaturated per-action accents for quick recognition (no candy colors)
.mb-act-photo .q-icon
  color: #6ea8dc
.mb-act-video .q-icon
  color: #e07a7a
.mb-act-stream .q-icon
  color: #6cc191
.mb-act-playback .q-icon
  color: #e0aa6b
.mb-act-timeline .q-icon
  color: #9bb0c2
.mb-act-tacho .q-icon
  color: #b9a0db

.mb-action-divider
  width: 1px
  align-self: stretch
  margin: 5px 4px
  background: rgba(255, 255, 255, .12)

.mb-icon-btn
  color: #b9c2cc
  transition: color .15s ease
  &:hover
    color: #fff

.filemanager
  /* height or max-height is important */
  height: 410px
  max-height: 100%
  .q-table__grid-content
    overflow: auto
  .q-table__top,
  .q-table__bottom,
  thead tr:first-child th /* bg color is important for th; just specify one */
    background-color: #333

  thead tr th
    position: sticky
    z-index: 1
  /* this will be the loading indicator */
  thead tr:last-child th
    /* height of all previous header rows */
    top: 48px
  thead tr:first-child th
    top: 0

  /* prevent scrolling behind sticky top row on focus */
  tbody
    /* height of all previous header rows */
    scroll-margin-top: 48px
.q-calendar-weekly__day.q-active-date .q-btn__wrapper:before
  background: inherit !important
.q-current-day
  // box-shadow: inset 0px 0px 5px grey;
  background: #ffdd99!important
.q-future-day
  background: #eee

.q-calendar-weekly__day
  cursor: pointer

.q-active-date
  box-shadow: inset 0px 0px 10px #999

.media-viewer>.absolute-full>.scroll
  overflow: unset!important

.media-viewer>.absolute-full>.scroll>.q-layout
  height: 100%

@media (min-width: 800px)
  .showmedia
    width: 50%!important
    height: 100%!important

.photo-title
  padding-top: 3px
  padding-left: 8px
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
</style>
