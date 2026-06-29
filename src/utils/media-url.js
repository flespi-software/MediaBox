let mediaBase = 'https://media.flespi.io'

export function setMediaBase (base) {
  if (base) mediaBase = base
}

function appendQuery (url, query) {
  if (!query) return url
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}${query}`
}

/**
 * Get URL for a media file by uuid.
 */
export function mediaFileUrl (item, query) {
  return appendQuery(`${mediaBase}/${item.uuid}`, query)
}

/**
 * Get source URL for a stream by uuid.
 */
export function streamSrcUrl (stream, query) {
  return appendQuery(`${mediaBase}/${stream.uuid}`, query)
}

/**
 * Get MIME type for a stream based on mediastream.
 */
export function streamMimeType (stream) {
  if ((stream.mediastream || stream.stream_type) === 'flv') return 'video/x-flv'
  return 'application/x-mpegURL'
}
