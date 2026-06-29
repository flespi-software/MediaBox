/**
 * Video.js tech for mpegts.js (FLV/MPEG-TS playback).
 * Based on videojs-mpegts by SaifAqqad (Apache-2.0).
 * Adapted for direct ESM import of mpegts.js.
 */
import videojs from 'video.js'
import mpegts from 'mpegts.js'

const Html5 = videojs.getTech('Html5')
const mergeOptions = videojs.obj ? videojs.obj.merge : videojs.mergeOptions || videojs.util.mergeOptions
const defaults = {
  mediaDataSource: {},
  config: {}
}

class Mpegts extends Html5 {
  constructor (options, ready) {
    options = mergeOptions(defaults, options)
    super(options, ready)
  }

  setSrc (src) {
    if (this.mpegtsPlayer) {
      this.mpegtsPlayer.detachMediaElement()
      this.mpegtsPlayer.destroy()
    }

    const mediaDataSource = { ...this.options_.mediaDataSource }
    const config = this.options_.config

    if (mediaDataSource.type === undefined) mediaDataSource.type = 'mpegts'
    mediaDataSource.url = src
    this.mpegtsPlayer = mpegts.createPlayer(mediaDataSource, config)
    this.mpegtsPlayer.attachMediaElement(this.el_)
    this.mpegtsPlayer.load()
    this.srcUrl_ = src
  }

  // Prevent video.js from overriding srcObject set by mpegts.js for ManagedMediaSource
  src (src) {
    if (typeof src !== 'undefined') {
      this.setSrc(src)
    }
    // When mpegts.js uses ManagedMediaSource it sets el.srcObject instead of el.src,
    // so el.src will be empty — return the stored URL to prevent video.js from
    // treating the source as missing
    return this.srcUrl_ || this.el_.src
  }

  // Disable sourceset monitoring — video.js patches el.src setter to track source
  // changes, which can interfere with srcObject used by ManagedMediaSource
  setupSourcesetHandling_ () {}

  dispose () {
    if (this.mpegtsPlayer) {
      this.mpegtsPlayer.detachMediaElement()
      this.mpegtsPlayer.destroy()
    }
    super.dispose()
  }
}

Mpegts.isSupported = function () {
  return mpegts && mpegts.isSupported()
}

Mpegts.formats = {
  'video/flv': 'FLV',
  'video/x-flv': 'FLV',
  'video/mp2t': 'MPEGTS'
}

Mpegts.canPlayType = function (type) {
  if (Mpegts.isSupported() && type in Mpegts.formats) {
    return 'maybe'
  }
  return ''
}

Mpegts.canPlaySource = function (srcObj) {
  return Mpegts.canPlayType(srcObj.type)
}

videojs.registerTech('Mpegts', Mpegts)

export default Mpegts
