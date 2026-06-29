<template><q-layout view="lHh Lpr lFf">
  <q-header class="mb-app-header bg-blue-grey-9" v-if="!$q.platform.within.iframe">
    <q-toolbar class="q-px-md">
      <q-btn v-if="token && connected && deviceList.length > 0" flat round dense icon="mdi-menu"
        @click="deviceDrawer = !deviceDrawer" class="q-mr-sm">
        <q-tooltip>Devices</q-tooltip>
      </q-btn>
      <q-toolbar-title shrink>
        <img alt="MediaBox logo" src="~assets/logo.svg"
          style="width: 34px; height: 42px; margin-top:-8px; vertical-align: middle;" />
        <span class="gt-xs text-weight-medium q-ml-xs">MediaBox</span>
      </q-toolbar-title>
      <div v-if="selectedDevice" class="row items-center no-wrap q-ml-md gt-xs text-blue-grey-3">
        <q-icon name="mdi-developer-board" size="18px" class="q-mr-xs" />
        <span class="ellipsis" style="max-width:240px">{{ selectedDevice.label || ('#' + selectedDevice.value) }}</span>
      </div>
      <q-space />
      <q-btn v-if="token && connected && deviceList.length === 0" tabindex="0" icon="mdi-developer-board"
        color="teal-4" outline no-caps rounded @click="getDevices()" label="Request devices" class="q-ml-sm" />
      <q-btn v-if="!token" tabindex="0" ref="loginbutton" icon="mdi-account-circle" color="teal-4" no-caps rounded
        outline @click="openWindow(`${region.rest || `https://${host}`}/login/#/providers`)" label="Log in" class="q-ml-sm" />
      <q-btn v-else tabindex="0" icon="mdi-logout" color="blue-grey-4" round flat dense @click="setToken('')" class="q-ml-sm">
        <q-tooltip>Log out</q-tooltip>
      </q-btn>
    </q-toolbar>
  </q-header>

  <q-drawer v-if="!$q.platform.within.iframe && token && connected && deviceList.length > 0"
    side="left" v-model="deviceDrawer" bordered :width="280" :breakpoint="767"
    :behavior="$q.screen.lt.md ? 'mobile' : 'desktop'" content-class="mb-device-drawer column no-wrap">
    <div class="mb-drawer-header row items-center no-wrap q-px-md">
      <q-icon name="mdi-developer-board" size="18px" color="blue-grey-4" class="q-mr-sm" />
      <div class="text-subtitle2 text-weight-medium">Devices</div>
      <q-space />
      <q-badge color="blue-grey-7">{{ visibleDevices.length }}</q-badge>
    </div>
    <div class="q-px-sm q-pt-sm">
      <q-input v-model="deviceSearch" debounce="250" dense dark outlined clearable placeholder="Search devices">
        <template v-slot:prepend><q-icon name="mdi-magnify" size="20px" /></template>
      </q-input>
      <q-toggle v-model="mediaOnly" dense size="sm" color="teal" class="q-mt-xs text-blue-grey-3"
        label="With media only" />
    </div>
    <q-virtual-scroll class="col" :items="visibleDevices" v-slot="{ item }">
      <q-item :key="item.value" clickable v-ripple :active="item.value === deviceId"
        active-class="mb-device-active" @click="selectDevice(item.value)"
        :title="(item.label || '<NONAME>') + ' · #' + item.value + (item.hasMedia ? ' · media: ' + formatSize(item.mediaSize) : '')">
        <q-item-section avatar style="min-width:34px">
          <q-icon name="mdi-developer-board"
            :color="item.value === deviceId ? 'teal-4' : item.connected ? 'green' : 'blue-grey-5'" />
        </q-item-section>
        <q-item-section>
          <q-item-label class="ellipsis">{{ item.label || '<NONAME>' }}</q-item-label>
          <q-item-label caption class="ellipsis" v-if="item.ident">{{ item.ident }}</q-item-label>
        </q-item-section>
        <q-item-section side class="items-end">
          <q-icon v-if="item.pinned" name="mdi-pin" color="blue-grey-6" size="xs" />
          <q-item-label caption>#{{ item.value }}</q-item-label>
        </q-item-section>
      </q-item>
    </q-virtual-scroll>
    <q-item v-if="!visibleDevices.length" class="text-grey-6 text-caption">
      <q-item-section>No devices match</q-item-section>
    </q-item>
  </q-drawer>

  <q-page-container>
    <router-view />
  </q-page-container>
</q-layout></template>
<style lang="sass">
.mb-app-header
  border-bottom: 1px solid rgba(255, 255, 255, .07)

.mb-device-drawer
  background: #1b2026
  .mb-drawer-header
    flex: 0 0 auto
    height: 48px
    border-bottom: 1px solid rgba(255, 255, 255, .07)

.mb-device-active
  background: rgba(77, 182, 172, .12)
  color: #4db6ac

