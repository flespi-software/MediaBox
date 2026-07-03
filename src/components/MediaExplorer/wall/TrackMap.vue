<template>
  <div class="tm-wrap">
    <div ref="map" class="tm-map" />

    <div v-if="loading" class="tm-state column flex-center text-grey-5">
      <q-spinner-gears size="34px" color="teal-4" />
      <div class="text-caption q-mt-sm">Loading track…</div>
    </div>
    <div v-else-if="live && !position" class="tm-state column flex-center text-grey-6">
      <q-spinner-dots size="34px" color="teal-4" />
      <div class="text-caption q-mt-xs">Waiting for position…</div>
    </div>
    <div v-else-if="!live && !track.length" class="tm-state column flex-center text-grey-6">
      <q-icon name="mdi-map-marker-off-outline" size="34px" style="opacity:.5" />
      <div class="text-caption q-mt-xs">No track for this day</div>
    </div>

    <div v-if="current" class="tm-readout row items-center no-wrap">
      <q-icon name="mdi-speedometer" size="14px" class="q-mr-xs" />
      <span>{{ Math.round(current.speed || 0) }} km/h</span>
      <span class="tm-sep">·</span>
      <q-icon name="mdi-navigation" size="14px" class="q-mr-xs"
        :style="`transform: rotate(${current.dir || 0}deg)`" />
      <span>{{ Math.round(current.dir || 0) }}°</span>
      <template v-if="current.alt != null">
        <span class="tm-sep">·</span>
        <span>{{ Math.round(current.alt) }} m</span>
      </template>
    </div>
  </div>
</template>

<script>
import { defineComponent } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// cyan = playhead, green = realtime; rotated to the heading
function arrowSvg (fill, stroke) {
  return '<div class="tm-arrow"><svg viewBox="0 0 32 32" width="30" height="30">' +
    `<path d="M16 1 L21.5 11 L16 8.3 L10.5 11 Z" fill="${fill}" stroke="${stroke}" stroke-width="1"/>` +
    `<circle cx="16" cy="16" r="6.5" fill="${fill}" stroke="${stroke}" stroke-width="2"/>` +
    '<circle cx="16" cy="16" r="2" fill="#0b2b30"/></svg></div>'
}
const ARROW = arrowSvg('#26c6da', '#08343b')
const LIVE_ARROW = arrowSvg('#2ecc71', '#0b3d24')

