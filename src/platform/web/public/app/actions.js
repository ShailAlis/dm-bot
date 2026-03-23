import {
  fetchSetupOptions,
  fetchDonations,
  fetchChronicle,
  fetchRoomState,
  fetchFeed,
  createRoomRequest,
  saveCharacterRequest,
  sendActionRequest,
  continueSceneRequest,
  castVoteRequest,
  resetVoteRequest,
} from './api.js'
import { STORAGE_KEYS } from './config.js'
import { state, el } from './state.js'
import { write } from './storage.js'
import { formatDonationMessage, esc } from './utils.js'
import { setLoading, fillSelect } from './dom.js'
import { render, syncScreenWithRoom } from './render.js'

export async function loadSetupOptions() {
  const payload = await fetchSetupOptions()
  state.setupOptions = payload
  fillSelect(el['char-race'], payload.races || [], esc)
  fillSelect(el['char-class'], payload.classes || [], esc)
}

export async function loadDonations() {
  try {
    const payload = await fetchDonations()
    state.donations = {
      enabled: Boolean(payload.enabled),
      message: formatDonationMessage(payload.message),
      providers: Array.isArray(payload.providers) ? payload.providers : [],
    }
  } catch {
    state.donations = {
      enabled: false,
      message: 'Las donaciones no estan disponibles en este momento.',
      providers: [],
    }
  }
}

export function setRoomId(roomId) {
  state.roomId = String(roomId || '').trim()
  write(STORAGE_KEYS.roomId, state.roomId)
}

export async function loadChronicle() {
  if (!state.roomId) {
    state.chronicle = []
    return
  }

  const payload = await fetchChronicle(state.roomId)
  state.chronicle = payload.entries || []
}

export async function applySnapshot(snapshot) {
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

export async function createRoom(event) {
  event.preventDefault()
  setLoading(el, true, 'Creando la room y preparando la mesa.')
  try {
    const payload = await createRoomRequest({
      title: el['room-title-input'].value.trim(),
      numPlayers: Number.parseInt(el['room-players-input'].value, 10) || 1,
    })
    await applySnapshot(payload)
  } finally {
    setLoading(el, false)
  }
}

export async function openRoom(event) {
  event.preventDefault()
  const roomId = el['room-id-input'].value.trim()
  if (!roomId) return

  setLoading(el, true, 'Recuperando la room y su estado actual.')
  try {
    const payload = await fetchRoomState(roomId)
    await applySnapshot(payload)
  } finally {
    setLoading(el, false)
  }
}

export async function saveCharacter(event) {
  event.preventDefault()
  if (!state.roomId) return

  const characterName = el['char-name'].value.trim()
  state.actorName = characterName || state.actorName || 'Jugador web'
  write(STORAGE_KEYS.actorName, state.actorName)

  setLoading(el, true, 'Guardando tu personaje en la room.')
  try {
    const payload = await saveCharacterRequest({
      roomId: state.roomId,
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
    })
    await applySnapshot(payload)
  } finally {
    setLoading(el, false)
  }
}

export async function refreshRoom() {
  if (!state.roomId) return
  setLoading(el, true, 'Actualizando la escena actual.')
  try {
    const payload = await fetchRoomState(state.roomId)
    await applySnapshot(payload)
  } finally {
    setLoading(el, false)
  }
}

export async function sendAction(event) {
  event.preventDefault()
  if (!state.roomId) return

  const text = el['action-input'].value.trim()
  if (!text) return

  setLoading(el, true, 'Enviando tu accion al director de juego.')
  try {
    const payload = await sendActionRequest({
      roomId: state.roomId,
      actorId: state.actorId,
      actorName: state.actorName || 'Jugador web',
      text,
    })
    el['action-input'].value = ''
    await applySnapshot(payload)
  } finally {
    setLoading(el, false)
  }
}

export async function continueScene(kind) {
  if (!state.roomId) return
  const message = kind === 'follow-up'
    ? 'Pidiendo al director de juego que retome la escena.'
    : 'Pidiendo al director de juego que continue la escena.'
  setLoading(el, true, message)
  try {
    const payload = await continueSceneRequest({
      roomId: state.roomId,
      actorId: state.actorId,
      kind,
    })
    await applySnapshot(payload)
  } finally {
    setLoading(el, false)
  }
}

export async function castVote(optionIndex) {
  if (!state.roomId) return
  setLoading(el, true, 'Registrando tu voto en la decision grupal.')
  try {
    const payload = await castVoteRequest({
      roomId: state.roomId,
      actorId: state.actorId,
      actorName: state.actorName || 'Jugador web',
      optionIndex,
    })
    await applySnapshot(payload)
  } finally {
    setLoading(el, false)
  }
}

export async function resetVote() {
  if (!state.roomId) return
  setLoading(el, true, 'Reiniciando la votacion actual.')
  try {
    const payload = await resetVoteRequest({
      roomId: state.roomId,
      actorId: state.actorId,
    })
    await applySnapshot(payload)
  } finally {
    setLoading(el, false)
  }
}

export async function copyRoomCode() {
  if (!state.roomId) return
  try {
    await navigator.clipboard.writeText(state.roomId)
  } catch {}
}

export async function pollFeed() {
  if (!state.roomId || !state.revision) return

  try {
    const payload = await fetchFeed(state.roomId, state.revision)
    if (payload.events?.length) {
      await refreshRoom()
    }
  } catch {
    // polling silencioso
  }
}
