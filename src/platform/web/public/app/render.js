import { state, el } from './state.js'
import { esc, renderPlayerSheet } from './utils.js'
import { setScreen } from './dom.js'

let voteHandler = null

export function setVoteHandler(handler) {
  voteHandler = handler
}

export function syncScreenWithRoom() {
  if (!state.room) {
    setScreen('screen-home')
    return
  }

  if (state.room.phase === 'setup') {
    setScreen('screen-character')
    return
  }

  setScreen('screen-room')
}

function renderCharacterScreen() {
  const room = state.room
  el['topbar-room-pill'].textContent = state.roomId
    ? `Room ${state.roomId.slice(0, 8)}`
    : 'Sin room activa'
  el['character-room-title'].textContent = room?.title || `Room ${state.roomId || ''}` || 'Nueva room'
  el['character-room-copy'].textContent = room
    ? `Faltan ${Math.max((room.numPlayers || 0) - (room.players?.length || 0), 0)} personaje(s) para empezar.`
    : 'Crea tu personaje. La aventura no empezara hasta que el grupo este completo.'
  el['character-player-count'].textContent = room
    ? `${room.players.length}/${room.numPlayers} personajes`
    : '0/0 personajes'

  const players = room?.players || []
  el['character-player-list'].innerHTML = players.length
    ? players.map(renderPlayerSheet).join('')
    : '<article class="notice-card">Todavia no hay personajes registrados en esta room.</article>'

  el['character-status-box'].innerHTML = room
    ? `Codigo de room: <strong>${esc(state.roomId)}</strong>`
    : 'Todavia no hay una room creada.'
}

function renderVote() {
  const vote = state.activeVote
  if (!vote?.options?.length) {
    el['vote-card'].classList.add('hidden')
    el['vote-question'].textContent = ''
    el['vote-options'].innerHTML = ''
    return
  }

  el['vote-card'].classList.remove('hidden')
  el['vote-question'].textContent = vote.question
  el['vote-options'].innerHTML = vote.options
    .map((option, index) => `<button class="ghost-button vote-option" type="button" data-option-index="${index}">${esc(option)}</button>`)
    .join('')

  document.querySelectorAll('[data-option-index]').forEach((button) => {
    button.addEventListener('click', () => {
      if (voteHandler) {
        voteHandler(Number(button.dataset.optionIndex))
      }
    })
  })
}

function renderFooter() {
  el['footer-donation-copy'].textContent = state.donations.message
    || 'Las opciones de donacion apareceran aqui si estan configuradas.'

  el['footer-donation-links'].innerHTML = state.donations.providers.length
    ? state.donations.providers.map((provider) => `
      <a class="footer-link" href="${esc(provider.url)}" target="_blank" rel="noreferrer">${esc(provider.label)}</a>
    `).join('')
    : '<span class="footer-link footer-link-muted">Sin enlaces de donacion activos</span>'
}

function renderRoomScreen() {
  const room = state.room
  el['room-title'].textContent = room?.title || `Room ${state.roomId}` || 'Room activa'
  el['room-phase-badge'].textContent = room?.phase || 'Sin fase'
  el['room-subtitle'].textContent = room?.worldContext?.hook?.summary || 'Retoma la aventura desde la escena actual.'
  el['last-narration'].textContent = room?.ui?.lastNarration || 'Todavia no hay una escena visible.'
  el['topbar-room-pill'].textContent = state.roomId
    ? `Room ${state.roomId.slice(0, 8)}`
    : 'Sin room activa'

  const actions = room?.ui?.currentActions || []
  el['suggested-actions'].innerHTML = actions.length
    ? actions.map((action) => `<button class="ghost-button suggested-action" type="button">${esc(action)}</button>`).join('')
    : '<article class="notice-card">Cuando la escena proponga opciones concretas, apareceran aqui.</article>'

  document.querySelectorAll('.suggested-action').forEach((button) => {
    button.addEventListener('click', () => {
      el['action-input'].value = button.textContent
    })
  })

  const players = room?.players || []
  el['room-player-list'].innerHTML = players.length
    ? players.map(renderPlayerSheet).join('')
    : '<article class="notice-card">No hay personajes cargados todavia.</article>'

  const worldContext = room?.worldContext
  el['world-summary'].innerHTML = worldContext
    ? `
      <article class="world-card">
        <div class="world-title">${esc(worldContext.town?.name || 'Lugar sin nombre')}</div>
        <div class="world-meta">${esc(worldContext.town?.type || 'Asentamiento')}</div>
        <div class="world-meta">${esc(worldContext.town?.authority || worldContext.town?.powerStructure || 'Sin autoridad destacada')}</div>
        <div class="world-meta">${esc(worldContext.hook?.summary || 'Sin gancho visible')}</div>
        ${worldContext.npc?.name ? `<div class="world-meta">Contacto: ${esc(worldContext.npc.name)}${worldContext.npc.role ? `, ${esc(worldContext.npc.role)}` : ''}</div>` : ''}
        ${worldContext.encounter?.summary ? `<div class="world-meta">Tension: ${esc(worldContext.encounter.summary)}</div>` : ''}
      </article>
    `
    : '<article class="notice-card">El contexto del mundo aparecera cuando la aventura este preparada.</article>'

  const memory = room?.worldMemory || []
  el['memory-list'].innerHTML = memory.length
    ? memory.slice(0, 8).map((entry) => `
      <article class="memory-card">
        <div class="memory-title">${esc(entry.title || entry.type || 'Entrada')}</div>
        <div class="memory-meta">${esc(entry.description || 'Sin descripcion')}</div>
      </article>
    `).join('')
    : '<article class="notice-card">La memoria de la aventura todavia esta vacia.</article>'

  el['chronicle-list'].innerHTML = state.chronicle.length
    ? state.chronicle.map((entry, index) => `
      <article class="timeline-item">
        <div class="memory-title">Entrada ${index + 1}</div>
        <div class="timeline-meta">${esc(entry.entry || '')}</div>
      </article>
    `).join('')
    : '<article class="notice-card">La cronica aparecera aqui cuando la partida avance.</article>'

  renderVote()
}

export function render() {
  renderFooter()
  renderCharacterScreen()
  renderRoomScreen()
}
