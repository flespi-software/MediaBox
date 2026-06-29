/**
 * File type classification for media items.
 *
 * The device may upload not only photos/videos and tachograph (.ddd) files,
 * but also logs, PDFs and other arbitrary file types. This util maps an item
 * to a "kind" with display metadata (icon/color/label), tells whether a
 * server-side jpeg thumbnail exists, and which viewer strategy to use.
 */

import { TACHO_EXTENSIONS } from './tachograph-url'

const KINDS = {
  video: { icon: 'mdi-play-circle', color: '#e07a7a', label: 'Video' },
  image: { icon: 'mdi-image', color: '#6ea8dc', label: 'Image' },
  tacho: { icon: 'mdi-smart-card-reader', color: '#b9a0db', label: 'Tachograph' },
  pdf: { icon: 'mdi-file-pdf-box', color: '#e06666', label: 'PDF' },
  log: { icon: 'mdi-file-document-outline', color: '#9bb0c2', label: 'Log' },
  text: { icon: 'mdi-file-document-outline', color: '#9bb0c2', label: 'Text' },
  archive: { icon: 'mdi-folder-zip', color: '#e0aa6b', label: 'Archive' },
  audio: { icon: 'mdi-music', color: '#6cc191', label: 'Audio' },
  file: { icon: 'mdi-file', color: '#9bb0c2', label: 'File' }
}

function ext (name) {
  const m = /\.([a-z0-9]+)$/i.exec(name || '')
  return m ? m[1].toLowerCase() : ''
}

/**
 * Classify an item into one of the KINDS keys.
 */
export function fileKind (item) {
  if (!item) return 'file'
  const mime = (item.mime || '').toLowerCase()
  const metaType = item.meta && item.meta.type
  const e = ext(item.name)

  if (TACHO_EXTENSIONS.includes(e)) return 'tacho'
  if (metaType === 'video' || mime.startsWith('video/')) return 'video'
  if (metaType === 'image' || mime.startsWith('image/')) return 'image'
  if (mime === 'application/pdf' || e === 'pdf') return 'pdf'
  if (mime.startsWith('audio/')) return 'audio'
  if (e === 'log') return 'log'
  if (mime.startsWith('text/') || ['txt', 'csv', 'json', 'xml', 'nmea'].includes(e)) return 'text'
  if (['zip', 'gz', 'tar', 'rar', '7z'].includes(e) || mime.includes('zip') || mime.includes('compressed')) return 'archive'
  return 'file'
}

/**
 * Display metadata (icon/color/label) for an item's kind.
 */
export function fileKindMeta (item) {
  return KINDS[fileKind(item)] || KINDS.file
}

/**
 * Whether the media server can produce a jpeg preview thumbnail for this item.
 */
export function hasThumbnail (item) {
  const k = fileKind(item)
  return k === 'video' || k === 'image'
}

/**
 * How the in-app viewer should render this item:
 * 'tacho' | 'video' | 'image' | 'pdf' | 'text' | 'download'
 */
export function viewerStrategy (item) {
  const k = fileKind(item)
  if (k === 'tacho' || k === 'video' || k === 'image' || k === 'pdf') return k
  if (k === 'log' || k === 'text') return 'text'
  return 'download'
}

export const FILE_KINDS = KINDS
