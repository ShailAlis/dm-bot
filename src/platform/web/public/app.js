(() => {
  const STORAGE_KEYS = {
    actorId: 'dmweb.actorId',
    roomId: 'dmweb.roomId',
    actorName: 'dmweb.actorName',
  }

  const state = {
    actorId: '',
    actorName: '',
    roomId: '',
    room: null,
    activeVote: null,
    chronicle: [],
    revision: 0,
    pollTimer: null,
    setupOptions: {
      races: [],
      classes: [],
    },
  }

  const PROFICIENCY_BONUS = [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6]
  const XP_TABLE = [
    0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
    85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000,
  ]

  const el = {}

  function $(id) {
    return document.getElementById(id)
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[char]))
  }

  function statModifier(value) {
    if (typeof value !== 'number') return '-'
    const modifier = Math.floor((value - 10) / 2)
    return `${value} (${modifier >= 0 ? '+' : ''}${modifier})`
  }

  function makeProgressBar(current, total, size = 10) {
    if (!total || total <= 0) return `[${'#'.repeat(size)}]`
    const safeCurrent = Math.max(0, Math.min(current, total))
    const filled = Math.round((safeCurrent / total) * size)
    return `[${'#'.repeat(filled)}${'-'.repeat(size - filled)}]`
  }

  function xpForNextLevel(level) {
    if (!level || level >= 20) return null
    return XP_TABLE[level]
  }

  function renderPlayerSheet(player) {
    const level = player.level || 1
    const proficiency = PROFICIENCY_BONUS[level - 1] || 2
    const nextXp = xpForNextLevel(level)
    const stats = player.stats || {}
    const inventory = Array.isArray(player.inventory) && player.inventory.length
      ? player.inventory.slice(0, 4).join(', ')
      : 'Sin equipo destacado'

    const lines = [
      player.name,
      `${player.race} ${player.class} - Nivel ${level}`,
      `HP: ${player.hp}/${player.maxHp} ${makeProgressBar(player.hp, player.maxHp)}`,
      `CA: ${player.ac} - Competencia: +${proficiency}`,
      `FUE ${statModifier(stats.str)} - DES ${statModifier(stats.dex)} - CON ${statModifier(stats.con)}`,
      `INT ${statModifier(stats.int)} - SAB ${statModifier(stats.wis)} - CAR ${statModifier(stats.cha)}`,
      nextXp ? `XP: ${player.xp || 0}/${nextXp}` : `XP: ${player.xp || 0} (maximo)`,
      `Equipo: ${inventory}`,
      `Rasgo: ${player.trait || 'Sin rasgo destacado'}`,
    ]

    return `
      <article class="player-card player-sheet">
        <pre class="player-sheet-text">${esc(lines.join('\n'))}</pre>
      </article>
    `
  }

  function read(key, fallback = '') {
    try {
      return localStorage.getItem(key) ?? fallback
    } catch {
      return fallback
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, value)
    } catch {}
  }

  function generateActorId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID()
    return `actor-${Date.now()}-${Math.random().toString(36).slice(2)}`
  }

  async function request(path, options = {}) {
    const response = await fetch(path, {
      method: options.method || 'GET',
      headers: options.body ? { 'Content-Type': 'application/json' } : {},
      body: options.body ? JSON.stringify(options.body) : undefined,
    })

    const text = await response.text()
    let payload = {}
    if (text) {
      try {
        payload = JSON.parse(text)
      } catch {
        payload = { raw: text }
      }
    }

    if (!response.ok) {
      throw new Error(payload.error || payload.message || `HTTP ${response.status}`)
    }

    return payload
  }

  function setLoading(active, message = 'Estamos preparando la siguiente pantalla.') {
    if (!el['loading-overlay'] || !el['loading-copy']) return
    el['loading-overlay'].classList.toggle('hidden', !active)
    el['loading-copy'].textContent = message
  }

  function setScreen(screenId) {
    document.querySelectorAll('.screen').forEach((screen) => {
      screen.classList.toggle('screen-active', screen.id === screenId)
    })
  }

  function fillSelect(select, values) {
    select.innerHTML = values
      .map((value) => `<option value="${esc(value)}">${esc(value[0].toUpperCase() + value.slice(1))}</option>`)
      .join('')
  }

  async function loadSetupOptions() {
    const payload = await request('/api/setup/options')
    state.setupOptions = payload
    fillSelect(el['char-race'], payload.races || [])
    fillSelect(el['char-class'], payload.classes || [])
  }

  function setRoomId(roomId) {
    state.roomId = String(roomId || '').trim()
    write(STORAGE_KEYS.roomId, state.roomId)
  }

  async function loadChronicle() {
    if (!state.roomId) {
      state.chronicle = []
      return
    }

    const payload = await request(`/api/rooms/${encodeURIComponent(state.roomId)}/chronicle`)
    state.chronicle = payload.entries || []
  }

  async function applySnapshot(snapshot) {
    state.room = {
      ...snapshot.game,
      ui: snapshot.ui || {},
    }
    state.activeVote = snapshot.activeVote || null
    state.revision = snapshot.revision || 0
    setRoomId(snapshot.roomId)
    await loadChronicle()
    render()
    syncScreenWithRoom()
  }

  function syncScreenWithRoom() {
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

  function renderRoomScreen() {
    const room = state.room
    el['room-title'].textContent = room?.title || `Room ${state.roomId}` || 'Room activa'
    el['room-phase-badge'].textContent = room?.phase || 'Sin fase'
    el['room-subtitle'].textContent = room?.worldContext?.hook?.summary || 'Retoma la aventura desde la escena actual.'
    el['last-narration'].textContent = room?.ui?.lastNarration || 'Todavia no hay una escena visible.'

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
          <div class="world-meta">${esc(worldContext.hook?.summary || 'Sin gancho visible')}</div>
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
      button.addEventListener('click', () => castVote(Number(button.dataset.optionIndex)))
    })
  }

  function render() {
    renderCharacterScreen()
    renderRoomScreen()
  }

  async function createRoom(event) {
    event.preventDefault()
    setLoading(true, 'Creando la room y preparando la mesa.')
    try {
      const payload = await request('/api/rooms', {
        method: 'POST',
        body: {
          title: el['room-title-input'].value.trim(),
          numPlayers: Number.parseInt(el['room-players-input'].value, 10) || 1,
        },
      })

      await applySnapshot(payload)
    } finally {
      setLoading(false)
    }
  }

  async function openRoom(event) {
    event.preventDefault()
    const roomId = el['room-id-input'].value.trim()
    if (!roomId) return

    setLoading(true, 'Recuperando la room y su estado actual.')
    try {
      const payload = await request(`/api/rooms/${encodeURIComponent(roomId)}/state`)
      await applySnapshot(payload)
    } finally {
      setLoading(false)
    }
  }

  async function saveCharacter(event) {
    event.preventDefault()
    if (!state.roomId) return

    const characterName = el['char-name'].value.trim()
    state.actorName = characterName || state.actorName || 'Jugador web'
    write(STORAGE_KEYS.actorName, state.actorName)

    setLoading(true, 'Guardando tu personaje en la room.')
    try {
      const payload = await request(`/api/rooms/${encodeURIComponent(state.roomId)}/players`, {
        method: 'POST',
        body: {
          actorId: state.actorId,
          actorName: state.actorName,
          character: {
            name: characterName,
            race: el['char-race'].value,
            class: el['char-class'].value,
            background: el['char-background'].value.trim(),
            trait: el['char-trait'].value.trim(),
            motivation: el['char-motivation'].value.trim(),
          },
        },
      })

      await applySnapshot(payload)
    } finally {
      setLoading(false)
    }
  }

  async function refreshRoom() {
    if (!state.roomId) return
    setLoading(true, 'Actualizando la escena actual.')
    try {
      const payload = await request(`/api/rooms/${encodeURIComponent(state.roomId)}/state`)
      await applySnapshot(payload)
    } finally {
      setLoading(false)
    }
  }

  async function sendAction(event) {
    event.preventDefault()
    if (!state.roomId) return

    const text = el['action-input'].value.trim()
    if (!text) return

    setLoading(true, 'Enviando tu accion al director de juego.')
    try {
      const payload = await request(`/api/rooms/${encodeURIComponent(state.roomId)}/actions`, {
        method: 'POST',
        body: {
          actorId: state.actorId,
          actorName: state.actorName || 'Jugador web',
          text,
        },
      })

      el['action-input'].value = ''
      await applySnapshot(payload)
    } finally {
      setLoading(false)
    }
  }

  async function continueScene(kind) {
    if (!state.roomId) return
    const endpoint = kind === 'follow-up' ? 'follow-up' : 'continue'
    const message = kind === 'follow-up'
      ? 'Pidiendo al director de juego que retome la escena.'
      : 'Pidiendo al director de juego que continue la escena.'
    setLoading(true, message)
    try {
      const payload = await request(`/api/rooms/${encodeURIComponent(state.roomId)}/${endpoint}`, {
        method: 'POST',
        body: {
          actorId: state.actorId,
        },
      })
      await applySnapshot(payload)
    } finally {
      setLoading(false)
    }
  }

  async function castVote(optionIndex) {
    if (!state.roomId) return
    setLoading(true, 'Registrando tu voto en la decision grupal.')
    try {
      const payload = await request(`/api/rooms/${encodeURIComponent(state.roomId)}/votes/current/cast`, {
        method: 'POST',
        body: {
          actorId: state.actorId,
          actorName: state.actorName || 'Jugador web',
          optionIndex,
        },
      })
      await applySnapshot(payload)
    } finally {
      setLoading(false)
    }
  }

  async function resetVote() {
    if (!state.roomId) return
    setLoading(true, 'Reiniciando la votacion actual.')
    try {
      const payload = await request(`/api/rooms/${encodeURIComponent(state.roomId)}/votes/current/reset`, {
        method: 'POST',
        body: {
          actorId: state.actorId,
        },
      })
      await applySnapshot(payload)
    } finally {
      setLoading(false)
    }
  }

  async function copyRoomCode() {
    if (!state.roomId) return
    try {
      await navigator.clipboard.writeText(state.roomId)
    } catch {}
  }

  async function pollFeed() {
    if (!state.roomId || !state.revision) return

    try {
      const payload = await request(`/api/rooms/${encodeURIComponent(state.roomId)}/feed?after=${state.revision}`)
      if (payload.events?.length) {
        await refreshRoom()
      }
    } catch {
      // polling silencioso
    }
  }

  function wire() {
    el['create-room-form'].addEventListener('submit', (event) => createRoom(event).catch(console.error))
    el['open-room-form'].addEventListener('submit', (event) => openRoom(event).catch(console.error))
    el['character-form'].addEventListener('submit', (event) => saveCharacter(event).catch(console.error))
    el['character-back-button'].addEventListener('click', () => setScreen('screen-home'))
    el['room-home-button'].addEventListener('click', () => setScreen('screen-home'))
    el['copy-room-button'].addEventListener('click', () => copyRoomCode().catch(console.error))
    el['action-form'].addEventListener('submit', (event) => sendAction(event).catch(console.error))
    el['continue-button'].addEventListener('click', () => continueScene('continue').catch(console.error))
    el['follow-button'].addEventListener('click', () => continueScene('follow-up').catch(console.error))
    el['reset-vote-button'].addEventListener('click', () => resetVote().catch(console.error))
  }

  async function boot() {
    ;[
      'loading-overlay',
      'loading-copy',
      'screen-home',
      'screen-character',
      'screen-room',
      'create-room-form',
      'open-room-form',
      'room-title-input',
      'room-players-input',
      'room-id-input',
      'copy-room-button',
      'character-room-title',
      'character-room-copy',
      'character-player-count',
      'character-back-button',
      'character-form',
      'char-name',
      'char-race',
      'char-class',
      'char-background',
      'char-trait',
      'char-motivation',
      'character-player-list',
      'character-status-box',
      'room-title',
      'room-subtitle',
      'room-phase-badge',
      'room-home-button',
      'last-narration',
      'suggested-actions',
      'action-form',
      'action-input',
      'continue-button',
      'follow-button',
      'vote-card',
      'vote-question',
      'vote-options',
      'reset-vote-button',
      'room-player-list',
      'world-summary',
      'memory-list',
      'chronicle-list',
    ].forEach((id) => { el[id] = $(id) })

    state.actorId = read(STORAGE_KEYS.actorId, generateActorId())
    state.actorName = read(STORAGE_KEYS.actorName, '')
    state.roomId = read(STORAGE_KEYS.roomId, '')
    write(STORAGE_KEYS.actorId, state.actorId)

    setLoading(true, 'Preparando la mesa web.')
    try {
      await loadSetupOptions()
      wire()

      const pathRoomId = window.location.pathname.startsWith('/room/')
        ? decodeURIComponent(window.location.pathname.split('/').filter(Boolean)[1] || '')
        : ''
      const initialRoomId = pathRoomId || state.roomId

      if (initialRoomId) {
        const payload = await request(`/api/rooms/${encodeURIComponent(initialRoomId)}/state`)
        await applySnapshot(payload)
      } else {
        setScreen('screen-home')
      }

      if (state.pollTimer) window.clearInterval(state.pollTimer)
      state.pollTimer = window.setInterval(() => {
        if (!document.hidden) {
          pollFeed()
        }
      }, 5000)
    } finally {
      setLoading(false)
    }
  }

  boot().catch((error) => {
    console.error(error)
  })
})()
