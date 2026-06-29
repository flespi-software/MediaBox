<template>
  <div class="q-mx-md">
    <q-resize-observer @resize="onResize" ref="resize" debounce="300" />
    <q-virtual-scroll v-if="!nopreviews" ref="mediaList" :items="intervals" class="q-mb-xs" virtual-scroll-horizontal>
      <template v-slot="{ item, index }">
        <div class="row items-center q-px-xs q-py-md" v-intersection="onIntersection" :data-created="item.created">
          <MediaItem :media="item" :item="device" :highlighted="current && current.uuid === item.uuid"
            @click="itemClick(item, index)" @embed="(uuid) => $emit('embed', uuid)" style="max-height:100px;" />
        </div>
      </template>
    </q-virtual-scroll>

    <template v-if="fromto">

      <div v-for="(intrvl, tl) in timelineIntervals" :key="tl" ref="timeline"
        :style="`margin-bottom:3px;height:16px;width:100%; overflow:hidden;${intrvl.length ? 'border: 1px solid rgba(255,255,255,.10);' : 'border:1px dashed rgba(255,255,255,.18)'}`"
        :class="`rounded-borders relative-position mb-tl-track`" title="Click and hold to request media">
        <template v-if="available && available[tl]">
          <div v-for="(tmln, index) of available[tl]" :key="tmln.begin + (index / 10000)"
            :class="`available-interval absolute bg-green-1 rounded-borders`"
            :style="`width:${((tmln.end - tmln.begin) || 1) / secbyperc}%; top:6px; left:${(tmln.begin - (fromto[0] / 1000)) / secbyperc}%; right:initial;`"
            :title="formatUnix(tmln.begin) + ' - ' + formatUnix(tmln.end)" />
        </template>
        <div class="absolute-full" v-touch-hold.mouse="(e) => touchHold(e, tl)" @click="(e) => timelineClick(e, tl)">
        </div>
        <div v-for="(interval, index) of intrvl" :key="interval.created + (index / 10000)"
          :class="`interval absolute-top absolute-bottom bg-${interval.meta.type === 'video' ? 'red' : interval.meta.type === 'image' ? 'blue' : 'grey'}-4 ${current && current.uuid === interval.uuid ? 'interval-highlighted' : ''}`"
          :style="`width:${(interval.meta.duration || 1) / secbyperc}%; left:${(interval.created - (fromto[0] / 1000)) / secbyperc}%; right:initial;`"
          :title="formatUnix(interval.created) + ' - ' + formatUnix(interval.created + (interval.meta.duration || 1))"
          @click.stop="() => itemClick(interval)" @touchstart.stop @mousedown.stop />
        <div v-if="intrvl.length === 0" :class="`fit text-center text-grey text-bold`" style="font-size:10px">NO DATA
        </div>
      </div>
      <div :style="`height:5px;width:100%;overflow:hidden;`" :class="`relative-position mb-tl-track`"
        title="Click and hold to request media">
        <div v-if="inView.length > 0" class="interval-viewport-upper absolute-top absolute-bottom"
          :style="`width:${(inView[inView.length - 1] - inView[0] || 1) / secbyperc}%; left:${(inView[0] - (fromto[0] / 1000)) / secbyperc}%; right:initial;`">
        </div>
      </div>
      <div class="relative-position text-overline" style="height:20px;line-height:1rem;">
        <div v-for="l in labels" :key="'label' + l" :style="`left: calc(${l}% - 16px);`" class="absolute-bottom">
          {{ formatUnixTime((fromto[0].getTime() / 1000) + (secbyperc * l)) }}
        </div>
      </div>
    </template>
  </div>
</template>

<script lang="js">
// import Vue from 'vue'

import { computed, ref } from 'vue'
import { useAppearanceStore } from '../../../stores/appearance'

import moment from 'moment'
// import { mapState } from 'vuex'
import MediaItem from '../item.vue'

