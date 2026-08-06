<template>
  <div class="av-root row no-wrap text-white">
    <!-- entry list -->
    <div class="av-list column">
      <div class="av-list-head row items-center q-px-sm q-py-xs no-wrap">
        <q-icon name="mdi-folder-zip" color="orange-4" size="18px" class="q-mr-xs" />
        <div class="ellipsis text-caption" :title="file.name">{{ file.name }}</div>
        <q-space />
        <q-btn dense flat round size="sm" icon="mdi-download" type="a"
          :href="archiveUrl" :download="file.name || 'archive.zip'" target="_blank">
          <q-tooltip>Download archive</q-tooltip>
        </q-btn>
      </div>
      <q-separator dark />

      <div v-if="loading" class="col column flex-center text-grey-5">
        <q-spinner-gears size="32px" />
        <div class="text-caption q-mt-sm">Reading archive…</div>
      </div>
      <div v-else-if="error" class="col column flex-center text-grey-5 q-pa-md text-center">
        <q-icon name="mdi-alert-circle-outline" color="red-4" size="32px" class="q-mb-sm" />
        <div class="text-caption">{{ error }}</div>
      </div>
      <template v-else>
        <div class="av-list-sub text-caption text-grey-6 q-px-sm q-py-xs">
          {{ entries.length }} file{{ entries.length === 1 ? '' : 's' }}
        </div>
        <q-list dark class="col scroll">
          <q-item v-for="e in entries" :key="e.name" clickable dense v-ripple
            :active="e.name === selected" active-class="av-active" @click="selectEntry(e)">
            <q-item-section avatar style="min-width:28px">
              <q-icon :name="e.icon" :style="{ color: e.color }" size="18px" />
            </q-item-section>
            <q-item-section>
              <q-item-label class="ellipsis" :title="e.name">{{ e.label }}</q-item-label>
              <q-item-label caption class="text-grey-6">{{ formatBytes(e.size) }}</q-item-label>
            </q-item-section>
          </q-item>
        </q-list>
      </template>
    </div>

    <q-separator dark vertical />

    <!-- content pane -->
    <div class="av-content col column">
      <div v-if="!selected" class="col column flex-center text-grey-6">
        <q-icon name="mdi-file-search-outline" size="40px" style="opacity:.4" />
        <div class="text-caption q-mt-sm">Select a file to preview</div>
      </div>
      <template v-else>
        <div class="av-content-head row items-center q-px-sm q-py-xs no-wrap">
          <q-icon :name="selectedMeta.icon" :style="{ color: selectedMeta.color }" size="16px" class="q-mr-xs" />
          <div class="ellipsis text-caption" :title="selected">{{ selected }}</div>
          <q-space />
          <q-btn dense flat round size="sm" icon="mdi-download" @click="downloadEntry(selected)">
            <q-tooltip>Download this file</q-tooltip>
          </q-btn>
        </div>
        <q-separator dark />
        <div v-if="contentLoading" class="col column flex-center text-grey-5">
          <q-spinner size="26px" />
        </div>
        <div v-else-if="contentError" class="col column flex-center text-grey-5 q-pa-md text-center">
          <q-icon name="mdi-alert-circle-outline" color="red-4" size="28px" class="q-mb-sm" />
          <div class="text-caption">{{ contentError }}</div>
        </div>
        <div v-else-if="!canPreview" class="col column flex-center text-grey-5 q-pa-md text-center">
          <q-icon :name="selectedMeta.icon" :style="{ color: selectedMeta.color }" size="48px" />
          <div class="text-caption q-mt-md">{{ selectedMeta.label }} — preview not supported</div>
          <q-btn class="q-mt-md" size="sm" outline no-caps color="primary" icon="mdi-download"
            label="Download" @click="downloadEntry(selected)" />
        </div>
        <template v-else>
          <div v-if="truncated" class="av-note text-caption q-px-sm q-py-xs">
            Showing the first {{ formatBytes(previewLimit) }} — file truncated for preview.
          </div>
          <pre class="av-text col scroll q-ma-none q-pa-sm">{{ content }}</pre>
        </template>
      </template>
    </div>
  </div>
</template>

<script>
import { defineComponent } from 'vue'
import { unzipSync, strFromU8 } from 'fflate'
import { mediaFileUrl } from '../../utils/media-url'
import { FILE_KINDS } from '../../utils/file-type'

// text-previewable extensions inside the archive (logs frequently have none)
const TEXT_EXT = ['log', 'txt', 'csv', 'json', 'xml', 'nmea', 'md', 'ini', 'conf',
  'cfg', 'yaml', 'yml', 'gpx', 'kml', 'srt', 'sql']
const PREVIEW_LIMIT = 2 * 1024 * 1024 // cap the decoded text put into the DOM
const MAX_ARCHIVE = 200 * 1024 * 1024 // refuse to load absurdly large archives

