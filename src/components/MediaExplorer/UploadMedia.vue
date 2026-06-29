<template>
  <q-dialog v-model="show">
    <q-card class="mb-upload-card">
      <q-card-section class="row items-center q-py-sm no-wrap">
        <q-icon name="mdi-upload" color="teal-4" size="22px" class="q-mr-sm" />
        <div class="text-subtitle1 text-weight-medium">Upload media file</div>
        <q-space />
        <q-btn flat round dense icon="mdi-close" color="blue-grey-4" v-close-popup>
          <q-tooltip>Close</q-tooltip>
        </q-btn>
      </q-card-section>

      <q-separator color="blue-grey-9" />

      <q-card-section class="q-pa-md" style="max-height: calc(100vh - 176px); overflow: auto; position: relative;">
        <q-file
          v-model="file"
          label="Select file"
          outlined
          dark
          bottom-slots
          counter
          :max-file-size="maxFileSize"
          @rejected="onFileRejected"
        >
          <template v-slot:prepend>
            <q-icon name="mdi-paperclip" />
          </template>
          <template v-slot:append>
            <q-icon v-if="file" name="mdi-close" class="cursor-pointer" @click.stop.prevent="file = null" />
          </template>
        </q-file>

        <div class="text-overline text-blue-grey-4 q-mt-md q-mb-xs">Metadata</div>
        <div class="mb-form-frame">
          <iframe v-if="show" :src="formboxUrl" id="upload-form" ref="form"
            :style="`border: 0; width: 100%; display: block; height: ${dialogHeight}px;`" />
        </div>
        <div class="absolute-full column flex-center" style="background:#1b2026;" v-if="!ready">
          <q-spinner-gears size="40px" color="blue-grey-4" />
          <div class="text-caption text-grey-6 q-mt-md">Loading form…</div>
        </div>
      </q-card-section>

      <q-separator color="blue-grey-9" />

      <q-card-actions align="right" class="q-px-md">
        <q-btn flat no-caps label="Cancel" color="blue-grey-3" v-close-popup />
        <q-btn unelevated no-caps :disabled="!file || formError || uploading" :loading="uploading"
          label="Upload" color="teal-6" icon="mdi-cloud-upload" @click="upload" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script>
import { isTachographFile } from '../../utils/tachograph-url'
import { formboxUrl } from '../../utils/formbox-url'

