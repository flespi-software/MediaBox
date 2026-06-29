<template>
  <div class="media-element bg-black rounded-borders overflow-hidden shadow-2 relative-position" :class="highlighted ? 'media-highlighted' : ''" @click="e => $emit('click', e)">
    <img v-if="thumb" :src="mediaFileUrl(media, 'preview=jpeg')" loading="lazy"/>
    <div v-else class="fit column flex-center non-media-body">
      <q-icon :name="kindMeta.icon" :style="{ color: kindMeta.color }" size="42px" />
      <div class="non-media-name ellipsis q-px-sm">{{ media.name }}</div>
    </div>
    <div class="absolute-bottom media-info text-overline bottom">
      {{formatUnixTime(media.created)}}
      <span v-if="media.meta && media.meta.duration">({{ Math.floor(media.meta.duration) }} s.)</span>
    </div>
    <div v-if="thumb && media.meta" class="absolute-top media-info text-overline">
      <q-icon color="white" :name="media.meta.has_audio ? 'mdi-volume-high':'mdi-volume-variant-off'" size="15px" class="float-left q-pa-xs"/>
      <span v-if="media.meta.channel">CH:{{media.meta.channel}}</span>
    </div>
    <div class="absolute-top media-info text-overline top">
      <q-btn flat dense @click.stop="toggleProtected(media.uuid, !media.protected)" :icon="media.protected?'mdi-lock':'mdi-lock-open-variant'" :color="media.protected?'red':'white'" size="10px" class="float-right q-pa-xs" />
      <q-btn color="white" flat dense icon="mdi-list-box" size="10px" class="float-right q-pa-xs" @click.stop="openToolbox(media.created)" />
      <q-btn color="white" flat dense icon="mdi-share" size="10px" class="float-right q-pa-xs" @click.stop="$emit('embed', media.uuid)">
      </q-btn>
    </div>
    <q-icon v-if="media.mime && media.mime.indexOf('video') == 0" color="white" name="mdi-video" size="50px" class="absolute-center type-icon"/>
    <q-icon v-if="media.mime && media.mime.indexOf('image') == 0" color="white" name="mdi-image" size="50px" class="absolute-center type-icon"/>
    <!-- <video :src="`${(region && region.media) || 'https://media.flespi.io'}/${m.uuid}`" class="" style="max-width:100%; max-height:100%;margin:auto;"></video> -->
  </div>
</template>

<script lang="js">
// import Vue from 'vue'
import { defineComponent, computed } from 'vue'
import moment from 'moment'
// import { mapState } from 'vuex'

import { useAuthStore } from '../../stores/auth'
import { mediaFileUrl } from '../../utils/media-url'
import { fileKindMeta, hasThumbnail } from '../../utils/file-type'

export default defineComponent({
  name: 'MediaItem',
  components: {
  },
  emits: ['embed'],
  props: {
    item: null,
    media: null,
    highlighted: {
      type: Boolean,
      default: false
    }
  },
  setup () {
    const auth = useAuthStore()
    const token = computed(() => auth.token)
    const region = computed(() => auth.region)
    return {
      token,
      region,
      mediaFileUrl
    }
  },
  data () {
    return {
    }
  },
  computed: {
    thumb () {
      return hasThumbnail(this.media)
    },
    kindMeta () {
      return fileKindMeta(this.media)
    }
  },
  watch: {
  },
  beforeMount () {
  },
  // mounted () {
  //   this.getMedia()
  // },
  mounted () {
  },
  beforeUnmount () {
  },
  methods: {
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
      // this.$root.$emit('openTools', { url, title: 'Toolbox device', subtitle: `d#${this.item.id}` })
      window.open(url, '_blank')
    }
  }
})
</script>

<style lang="sass">
.media-element
  max-width: 100%
  text-align: center
  cursor: pointer
  aspect-ratio: 16/9
  background: #1b1f24
  border: 1px solid rgba(255, 255, 255, .06)
  transition: border-color .15s ease, box-shadow .15s ease, transform .15s ease
  .type-icon
    transition: opacity .5s
    opacity: .45
  &:hover
    border-color: rgba(255, 255, 255, .22)
    box-shadow: 0 4px 14px rgba(0, 0, 0, .45)
    transform: translateY(-2px)
    .type-icon
      opacity: 0

.media-element .non-media-body
  color: #c8ccd4
  .non-media-name
    margin-top: 6px
    max-width: 100%
    font-size: 11px
    line-height: 1.2
    color: #9aa6b2

.media-element img
  width: 100%
  height: 100%
  object-fit: cover
  vertical-align: middle
  opacity: .92
  transition: opacity .15s ease, transform .3s ease
.media-element:hover img
  opacity: 1
  transform: scale(1.03)
.media-element .media-info
  background: rgba(0,0,0,.5)
  height: 18px
  line-height: 20px
  color: #fff
  transition: top .2s ease-in-out, bottom .2s ease-in-out
.media-element .media-info.top
  top: -50px
  height: 23px
.media-element .media-info.bottom
  bottom: 0
.media-element:hover .media-info.top
  top: 0
.media-element:hover .media-info.bottom
  bottom: 0

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
</style>
