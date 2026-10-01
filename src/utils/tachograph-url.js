import { appHost } from './region-apps'

// Tachograph file extensions: .ddd (generic), .v1b/.v2b (vehicle unit gen1/2),
// .c1b/.c2b (driver card gen1/2), .tgd, .esm
export const TACHO_EXTENSIONS = ['ddd', 'v1b', 'v2b', 'c1b', 'c2b', 'tgd', 'esm']

export function isTachographFile (file) {
  if (!file) return false
  const name = (file.name || '').toLowerCase()
  return TACHO_EXTENSIONS.some(ext => name.endsWith('.' + ext))
}

// files: one file or several of the same device; TachoBox merges them
export function tachoboxUrl (deviceId, files, token, options) {
  const uuids = [].concat(files).map(f => f.uuid).join(',')
  const params = new URLSearchParams()
  if (token) params.set('token', token)
  if (options) {
    Object.entries(options).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') return
      params.set(k, v)
    })
  }
  const query = params.toString()
  const base = `${appHost('tachobox')}/#/device/${deviceId}/file/${uuids}`
  return query ? `${base}?${query}` : base
}
