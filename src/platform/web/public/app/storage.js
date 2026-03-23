export function read(key, fallback = '') {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

export function write(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {}
}
