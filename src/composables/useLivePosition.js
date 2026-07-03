import { ref, onBeforeUnmount, getCurrentInstance } from 'vue'

const KEYMAP = {
  'position.latitude': 'lat',
  'position.longitude': 'lng',
  'position.speed': 'speed',
  'position.direction': 'dir',
  'position.altitude': 'alt'
}

// realtime device position over MQTT while mounted -> ref { lat,lng,speed,dir,alt } | null
export function useLivePosition (deviceId, enabled = true) {
  const position = ref(null)
  const inst = getCurrentInstance()
  const connector = inst && inst.appContext.config.globalProperties.$connector
  const socket = connector && connector.socket
  let topic = null

  function handler (data, tpc) {
    let val
    try {
      val = data && data.length ? JSON.parse(data) : null
    } catch (e) {
      return
    }
    if (val == null) return
    const leaf = String(tpc).split('/').pop()
    const cur = { ...(position.value || {}) }
    // ignore non-position telemetry (the + wildcard delivers everything)
    if (leaf === 'position' && typeof val === 'object') {
      if (val.latitude != null) cur.lat = val.latitude
      if (val.longitude != null) cur.lng = val.longitude
      if (val.speed != null) cur.speed = val.speed
      if (val.direction != null) cur.dir = val.direction
      if (val.altitude != null) cur.alt = val.altitude
    } else if (KEYMAP[leaf]) {
      cur[KEYMAP[leaf]] = val
    } else {
      return
    }
    // 0,0 is the "no GPS fix" sentinel - ignore it
    if (cur.lat != null && cur.lng != null && !(cur.lat === 0 && cur.lng === 0)) {
      position.value = cur
    }
  }

  if (enabled && deviceId != null && socket) {
    // wildcard matches both nested `position` and flattened `position.*` keys
    topic = `flespi/state/gw/devices/${deviceId}/telemetry/+`
    socket.subscribe({ name: topic, handler, options: { qos: 1, nl: false, rap: false, rh: 1, properties: {} } })
  }

  onBeforeUnmount(() => {
    if (topic) socket.unsubscribe(topic)
  })

  return position
}
