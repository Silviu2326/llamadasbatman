const KEY = 'umbra-protocol:v1'

export function loadProfile() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || '{}')
    return { bestByMap: value.bestByMap || {}, eggs: value.eggs || {}, audio: value.audio !== false, reducedMotion: Boolean(value.reducedMotion) }
  } catch { return { bestByMap: {}, eggs: {}, audio: true, reducedMotion: false } }
}

export function saveProfile(profile) {
  try { localStorage.setItem(KEY, JSON.stringify(profile)) } catch { /* storage can be unavailable */ }
}