export default defineComponent({
  name: 'TrackMap',
  props: {
    // live mode: single realtime marker from `position`, no track/seek
    live: { type: Boolean, default: false },
    // realtime position { lat, lng, speed, dir, alt }
    position: { type: Object, default: null },
    // playhead time (unix s), track mode
    t: { type: Number, default: null },
    // [{ t, lat, lng, speed, dir, alt }] sorted by t
    track: { type: Array, default: () => [] },
    loading: { type: Boolean, default: false },
    playing: { type: Boolean, default: false },
    // current playback time window (matches the timeline zoom); the map fits the
    // track segment within it
    rangeFrom: { type: Number, default: null },
    rangeTo: { type: Number, default: null },
    // [{ from, to }] time ranges that have video - highlighted + clickable to play
    coverage: { type: Array, default: () => [] }
  },
  emits: ['seek', 'seek-play'],
  data () {
    return { current: null, follow: true }
  },
  watch: {
    track () { if (!this.live) this.drawTrack() },
    coverage () { if (!this.live) this.drawTrack() },
    t () { if (!this.live) this.updateMarker() },
    playing (on) { if (!this.live && on) this.onPlayStart() },
    rangeFrom () { if (!this.live) this.fitRange() },
    rangeTo () { if (!this.live) this.fitRange() },
    // realtime position drives the green marker in both modes
    position () { this.updateLiveMarker() }
  },
  mounted () {
    // base layers with a switcher: dark (default) / light Carto + satellite
    const carto = '&copy; OpenStreetMap &copy; CARTO'
    const baseLayers = {
      Dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        { maxZoom: 20, subdomains: 'abcd', attribution: carto }),
      Light: L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
        { maxZoom: 20, subdomains: 'abcd', attribution: carto }),
      Satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 19, attribution: 'Tiles &copy; Esri' })
    }
    // Leaflet objects are kept as plain (non-reactive) instance props.
    // SVG renderer (default): canvas renderer throws on redraw during teardown/resize.
    this.map = L.map(this.$refs.map, { layers: [baseLayers.Dark] })
    L.control.layers(baseLayers, null, { position: 'topright' }).addTo(this.map)
    this.map.setView([0, 0], 2)
    this.map.on('click', this.onMapClick)
    // a manual pan hands control back to the user (stop auto-following)
    this.map.on('dragstart', () => { this.follow = false })
    this.$nextTick(() => this.map.invalidateSize())
    if (this.live) {
      this.updateLiveMarker()
    } else {
      this.drawTrack()
      this.updateLiveMarker() // "now" marker if today
    }
  },
  beforeUnmount () {
    if (this.map) {
      this.map.remove()
      this.map = null
    }
  },
  methods: {
    drawTrack () {
      if (!this.map) return
      if (this.line) { this.line.remove(); this.line = null }
      ;(this.hlLines || []).forEach((l) => l.remove())
      this.hlLines = []
      this.map.invalidateSize()
      if (!this.track.length) return
      const latlngs = this.track.map((p) => [p.lat, p.lng])
      // base track: dim, so the video stretches stand out
      this.line = L.polyline(latlngs, { color: '#5b7d84', weight: 3, opacity: 0.75 }).addTo(this.map)
      // highlight the stretches that have video in the same red as the timeline
      // video bars (Quasar red-4); clicking one seeks there and plays
      this.coverage.forEach((iv) => {
        const pts = this.track.filter((p) => p.t >= iv.from && p.t <= iv.to).map((p) => [p.lat, p.lng])
        if (pts.length < 2) return
        const hl = L.polyline(pts, { color: '#ef5350', weight: 6, opacity: 0.95 }).addTo(this.map)
        hl.on('click', (e) => { L.DomEvent.stop(e); this.$emit('seek-play', this.nearestTime(e.latlng)) })
        hl.on('mouseover', () => hl.setStyle({ weight: 9 }))
        hl.on('mouseout', () => hl.setStyle({ weight: 6 }))
        this.hlLines.push(hl)
      })
      this.ensureMarker(latlngs[0])
      this.fitRange()
      this.updateMarker()
    },
    // cyan playhead marker
    ensureMarker (latlng) {
      if (this.marker || !this.map) return
      this.marker = L.marker(latlng, {
        icon: L.divIcon({ className: 'tm-marker', html: ARROW, iconSize: [30, 30], iconAnchor: [15, 15] }),
        interactive: false,
        zIndexOffset: 1000
      }).addTo(this.map)
    },
    // green realtime marker
    ensureLiveMarker (latlng) {
      if (this.liveMarker || !this.map) return
      this.liveMarker = L.marker(latlng, {
        icon: L.divIcon({ className: 'tm-marker', html: LIVE_ARROW, iconSize: [30, 30], iconAnchor: [15, 15] }),
        interactive: false,
        zIndexOffset: 1200
      }).addTo(this.map)
    },
    // green marker -> latest position; live mode also drives readout + centering
    updateLiveMarker () {
      const p = this.position
      if (!p || p.lat == null || p.lng == null || !this.map) return
      const latlng = [p.lat, p.lng]
      this.ensureLiveMarker(latlng)
      this.liveMarker.setLatLng(latlng)
      const el = this.liveMarker.getElement()
      if (el) {
        const a = el.querySelector('.tm-arrow')
        if (a) a.style.transform = `rotate(${p.dir || 0}deg)`
      }
      if (this.live) {
        this.current = p
        if (!this._hadFix) {
          this._hadFix = true
          this.map.setView(latlng, 15, { animate: true })
        } else if (!this.map.getBounds().contains(latlng)) {
          // marker left the view -> recenter and resume following
          this.follow = true
          this.map.panTo(latlng, { animate: true, duration: 0.5 })
        } else if (this.follow) {
          const inner = this.map.getBounds().pad(-0.25)
          if (!inner.contains(latlng)) this.map.panTo(latlng, { animate: true, duration: 0.5 })
        }
      }
    },
    // fit the map to the track portion within the current time window (the
    // timeline zoom range); falls back to the whole track
    fitRange () {
      if (!this.map || !this.track.length) return
      let pts = null
      if (this.rangeFrom != null && this.rangeTo != null) {
        pts = this.track
          .filter((p) => p.t >= this.rangeFrom && p.t <= this.rangeTo)
          .map((p) => [p.lat, p.lng])
      }
      if (!pts || !pts.length) pts = this.track.map((p) => [p.lat, p.lng])
      this.map.fitBounds(L.latLngBounds(pts), { padding: [24, 24], maxZoom: 17 })
    },
    // interpolate position between the two track points surrounding time t
    pointAt (t) {
      const tr = this.track
      if (!tr.length) return null
      if (t <= tr[0].t) return { ...tr[0] }
      if (t >= tr[tr.length - 1].t) return { ...tr[tr.length - 1] }
      let lo = 0
      let hi = tr.length - 1
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1
        if (tr[mid].t <= t) lo = mid
        else hi = mid
      }
      const a = tr[lo]
      const b = tr[hi]
      const f = (b.t - a.t) ? (t - a.t) / (b.t - a.t) : 0
      return {
        lat: a.lat + (b.lat - a.lat) * f,
        lng: a.lng + (b.lng - a.lng) * f,
        speed: a.speed,
        dir: a.dir,
        alt: a.alt
      }
    },
    updateMarker () {
      const p = this.pointAt(this.t)
      this.current = p
      if (!p || !this.marker) return
      const latlng = [p.lat, p.lng]
      this.marker.setLatLng(latlng)
      const el = this.marker.getElement()
      if (el) {
        const arrow = el.querySelector('.tm-arrow')
        if (arrow) arrow.style.transform = `rotate(${p.dir || 0}deg)`
      }
      // keep the moving marker on-screen while playing: pan once it nears an edge
      if (this.playing && this.follow) {
        const inner = this.map.getBounds().pad(-0.25)
        if (!inner.contains(latlng)) this.map.panTo(latlng, { animate: true, duration: 0.5 })
      }
    },
    // on play start: zoom in to street level so roads are visible, follow the marker
    onPlayStart () {
      this.follow = true
      const p = this.pointAt(this.t)
      if (!p || !this.map) return
      const zoom = Math.max(this.map.getZoom(), 16)
      this.map.setView([p.lat, p.lng], zoom, { animate: true })
    },
    // time of the track point nearest (geographically) to a clicked location
    nearestTime (latlng) {
      let best = null
      let bestD = Infinity
      this.track.forEach((p) => {
        const d = this.map.distance(latlng, [p.lat, p.lng])
        if (d < bestD) { bestD = d; best = p }
      })
      return best ? best.t : this.t
    },
    onMapClick (e) {
      // click on empty map -> just seek to the nearest track point
      if (this.track.length) this.$emit('seek', this.nearestTime(e.latlng))
    }
  }
})
</script>