export default {
  name: 'UploadMedia',
  data: () => ({
    show: false,
    file: null,
    data: null,
    uploadType: null,
    schema: null,
    ready: false,
    formReady: false,
    formError: false,
    uploading: false,
    deviceId: null,
    height: 500,
    screenHeight: 500,
    maxFileSize: 100 * 1024 * 1024
  }),
  computed: {
    formboxUrl () {
      return formboxUrl()
    },
    dialogHeight () {
      if (this.height > this.screenHeight - 300) {
        return this.screenHeight - 300
      }
      return this.height
    }
  },
  watch: {
    '$q.screen.height' (val) {
      this.screenHeight = val
    },
    file (val) {
      // detect the upload type from the chosen file and pre-select the matching
      // form variant (video/image/tacho). If undetected, leave the choice to the user.
      this.uploadType = this.detectUploadType(val)
      if (this.formReady) this.initForm()
    }
  },
  created () {
    window.addEventListener('message', this.processForm)
    this.screenHeight = this.$q.screen.height
  },
  beforeUnmount () {
    window.removeEventListener('message', this.processForm)
  },
  methods: {
    async open (deviceId) {
      this.deviceId = deviceId
      this.file = null
      this.data = null
      this.uploadType = null
      this.ready = false
      this.formReady = false
      this.formError = false
      this.uploading = false
      this.height = 500
      this.show = true
      await this.loadSchema()
    },
    close () {
      this.show = false
      this.deviceId = null
      this.file = null
      this.data = null
    },
    async loadSchema () {
      try {
        const response = await this.$connector.http.get('/gw/api.json')
        const apiData = response.data

        function getDefinition (ref) {
          const parts = ref.split('/')
          return apiData[parts[1]][parts[2]] || {}
        }
        function unrefs (sch) {
          if (sch.$ref) return unrefs(JSON.parse(JSON.stringify(getDefinition(sch.$ref))))
          for (const i in sch) {
            if (sch[i] !== null && typeof sch[i] === 'object') {
              sch[i] = unrefs(sch[i])
            }
          }
          return sch
        }

        this.schema = unrefs(JSON.parse(JSON.stringify(apiData.definitions['media.file.post'])))
        if (this.formReady) {
          this.initForm()
        }
      } catch (e) {
        console.error('Failed to load upload schema', e)
        this.$q.notify({ type: 'negative', message: 'Failed to load upload schema' })
      }
    },
    initForm () {
      if (!this.schema) return
      const cmd = { applybtn: '', schema: this.schema }
      // pre-select the matching anyOf variant via its discriminator field
      if (this.uploadType) cmd.data = { type: this.uploadType }
      this.send(cmd)
    },
    // Map the chosen file to an upload form type: 'video' | 'image' | 'tacho',
    // or null when it can't be determined (then the user picks the form).
    detectUploadType (file) {
      if (!file) return null
      const name = (file.name || '').toLowerCase()
      const mime = (file.type || '').toLowerCase()
      if (isTachographFile(file)) return 'tacho'
      if (mime.startsWith('video/') || /\.(mp4|avi|mov|mkv|webm|flv|ts|m4v|3gp)$/.test(name)) return 'video'
      if (mime.startsWith('image/') || /\.(jpe?g|png|gif|bmp|webp|heic)$/.test(name)) return 'image'
      return null
    },
    send (cmd) {
      if (!this.$refs.form) return
      this.$refs.form.contentWindow.postMessage('FormBox|cmd:' + JSON.stringify(cmd), '*')
    },
    processForm (event) {
      if (!this.show) return
      if (typeof event.data === 'string') {
        if (event.data.indexOf('FormBox|state') === 0) {
          const state = JSON.parse(event.data.replace('FormBox|state:', ''))
          if (state.ready) {
            this.formReady = true
            this.initForm()
            setTimeout(() => { this.ready = true }, 3000)
          }
          if (state.form) {
            this.formError = state.form !== 'ok'
          }
          if (state.resize) {
            this.height = state.resize.height < 200 ? 200 : state.resize.height
            setTimeout(() => { this.ready = true }, 1000)
          }
        }
        if (event.data.indexOf('FormBox|data') === 0) {
          this.data = JSON.parse(event.data.replace('FormBox|data:', ''))
        }
      }
    },
    onFileRejected () {
      this.$q.notify({ type: 'negative', message: 'File is too large' })
    },
    async upload () {
      if (!this.file || !this.deviceId) return
      this.uploading = true

      const formData = new FormData()
      formData.append('file', this.file)
      formData.append('data', JSON.stringify(this.data || {}))

      try {
        const response = await this.$connector.http.post(
          `gw/devices/${this.deviceId}/media`,
          formData
        )
        if (response.data.errors && response.data.errors.length) {
          const err = response.data.errors[0]
          this.$q.notify({ type: 'negative', message: err.reason || 'Upload failed' })
        } else if (response.data.result && response.data.result.length) {
          this.$q.notify({ type: 'positive', message: 'File uploaded successfully' })
          this.close()
        } else {
          this.$q.notify({ type: 'negative', message: 'Upload failed' })
        }
      } catch (e) {
        const errors = e.response?.data?.errors
        const msg = errors?.length ? errors[0].reason : 'Upload failed'
        this.$q.notify({ type: 'negative', message: msg })
      }
      this.uploading = false
    }
  }
}
</script>

<style scoped>
.mb-upload-card {
  background: #1b2026;
  min-width: 550px;
  max-width: 92vw;
}
.mb-form-frame {
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
  line-height: 0;
}
</style>
