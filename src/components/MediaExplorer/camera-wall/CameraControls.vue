<template>
  <div class="cwc row items-center no-wrap q-px-md">
    <q-btn round dense flat color="blue-grey-3" icon="mdi-skip-previous" @click="$emit('prev')">
      <q-tooltip>Previous clip</q-tooltip>
    </q-btn>
    <q-btn round dense unelevated color="teal-6" class="q-mx-xs" :icon="playing ? 'mdi-pause' : 'mdi-play'"
      @click="$emit('toggle-play')">
      <q-tooltip>{{ playing ? 'Pause' : 'Play' }}</q-tooltip>
    </q-btn>
    <q-btn round dense flat color="blue-grey-3" icon="mdi-skip-next" @click="$emit('next')">
      <q-tooltip>Next clip</q-tooltip>
    </q-btn>

    <div class="cwc-time q-ml-md">{{ clock }}</div>

    <q-space />

    <q-btn-toggle :model-value="rate" @update:model-value="v => $emit('set-rate', v)"
      dense unelevated no-caps toggle-color="teal-6" color="blue-grey-9" text-color="blue-grey-3"
      :options="rateOptions" class="q-mr-md" />

    <q-toggle :model-value="skipGaps" @update:model-value="v => $emit('toggle-skip', v)"
      dense size="sm" color="teal" label="Skip gaps" class="text-blue-grey-3" />
  </div>
</template>

<script>
import { defineComponent } from 'vue'
import moment from 'moment'

export default defineComponent({
  name: 'CameraControls',
  props: {
    playing: { type: Boolean, default: false },
    rate: { type: Number, default: 1 },
    skipGaps: { type: Boolean, default: true },
    t: { type: Number, required: true }
  },
  emits: ['toggle-play', 'set-rate', 'toggle-skip'],
  data () {
    return {
      rateOptions: [
        { label: '1x', value: 1 },
        { label: '2x', value: 2 },
        { label: '4x', value: 4 }
      ]
    }
  },
  computed: {
    clock () {
      return moment.unix(this.t).format('HH:mm:ss')
    }
  }
})
</script>

<style lang="sass" scoped>
.cwc
  height: 48px
  flex: 0 0 auto
  background: #14171c
  border-top: 1px solid rgba(255, 255, 255, .08)
.cwc-time
  color: #fff
  font-size: 15px
  font-weight: 600
  font-variant-numeric: tabular-nums
</style>
