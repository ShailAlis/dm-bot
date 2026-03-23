export async function request(path, options = {}) {
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

export const fetchSetupOptions = () => request('/api/setup/options')
export const fetchDonations = () => request('/api/donations/links')
export const fetchChronicle = (roomId) => request(`/api/rooms/${encodeURIComponent(roomId)}/chronicle`)
export const fetchRoomState = (roomId) => request(`/api/rooms/${encodeURIComponent(roomId)}/state`)
export const fetchFeed = (roomId, revision) => request(`/api/rooms/${encodeURIComponent(roomId)}/feed?after=${revision}`)

export const createRoomRequest = ({ title, numPlayers }) => request('/api/rooms', {
  method: 'POST',
  body: { title, numPlayers },
})

export const saveCharacterRequest = ({ roomId, actorId, actorName, character }) => request(`/api/rooms/${encodeURIComponent(roomId)}/players`, {
  method: 'POST',
  body: { actorId, actorName, character },
})

export const sendActionRequest = ({ roomId, actorId, actorName, text }) => request(`/api/rooms/${encodeURIComponent(roomId)}/actions`, {
  method: 'POST',
  body: { actorId, actorName, text },
})

export const continueSceneRequest = ({ roomId, actorId, kind }) => request(`/api/rooms/${encodeURIComponent(roomId)}/${kind === 'follow-up' ? 'follow-up' : 'continue'}`, {
  method: 'POST',
  body: { actorId },
})

export const castVoteRequest = ({ roomId, actorId, actorName, optionIndex }) => request(`/api/rooms/${encodeURIComponent(roomId)}/votes/current/cast`, {
  method: 'POST',
  body: { actorId, actorName, optionIndex },
})

export const resetVoteRequest = ({ roomId, actorId }) => request(`/api/rooms/${encodeURIComponent(roomId)}/votes/current/reset`, {
  method: 'POST',
  body: { actorId },
})
