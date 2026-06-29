import { defineStore } from 'pinia'
import moment from 'moment'

export const useMediaStore = defineStore('media', {
  state: () => ({
    deviceList: [],
    deviceId: null,
    pinnedDevices: {},
    devices: {},
    topics: {
      pinnedDevices: 'xflespifront/pinned/devices',
      connections: 'flespi/state/gw/devices/{device_id}/connections/+',
      commandslog: 'flespi/log/gw/devices/{device_id}/commands-queue/{cmds}/queued,sent,processed,canceled,expired',
      commandsqueue: 'flespi/state/gw/devices/{device_id}/commands-queue/+',
      uploads: 'flespi/log/gw/devices/{device_id}/media_file_uploaded,media_file_updated'
    },
    connections: {},
    commands: {},
    connected: false,

    selectedDate: moment().format('YYYY-MM-DD') || '',
    from: moment().startOf('month').unix(),
    to: moment().endOf('month').unix(),

    timestamp_type: 'created',

    media: {},
    mediaLoading: false,
    mediaDeviceTypes: {},
    timeline: {},
    realtimeList: [],
    cmds: ['request_video', 'take_photo', 'start_videostream', 'video_timeline', 'playback_video', 'request_tachograph_file'],
    recentCommandsLimit: 7
  }),
  getters: {
    streamscount: state => Object.values(state.connections).filter(el => !!el.meta).length,
    currentEvents: state => state.media[state.selectedDate] || [],
    timelines: state => state.timeline[state.selectedDate] || [],
    recentCommands: state => Object.values(state.commands)
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, state.recentCommandsLimit),
    sortedDeviceList: state => {
      return [...state.deviceList]
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        .map(e => {
          return {
            label: e.name,
            value: e.id,
            cid: e.cid,
            ident: e.configuration && e.configuration.ident,
            pinned: !!state.pinnedDevices[e.id],
            connected: !!e.connected,
            mediaSize: e.media_size || 0,
            hasMedia: (e.media_size || 0) > 0,
            mediaCapable: !!state.mediaDeviceTypes[e.device_type_id]
          }
        })
        // pinned first, then media-relevant devices (have media or media-capable), then the rest
        .sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
          const aRel = a.hasMedia || a.mediaCapable
          const bRel = b.hasMedia || b.mediaCapable
          if (aRel !== bRel) return aRel ? -1 : 1
          if (a.hasMedia !== b.hasMedia) return a.hasMedia ? -1 : 1
          return 0
        })
    }
  },
  actions: {
    setSelectedDate (d) {
      this.selectedDate = d
    },
    setSelectedMonth ({ from, to, year, month }) {
      if (from && to && (this.from !== from || this.to !== to)) {
        this.from = from
        this.to = to
        this.getMedia()
      } else if (year && month) {
        const date = new Date(year, month - 1)
        this.from = new Date(date.getFullYear(), date.getMonth(), 1).getTime() / 1000
        this.to = new Date(date.getFullYear(), date.getMonth() + 1, 0).getTime() / 1000
        this.getMedia()
      }
    },
    async getDevice () {
      let response
      try {
        // channel_id,created,device_id,meta,mime,modified,name,protected,shared,size,uploaded,url,uuid
        response = await this.$connector.http.get(`gw/devices/${this.deviceId}`)
      } catch (e) {
        if (e.response) {
          response = e.response
        }
        console.error(e)
      }
      if (response.data.result[0] && response.data.result[0].id) {
        this.devices[response.data.result[0].id] = response.data.result[0]
      }
    },
    async getDevices () {
      let response
      try {
        // channel_id,created,device_id,meta,mime,modified,name,protected,shared,size,uploaded,url,uuid
        response = await this.$connector.http.get('gw/devices/all?fields=id,name,cid,configuration,media_size,connected,device_type_id')
      } catch (e) {
        if (e.response) {
          response = e.response
        }
        console.error(e)
      }
      this.deviceList = response.data.result
      this.detectMediaDeviceTypes()
    },
    // Determine which device types support media commands (video/photo/stream/
    // playback/tacho/timeline). A device can be media-capable even with no media
    // files yet, so capability is derived from the type's command set, not media_size.
    async detectMediaDeviceTypes () {
      const ids = [...new Set((this.deviceList || []).map(d => d.device_type_id).filter(Boolean))]
      if (!ids.length) {
        this.mediaDeviceTypes = {}
        return
      }
      let response
      try {
        response = await this.$connector.http.get(`gw/channel-protocols/all/device-types/${ids.join(',')}/?fields=id,commands`)
      } catch (e) {
        response = e.response
      }
      const result = (response && response.data && response.data.result) || []
      const map = {}
      result.forEach(t => {
        const names = (t.commands || []).map(c => c.name)
        map[t.id] = this.cmds.some(name => names.includes(name))
      })
      this.mediaDeviceTypes = map
    },
    subscribePinnedDevices () {
      this.pinnedDevices = {}
      this.$connector.socket.subscribe({
        name: this.topics.pinnedDevices,
        handler: this.processPinnedDevices,
        options: { qos: 1, nl: false, properties: {} }
      }).then((e) => {
        // console.trace(this.topics.pinnedDevices.replace('{device_id}', newid))
      })
    },
    processPinnedDevices (data, topic, packet) {
      try {
        if (data && data.toString()) {
          data = JSON.parse(data)
          this.pinnedDevices = data
        } else {
          this.pinnedDevices = {}
        }
      } catch (e) {
        console.error(e)
      }
    },
    async getMedia () {
      let response
      const from = this.from
      const to = this.to
      this.mediaLoading = true
      try {
        // channel_id,created,device_id,meta,mime,modified,name,protected,shared,size,uploaded,url,uuid
        response = await this.$connector.http.get(`gw/devices/${this.deviceId}/media?data=%7B%22filter%22%3A%22${this.timestamp_type}%3E${from}%26%26${this.timestamp_type}%3C${to}%22%2C%22fields%22%3A%22channel_id%2Ccreated%2Cdevice_id%2Cmeta%2Cmime%2Cmodified%2Cname%2Cprotected%2Cshared%2Csize%2Cuploaded%2Curl%2Cuuid%22%7D`)
      } catch (e) {
        if (e.response) {
          response = e.response
        }
        console.error(e)
      } finally {
        this.mediaLoading = false
      }
      response.data.result.sort((a, b) => a.created - b.created)
      const obj = {}
      let created = 0
      let latestday = ''
      response.data.result.forEach(el => {
        let d = this.formatUnix(el.created)
        d = d.split(' ')
        if (el.created > created) {
          created = el.created
          latestday = d[0]
        }
        const event = {
          date: d[0],
          time: d[1]
        }
        el.__event = event
        if (obj[d[0]]) {
          obj[d[0]].push(el)
        } else {
          obj[d[0]] = [el]
        }
      })
      this.media = obj
      if (latestday) this.setSelectedDate(latestday)
      if (this.realtimeList.length === 0 && response.data.result.length > 0) {
        this.realtimeList = response.data.result.slice(-5).reverse()
      }
    },
    deleteMedia (date, uuid) {
      if (this.media[date]) {
        const del = this.media[date].findIndex((element) => element.uuid === uuid)
        if (del > -1) {
          this.media[date].splice(del, 1)
        }
      }
    },
    setDeviceId (id) {
      const oldid = this.deviceId
      this.deviceId = id
      this.subscribeConnections(this.deviceId, oldid)
      this.subscribeUploads(this.deviceId, oldid)
      this.subscribeCommands(this.deviceId, oldid)
      this.fetchRecentCommands(this.deviceId)
      this.getMedia()
    },
    applyTimelineResponse (cmd) {
      if (!cmd || cmd.name !== 'video_timeline' || !Array.isArray(cmd.response)) return
      this.timeline = {}
      const addToTimeline = (tl, d, el) => {
        if (!tl[d]) tl[d] = []
        tl[d].push(el)
      }
      cmd.response.forEach((el) => {
        const bgn = this.formatUnix(el.begin).split(' ')
        const end = this.formatUnix(el.end).split(' ')
        if (bgn[0] !== end[0]) {
          addToTimeline(this.timeline, bgn[0], el)
          addToTimeline(this.timeline, end[0], el)
        } else {
          addToTimeline(this.timeline, bgn[0], el)
        }
      })
    },
    async fetchRecentCommands (id) {
      if (!id) return
      const to = Math.floor(Date.now() / 1000)
      const from = to - 7 * 24 * 3600
      let response
      try {
        const data = encodeURIComponent(JSON.stringify({ from, to }))
        response = await this.$connector.http.get(`gw/devices/${id}/commands-result?data=${data}`)
      } catch (e) {
        if (e.response) response = e.response
        console.error(e)
        return
      }
      if (id !== this.deviceId) return
      const items = (response.data && response.data.result) || []
      items
        .filter(el => this.cmds.includes(el.name))
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        .slice(0, this.recentCommandsLimit)
        .forEach(el => {
          const action = el.executed ? 'processed' : 'expired'
          this.commands[el.id] = { ...el, action, ...this.commands[el.id] }
        })
    },
    subscribeUploads (newid, oldid) {
      if (oldid) {
        this.$connector.socket.unsubscribe(this.topics.uploads.replace('{device_id}', oldid))
        this.realtimeList = []
        this.media = {}
      }
      if (newid) {
        this.$connector.socket.subscribe({
          name: this.topics.uploads.replace('{device_id}', newid),
          handler: this.processRealtimeUpload,
          options: {
            properties: {
              subscriptionIdentifier: 873487
            }
          }
        }).then(() => {
          // that.loading = false
        })
      }
    },
    subscribeCommands (newid, oldid) {
      if (oldid) {
        this.$connector.socket.unsubscribe(this.topics.commandslog.replace('{device_id}', oldid).replace('{cmds}', this.cmds))
        this.$connector.socket.unsubscribe(this.topics.commandsqueue.replace('{device_id}', oldid))
        this.commands = {}
      }
      if (newid) {
        this.$connector.socket.subscribe({
          name: this.topics.commandslog.replace('{device_id}', newid).replace('{cmds}', this.cmds),
          handler: this.processCommandsLog,
          options: {
            properties: {
              subscriptionIdentifier: 873487
            }
          }
        }).then(() => {
          // that.loading = false
        })
        this.$connector.socket.subscribe({
          name: this.topics.commandsqueue.replace('{device_id}', newid),
          handler: this.processCommandsQueue,
          options: {
            properties: {
              subscriptionIdentifier: 873484
            }
          }
        }).then(() => {
          // that.loading = false
        })
      }
    },
    processCommandsQueue (data, topic, packet) {
      try {
        topic = topic.split('/')
        if (data && data.toString()) {
          data = JSON.parse(data)
          if (data.id && this.cmds.includes(data.name)) {
            if (this.commands[data.id]) {
              data = { ...this.commands[data.id], ...data }
            }
            this.commands[data.id] = data
          }
        } else if (this.commands[topic[6]]) {
          // delete this.commands[topic[6]]
        }
      } catch (e) {
        console.error(e)
      }
    },
    processCommandsLog (data, topic, packet) {
      try {
        if (data) {
          data = JSON.parse(data)
          // console.log(topic, data.toString())
          topic = topic.split('/')
          // const type = topic[1]
          const action = topic[topic.length - 1]
          // request_video
          // take_photo
          // start_videostream
          if (this.commands[data.id]) {
            switch (action) {
              case 'queued':
                this.commands[data.id] = data
                break
              // case 'sent':
              // break
              // case 'processed':
              //   console.log('result', data, JSON.parse(JSON.stringify(this.commands[data.id])))
              //   break
              // case 'canceled':
              // break
              // case 'expire':
              // break
            }
            if (!this.commands[data.id].timestamp || data.timestamp >= this.commands[data.id].timestamp) {
              this.commands[data.id] = { ...this.commands[data.id], ...data, action, timestamp: data.timestamp || this.commands[data.id].timestamp }
            }
            this.applyTimelineResponse(this.commands[data.id])
          }
          // this.commands[]
        }
      } catch (e) {
        console.error(e)
      }
    },
    processRealtimeUpload (data, topic, packet) {
      // console.log({ data: JSON.parse(data), topic })
      topic = topic.split('/')
      let update = false
      if (topic[topic.length - 1] === 'media_file_updated') {
        update = true
      }
      const el = JSON.parse(data)
      let d = this.formatUnix(el.created)
      d = d.split(' ')
      const event = {
        date: d[0],
        time: d[1]
      }
      el.__event = event
      if (this.media[d[0]]) {
        const found = this.media[d[0]].findIndex((element) => element.uuid === el.uuid)
        if (found > -1) {
          this.media[d[0]].splice(found, 1, el)
        } else {
          const bigger = this.media[d[0]].findIndex((element) => element.created > el.created)
          if (bigger > -1) {
            this.media[d[0]].splice(bigger, 0, el)
          } else {
            this.media[d[0]].push(el)
          }
          // if ()
          // this.playing = false
          // current = props.row
          // showmedia = true}
        }
      } else {
        this.media[d[0]] = [el]
      }
      if (!update) {
        if (this.realtimeList.length > 4) {
          this.realtimeList.splice(-1)
        }
        this.realtimeList.unshift(el)
      }
    },
    subscribeConnections (newid, oldid) {
      if (oldid) {
        this.$connector.socket.unsubscribe(this.topics.connections.replace('{device_id}', oldid))
        this.connections = {}
      }
      if (newid) {
        this.$connector.socket.subscribe({
          name: this.topics.connections.replace('{device_id}', newid),
          handler: this.processConnection,
          options: { qos: 1, nl: false, rap: false, rh: 1, properties: {} }
        }).then((e) => {
          // console.trace(this.topics.connections.replace('{device_id}', newid))
        })
      }
    },

    formatUnix (unixtime) {
      return moment.unix(parseFloat(unixtime)).format('YYYY-MM-DD HH:mm:ss')
    },
    processConnection (data, topic, packet) {
      topic = topic.split('/')
      const id = topic[topic.length - 1]
      if (data.length > 0) {
        this.connections[id] = JSON.parse(data)
      } else {
        delete this.connections[id]
      }
    }
  }
})