export default {
  name: 'MediaTimeline',
  components: {
    MediaItem
  },
  props: {
    device: null,
    intervals: null,
    timeline: null,
    date: null,
    current: null,
    nopreviews: null
  },
  setup () {
    const appearance = useAppearanceStore()
    const color = computed(() => appearance.color)
    const labels = ref([0, 25, 50, 75, 100])
    const inView = ref([])
    return {
      color,
      labels,
      inView
    }
  },

  data () {
    return {
      size: { height: 50 }
    }
  },
  computed: {
    // ...mapState({
    //   color: state => state.color
    // }),
    secbyperc () {
      return ((this.fromto[1] - this.fromto[0]) / 100 / 1000)
    },
    fromto () {
      const start = new Date(this.date || undefined)
      start.setHours(0, 0, 0, 0)
      const end = new Date(this.date || undefined)
      end.setHours(23, 59, 59, 999)

      return [start, end]
    },
    timelineIntervals () {
      const obj = {}
      this.intervals.forEach((interval) => {
        let tl = null
        if (interval.meta && interval.meta.channel) {
          tl = interval.meta.channel
        } else if (interval.meta && interval.meta.type === 'tacho') {
          tl = 'tacho'
        }
        if (tl !== null) {
          if (!obj[tl]) {
            obj[tl] = []
          }
          obj[tl].push(interval)
        }
      })
      return obj
    },
    available () {
      const obj = {}
      if (this.timeline) {
        this.timeline.forEach((tlel) => {
          if (tlel && tlel.channel) {
            if (!obj[tlel.channel]) {
              obj[tlel.channel] = []
            }
            obj[tlel.channel].push(tlel)
          }
        })
      }
      return obj
    }
  },
  watch: {
    date () {
      this.inView = []
    }
  },
  mounted () {
    // console.log(this.$refs.mediaList)
    this.$refs.resize.trigger()
    if (this.$refs.mediaList) {
      this.$refs.mediaList.$el.addEventListener('wheel', (evt) => {
        evt.preventDefault()
        this.$refs.mediaList.$el.scrollLeft += evt.deltaY + evt.deltaX
      })
      if (this.current) {
        this.scrollToTimestamp(this.current.created)
      }
    }
  },
  beforeUnmount () {
  },
  methods: {
    onResize (size) {
      this.size = size
      this.$emit('resizeTimeline', size)
    },
    touchHold (e, tl) {
      const tlIndex = Object.keys(this.timelineIntervals).indexOf(tl.toString())
      const tlEl = this.$refs.timeline[tlIndex] || this.$refs.timeline[0]
      this.$emit('requestPlayback', { channel: parseInt(tl), timestamp: (this.fromto[0].getTime() / 1000) + Math.floor((e.evt.offsetX / (tlEl.clientWidth / 100)) * this.secbyperc) })
    },
    timelineClick (e, tl) {
      const tlIndex = Object.keys(this.timelineIntervals).indexOf(tl.toString())
      const tlEl = this.$refs.timeline[tlIndex] || this.$refs.timeline[0]
      const time = (this.fromto[0].getTime() / 1000) + Math.floor((e.offsetX / (tlEl.clientWidth / 100)) * this.secbyperc)
      const bigger = this.timelineIntervals[tl].findIndex((element) => element.created > time)
      if (bigger > 0) {
        if ((this.timelineIntervals[tl][bigger].created - time) < (time - this.timelineIntervals[tl][bigger - 1].created)) {
          this.$emit('itemClick', this.timelineIntervals[tl][bigger])
          this.scrollToTimestamp(this.timelineIntervals[tl][bigger].created)
        } else {
          this.$emit('itemClick', this.timelineIntervals[tl][bigger - 1])
          this.scrollToTimestamp(this.timelineIntervals[tl][bigger - 1].created)
        }
      } else if (bigger === 0) {
        this.$emit('itemClick', this.timelineIntervals[tl][bigger])
        this.scrollToTimestamp(this.timelineIntervals[tl][bigger].created)
      } else {
        this.$emit('itemClick', this.timelineIntervals[tl][this.timelineIntervals[tl].length - 1])
        if (this.timelineIntervals[tl][bigger - 1]) {
          this.scrollToTimestamp(this.timelineIntervals[tl][bigger - 1].created)
        }
      }
    },
    itemClick (interval, index) {
      // console.log(index)
      this.scrollToTimestamp(interval.created)
      this.$emit('itemClick', interval)
    },
    scrollToTimestamp (timestamp) {
      if (this.$refs.mediaList) {
        const index = this.intervals.findIndex(el => el.created === timestamp) || 0
        this.$refs.mediaList.scrollTo(index)
      }
    },
    formatUnix (unixtime) {
      return moment.unix(parseFloat(unixtime)).format('YYYY-MM-DD HH:mm:ss')
    },
    formatUnixTime (unixtime) {
      return moment.unix(parseFloat(unixtime)).format('HH:mm')
    },
    formatUnixUTCTZ (unixtime) {
      return moment.unix(parseFloat(unixtime)).utc().format()
    },
    onIntersection (entry) {
      // console.log(entry)
      if (entry.isIntersecting === true) {
        this.add(entry.target.dataset.created)
      } else {
        this.remove(entry.target.dataset.created)
      }
    },
    add (i) {
      this.remove(i)
      this.inView.push(i)
      this.inView.sort(this.sortAtoi)
    },
    remove (i) {
      let index
      while ((index = this.inView.indexOf(i)) > -1) {
        this.inView.splice(index, 1)
        this.inView.sort(this.sortAtoi)
      }
    },
    sortAtoi (a, b) {
      return a - b
    }
  }
}
</script>

<style lang="sass" scoped>
.mb-tl-track
  background: #20262b
.interval-viewport-upper
  height:100%
  border-color: #f00
  border-width: 0px 1px 1px 1px
  border-style: solid
  user-select: none
.interval-viewport
  height:100%
  background: #222
  box-shadow: inset 0px 0px 5px yellow
  user-select: none
.interval-highlighted
  box-shadow: 0px 0px 10px yellow
  background: yellow !important
  z-index:1

.available-interval
  height: 2px
  opacity: .2
  top: 6px
.interval
  cursor: pointer
  min-width: 1px
.interval:hover
  z-index: 9999
</style>
