// FormBox is normally served from the public flespi host. When the app runs
// locally on port 9005 (e.g. offline / no access to flespi.io), FormBox is
// served from the same origin under /formbox instead.
const FORMBOX_HOST = 'https://formbox.flespi.io/'
const LOCAL_PORT = '9005'

export function formboxUrl () {
  if (typeof window !== 'undefined' && window.location.port === LOCAL_PORT) {
    return `${window.location.origin}/formbox`
  }
  return FORMBOX_HOST
}
