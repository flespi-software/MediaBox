// Audio session modes, as the start_audiostream schema declares them.
// Intercom is the schema default and is only supported on channel 1; the other
// channels can be listened to. In broadcast the device plays what it is sent
// and returns no audio of its own.
export const LISTENING = 0
export const INTERCOM = 1
export const BROADCAST = 2

// `color` paints the icon and the badge; amber needs dark text to stay readable
const MODES = {
  [LISTENING]: { label: 'Listening', icon: 'mdi-headphones', color: 'blue-grey-5', textColor: 'white' },
  [INTERCOM]: { label: 'Intercom', icon: 'mdi-account-voice', color: 'teal', textColor: 'white' },
  [BROADCAST]: { label: 'Broadcast', icon: 'mdi-bullhorn', color: 'amber-8', textColor: 'grey-10' }
}

export function audioMode (type) {
  return MODES[type] || MODES[INTERCOM]
}

/**
 * Mode of a running session. The mediastream carries no mode of its own, so
 * read it back from the command that started it - by command_id, or by matching
 * the uuid in its response when the id is missing.
 */
export function audioModeOfStream (ms, commands) {
  const list = Object.values(commands || {})
  const cmd = list.find(c => c.name === 'start_audiostream' && (
    (ms.command_id && c.id === ms.command_id) ||
    (c.response && (Array.isArray(c.response) ? c.response : [c.response]).some(r => r && r.uuid === ms.uuid))
  ))
  const props = (cmd && cmd.properties) || {}
  return {
    type: typeof props.type === 'number' ? props.type : LISTENING,
    channel: props.channel || ms.channel || 1
  }
}