<style lang="sass">
// not scoped: leaflet-created elements (tiles, marker) carry no scope attribute
.tm-wrap
  position: relative
  height: 100%
  width: 100%
  background: #0f1216
.tm-map
  position: absolute
  inset: 0
.tm-state
  position: absolute
  inset: 0
  background: #0f1216
  z-index: 500
  pointer-events: none
.tm-readout
  position: absolute
  left: 8px
  bottom: 8px
  z-index: 500
  background: rgba(15, 18, 22, .82)
  color: #cfd8e0
  padding: 4px 9px
  border-radius: 6px
  font-size: 12px
  font-variant-numeric: tabular-nums
  .tm-sep
    margin: 0 7px
    color: #5b6b78
.tm-marker
  background: transparent
  border: none
.tm-arrow
  transition: transform .12s linear
  transform-origin: 50% 50%
  filter: drop-shadow(0 0 3px rgba(0, 0, 0, .6))

// --- app-styled leaflet controls (dark theme, scoped to this map) ---
.tm-wrap
  .leaflet-control-zoom
    border: none
    box-shadow: 0 1px 5px rgba(0, 0, 0, .5)
  .leaflet-control-zoom a
    background: #1b2026
    color: #cfd8e0
    border: none
    border-bottom: 1px solid rgba(255, 255, 255, .07)
    width: 30px
    height: 30px
    line-height: 30px
    &:hover
      background: #262d35
      color: #fff
    &.leaflet-disabled
      background: #14171c
      color: #4a555e
  .leaflet-control-zoom a:first-child
    border-radius: 8px 8px 0 0
  .leaflet-control-zoom a:last-child
    border-radius: 0 0 8px 8px
    border-bottom: none
  .leaflet-control-layers
    background: #1b2026
    color: #cfd8e0
    border: 1px solid rgba(255, 255, 255, .1)
    border-radius: 8px
    box-shadow: 0 2px 8px rgba(0, 0, 0, .5)
  .leaflet-control-layers-toggle
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23cfd8e0' d='M12,16L19.36,10.27L21,9L12,2L3,9L4.63,10.27M12,18.54L4.62,12.81L3,14.07L12,21.07L21,14.07L19.37,12.8L12,18.54Z'/%3E%3C/svg%3E")
    background-size: 22px 22px
    background-position: center
    background-repeat: no-repeat
    filter: none
  .leaflet-control-layers-expanded
    padding: 8px 12px 8px 9px
  .leaflet-control-layers-list
    color: #cfd8e0
  .leaflet-control-layers label
    margin: 3px 0
    font-size: 12px
    display: flex
    align-items: center
    cursor: pointer
  .leaflet-control-layers-selector
    accent-color: #26c6da
    margin: 0 7px 0 0
  .leaflet-control-layers-separator
    border-top-color: rgba(255, 255, 255, .1)
  .leaflet-control-attribution
    background: rgba(15, 18, 22, .72)
    color: #7a8894
    box-shadow: none
    a
      color: #9fb0bc
  .leaflet-bar a
    border-bottom-color: rgba(255, 255, 255, .07)
</style>
