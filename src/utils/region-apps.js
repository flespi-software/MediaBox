// Hosts of the other flespi apps: every region advertises them in apps.<name>
// (/auth/regions, applied on boot). Nothing here is hardcoded - a region that
// lists no such app has none to link to.
let apps = {}

export function setRegionApps (regionApps) {
  apps = regionApps || {}
}

// without a trailing slash: callers append their own path
export function appHost (name) {
  const host = apps[name]
  if (!host) {
    console.warn(`Region lists no "${name}" app`)
    return ''
  }
  return host.replace(/\/+$/, '')
}
