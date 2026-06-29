<template>
<div>
  <q-dialog v-model="showembed" position="bottom">
    <div style="width: 700px; max-width:100%;padding:10px;" class="bg-grey-9">
      <q-btn icon="mdi-close" class="float-right" round flat @click="showembed = false" />
      <span class="text-h4">Share</span>
      <div class="ellipsis q-mt-sm">
        Download: <br /><a :href="downloadurl" target="_blank">{{ downloadurl }}</a>
      </div>

      <template v-if="file && deviceId && isTachographFile(file)">
        <div class="ellipsis q-mt-sm">
          Open in TachoBox: <br /><a :href="tachoOpenUrl" target="_blank">{{ tachoOpenUrl }}</a>
        </div>
        <div class="q-mt-sm">
          Embed:
          <div class="code">{{ embedhtml.replace('{url}', tachoEmbedUrl) }}</div>
        </div>

        <q-banner dense rounded class="bg-orange-9 text-white q-mt-md text-caption">
          <template #avatar>
            <q-icon name="mdi-shield-alert" color="white" />
          </template>
          The recipient must log in to TachoBox themselves — the link does not include a token.
          Adding a token here would expose <b>all data</b> your token can access, not just this
          file.
          <div class="q-mt-xs">
            <q-toggle v-model="includeToken" dense size="sm" label="Include my token (insecure)" color="amber" />
          </div>
        </q-banner>
      </template>

      <template v-else>
        <div class="ellipsis q-mt-sm">
          Open player: <br /><a :href="`${embedurl.replace('{uuid}', uuid)}`" target="_blank">{{
            embedurl.replace('{uuid}', uuid) }}</a>
        </div>
        <div class="q-mt-sm">
          Embed:
          <div class="code">{{ embedhtml.replace('{url}', embedurl.replace('{uuid}', uuid)) }}</div>
        </div>
      </template>
    </div>
  </q-dialog>
</div>
</template>

<script lang="js">
import { defineComponent } from 'vue'
import { mapState } from 'pinia'
import { useAuthStore } from '../../stores/auth'
import { useMediaStore } from '../../stores/media'
import { mediaFileUrl } from '../../utils/media-url'
import { isTachographFile, tachoboxUrl } from '../../utils/tachograph-url'

export default defineComponent({
  name: 'EmbedPlayer',
  components: {
  },
  data () {
    return {
      showembed: false,
      uuid: '',
      mediaUrl: null,
      file: null,
      deviceId: null,
      includeToken: false,
      embedhtml: '<iframe src="{url}" frameborder="0" style="min-width:350px;min-height:200px;" allowfullscreen allow="clipboard-read; clipboard-write"></iframe>'
    }
  },
  computed: {
    ...mapState(useAuthStore, {
      region: state => state.region,
      token: state => state.token
    }),
    ...mapState(useMediaStore, {
      connections: state => state.connections
    }),
    downloadurl () {
      return this.mediaUrl || mediaFileUrl({ uuid: this.uuid })
    },
    embedurl () {
      return `${window.location.origin}${window.location.pathname}#/uuid/{uuid}`
    },
    tachoOpenUrl () {
      if (!this.file || !this.deviceId || !isTachographFile(this.file)) return ''
      return tachoboxUrl(this.deviceId, this.file, this.includeToken ? this.token : null)
    },
    tachoEmbedUrl () {
      if (!this.file || !this.deviceId || !isTachographFile(this.file)) return ''
      return tachoboxUrl(this.deviceId, this.file, this.includeToken ? this.token : null, { hidepanels: 1 })
    }
  },
  methods: {
    isTachographFile,
    open (uuid, url, ctx) {
      this.uuid = uuid
      this.mediaUrl = url || null
      this.file = (ctx && ctx.file) || null
      this.deviceId = (ctx && ctx.deviceId) || null
      this.includeToken = false
      this.showembed = true
    },
    close () {
      this.uuid = ''
      this.mediaUrl = null
      this.file = null
      this.deviceId = null
      this.includeToken = false
      this.showembed = false
    }
  }
})
</script>

<style lang="sass" scoped>
a
  color: #f00
.code
  border: 1px dashed #cc0
  background: #222
  padding: 10px
  border-radius: 5px
  word-wrap: break-word
</style>
