<template>
  <q-page>
    <div v-if="!current.mime" class="fit flex flex-center">
      <img
        alt="MediaBox logo"
        src="~assets/logo.svg"
        style="width: 400px; height: 400px"
      >
    </div>
    <div style="height:100vh" v-else>
      <MediaPlayer
        v-if="current.meta.type == 'mediastream'"
        :options="{
          autoplay: true,
          controls: true,
          sources: [
            {
              src: mediaFileUrl(current),
              type: current.mime
            }
          ],
          poster: mediaFileUrl(current, 'preview=jpeg')
        }"
        title="Live"
        style="max-width:calc(100% - 8px); height: 100%;"
        class="bg-black fit" />
      <MediaPlayer
        v-else-if="current.mime.indexOf('video') == 0"
        :options="{
          autoplay: true,
          controls: true,
          sources: [
            {
              src: mediaFileUrl(current),
              type: current.mime
            }
          ],
          poster: mediaFileUrl(current, 'preview=jpeg')
        }"
        :title="formatUnix(current.created)"
        style="max-width:calc(100% - 8px); height: 100%;"
        class="bg-black fit" />
      <template v-else-if="current.mime.indexOf('image') == 0">
        <div class="photo-title" style="z-index:1">{{ formatUnix(current.created) }}</div>
        <img :src="mediaFileUrl(current)" class="absolute-center" style="max-height:calc(100% - 8px);max-width:calc(100% - 8px);"  />
      </template>
    </div>
  </q-page>
</template>

<script>

import MediaPlayer from '../components/MediaExplorer/player/player.vue'

import { mapState } from 'pinia'

import { useAuthStore } from '../stores/auth'
import moment from 'moment'
import { mediaFileUrl } from '../utils/media-url'
export default {
  name: 'MediaPlayerPage',
  components: {
    MediaPlayer
  },
  data () {
    return {
      current: {},
      requested: false
    }
  },
  computed: {
    ...mapState(useAuthStore, {
      region: store => store.region,
      token: store => store.token,
      connected: store => store.connected
    })
  },
  mounted () {
    if (this.$route.params.uuid && !this.requested) {
      const that = this
      that.getMeta()
    }
  },
  methods: {
    mediaFileUrl,
    async getMeta () {
      this.requested = true
      let response
      try {
        response = await this.$connector.http.external(mediaFileUrl({ uuid: this.$route.params.uuid }, 'preview=json'))
      } catch (e) {
        if (e.response) {
          response = e.response
        }
      }
      this.current = response.data || {}
      this.current.uuid = this.$route.params.uuid
    },
    formatUnix (unixtime) {
      return moment.unix(parseFloat(unixtime)).format('YYYY-MM-DD HH:mm:ss')
    }
  }
}
</script>
