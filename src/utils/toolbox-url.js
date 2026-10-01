import moment from 'moment'
import { appHost } from './region-apps'

/**
 * Toolbox opened on a device, with logs and messages of the day around the
 * given timestamp and that message selected.
 */
export function toolboxDeviceUrl (deviceId, token, timestamp) {
  const start = moment.unix(timestamp).startOf('day').unix(),
    end = moment.unix(timestamp).endOf('day').unix()
  return `${appHost('toolbox')}/#/devices/${deviceId}?token=${token}&fullscreen=1&noselect=all&logs=%7B%22from%22%3A${start},%22to%22%3A${end}.999999,%22scroll%22%3A${timestamp}%7D&messages=%7B%22from%22%3A${start},%22to%22%3A${end}.999999,%22scroll%22%3A${timestamp},"selected"%3A%5B${timestamp}%5D%7D`
}
