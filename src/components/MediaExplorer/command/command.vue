<template>
  <q-dialog v-model="showCommand">
    <q-card class="mb-command-card">
      <q-card-section class="row items-center q-py-sm no-wrap">
        <q-icon name="mdi-cog-play-outline" color="teal-4" size="22px" class="q-mr-sm" />
        <div class="text-subtitle1 text-weight-medium">Send command</div>
        <q-space />
        <q-btn flat round dense icon="mdi-close" color="blue-grey-4" v-close-popup>
          <q-tooltip>Close</q-tooltip>
        </q-btn>
      </q-card-section>

      <q-separator color="blue-grey-9" />

      <q-card-section class="q-pa-md" style="max-height: calc(100vh - 176px); position:relative;">
        <div class="mb-form-frame">
          <iframe v-if="showCommand" :src="formboxUrl" id="form" ref="form" :style="`border: 0;width:500px;max-width:100%;display:block;height:${dialogHeight}px;`"/>
        </div>
        <div class="absolute-full column flex-center" style="background:#1b2026;" v-if="!ready">
          <q-spinner-gears size="40px" color="blue-grey-4" />
          <div class="text-caption text-grey-6 q-mt-md">Loading form…</div>
        </div>
      </q-card-section>

      <q-separator color="blue-grey-9" />

      <q-card-actions align="right" class="q-px-md">
        <q-input v-model.number="ttl" label="TTL" dark dense suffix="sec." style="width:110px"
          hide-bottom-space :error="ttl>2592000 || ttl<60" /><q-space />
        <q-btn flat no-caps label="Cancel" color="blue-grey-3" v-close-popup />
        <q-btn unelevated no-caps :disabled="formError" :loading="blocksend" label="Send"
          color="teal-6" icon="mdi-send" @click="() => { this.sendRequest() }" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script>
import moment from 'moment'
import { formboxUrl } from '../../../utils/formbox-url'
export default {
  name: 'MediaCommand',
  props: {
    events: {
      type: Object,
      default: () => { return {} }
    }
  },
  emits: ['dayClick', 'monthChange'],
  watch: {
    '$q.screen.height': function (val) {
      this.screenHeight = val
    }
  },
  data: () => ({
    date: moment(),
    days: [],
    command: undefined,
    data: undefined,
    ready: false,
    showCommand: false,
    blocksend: true,
    cb: undefined,
    deviceId: undefined,
    formError: false,
    height: 500,
    screenHeight: 500,
    ttl: 600
  }),
  computed: {
    formboxUrl () {
      return formboxUrl()
    },
    dialogHeight: function () {
      if (this.height > this.screenHeight - 200) {
        return this.screenHeight - 200
      } else {
        return this.height
      }
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
    open (id, command, data, cb) {
      this.deviceId = id
      this.command = command
      this.data = data
      this.cb = cb || undefined
      this.showCommand = true
      this.height = 500
    },
    close () {
      this.deviceId = undefined
      this.command = undefined
      this.data = undefined
      this.cb = undefined
      this.showCommand = false
    },
    send (cmd) {
      const el = document.getElementById('form')
      if (!el) return
      el.contentWindow.postMessage('FormBox|cmd:' + JSON.stringify(cmd), '*')
    },
    initForm () {
      const obj = {
        // debug: true,
        applybtn: ''
      }
      if (this.command && this.command.schema) obj.schema = this.command.schema
      if (this.data) obj.data = this.data
      this.send(obj)
    },
    // document.getElementById('form').contentWindow.postMessage('FormBox|cmd:...', '*')
    processForm (event) {
      if (!this.showCommand) return
      if (typeof event.data === 'string') {
        if (event.data.indexOf('FormBox|state') === 0) {
          const data = JSON.parse(event.data.replace('FormBox|state:', ''))
          if (data.ready) {
            this.blocksend = false
            this.initForm()
            setTimeout(() => { this.ready = true }, 3000)
          }
          if (data.form) {
            this.formError = data.form !== 'ok'
          }
          if (data.resize) {
            this.height = data.resize.height < 500 ? 500 : data.resize.height
            setTimeout(() => { this.ready = true }, 1000)
          }
        }
        if (event.data.indexOf('FormBox|data') === 0) {
          const data = JSON.parse(event.data.replace('FormBox|data:', ''))
          this.data = data
        }
      }
    },

    async sendRequest () {
      this.blocksend = true
      const that = this
      // console.log(this.data)
      const addr = '/gw/devices/' + this.deviceId + '/commands-queue'
      const data = [{ name: this.command.name, properties: that.data, ttl: that.ttl || 600 }]

      let response
      try {
        response = await this.$connector.http.post(addr, data)
      } catch (e) {
        if (e.response) {
          response = e.response
        }
      }
      if (response.data.result && response.data.result[0]) {
        // console.log(response.data.result[0])
        that.$q.notify('Successfully added to queue')
        if (this.cb) {
          this.cb(response.data.result[0].id)
        }
        this.close()
      }
      this.blocksend = false

      // this.onError(response)
      // this.$emit('close')
    }
  },
  mounted () {
  }
}
</script>

<style scoped>
.mb-command-card {
  background: #1b2026;
  width: 540px;
  max-width: 92vw;
}
.mb-form-frame {
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
  line-height: 0;
}
</style>
