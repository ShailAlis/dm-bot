import { ELEMENT_IDS, STORAGE_KEYS } from './config.js'
import { cacheElements, setLoading, setScreen } from './dom.js'
import { state, el } from './state.js'
import { read, write } from './storage.js'
import { generateActorId } from './utils.js'
import { render, setVoteHandler } from './render.js'
import {
  loadSetupOptions,
  loadDonations,
  applySnapshot,
  createRoom,
  openRoom,
  saveCharacter,
  copyRoomCode,
  sendAction,
  continueScene,
  resetVote,
  castVote,
  pollFeed,
} from './actions.js'
import { fetchRoomState } from './api.js'

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

export async function boot() {
  cacheElements(el, ELEMENT_IDS)
  setVoteHandler((optionIndex) => castVote(optionIndex).catch(console.error))

  state.actorId = read(STORAGE_KEYS.actorId, generateActorId())
  state.actorName = read(STORAGE_KEYS.actorName, '')
  state.roomId = read(STORAGE_KEYS.roomId, '')
  write(STORAGE_KEYS.actorId, state.actorId)

  setLoading(el, true, 'Preparando la mesa web.')
  try {
    await loadSetupOptions()
    await loadDonations()
    wire()

    const pathRoomId = window.location.pathname.startsWith('/room/')
      ? decodeURIComponent(window.location.pathname.split('/').filter(Boolean)[1] || '')
      : ''
    const initialRoomId = pathRoomId || state.roomId

    if (initialRoomId) {
      const payload = await fetchRoomState(initialRoomId)
      await applySnapshot(payload)
    } else {
      render()
      setScreen('screen-home')
    }

    if (state.pollTimer) window.clearInterval(state.pollTimer)
    state.pollTimer = window.setInterval(() => {
      if (!document.hidden) {
        pollFeed()
      }
    }, 5000)
  } finally {
    setLoading(el, false)
  }
}
