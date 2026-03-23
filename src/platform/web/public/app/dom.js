export function $(id) {
  return document.getElementById(id)
}

export function cacheElements(el, ids) {
  ids.forEach((id) => {
    el[id] = $(id)
  })
}

export function setLoading(el, active, message = 'Estamos preparando la siguiente pantalla.') {
  if (!el['loading-overlay'] || !el['loading-copy']) return
  el['loading-overlay'].classList.toggle('hidden', !active)
  el['loading-copy'].textContent = message
}

export function setScreen(screenId) {
  document.querySelectorAll('.screen').forEach((screen) => {
    screen.classList.toggle('screen-active', screen.id === screenId)
  })
}

export function fillSelect(select, values, esc) {
  select.innerHTML = values
    .map((value) => `<option value="${esc(value)}">${esc(value[0].toUpperCase() + value.slice(1))}</option>`)
    .join('')
}
