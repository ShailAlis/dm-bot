(() => {
  const RACES = ['humano','elfo','enano','mediano','draconido','gnomo','semielfo','semiorco','tiflin']
  const CLASSES = ['guerrero','mago','picaro','clerigo','barbaro','bardo','druida','explorador','paladin','hechicero','brujo','monje']
  const K = { apiBase: 'dmweb.apiBase', roomId: 'dmweb.roomId', drafts: 'dmweb.drafts', activity: 'dmweb.activity', actions: 'dmweb.actions', votes: 'dmweb.votes' }
  const $ = (s, r = document) => r.querySelector(s)
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const read = (k, f = '') => { try { return localStorage.getItem(k) ?? f } catch { return f } }
  const save = (k, v) => { try { localStorage.setItem(k, v) } catch {} }
  const jread = (k, f) => { try { return JSON.parse(localStorage.getItem(k) || JSON.stringify(f)) } catch { return f } }
  const jsave = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }
  const api0 = () => location.protocol.startsWith('http') ? location.origin : ''

  const el = {}
  const st = { apiBase: read(K.apiBase, api0()), roomId: read(K.roomId, ''), room: null, chronicle: [], donations: null, vote: null, drafts: jread(K.drafts, {}), activity: jread(K.activity, []), actions: jread(K.actions, []), votes: jread(K.votes, []), voteChoice: null, apiOk: null, apiInfo: null, lastSync: '' }

  const R = {
    async req(path, opt = {}) {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), opt.timeoutMs || 12000)
      try {
        const res = await fetch(`${st.apiBase.replace(/\/$/, '')}${path}`, { method: opt.method || 'GET', headers: { ...(opt.body ? { 'Content-Type': 'application/json' } : {}), ...(opt.headers || {}) }, body: opt.body ? JSON.stringify(opt.body) : undefined, signal: ctrl.signal })
        const txt = await res.text()
        let data = {}
        if (txt) { try { data = JSON.parse(txt) } catch { data = { raw: txt } } }
        if (!res.ok) { const e = new Error(data.error || data.message || `HTTP ${res.status}`); e.status = res.status; throw e }
        return data
      } finally { clearTimeout(t) }
    },
    async opt(path, opt = {}) { try { return await R.req(path, opt) } catch (e) { if (e.status === 404 || e.status === 405) return null; throw e } },
  }

  const setTone = (tone) => { const p = el['api-status']; p.dataset.tone = tone; p.textContent = tone === 'good' ? 'Conectada' : tone === 'bad' ? 'Error' : 'Pendiente' }
  const setMsg = (msg, tone = 'warn') => { setTone(tone); el['last-sync'].textContent = msg }
  const act = (kind, title, detail = '') => { st.activity.unshift({ kind, title, detail, at: new Date().toISOString() }); st.activity = st.activity.slice(0, 30); jsave(K.activity, st.activity); drawActivity() }
  const logAction = (kind, text) => { st.actions.unshift({ kind, text, at: new Date().toISOString() }); st.actions = st.actions.slice(0, 20); jsave(K.actions, st.actions); drawActions() }
  const logVote = (kind, text) => { st.votes.unshift({ kind, text, at: new Date().toISOString() }); st.votes = st.votes.slice(0, 20); jsave(K.votes, st.votes); drawVotes() }
  const setDraft = (roomId, draft) => { st.drafts[roomId || '__global__'] = draft; jsave(K.drafts, st.drafts); drawDraft() }
  const getDraft = (roomId = st.roomId) => st.drafts[roomId || '__global__'] || { name: '', race: RACES[0], className: CLASSES[0], background: '', trait: '', motivation: '' }
  const actorName = () => getDraft().name || 'Jugador web'

  function init() {
    ;['api-status','api-base-input','api-base-save','active-room-pill','last-sync','local-file-notice','api-capabilities','refresh-all-button','create-room-form','room-title-input','room-players-input','join-room-form','join-room-input','copy-room-button','room-summary','character-sync-status','character-form','char-name','char-background','char-race','char-class','char-trait','char-motivation','sync-character-button','load-draft-button','character-preview','player-list','world-summary','memory-list','chronicle-list','reload-state-button','reload-chronicle-button','action-form','action-input','action-sync-status','action-feed','continue-button','follow-button','vote-status','vote-question','vote-options','vote-submit-button','reload-vote-button','donation-message','donation-links','reload-donations-button','activity-feed','clear-activity-button'].forEach((id) => { el[id] = document.getElementById(id) })
    el['api-base-input'].value = st.apiBase
    el['local-file-notice'].hidden = location.protocol !== 'file:'
    fillSelect(el['char-race'], RACES)
    fillSelect(el['char-class'], CLASSES)
    bind()
    hashRoom()
    putDraftToForm()
    drawAll()
    boot()
    setInterval(() => { if (st.roomId && !document.hidden) refreshRoom().catch(() => {}); refreshVote().catch(() => {}) }, 20000)
    addEventListener('hashchange', () => { hashRoom(); if (st.roomId) openRoom(st.roomId).catch(() => {}) })
  }

  function fillSelect(select, list) { select.innerHTML = list.map((x, i) => `<option value="${esc(x)}">${i + 1}. ${esc(x[0].toUpperCase() + x.slice(1))}</option>`).join('') }
  function hashRoom() { const q = new URLSearchParams(location.hash.replace(/^#/, '')); const room = q.get('room'); if (room) st.roomId = room; save(K.roomId, st.roomId) }
  function draftFromForm() { return { name: el['char-name'].value.trim(), race: el['char-race'].value, className: el['char-class'].value, background: el['char-background'].value.trim(), trait: el['char-trait'].value.trim(), motivation: el['char-motivation'].value.trim() } }
  function putDraftToForm() { const d = getDraft(); el['char-name'].value = d.name; el['char-race'].value = d.race; el['char-class'].value = d.className; el['char-background'].value = d.background; el['char-trait'].value = d.trait; el['char-motivation'].value = d.motivation; drawDraft() }
  function fmtStat(n) { if (typeof n !== 'number') return '-'; const m = Math.floor((n - 10) / 2); return `${n} (${m >= 0 ? '+' : ''}${m})` }
  function textWorld(w) { if (!w || typeof w !== 'object') return 'Todavia no hay contexto de mundo.'; return [w.town?.name, w.town?.type, w.hook?.summary, w.encounter?.description].filter(Boolean).join(' - ') || 'El mundo todavia no tiene un resumen visible.' }
  function voteData(room) { if (!room) return null; const v = room.vote || room.activeVote || room.voting || room.currentVote; if (v?.options?.length) return v; if (room.voteQuestion && room.voteOptions?.length) return { question: room.voteQuestion, options: room.voteOptions, votes: room.voteVotes || {} }; return null }

  function drawHeader() {
    el['api-base-input'].value = st.apiBase
    el['api-status'].textContent = st.apiOk === true ? 'Conectada' : st.apiOk === false ? 'Error' : 'Pendiente'
    el['api-status'].dataset.tone = st.apiOk === true ? 'good' : st.apiOk === false ? 'bad' : 'warn'
    el['active-room-pill'].textContent = st.roomId || 'Ninguna'
    el['join-room-input'].value = st.roomId || ''
    el['last-sync'].textContent = st.lastSync ? new Date(st.lastSync).toLocaleString('es-ES') : 'Todavia no hay datos'
    el['api-capabilities'].innerHTML = ['<span class="chip"><strong>Rooms</strong> crear/cargar</span>', '<span class="chip"><strong>Status</strong> grupo y memoria</span>', '<span class="chip"><strong>Chronicle</strong> cronica persistente</span>', '<span class="chip"><strong>Donations</strong> enlaces</span>', '<span class="chip"><strong>Drafts</strong> local first</span>', ...(st.apiInfo?.capabilities || []).map((c) => `<span class="chip">${esc(String(c))}</span>`)].join('')
  }

  function drawRoom() {
    const r = st.room
    if (!st.roomId || !r) { el['room-summary'].innerHTML = '<p class="muted">Crea o carga una room para ver aqui el estado del grupo y la escena.</p>'; el['world-summary'].innerHTML = '<div class="empty-state">Sin room cargada.</div>'; el['player-list'].innerHTML = '<div class="empty-state">No hay personajes todavia.</div>'; el['memory-list'].innerHTML = '<div class="empty-state">Todavia no hay memoria registrada.</div>'; return }
    const bits = [r.phase ? `fase: ${r.phase}` : '', Number.isInteger(r.numPlayers) ? `jugadores: ${r.numPlayers}` : '', Number.isInteger(r.currentTurn) ? `turno: ${r.currentTurn}` : '', r.setupSubStep ? `setup: ${r.setupSubStep}` : ''].filter(Boolean)
    el['room-summary'].innerHTML = `<div class="grid-two"><div class="note-card"><div class="note-title">Room activa</div><div class="note-meta">${esc(st.roomId)}</div></div><div class="note-card"><div class="note-title">Estado</div><div class="note-meta">${esc(bits.join(' | ') || 'Sin datos de fase')}</div></div><div class="note-card"><div class="note-title">Grupo</div><div class="note-meta">${esc((r.players || []).length)} personaje(s) registrados</div></div><div class="note-card"><div class="note-title">Mundo</div><div class="note-meta">${esc(textWorld(r.worldContext))}</div></div></div>`
    el['world-summary'].innerHTML = `<div class="note-card"><div class="note-title">${esc(r.worldContext?.town?.name || 'Sin ciudad')}</div><div class="note-meta">${esc(textWorld(r.worldContext))}</div></div>`
    const players = r.players || []
    el['player-list'].innerHTML = players.length ? players.map((p) => `<article class="player-card"><div class="player-name">${esc(p.name)}</div><div class="player-meta">${esc(p.race)} ${esc(p.class)} - nivel ${esc(p.level || 1)}</div><div class="player-meta">HP ${esc(p.hp)}/${esc(p.maxHp)} | CA ${esc(p.ac)}</div><div class="player-meta">FUE ${fmtStat(p.stats?.str)} | DES ${fmtStat(p.stats?.dex)} | CON ${fmtStat(p.stats?.con)} | INT ${fmtStat(p.stats?.int)} | SAB ${fmtStat(p.stats?.wis)} | CAR ${fmtStat(p.stats?.cha)}</div></article>`).join('') : '<div class="empty-state">No hay personajes todavia.</div>'
    el['memory-list'].innerHTML = (r.worldMemory || []).length ? (r.worldMemory || []).slice(0, 8).map((m) => `<article class="note-card"><div class="note-title">${esc(m.title || m.type || 'Entrada')}</div><div class="note-meta">${esc(m.description || m.entry || 'Sin descripcion')}</div></article>`).join('') : '<div class="empty-state">Todavia no hay memoria registrada.</div>'
  }

  function drawChronicle() { const list = st.chronicle || []; el['chronicle-list'].innerHTML = list.length ? list.slice(0, 12).map((x, i) => `<article class="timeline-item"><div class="timeline-title">Entrada ${list.length - i}</div><div class="timeline-meta">${esc(x.entry || x.text || String(x))}</div></article>`).join('') : '<div class="timeline-empty">La cronica aparece aqui cuando haya entradas guardadas.</div>' }
  function drawDraft() { const d = getDraft(); el['character-preview'].innerHTML = `<article class="note-card"><div class="note-title">${esc(d.name || 'Personaje sin nombre')}</div><div class="note-meta">${esc(d.race || 'humano')} ${esc(d.className || 'guerrero')}</div><div class="note-meta">Trasfondo: ${esc(d.background || 'Sin definir')}</div><div class="note-meta">Rasgo: ${esc(d.trait || 'Sin definir')}</div><div class="note-meta">Motivacion: ${esc(d.motivation || 'Sin definir')}</div><div class="note-meta">Guardado para: ${esc(st.roomId || 'sin room')}</div></article>`; el['character-sync-status'].textContent = st.drafts[st.roomId || '__global__'] ? 'Borrador guardado' : 'Borrador local' }
  function drawActions() { el['action-feed'].innerHTML = st.actions.length ? st.actions.slice(0, 8).map((x) => `<article class="feed-item"><div class="feed-title">${esc(x.kind || 'accion')}</div><div class="feed-meta">${esc(x.text || '')}</div></article>`).join('') : '<div class="empty-state">Las acciones enviadas o guardadas apareceran aqui.</div>' }
  function drawVotes() {
    const v = st.vote || voteData(st.room)
    if (!v?.options?.length) { el['vote-status'].textContent = 'Sin votacion'; el['vote-status'].dataset.tone = 'warn'; el['vote-question'].textContent = 'Todavia no hay una votacion disponible en esta room.'; el['vote-options'].innerHTML = '<div class="empty-state">Cuando haya votacion, los botones apareceran aqui.</div>'; el['vote-submit-button'].disabled = true; return }
    el['vote-status'].textContent = 'Activa'; el['vote-status'].dataset.tone = 'good'; el['vote-question'].textContent = v.question || 'Votacion activa'
    el['vote-options'].innerHTML = v.options.map((o, i) => `<button class="vote-option ${st.voteChoice === i ? 'selected' : ''}" type="button" data-v="${i}">${esc(o)}</button>`).join('')
    el['vote-submit-button'].disabled = st.voteChoice === null || st.voteChoice === undefined
    el['vote-options'].querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => { st.voteChoice = Number(b.dataset.v); drawVotes() }))
  }
  function drawDonations() { const d = st.donations; if (!d) { el['donation-message'].innerHTML = '<p class="muted">Las donaciones se cargan desde /api/donations/links.</p>'; el['donation-links'].innerHTML = ''; return } el['donation-message'].innerHTML = `<div class="note-card"><div class="note-title">${esc(d.message || 'Apoya el proyecto')}</div><div class="note-meta">${d.enabled ? 'Hay enlaces disponibles.' : 'No hay enlaces de donacion configurados.'}</div></div>`; el['donation-links'].innerHTML = (d.providers || []).length ? d.providers.map((p) => `<a class="primary-button" href="${esc(p.url)}" target="_blank" rel="noreferrer noopener">${esc(p.label || p.id || 'Donar')}</a>`).join('') : '<div class="empty-state">No hay proveedores disponibles ahora mismo.</div>' }
  function drawActivity() { el['activity-feed'].innerHTML = st.activity.length ? st.activity.slice(0, 10).map((x) => `<article class="feed-item"><div class="feed-title">${esc(x.title || x.kind || 'evento')}</div><div class="feed-meta">${esc(x.detail || '')}</div><div class="feed-meta">${esc(new Date(x.at).toLocaleString('es-ES'))}</div></article>`).join('') : '<div class="empty-state">Todavia no hay actividad registrada.</div>' }
  function drawAll() { drawHeader(); drawRoom(); drawChronicle(); drawDraft(); drawActions(); drawVotes(); drawDonations(); drawActivity() }

  async function loadApi() { try { st.apiInfo = await R.req('/api'); st.apiOk = true; st.lastSync = new Date().toISOString(); act('api', 'Conexion API correcta', st.apiInfo?.service ? `Servicio: ${st.apiInfo.service}` : 'API disponible') } catch (e) { st.apiOk = false; st.apiInfo = null; act('api', 'No se pudo leer /api', e.message) } drawHeader() }
  async function loadDonations() { try { st.donations = await R.req('/api/donations/links'); st.lastSync = new Date().toISOString(); drawDonations() } catch (e) { st.donations = { enabled: false, message: `No se pudieron cargar las donaciones: ${e.message}`, providers: [] }; drawDonations() } }
  async function refreshRoom() { if (!st.roomId) return drawAll(); try { const [room, chronicle, vote] = await Promise.all([R.req(`/api/rooms/${encodeURIComponent(st.roomId)}/state`), R.req(`/api/rooms/${encodeURIComponent(st.roomId)}/chronicle`), R.opt(`/api/rooms/${encodeURIComponent(st.roomId)}/vote`)]); st.room = room.game || room || null; st.chronicle = chronicle.entries || []; st.vote = vote?.vote || vote || null; st.lastSync = new Date().toISOString(); drawAll(); setMsg(`Estado actualizado para ${st.roomId}`, 'good') } catch (e) { setMsg(`No se pudo actualizar la room: ${e.message}`, 'bad') } }
  async function refreshVote() { if (!st.roomId) return; try { const vote = await R.opt(`/api/rooms/${encodeURIComponent(st.roomId)}/vote`); st.vote = vote?.vote || vote || st.vote; drawVotes() } catch {} }
  async function refreshChronicle() { if (!st.roomId) return; try { const c = await R.req(`/api/rooms/${encodeURIComponent(st.roomId)}/chronicle`); st.chronicle = c.entries || []; drawChronicle(); st.lastSync = new Date().toISOString() } catch (e) { setMsg(`No se pudo actualizar la cronica: ${e.message}`, 'bad') } }
  async function openRoom(id) { setRoom(id); setMsg(`Cargando room ${id}...`, 'warn'); try { const [room, chronicle, vote] = await Promise.all([R.req(`/api/rooms/${encodeURIComponent(id)}/state`), R.req(`/api/rooms/${encodeURIComponent(id)}/chronicle`), R.opt(`/api/rooms/${encodeURIComponent(id)}/vote`)]); st.room = room.game || room || null; st.chronicle = chronicle.entries || []; st.vote = vote?.vote || vote || null; st.lastSync = new Date().toISOString(); drawAll(); setMsg(`Room cargada: ${id}`, 'good'); act('room', 'Room cargada', id) } catch (e) { setMsg(`No se pudo abrir la room: ${e.message}`, 'bad'); act('room', 'Error cargando room', e.message); drawAll() } }
  async function createRoom(e) { e.preventDefault(); try { const resp = await R.req('/api/rooms', { method: 'POST', body: { title: el['room-title-input'].value.trim(), numPlayers: Number.parseInt(el['room-players-input'].value, 10) || 1 } }); setRoom(resp.roomId); st.room = resp.game || null; st.chronicle = []; drawAll(); act('room', 'Room creada', resp.roomId); setMsg(`Room creada: ${resp.roomId}`, 'good'); await refreshRoom() } catch (err) { setMsg(`No se pudo crear la room: ${err.message}`, 'bad'); act('room', 'Error creando room', err.message) } }
  async function submitDraft(e) { e.preventDefault(); const d = draftFromForm(); setDraft(st.roomId, d); act('character', 'Borrador de personaje guardado', `${d.name || 'Sin nombre'} - ${d.race} ${d.className}`); setMsg('Borrador guardado localmente.', 'good') }
  async function syncCharacter() { if (!st.roomId) return setMsg('Primero crea o carga una room.', 'warn'); const d = draftFromForm(); setDraft(st.roomId, d); const payload = { name: d.name, race: d.race, class: d.className, background: d.background, trait: d.trait, motivation: d.motivation }; for (const path of [`/api/rooms/${encodeURIComponent(st.roomId)}/players`, `/api/rooms/${encodeURIComponent(st.roomId)}/characters`, `/api/rooms/${encodeURIComponent(st.roomId)}/setup/character`]) { try { const res = await R.req(path, { method: 'POST', body: payload }); st.room = res.game || st.room; drawAll(); setMsg(`Personaje sincronizado en ${path}.`, 'good'); act('character', 'Personaje sincronizado', d.name || 'Sin nombre'); return } catch (e) { if (e.status === 404 || e.status === 405) continue; setMsg(`No se pudo sincronizar el personaje: ${e.message}`, 'bad'); act('character', 'Error sincronizando personaje', e.message); return } } setMsg('El personaje quedo guardado como borrador local. El backend aun no expone el endpoint de personajes.', 'warn'); act('character', 'Sincronizacion pendiente', 'Se guardo el borrador local, pero no existe aun la ruta del backend.') }
  async function sendAction(e) { e.preventDefault(); if (!st.roomId) return setMsg('Primero crea o carga una room.', 'warn'); const text = el['action-input'].value.trim(); if (!text) return; const payload = { text, actor: actorName() }; logAction('accion', text); try { const res = await R.req(`/api/rooms/${encodeURIComponent(st.roomId)}/actions`, { method: 'POST', body: payload }); st.room = res.game || st.room; el['action-input'].value = ''; drawAll(); setMsg('Accion enviada al backend.', 'good'); act('action', 'Accion sincronizada', text); await refreshRoom(); return } catch (e) { if (e.status !== 404 && e.status !== 405) { setMsg(`No se pudo enviar la accion: ${e.message}`, 'bad'); act('action', 'Error enviando accion', e.message); return } } el['action-input'].value = ''; setMsg('La accion quedo guardada localmente. El backend todavia no expone /actions.', 'warn'); act('action', 'Accion local', text) }
  async function continueScene(force = false) { if (!st.roomId) return setMsg('Primero crea o carga una room.', 'warn'); const label = force ? 'Seguir' : 'Continuar'; for (const path of [`/api/rooms/${encodeURIComponent(st.roomId)}/${force ? 'follow' : 'continue'}`, `/api/rooms/${encodeURIComponent(st.roomId)}/advance`]) { try { const res = await R.req(path, { method: 'POST', body: { force, roomId: st.roomId } }); st.room = res.game || st.room; drawAll(); setMsg(`${label} enviado.`, 'good'); act('scene', `${label} solicitado`, `Ruta: ${path}`); await refreshRoom(); return } catch (e) { if (e.status === 404 || e.status === 405) continue; setMsg(`No se pudo ejecutar ${label.toLowerCase()}: ${e.message}`, 'bad'); act('scene', `Error en ${label.toLowerCase()}`, e.message); return } } setMsg(`El backend todavia no expone una ruta para ${label.toLowerCase()}.`, 'warn'); act('scene', `${label} pendiente`, 'No existe aun la ruta de backend para esta accion.') }
  async function submitVote() { const v = st.vote || voteData(st.room); if (!v?.options?.length) return setMsg('No hay votacion activa.', 'warn'); if (st.voteChoice === null || st.voteChoice === undefined) return setMsg('Selecciona una opcion antes de votar.', 'warn'); const choice = v.options[st.voteChoice], payload = { choice, choiceIndex: st.voteChoice, actor: actorName() }; for (const path of [`/api/rooms/${encodeURIComponent(st.roomId)}/votes`, `/api/rooms/${encodeURIComponent(st.roomId)}/vote`]) { try { const res = await R.req(path, { method: 'POST', body: payload }); st.room = res.game || st.room; st.voteChoice = null; logVote('vote', `Voto enviado: ${choice}`); setMsg(`Voto enviado: ${choice}`, 'good'); act('vote', 'Voto sincronizado', choice); await refreshRoom(); return } catch (e) { if (e.status === 404 || e.status === 405) continue; setMsg(`No se pudo votar: ${e.message}`, 'bad'); act('vote', 'Error votando', e.message); return } } st.voteChoice = null; logVote('vote', `Voto local: ${choice}`); setMsg('El voto quedo guardado localmente. El backend aun no expone la ruta.', 'warn'); act('vote', 'Voto local', choice); drawVotes() }
  function clearActivity() { st.activity = []; jsave(K.activity, st.activity); drawActivity(); setMsg('Actividad local limpiada.', 'good') }
  async function copyRoom() { if (!st.roomId) return setMsg('No hay room activa para copiar.', 'warn'); try { await navigator.clipboard.writeText(st.roomId); setMsg('Room copiada al portapapeles.', 'good') } catch { setMsg(`Room: ${st.roomId}`, 'warn') } }
  function setRoom(id) { st.roomId = String(id || '').trim(); save(K.roomId, st.roomId); location.hash = st.roomId ? `#room=${encodeURIComponent(st.roomId)}` : '#'; drawHeader() }
  function bind() {
    el['api-base-save'].addEventListener('click', () => { st.apiBase = el['api-base-input'].value.trim(); save(K.apiBase, st.apiBase); setMsg('API base guardada.', 'good'); loadApi() })
    el['api-base-input'].addEventListener('change', () => { st.apiBase = el['api-base-input'].value.trim(); save(K.apiBase, st.apiBase) })
    el['refresh-all-button'].addEventListener('click', refreshAll)
    el['create-room-form'].addEventListener('submit', createRoom)
    el['join-room-form'].addEventListener('submit', (e) => { e.preventDefault(); const id = el['join-room-input'].value.trim(); if (id) openRoom(id) })
    el['copy-room-button'].addEventListener('click', copyRoom)
    el['character-form'].addEventListener('submit', submitDraft)
    el['sync-character-button'].addEventListener('click', syncCharacter)
    el['load-draft-button'].addEventListener('click', putDraftToForm)
    el['reload-state-button'].addEventListener('click', refreshRoom)
    el['reload-chronicle-button'].addEventListener('click', refreshChronicle)
    el['reload-vote-button'].addEventListener('click', refreshVote)
    el['reload-donations-button'].addEventListener('click', loadDonations)
    el['action-form'].addEventListener('submit', sendAction)
    el['continue-button'].addEventListener('click', () => continueScene(false))
    el['follow-button'].addEventListener('click', () => continueScene(true))
    el['vote-submit-button'].addEventListener('click', submitVote)
    el['clear-activity-button'].addEventListener('click', clearActivity)
    ;['char-name','char-background','char-race','char-class','char-trait','char-motivation'].forEach((id) => { const x = el[id]; x.addEventListener('input', () => setDraft(st.roomId || '__global__', draftFromForm())); x.addEventListener('change', () => setDraft(st.roomId || '__global__', draftFromForm())) })
  }
  function refreshAll() { return loadApi().then(loadDonations).then(() => st.roomId ? refreshRoom() : drawAll()) }
  async function boot() { putDraftToForm(); await loadApi(); await loadDonations(); if (st.roomId) await openRoom(st.roomId); else drawAll() }
  function drawAll() { drawHeader(); drawRoom(); drawChronicle(); drawDraft(); drawActions(); drawVotes(); drawDonations(); drawActivity() }
  function drawHeader() { el['api-base-input'].value = st.apiBase; el['api-status'].textContent = st.apiOk === true ? 'Conectada' : st.apiOk === false ? 'Error' : 'Pendiente'; el['api-status'].dataset.tone = st.apiOk === true ? 'good' : st.apiOk === false ? 'bad' : 'warn'; el['active-room-pill'].textContent = st.roomId || 'Ninguna'; el['join-room-input'].value = st.roomId || ''; el['last-sync'].textContent = st.lastSync ? new Date(st.lastSync).toLocaleString('es-ES') : 'Todavia no hay datos'; el['api-capabilities'].innerHTML = ['<span class="chip"><strong>Rooms</strong> crear/cargar</span>', '<span class="chip"><strong>Status</strong> grupo y memoria</span>', '<span class="chip"><strong>Chronicle</strong> cronica persistente</span>', '<span class="chip"><strong>Donations</strong> enlaces</span>', '<span class="chip"><strong>Drafts</strong> local first</span>', ...(st.apiInfo?.capabilities || []).map((c) => `<span class="chip">${esc(String(c))}</span>`)].join('') }
  init()
})()