function ext (name) {
  const m = /\.([a-z0-9]+)$/i.exec(name || '')
  return m ? m[1].toLowerCase() : ''
}
function baseName (name) {
  return (name || '').replace(/\/$/, '').split('/').pop()
}
function kindOf (name) {
  const e = ext(name)
  if (TEXT_EXT.includes(e)) return 'text'
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(e)) return 'image'
  if (e === 'pdf') return 'pdf'
  if (['zip', 'gz', 'tar', 'rar', '7z'].includes(e)) return 'archive'
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(e)) return 'video'
  if (['mp3', 'wav', 'ogg', 'aac', 'flac'].includes(e)) return 'audio'
  return e ? 'file' : 'log' // extensionless -> assume a readable log
}

export default defineComponent({
  name: 'ArchiveViewer',
  props: {
    file: { type: Object, required: true }
  },
  data () {
    return {
      loading: false,
      error: '',
      entries: [],
      bytes: null, // the raw archive (kept to decompress entries on demand)
      selected: null,
      content: '',
      contentLoading: false,
      contentError: '',
      canPreview: false,
      truncated: false,
      previewLimit: PREVIEW_LIMIT
    }
  },
  computed: {
    archiveUrl () {
      return mediaFileUrl(this.file)
    },
    selectedMeta () {
      return FILE_KINDS[kindOf(this.selected)] || FILE_KINDS.file
    }
  },
  watch: {
    'file.uuid' () {
      this.load()
    }
  },
  mounted () {
    this.load()
  },
  methods: {
    async load () {
      this.reset()
      if (this.file.size && this.file.size > MAX_ARCHIVE) {
        this.error = 'Archive is too large to open in the browser. Please download it.'
        return
      }
      this.loading = true
      try {
        const res = await this.$connector.http.external(this.archiveUrl, { responseType: 'arraybuffer' })
        this.bytes = new Uint8Array(res.data)
        this.entries = this.listEntries(this.bytes)
      } catch (e) {
        this.error = (e && e.message) || 'Failed to read the archive.'
      } finally {
        this.loading = false
      }
    },
    reset () {
      this.error = ''
      this.entries = []
      this.bytes = null
      this.selected = null
      this.content = ''
      this.contentError = ''
      this.canPreview = false
      this.truncated = false
    },
    // parse the central directory only (filter returns false -> no decompression)
    listEntries (bytes) {
      const list = []
      unzipSync(bytes, {
        filter: (f) => {
          if (!f.name.endsWith('/')) {
            const k = kindOf(f.name)
            const meta = FILE_KINDS[k] || FILE_KINDS.file
            list.push({ name: f.name, label: baseName(f.name), size: f.originalSize, icon: meta.icon, color: meta.color })
          }
          return false
        }
      })
      return list.sort((a, b) => a.name.localeCompare(b.name))
    },
    selectEntry (e) {
      this.selected = e.name
      this.content = ''
      this.contentError = ''
      this.truncated = false
      const k = kindOf(e.name)
      this.canPreview = k === 'text' || k === 'log'
      if (!this.canPreview) return
      this.contentLoading = true
      // defer so the spinner paints before the (sync) decompress
      setTimeout(() => {
        try {
          const data = this.extract(e.name)
          if (this.looksBinary(data)) {
            this.canPreview = false
          } else {
            const slice = data.length > PREVIEW_LIMIT ? data.subarray(0, PREVIEW_LIMIT) : data
            this.truncated = data.length > PREVIEW_LIMIT
            this.content = strFromU8(slice)
          }
        } catch (err) {
          this.contentError = (err && err.message) || 'Failed to read this file.'
        } finally {
          this.contentLoading = false
        }
      }, 0)
    },
    // decompress a single entry by name
    extract (name) {
      const out = unzipSync(this.bytes, { filter: (f) => f.name === name })
      return out[name]
    },
    downloadEntry (name) {
      let data
      try {
        data = this.extract(name)
      } catch {
        return
      }
      const url = URL.createObjectURL(new Blob([data]))
      const a = document.createElement('a')
      a.href = url
      a.download = baseName(name)
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    },
    // treat as binary if a NUL byte shows up early (text logs won't have them)
    looksBinary (data) {
      const n = Math.min(data.length, 8000)
      for (let i = 0; i < n; i++) if (data[i] === 0) return true
      return false
    },
    formatBytes (n) {
      if (!n) return '0 B'
      const units = ['B', 'KB', 'MB', 'GB']
      let i = 0
      let v = n
      while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
      return v.toFixed(v >= 10 || i === 0 ? 0 : 1) + ' ' + units[i]
    }
  }
})
</script>

<style lang="sass" scoped>
.av-root
  height: 100%
  width: 100%
  background: #14171c

.av-list
  flex: 0 0 300px
  max-width: 40%
  min-width: 220px
  background: #191d23
.av-list-head
  background: #20262b
.av-list-sub
  border-bottom: 1px solid rgba(255, 255, 255, .06)

.av-active
  background: rgba(38, 198, 218, .15)
  color: #fff

.av-content
  min-width: 0
.av-content-head
  background: #20262b
.av-note
  background: rgba(224, 170, 107, .15)
  color: #e0aa6b
.av-text
  font-family: 'Roboto Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace
  font-size: 12px
  line-height: 1.45
  white-space: pre
  color: #cdd6df
</style>
