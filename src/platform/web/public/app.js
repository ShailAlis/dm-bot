(() => {
  const STORAGE_KEYS = {
    actorId: 'dmweb.actorId',
    actorName: 'dmweb.actorName',
    roomId: 'dmweb.roomId',
    characterDrafts: 'dmweb.characterDrafts',
  }

  const state = {
    actorId: '',
    actorName: '',
    roomId: '',
    room: null,
    activeVote: null,
    chronicle: [],
    events: [],
    donations: null,
    revision: 0,
    pollTimer: null,
    setupOptions: {
      races: [],
      classes: [],
    },
    drafts: {},
  }

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

  function readJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback))
    } catch {
      return fallback
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {}
  }

  function generateActorId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID()
    return `actor-${Date.now()}-${Math.random().toString(36).slice(2)}`
  }

  function setStatus(text, tone = 'warn') {
    el['status-text'].textContent = text
    el['api-status'].dataset.tone = tone
    el['api-status'].textContent = tone === 'good' ? 'Conectada' : tone === 'bad' ? 'Error' : 'Pendiente'
    el['last-sync'].textContent = new Date().toLocaleString('es-ES')
  }

  async function request(path, options = {}) {
    const response = await fetch(path, {
      method: options.method || 'GET',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
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

  function saveIdentity() {
    state.actorName = el['actor-name'].value.trim()
    write(STORAGE_KEYS.actorName, state.actorName)
    drawIdentity()
    setStatus('Identidad local guardada.', 'good')
  }

  function drawIdentity() {
    el['actor-name'].value = state.actorName
    el['actor-id-label'].textContent = `Actor ID local: ${state.actorId}`
  }

  function fillSelect(select, values) {
    select.innerHTML = values
      .map((value) => `<option value="${esc(value)}">${esc(value[0].toUpperCase() + value.slice(1))}</option>`)
      .join('')
  }

  function currentDraftKey() {
    return state.roomId || '__global__'
  }

  function getCurrentDraft() {
    return state.drafts[currentDraftKey()] || {
      name: '',
      race: state.setupOptions.races[0] || 'humano',
      className: state.setupOptions.classes[0] || 'guerrero',
      background: '',
      trait: '',
      motivation: '',
    }
  }

  function saveDraftFromForm() {
    state.drafts[currentDraftKey()] = {
      name: el['char-name'].value.trim(),
      race: el['char-race'].value,
      className: el['char-class'].value,
      background: el['char-background'].value.trim(),
      trait: el['char-trait'].value.trim(),
      motivation: el['char-motivation'].value.trim(),
    }
    writeJson(STORAGE_KEYS.characterDrafts, state.drafts)
  }

  function loadDraftIntoForm() {
    const draft = getCurrentDraft()
    el['char-name'].value = draft.name
    el['char-race'].value = draft.race
    el['char-class'].value = draft.className
    el['char-background'].value = draft.background
    el['char-trait'].value = draft.trait
    el['char-motivation'].value = draft.motivation
  }

  function renderRoomHeader() {
    const room = state.room
    el['room-pill'].textContent = state.roomId || 'Ninguna'
    el['room-id-input'].value = state.roomId

    if (!room) {
      el['story-title'].textContent = 'Sin room cargada'
      el['phase-badge'].textContent = 'Sin fase'
      el['players-badge'].textContent = '0/0 jugadores'
      el['last-narration'].textContent = 'Crea o abre una room para empezar a jugar.'
      return
    }

    el['story-title'].textContent = room.title || `Room ${state.roomId}`
    el['phase-badge'].textContent = room.phase || 'sin fase'
    el['players-badge'].textContent = `${room.players.length}/${room.numPlayers} jugadores`
    el['last-narration'].textContent = state.room.ui?.lastNarration || 'Todavia no hay una narracion visible.'
    const townName = room.worldContext?.town?.name || 'Aventura en preparacion'
    const hook = room.worldContext?.hook?.summary || 'Cuando el grupo se complete, aqui veras el gancho principal.'
    el['world-banner-title'].textContent = townName
    el['world-banner-copy'].textContent = hook
  }

  function renderPlayers() {
    const players = state.room?.players || []
    el['player-list'].innerHTML = players.length
      ? players.map((player) => `
        <article class="player-card">
          <div class="player-name">${esc(player.name)}</div>
          <div class="player-meta">${esc(player.race)} ${esc(player.class)} - nivel ${esc(player.level || 1)}</div>
          <div class="player-meta">HP ${esc(player.hp)}/${esc(player.maxHp)} - CA ${esc(player.ac)}</div>
          <div class="player-meta">${esc(player.trait || 'Sin rasgo destacado')}</div>
        </article>
      `).join('')
      : '<div class="memory-card"><div class="memory-meta">Todavia no hay personajes registrados.</div></div>'
  }

  function renderWorld() {
    const worldContext = state.room?.worldContext
    const memory = state.room?.worldMemory || []

    if (!worldContext) {
      el['world-summary'].innerHTML = '<article class="world-card"><div class="world-meta">El contexto del mundo aparecera cuando la aventura arranque.</div></article>'
    } else {
      el['world-summary'].innerHTML = `
        <article class="world-card">
          <div class="world-title">${esc(worldContext.town?.name || 'Lugar sin nombre')}</div>
          <div class="world-meta">${esc(worldContext.town?.type || 'Asentamiento')} - ${esc(worldContext.hook?.summary || 'Sin gancho visible todavia')}</div>
          <div class="world-meta">${esc(worldContext.encounter?.description || 'Sin encuentro descrito todavia')}</div>
        </article>
      `
    }

    el['memory-list'].innerHTML = memory.length
      ? memory.slice(0, 8).map((entry) => `
        <article class="memory-card">
          <div class="memory-title">${esc(entry.title || entry.type || 'Entrada')}</div>
          <div class="memory-meta">${esc(entry.description || 'Sin descripcion')}</div>
        </article>
      `).join('')
      : '<article class="memory-card"><div class="memory-meta">La memoria de la aventura todavia esta vacia.</div></article>'
  }

  function renderChronicle() {
    const entries = state.chronicle || []
    el['chronicle-list'].innerHTML = entries.length
      ? entries.map((entry, index) => `
        <article class="timeline-item">
          <div class="timeline-title">Entrada ${index + 1}</div>
          <div class="timeline-meta">${esc(entry.entry || '')}</div>
        </article>
      `).join('')
      : '<article class="timeline-item"><div class="timeline-meta">La cronica aparecera aqui a medida que el director registre hitos.</div></article>'
  }

  function eventText(event) {
    const payload = event.payload || {}
    if (payload.text) return payload.text
    if (event.type === 'player_action') return `${payload.characterName || payload.actorName}: ${payload.text || ''}`
    if (event.type === 'player_joined') return payload.text || `${payload.player?.name || 'Un personaje'} se une a la room.`
    if (event.type === 'vote') return `${payload.question}\n${(payload.options || []).join(' - ')}`
    if (event.type === 'level_up') return payload.text || 'Un personaje sube de nivel.'
    if (event.type === 'error') return payload.message || 'Error del sistema.'
    return JSON.stringify(payload)
  }

  function renderEvents() {
    const events = state.events || []
    el['event-feed'].innerHTML = events.length
      ? events.map((event) => `
        <article class="feed-item">
          <div class="feed-title">${esc(event.type.replace(/_/g, ' '))}</div>
          <div class="feed-meta">${esc(eventText(event))}</div>
        </article>
      `).join('')
      : '<article class="feed-item"><div class="feed-meta">El feed se poblara cuando ocurra actividad en la room.</div></article>'
  }

  function renderSuggestedActions() {
    const actions = state.room?.ui?.currentActions || []
    el['suggested-actions'].innerHTML = actions.length
      ? actions.map((action) => `<button class="ghost-button action-suggestion" type="button">${esc(action)}</button>`).join('')
      : '<span class="helper">Cuando la escena ofrezca opciones, apareceran aqui.</span>'

    document.querySelectorAll('.action-suggestion').forEach((button) => {
      button.addEventListener('click', () => {
        el['action-input'].value = button.textContent
      })
    })
  }

  function renderVote() {
    const vote = state.activeVote
    if (!vote?.options?.length) {
      el['vote-card'].classList.add('hidden')
      el['vote-options'].innerHTML = ''
      el['vote-question'].textContent = ''
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

  function renderDonations() {
    const donations = state.donations
    el['donation-message'].textContent = donations?.message || 'No hay proveedores de donacion configurados.'
    el['donation-links'].innerHTML = donations?.providers?.length
      ? donations.providers.map((provider) => `
        <a class="primary-button" href="${esc(provider.url)}" target="_blank" rel="noreferrer noopener">${esc(provider.label)}</a>
      `).join('')
      : ''
  }

  function drawAll() {
    renderRoomHeader()
    renderPlayers()
    renderWorld()
    renderChronicle()
    renderEvents()
    renderSuggestedActions()
    renderVote()
    renderDonations()
    renderSessionSummary()
  }

  function renderSessionSummary() {
    const room = state.room
    $('summary-phase').textContent = room?.phase || 'Sin room'
    $('summary-turn').textContent = typeof room?.currentTurn === 'number' ? String(room.currentTurn) : '-'
    $('summary-memory').textContent = `${(room?.worldMemory || []).length} hitos`
    $('summary-events').textContent = `${(state.events || []).length} eventos`

    if (!room) {
      el['world-banner-title'].textContent = 'Todavia no hay aventura activa'
      el['world-banner-copy'].textContent = 'Cuando el grupo se complete, aqui veras el asentamiento, el gancho y el tono de la escena.'
    }
  }

  async function loadSetupOptions() {
    const data = await request('/api/setup/options')
    state.setupOptions = data
    fillSelect(el['char-race'], data.races || [])
    fillSelect(el['char-class'], data.classes || [])
    loadDraftIntoForm()
  }

  async function loadDonations() {
    state.donations = await request('/api/donations/links')
    renderDonations()
  }

  function setRoom(roomId) {
    state.roomId = String(roomId || '').trim()
    write(STORAGE_KEYS.roomId, state.roomId)
    const nextPath = state.roomId ? `/room/${encodeURIComponent(state.roomId)}` : '/'
    window.history.replaceState({}, '', nextPath)
  }

  async function applySnapshot(snapshot) {
    state.room = {
      ...snapshot.game,
      ui: snapshot.ui || {},
    }
    state.activeVote = snapshot.activeVote || null
    state.events = snapshot.events || []
    state.revision = snapshot.revision || 0
    setRoom(snapshot.roomId)
    await loadChronicle()
    drawAll()
  }

  async function loadChronicle() {
    if (!state.roomId) {
      state.chronicle = []
      renderChronicle()
      return
    }

    const chronicle = await request(`/api/rooms/${encodeURIComponent(state.roomId)}/chronicle`)
    state.chronicle = chronicle.entries || []
    renderChronicle()
  }

  async function refreshRoom() {
    if (!state.roomId) {
      drawAll()
      return
    }

    const snapshot = await request(`/api/rooms/${encodeURIComponent(state.roomId)}/state`)
    await applySnapshot(snapshot)
    setStatus(`Room ${state.roomId} actualizada.`, 'good')
  }

  async function createRoom(event) {
    event.preventDefault()
    const snapshot = await request('/api/rooms', {
      method: 'POST',
      body: {
        title: el['room-title-input'].value.trim(),
        numPlayers: Number.parseInt(el['room-players-input'].value, 10) || 1,
      },
    })

    await applySnapshot(snapshot)
    setStatus(`Room creada: ${snapshot.roomId}`, 'good')
  }

  async function openRoom(event) {
    event.preventDefault()
    const roomId = el['room-id-input'].value.trim()
    if (!roomId) return

    const snapshot = await request(`/api/rooms/${encodeURIComponent(roomId)}/state`)
    await applySnapshot(snapshot)
    setStatus(`Room cargada: ${roomId}`, 'good')
  }

  async function registerCharacter(event) {
    event.preventDefault()
    if (!state.roomId) {
      setStatus('Primero crea o abre una room.', 'warn')
      return
    }

    saveDraftFromForm()

    const payload = {
      actorId: state.actorId,
      actorName: state.actorName || el['char-name'].value.trim() || 'Jugador web',
      character: {
        name: el['char-name'].value.trim(),
        race: el['char-race'].value,
        class: el['char-class'].value,
        background: el['char-background'].value.trim(),
        trait: el['char-trait'].value.trim(),
        motivation: el['char-motivation'].value.trim(),
      },
    }

    const snapshot = await request(`/api/rooms/${encodeURIComponent(state.roomId)}/players`, {
      method: 'POST',
      body: payload,
    })

    await applySnapshot(snapshot)
    setStatus(`Personaje registrado en ${state.roomId}.`, 'good')
  }

  async function sendAction(event) {
    event.preventDefault()
    if (!state.roomId) {
      setStatus('Primero crea o abre una room.', 'warn')
      return
    }

    const text = el['action-input'].value.trim()
    if (!text) {
      setStatus('Escribe una accion antes de enviarla.', 'warn')
      return
    }

    const snapshot = await request(`/api/rooms/${encodeURIComponent(state.roomId)}/actions`, {
      method: 'POST',
      body: {
        actorId: state.actorId,
        actorName: state.actorName || 'Jugador web',
        text,
      },
    })

    el['action-input'].value = ''
    await applySnapshot(snapshot)
    setStatus('Accion enviada al director.', 'good')
  }

  async function continueScene(kind) {
    if (!state.roomId) {
      setStatus('Primero crea o abre una room.', 'warn')
      return
    }

    const endpoint = kind === 'follow-up' ? 'follow-up' : 'continue'
    const snapshot = await request(`/api/rooms/${encodeURIComponent(state.roomId)}/${endpoint}`, {
      method: 'POST',
      body: {
        actorId: state.actorId,
      },
    })

    await applySnapshot(snapshot)
    setStatus(kind === 'follow-up' ? 'Se ha pedido seguir la escena.' : 'Se ha pedido continuar la aventura.', 'good')
  }

  async function castVote(optionIndex) {
    if (!state.roomId) return

    const snapshot = await request(`/api/rooms/${encodeURIComponent(state.roomId)}/votes/current/cast`, {
      method: 'POST',
      body: {
        actorId: state.actorId,
        actorName: state.actorName || 'Jugador web',
        optionIndex,
      },
    })

    await applySnapshot(snapshot)
    setStatus('Voto registrado.', 'good')
  }

  async function resetVote() {
    if (!state.roomId) return

    const snapshot = await request(`/api/rooms/${encodeURIComponent(state.roomId)}/votes/current/reset`, {
      method: 'POST',
      body: {
        actorId: state.actorId,
      },
    })

    await applySnapshot(snapshot)
    setStatus('Votacion reseteada.', 'good')
  }

  async function pollFeed() {
    if (!state.roomId) return

    try {
      const payload = await request(`/api/rooms/${encodeURIComponent(state.roomId)}/feed?after=${state.revision}`)
      if (payload.events?.length) {
        state.events = [...state.events, ...payload.events]
        state.revision = payload.cursor || state.revision
        renderEvents()
      }
    } catch {
      // polling silencioso
    }
  }

  async function copyRoomId() {
    if (!state.roomId) {
      setStatus('No hay room activa para copiar.', 'warn')
      return
    }

    try {
      await navigator.clipboard.writeText(state.roomId)
      setStatus('Room ID copiado al portapapeles.', 'good')
    } catch {
      setStatus(`Room activa: ${state.roomId}`, 'warn')
    }
  }

  function wire() {
    el['save-identity-button'].addEventListener('click', saveIdentity)
    el['hero-create-button'].addEventListener('click', () => $('room-title-input').focus())
    el['hero-open-button'].addEventListener('click', () => $('room-id-input').focus())
    el['refresh-button'].addEventListener('click', () => refreshRoom().catch((error) => setStatus(error.message, 'bad')))
    el['create-room-form'].addEventListener('submit', (event) => createRoom(event).catch((error) => setStatus(error.message, 'bad')))
    el['open-room-form'].addEventListener('submit', (event) => openRoom(event).catch((error) => setStatus(error.message, 'bad')))
    el['copy-room-button'].addEventListener('click', () => copyRoomId().catch((error) => setStatus(error.message, 'bad')))
    el['character-form'].addEventListener('submit', (event) => registerCharacter(event).catch((error) => setStatus(error.message, 'bad')))
    el['action-form'].addEventListener('submit', (event) => sendAction(event).catch((error) => setStatus(error.message, 'bad')))
    el['continue-button'].addEventListener('click', () => continueScene('continue').catch((error) => setStatus(error.message, 'bad')))
    el['follow-button'].addEventListener('click', () => continueScene('follow-up').catch((error) => setStatus(error.message, 'bad')))
    el['reset-vote-button'].addEventListener('click', () => resetVote().catch((error) => setStatus(error.message, 'bad')))

    ;['char-name', 'char-race', 'char-class', 'char-background', 'char-trait', 'char-motivation'].forEach((id) => {
      $(id).addEventListener('input', saveDraftFromForm)
      $(id).addEventListener('change', saveDraftFromForm)
    })
  }

  async function boot() {
    ;[
      'api-status',
      'room-pill',
      'last-sync',
      'status-text',
      'hero-create-button',
      'hero-open-button',
      'actor-name',
      'save-identity-button',
      'actor-id-label',
      'refresh-button',
      'create-room-form',
      'room-title-input',
      'room-players-input',
      'open-room-form',
      'room-id-input',
      'copy-room-button',
      'character-form',
      'char-name',
      'char-race',
      'char-class',
      'char-background',
      'char-trait',
      'char-motivation',
      'donation-message',
      'donation-links',
      'story-title',
      'phase-badge',
      'players-badge',
      'last-narration',
      'world-banner-title',
      'world-banner-copy',
      'suggested-actions',
      'action-form',
      'action-input',
      'continue-button',
      'follow-button',
      'vote-card',
      'vote-question',
      'vote-options',
      'reset-vote-button',
      'event-feed',
      'player-list',
      'world-summary',
      'memory-list',
      'chronicle-list',
      'summary-phase',
      'summary-turn',
      'summary-memory',
      'summary-events',
    ].forEach((id) => { el[id] = $(id) })

    state.actorId = read(STORAGE_KEYS.actorId, generateActorId())
    state.actorName = read(STORAGE_KEYS.actorName, '')
    state.roomId = read(STORAGE_KEYS.roomId, '')
    state.drafts = readJson(STORAGE_KEYS.characterDrafts, {})

    write(STORAGE_KEYS.actorId, state.actorId)
    drawIdentity()
    wire()

    await loadSetupOptions()
    await loadDonations()

    const pathRoomId = window.location.pathname.startsWith('/room/')
      ? decodeURIComponent(window.location.pathname.split('/').filter(Boolean)[1] || '')
      : ''
    const initialRoomId = pathRoomId || state.roomId

    if (initialRoomId) {
      const snapshot = await request(`/api/rooms/${encodeURIComponent(initialRoomId)}/state`)
      await applySnapshot(snapshot)
      setStatus(`Room cargada: ${initialRoomId}`, 'good')
    } else {
      drawAll()
    }

    if (state.pollTimer) window.clearInterval(state.pollTimer)
    state.pollTimer = window.setInterval(() => {
      pollFeed()
      if (!document.hidden && state.roomId) {
        loadChronicle().catch(() => {})
      }
    }, 5000)
  }

  boot().catch((error) => {
    setStatus(error.message, 'bad')
  })
})()
