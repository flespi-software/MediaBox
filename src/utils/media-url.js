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

// mime reported by the gateway for a webrtc stream (preview=json / embed page)
export const WEBRTC_MIME = 'application/webrtc'

/**
 * Stream flavor as reported by the gateway: hls (default), flv or webrtc.
 */
export function streamKind (stream) {
  if (!stream) return 'hls'
  if (stream.mime === WEBRTC_MIME) return 'webrtc'
  return stream.mediastream || stream.stream_type || 'hls'
}

export function isWebrtcStream (stream) {
  return streamKind(stream) === 'webrtc'
}

/**
 * Get source URL for a stream by uuid. The gateway hands the URL over in the
 * mediastream object; fall back to composing it from the uuid.
 */
export function streamSrcUrl (stream, query) {
  const explicit = stream && (stream.url || stream.src)
  if (explicit) return appendQuery(explicit, query)
  return appendQuery(`${mediaBase}/${stream.uuid}`, query)
}

/**
 * An audio-only session (start_audiostream) carries no video parameters.
 * Callers that know the originating command should trust that instead.
 */
export function isAudioStream (stream) {
  return !!stream && !stream.width && !stream.height && !stream.video_codec
}

/**
 * Get MIME type for a stream based on mediastream.
 */
export function streamMimeType (stream) {
  const kind = streamKind(stream)
  if (kind === 'flv') return 'video/x-flv'
  if (kind === 'webrtc') return WEBRTC_MIME
  return 'application/x-mpegURL'
}