.q-item--active
  color: #4db6ac
</style>
<script>
import { defineComponent } from 'vue'

import { mapState, mapActions } from 'pinia'
import { useAuthStore } from '../stores/auth'
import { useMediaStore } from '../stores/media'

export default defineComponent({
  name: 'MainLayout',
  data () {
    return {
      host: 'flespi.io',
      deviceId: null,
      deviceDrawer: this.$q ? this.$q.screen.gt.sm : false,
      deviceSearch: '',
      mediaOnly: true
    }
  },
  computed: {
    ...mapState(useAuthStore, {
      region: store => store.region,
      token: store => store.token,
      connected: store => store.connected
    }),

    ...mapState(useMediaStore, {
      deviceList: store => store.sortedDeviceList
    }),
    visibleDevices () {
      let list = this.deviceList
      // Default view: devices relevant to MediaBox = those that already have
      // media OR whose type supports media commands. Turn the filter off to see
      // every device (e.g. to manually upload a file into a non-media device).
      if (this.mediaOnly) list = list.filter(d => d.hasMedia || d.mediaCapable)
      const q = (this.deviceSearch || '').toLowerCase().trim()
      if (q) {
        list = list.filter(d =>
          (d.label || '').toLowerCase().includes(q) ||
          String(d.value).includes(q) ||
          (d.ident || '').toLowerCase().includes(q)
        )
      }
      return list
    },
    selectedDevice () {
      return (this.deviceList || []).find(d => d.value === this.deviceId) || null
    }
  },
  components: {
  },
  watch: {
    token (val) {
      if (!this.$q.platform.within.iframe && val) {
        this.getDevices()
      }
      if (!val) {
        this.$router.push({ path: '/' })
      }
    },
    connected (val) {
      if (val) {
        this.subscribePinnedDevices()
      }
    },
    deviceId (val) {
      if (val) this.$router.push({ path: `/device/${val}` })
    },
    '$route.params.deviceid': function (val) {
      this.deviceId = val ? parseInt(val) : null
    }
  },
  mounted () {
    const that = this
    that.init()
    if (this.$refs.loginbutton && this.$refs.loginbutton.$el) this.$refs.loginbutton.$el.focus()
    if (this.$route.params.deviceid) {
      this.deviceId = parseInt(this.$route.params.deviceid)
    }
    if (!this.$q.platform.within.iframe && this.token) {
      this.getDevices()
      if (this.connected) {
        this.subscribePinnedDevices()
      }
    }
    window.addEventListener('message', function (event) {
      // console.log(event.data)
      if (typeof event.data === 'string' && event.data === 'error:1102') {
        // that.getOauth()
      }

      if (typeof event.data === 'string' && ~event.data.indexOf('FlespiLogin|token:')) { // && that.token.replace('FlespiToken ', '') !== event.data.replace('FlespiToken ', '')) {
        const login = JSON.parse(event.data.replace('FlespiLogin|token:', ''))
        that.setToken(login.token)
        // that.setRegion(login.region)
        // that.$store.dispatch('setToken', login.token)
        // that.$q.sessionStorage.set('currentLogin', login)
      }
    })
  },
  methods: {
    ...mapActions(useAuthStore, ['setToken', 'init']),
    ...mapActions(useMediaStore, ['getDevices', 'subscribePinnedDevices']),
    selectDevice (id) {
      this.deviceId = id
      if (this.$q.screen.lt.md) this.deviceDrawer = false
    },
    // media_size is reported in kilobytes
    formatSize (kb) {
      const units = ['KB', 'MB', 'GB', 'TB']
      let u = 0, n = kb || 0
      while (n >= 1024 && u < units.length - 1) {
        n /= 1024
        u++
      }
      return `${n >= 10 || u === 0 ? Math.round(n) : n.toFixed(1)} ${units[u]}`
    },
    openWindow (url, title) {
      title = title || 'auth'
      const w = 500, h = 600
      const dualScreenLeft = window.screenLeft !== undefined ? window.screenLeft : screen.left
      const dualScreenTop = window.screenTop !== undefined ? window.screenTop : screen.top

      const width = window.innerWidth ? window.innerWidth : document.documentElement.clientWidth ? document.documentElement.clientWidth : screen.width
      const height = window.innerHeight ? window.innerHeight : document.documentElement.clientHeight ? document.documentElement.clientHeight : screen.height

      const left = ((width / 2) - (w / 2)) + dualScreenLeft
      const top = ((height / 2) - (h / 2)) + dualScreenTop
      const newWindow = window.open(url, title, 'toolbar=no,location=no,status=yes,resizable=yes,scrollbars=yes, width=' + w + ', height=' + h + ', top=' + top + ', left=' + left)

      // Puts focus on the newWindow
      if (window.focus) {
        newWindow.focus()
      }
    }
  }
})
</script>
