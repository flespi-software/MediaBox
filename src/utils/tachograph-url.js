const TACHOBOX_HOST = 'https://tachobox.flespi.io'

// Tachograph file extensions: .ddd (generic), .v1b/.v2b (vehicle unit gen1/2),
// .c1b/.c2b (driver card gen1/2), .tgd, .esm
export const TACHO_EXTENSIONS = ['ddd', 'v1b', 'v2b', 'c1b', 'c2b', 'tgd', 'esm']

export function isTachographFile (file) {
  if (!file) return false
  const name = (file.name || '').toLowerCase()
  return TACHO_EXTENSIONS.some(ext => name.endsWith('.' + ext))
}

export function tachoboxUrl (deviceId, file, token, options) {
  const base = `${TACHOBOX_HOST}/#/device/${deviceId}/file/${file.uuid}`
  const params = []
  if (token) params.push(`token=${encodeURIComponent(token)}`)
  if (options) {
    Object.entries(options).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') return
      params.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    })
  }
  return params.length ? `${base}?${params.join('&')}` : base
}
