const crypto = require('crypto')
const fs = require('fs')
const http = require('http')
const path = require('path')
const { createPlayer } = require('../../game/player')
const { computeVoteOutcome } = require('../../core/voting')
const { RACE_OPTIONS, CLASS_OPTIONS, resolveRaceValue, resolveClassValue } = require('../../core/setup')
const { buildDonationMessage, getDonationProviders } = require('../../services/donations')
const { handleWebhookRequest, sendWebhookNotFound } = require('../../services/webhooks')
const { createWebAdventureHandlers, addVoteProgressEvent, addVoteResultEvent } = require('./runtime')

const PUBLIC_DIR = path.join(__dirname, 'public')
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
}

function shouldStartWebServer() {
  return !['1', 'true', 'si', 'yes'].includes(String(process.env.WEB_DISABLED || '').trim().toLowerCase())
}

function getWebPort() {
  return Number.parseInt(process.env.PORT || process.env.WEB_PORT || '3000', 10)
}

function getRequestUrl(request) {
  return new URL(request.url, 'http://localhost')
}

function normalizePathname(requestUrl) {
  return getRequestUrl({ url: requestUrl }).pathname
}

function getRouteMatch(pathname, pattern) {
  const pathSegments = pathname.split('/').filter(Boolean)
  const patternSegments = pattern.split('/').filter(Boolean)
  if (pathSegments.length !== patternSegments.length) return null

  const params = {}
  for (let index = 0; index < patternSegments.length; index += 1) {
    const currentPattern = patternSegments[index]
    const currentValue = pathSegments[index]
    if (currentPattern.startsWith(':')) {
      params[currentPattern.slice(1)] = currentValue
      continue
    }

    if (currentPattern !== currentValue) return null
  }

  return params
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(JSON.stringify(payload))
}

function sendText(response, statusCode, text, contentType = 'text/plain; charset=utf-8') {
  response.writeHead(statusCode, { 'Content-Type': contentType })
  response.end(text)
}

function readRawBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = []

    request.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

async function readJsonBody(request) {
  const rawBody = await readRawBody(request)
  if (!rawBody.trim()) return {}
  return JSON.parse(rawBody)
}

function buildRoomScope(roomId) {
  return {
    platform: 'web',
    type: 'room',
    id: roomId,
  }
}

function clampPlayerCount(value) {
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed)) return 1
  return Math.max(1, Math.min(parsed, 6))
}

function safeEventCursor(value) {
  const parsed = Number.parseInt(value || '0', 10)
  if (Number.isNaN(parsed)) return 0
  return Math.max(0, parsed)
}

function ensureArray(value) {
  return Array.isArray(value) ? value : []
}

function serializePlayer(player) {
  return {
    name: player.name,
    race: player.race,
    class: player.class,
    background: player.background,
    trait: player.trait,
    motivation: player.motivation,
    hp: player.hp,
    maxHp: player.maxHp,
    ac: player.ac,
    stats: player.stats || {},
    inventory: player.inventory || [],
    conditions: player.conditions || [],
    xp: player.xp || 0,
    level: player.level || 1,
    abilities: player.abilities || [],
    platform: player.platform || 'web',
    platformUserId: player.platformUserId || null,
    platformUsername: player.platformUsername || null,
  }
}

function serializeEvent(event) {
  return {
    id: event.id,
    type: event.type,
    payload: event.payload || {},
    createdAt: event.createdAt,
  }
}

function buildUiState(events) {
  const safeEvents = ensureArray(events)
  const lastActions = [...safeEvents].reverse().find((event) => event.type === 'actions')
  const lastNarration = [...safeEvents].reverse().find((event) => ['actions', 'message'].includes(event.type))

  return {
    currentActions: lastActions?.payload?.actions || [],
    lastNarration: lastNarration?.payload?.text || '',
  }
}

function serializeGame(scope, game) {
  return {
    scope,
    roomId: scope.id,
    title: game.setupBuffer?.adventureTitle || game.setupBuffer?.title || null,
    phase: game.phase || 'idle',
    numPlayers: game.numPlayers || 0,
    setupStep: game.setupStep || 0,
    setupSubStep: game.setupSubStep || 'num_players',
    currentTurn: game.currentTurn || 0,
    players: ensureArray(game.players).map(serializePlayer),
    worldMemory: ensureArray(game.worldMemory),
    worldContext: game.worldContext || null,
    historySize: ensureArray(game.history).length,
  }
}

async function buildSnapshot(storage, scope, game, options = {}) {
  const events = options.events || await storage.getGameEvents(scope, options.eventLimit || 100)
  const activeVote = options.activeVote === undefined ? await storage.getActiveVote(scope) : options.activeVote
  const revision = events.length > 0 ? events[events.length - 1].id : 0

  return {
    ok: true,
    roomId: scope.id,
    revision,
    game: serializeGame(scope, game),
    events: events.map(serializeEvent),
    activeVote: activeVote
      ? {
          id: activeVote.id,
          question: activeVote.question,
          options: activeVote.options || [],
          votes: activeVote.votes || {},
          requiredVoters: activeVote.required_voters || [],
        }
      : null,
    ui: buildUiState(events),
  }
}

function ensureRoomPlayer(game, actorId) {
  return ensureArray(game.players).find((player) => String(player.platformUserId || '') === String(actorId || ''))
}

function ensureRoomScopeTitle(game, body) {
  if (!game.setupBuffer) game.setupBuffer = {}
  if (game.setupBuffer.title) return

  const requestedTitle = String(body.title || '').trim()
  if (requestedTitle) {
    game.setupBuffer.title = requestedTitle
  }
}

function validateCharacterPayload(character) {
  const name = String(character?.name || '').trim()
  const background = String(character?.background || '').trim()
  const trait = String(character?.trait || '').trim()
  const motivation = String(character?.motivation || '').trim()
  const race = resolveRaceValue(String(character?.race || '').trim())
  const playerClass = resolveClassValue(String(character?.class || '').trim())

  if (!name) throw new Error('El personaje necesita nombre.')
  if (!RACE_OPTIONS.includes(race)) throw new Error('La raza no es valida.')
  if (!CLASS_OPTIONS.includes(playerClass)) throw new Error('La clase no es valida.')
  if (!background) throw new Error('El personaje necesita trasfondo.')
  if (!trait) throw new Error('El personaje necesita rasgo.')
  if (!motivation) throw new Error('El personaje necesita motivacion.')

  return {
    name,
    race,
    playerClass,
    background,
    trait,
    motivation,
  }
}

function toPlayerActorLabel(player, fallbackName) {
  return player?.name || String(fallbackName || '').trim() || 'Jugador'
}

async function requireExistingRoom(storage, roomId, response) {
  const scope = buildRoomScope(roomId)
  const game = await storage.loadGame(scope)
  if (!game) {
    sendJson(response, 404, { ok: false, error: 'La room no existe.' })
    return null
  }

  storage.setCachedGame(scope, game)
  return { scope, game }
}

async function sendPublicFile(response, pathname) {
  let requestedPath = pathname === '/' ? '/index.html' : pathname
  if (requestedPath.endsWith('/')) requestedPath += 'index.html'

  const safePath = path.normalize(path.join(PUBLIC_DIR, requestedPath))
  if (!safePath.startsWith(PUBLIC_DIR)) {
    sendText(response, 403, 'Forbidden')
    return true
  }

  try {
    const file = await fs.promises.readFile(safePath)
    const extension = path.extname(safePath).toLowerCase()
    sendText(response, 200, file, MIME_TYPES[extension] || 'application/octet-stream')
    return true
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  return false
}

async function sendAppShell(response) {
  const indexPath = path.join(PUBLIC_DIR, 'index.html')
  const file = await fs.promises.readFile(indexPath)
  sendText(response, 200, file, MIME_TYPES['.html'])
}

async function createRoom(request, response, storage) {
  const body = await readJsonBody(request)
  const roomId = crypto.randomUUID()
  const scope = buildRoomScope(roomId)
  const game = storage.createEmptyGame()

  game.phase = 'setup'
  game.numPlayers = clampPlayerCount(body.numPlayers)
  game.setupSubStep = 'name'
  game.setupBuffer = {
    title: String(body.title || '').trim() || null,
    createdFrom: 'web',
  }
  game.scope = scope

  await storage.resetGame(scope)
  storage.clearCachedGame(scope)
  await storage.saveGame(scope, game)
  await storage.addGameEvent(scope, 'system', {
    text: `Room creada para ${game.numPlayers} jugador(es).`,
    title: game.setupBuffer.title,
  })
  storage.setCachedGame(scope, game)

  const snapshot = await buildSnapshot(storage, scope, game)
  sendJson(response, 201, snapshot)
}

async function handlePlayerCreate(request, response, storage, adventureHandlers, roomId) {
  const room = await requireExistingRoom(storage, roomId, response)
  if (!room) return true

  const { scope, game } = room
  const body = await readJsonBody(request)
  const actorId = String(body.actorId || '').trim()
  const actorName = String(body.actorName || '').trim()
  if (!actorId) {
    sendJson(response, 400, { ok: false, error: 'actorId es obligatorio.' })
    return true
  }

  if (game.phase !== 'setup') {
    sendJson(response, 409, { ok: false, error: 'La room ya no esta en fase de creacion de personajes.' })
    return true
  }

  if (ensureArray(game.players).length >= game.numPlayers) {
    sendJson(response, 409, { ok: false, error: 'La room ya tiene todos los personajes necesarios.' })
    return true
  }

  if (ensureRoomPlayer(game, actorId)) {
    sendJson(response, 409, { ok: false, error: 'Ese actor ya tiene un personaje en esta room.' })
    return true
  }

  const character = validateCharacterPayload(body.character || body)
  const player = createPlayer(
    character.name,
    character.race,
    character.playerClass,
    character.background,
    character.trait,
    character.motivation,
  )

  player.platform = 'web'
  player.platformUserId = actorId
  player.platformUsername = actorName || character.name

  ensureRoomScopeTitle(game, body)
  game.players.push(player)
  game.setupStep = ensureArray(game.players).length
  game.scope = scope

  await storage.addGameEvent(scope, 'player_joined', {
    actorId,
    actorName: actorName || character.name,
    player: serializePlayer(player),
    text: `${player.name} se une a la aventura como ${player.race} ${player.class}.`,
  })

  if (game.setupStep >= game.numPlayers) {
    await storage.saveGame(scope, game)
    storage.setCachedGame(scope, game)
    await adventureHandlers.startAdventure(scope, game, game.players.length > 1)
  } else {
    await storage.saveGame(scope, game)
    storage.setCachedGame(scope, game)
  }

  const snapshot = await buildSnapshot(storage, scope, game)
  sendJson(response, 201, {
    ...snapshot,
    player: serializePlayer(player),
    autoStarted: game.phase === 'adventure',
  })
  return true
}

async function handleAction(request, response, storage, adventureHandlers, roomId) {
  const room = await requireExistingRoom(storage, roomId, response)
  if (!room) return true

  const { scope, game } = room
  const body = await readJsonBody(request)
  const actorId = String(body.actorId || '').trim()
  const actorName = String(body.actorName || '').trim()
  const text = String(body.text || '').trim()

  if (!actorId || !text) {
    sendJson(response, 400, { ok: false, error: 'actorId y text son obligatorios.' })
    return true
  }

  if (game.phase !== 'adventure') {
    sendJson(response, 409, { ok: false, error: 'No hay una aventura activa en esta room.' })
    return true
  }

  const player = ensureRoomPlayer(game, actorId)
  if (!player) {
    sendJson(response, 403, { ok: false, error: 'Solo los jugadores registrados pueden actuar.' })
    return true
  }

  await storage.addGameEvent(scope, 'player_action', {
    actorId,
    actorName: actorName || player.name,
    characterName: player.name,
    text,
  })

  const reply = await require('../../services/dm').callClaude(game, `[${player.name}]: ${text}`)
  await adventureHandlers.handleDmReply(scope, game, reply, game.players.length > 1)
  await storage.saveGame(scope, game)
  storage.setCachedGame(scope, game)

  const snapshot = await buildSnapshot(storage, scope, game)
  sendJson(response, 200, snapshot)
  return true
}

async function handleContinue(request, response, storage, adventureHandlers, roomId, type) {
  const room = await requireExistingRoom(storage, roomId, response)
  if (!room) return true

  const { scope, game } = room
  const body = await readJsonBody(request)
  const actorId = String(body.actorId || '').trim()
  if (!actorId) {
    sendJson(response, 400, { ok: false, error: 'actorId es obligatorio.' })
    return true
  }

  if (game.phase !== 'adventure') {
    sendJson(response, 409, { ok: false, error: 'No hay una aventura activa en esta room.' })
    return true
  }

  if (!ensureRoomPlayer(game, actorId)) {
    sendJson(response, 403, { ok: false, error: 'Solo los jugadores registrados pueden continuar la escena.' })
    return true
  }

  if (type === 'follow-up') {
    await adventureHandlers.forceContinueNarration(scope, game, game.players.length > 1)
  } else {
    await adventureHandlers.continueAdventure(scope, game, game.players.length > 1)
  }

  await storage.saveGame(scope, game)
  storage.setCachedGame(scope, game)

  const snapshot = await buildSnapshot(storage, scope, game)
  sendJson(response, 200, snapshot)
  return true
}

async function handleVoteCast(request, response, storage, adventureHandlers, roomId) {
  const room = await requireExistingRoom(storage, roomId, response)
  if (!room) return true

  const { scope, game } = room
  const body = await readJsonBody(request)
  const actorId = String(body.actorId || '').trim()
  const optionIndex = Number.parseInt(body.optionIndex, 10)
  const vote = await storage.getActiveVote(scope)

  if (!actorId) {
    sendJson(response, 400, { ok: false, error: 'actorId es obligatorio.' })
    return true
  }

  if (!vote) {
    sendJson(response, 409, { ok: false, error: 'No hay una votacion activa.' })
    return true
  }

  const player = ensureRoomPlayer(game, actorId)
  if (!player) {
    sendJson(response, 403, { ok: false, error: 'Solo los jugadores registrados pueden votar.' })
    return true
  }

  const choice = vote.options?.[optionIndex]
  if (!choice) {
    sendJson(response, 400, { ok: false, error: 'La opcion elegida no es valida.' })
    return true
  }

  const requiredVoters = ensureArray(vote.required_voters).map(String)
  if (!requiredVoters.includes(actorId)) {
    sendJson(response, 403, { ok: false, error: 'Ese actor no forma parte de la votacion activa.' })
    return true
  }

  const result = await storage.castVote(scope, actorId, choice)
  if (!result) {
    sendJson(response, 409, { ok: false, error: 'No se pudo registrar el voto.' })
    return true
  }

  await addVoteProgressEvent(storage, scope, toPlayerActorLabel(player, body.actorName), choice)

  if (result.allVoted) {
    await storage.clearVote(scope)
    const { winner, summary } = computeVoteOutcome(result.vote.votes)
    await addVoteResultEvent(storage, scope, summary, winner)

    if (game.phase === 'adventure' && winner) {
      const reply = await require('../../services/dm').callClaude(
        game,
        `El grupo ha decidido por votacion: "${winner}". Narra las consecuencias.`,
      )
      await adventureHandlers.handleDmReply(scope, game, reply, game.players.length > 1)
      await storage.saveGame(scope, game)
      storage.setCachedGame(scope, game)
    }
  }

  const snapshot = await buildSnapshot(storage, scope, game)
  sendJson(response, 200, {
    ...snapshot,
    accepted: true,
    resolved: result.allVoted,
  })
  return true
}

async function handleVoteReset(request, response, storage, roomId) {
  const room = await requireExistingRoom(storage, roomId, response)
  if (!room) return true

  const { scope, game } = room
  const body = await readJsonBody(request)
  const actorId = String(body.actorId || '').trim()
  if (!actorId) {
    sendJson(response, 400, { ok: false, error: 'actorId es obligatorio.' })
    return true
  }

  if (!ensureRoomPlayer(game, actorId)) {
    sendJson(response, 403, { ok: false, error: 'Solo los jugadores registrados pueden resetear la votacion.' })
    return true
  }

  await storage.clearVote(scope)
  await storage.addGameEvent(scope, 'system', {
    text: 'La votacion activa ha sido limpiada manualmente.',
  })

  const snapshot = await buildSnapshot(storage, scope, game)
  sendJson(response, 200, {
    ...snapshot,
    cleared: true,
  })
  return true
}

async function handleApiRequest(request, response, { storage, adventureHandlers }) {
  const requestUrl = getRequestUrl(request)
  const pathname = requestUrl.pathname

  if (request.method === 'GET' && pathname === '/api') {
    sendJson(response, 200, {
      ok: true,
      service: 'dm-bot-web',
      capabilities: ['rooms', 'players', 'actions', 'votes', 'chronicle', 'donations', 'webhooks'],
    })
    return true
  }

  if (request.method === 'GET' && pathname === '/api/setup/options') {
    sendJson(response, 200, {
      ok: true,
      races: RACE_OPTIONS,
      classes: CLASS_OPTIONS,
    })
    return true
  }

  if (request.method === 'GET' && pathname === '/api/donations/links') {
    sendJson(response, 200, {
      ok: true,
      enabled: getDonationProviders().length > 0,
      message: buildDonationMessage(),
      providers: getDonationProviders(),
    })
    return true
  }

  if (request.method === 'POST' && pathname === '/api/rooms') {
    await createRoom(request, response, storage)
    return true
  }

  const roomParams = getRouteMatch(pathname, '/api/rooms/:roomId')
  if (request.method === 'GET' && roomParams) {
    const room = await requireExistingRoom(storage, roomParams.roomId, response)
    if (!room) return true
    const snapshot = await buildSnapshot(storage, room.scope, room.game)
    sendJson(response, 200, snapshot)
    return true
  }

  const roomStateParams = getRouteMatch(pathname, '/api/rooms/:roomId/state')
  if (request.method === 'GET' && roomStateParams) {
    const room = await requireExistingRoom(storage, roomStateParams.roomId, response)
    if (!room) return true
    const snapshot = await buildSnapshot(storage, room.scope, room.game)
    sendJson(response, 200, snapshot)
    return true
  }

  const roomFeedParams = getRouteMatch(pathname, '/api/rooms/:roomId/feed')
  if (request.method === 'GET' && roomFeedParams) {
    const room = await requireExistingRoom(storage, roomFeedParams.roomId, response)
    if (!room) return true
    const after = safeEventCursor(requestUrl.searchParams.get('after'))
    const events = await storage.getGameEventsAfter(room.scope, after, 100)
    const cursor = events.length > 0 ? events[events.length - 1].id : after
    sendJson(response, 200, {
      ok: true,
      roomId: room.scope.id,
      cursor,
      events: events.map(serializeEvent),
    })
    return true
  }

  const roomPlayersParams = getRouteMatch(pathname, '/api/rooms/:roomId/players')
  if (roomPlayersParams) {
    if (request.method === 'GET') {
      const room = await requireExistingRoom(storage, roomPlayersParams.roomId, response)
      if (!room) return true
      sendJson(response, 200, {
        ok: true,
        roomId: room.scope.id,
        players: ensureArray(room.game.players).map(serializePlayer),
      })
      return true
    }

    if (request.method === 'POST') {
      return handlePlayerCreate(request, response, storage, adventureHandlers, roomPlayersParams.roomId)
    }
  }

  const roomCharactersParams = getRouteMatch(pathname, '/api/rooms/:roomId/characters')
  if (roomCharactersParams && request.method === 'POST') {
    return handlePlayerCreate(request, response, storage, adventureHandlers, roomCharactersParams.roomId)
  }

  const roomActionsParams = getRouteMatch(pathname, '/api/rooms/:roomId/actions')
  if (roomActionsParams && request.method === 'POST') {
    return handleAction(request, response, storage, adventureHandlers, roomActionsParams.roomId)
  }

  const roomVoteParams = getRouteMatch(pathname, '/api/rooms/:roomId/votes/current')
  if (roomVoteParams && request.method === 'GET') {
    const room = await requireExistingRoom(storage, roomVoteParams.roomId, response)
    if (!room) return true
    const vote = await storage.getActiveVote(room.scope)
    sendJson(response, 200, {
      ok: true,
      roomId: room.scope.id,
      activeVote: vote
        ? {
            id: vote.id,
            question: vote.question,
            options: vote.options || [],
            votes: vote.votes || {},
            requiredVoters: vote.required_voters || [],
          }
        : null,
    })
    return true
  }

  const roomVoteCastParams = getRouteMatch(pathname, '/api/rooms/:roomId/votes/current/cast')
  if (roomVoteCastParams && request.method === 'POST') {
    return handleVoteCast(request, response, storage, adventureHandlers, roomVoteCastParams.roomId)
  }

  const roomVoteResetParams = getRouteMatch(pathname, '/api/rooms/:roomId/votes/current/reset')
  if (roomVoteResetParams && request.method === 'POST') {
    return handleVoteReset(request, response, storage, roomVoteResetParams.roomId)
  }

  const roomContinueParams = getRouteMatch(pathname, '/api/rooms/:roomId/continue')
  if (roomContinueParams && request.method === 'POST') {
    return handleContinue(request, response, storage, adventureHandlers, roomContinueParams.roomId, 'continue')
  }

  const roomFollowUpParams = getRouteMatch(pathname, '/api/rooms/:roomId/follow-up')
  if (roomFollowUpParams && request.method === 'POST') {
    return handleContinue(request, response, storage, adventureHandlers, roomFollowUpParams.roomId, 'follow-up')
  }

  const roomChronicleParams = getRouteMatch(pathname, '/api/rooms/:roomId/chronicle')
  if (request.method === 'GET' && roomChronicleParams) {
    const room = await requireExistingRoom(storage, roomChronicleParams.roomId, response)
    if (!room) return true
    const entries = await storage.getChronicleEntries(room.scope)
    sendJson(response, 200, {
      ok: true,
      roomId: room.scope.id,
      entries: entries.map((entry) => ({
        entry: entry.entry,
        createdAt: entry.created_at,
      })),
    })
    return true
  }

  return false
}

async function handleStaticRequest(request, response) {
  const pathname = normalizePathname(request.url)
  if (!['GET', 'HEAD'].includes(request.method)) return false

  if (pathname.startsWith('/api/') || pathname.startsWith('/webhooks/')) return false
  if (pathname === '/health') return false

  const served = await sendPublicFile(response, pathname)
  if (served) return true

  if (pathname === '/' || pathname.startsWith('/room/')) {
    await sendAppShell(response)
    return true
  }

  return false
}

async function handleWebRequest(request, response, dependencies) {
  const webhookHandled = await handleWebhookRequest(request, response)
  if (webhookHandled) return true

  const pathname = normalizePathname(request.url)
  if (request.method === 'GET' && pathname === '/health') {
    sendJson(response, 200, { ok: true, service: 'dm-bot' })
    return true
  }

  const apiHandled = await handleApiRequest(request, response, dependencies)
  if (apiHandled) return true

  const staticHandled = await handleStaticRequest(request, response)
  if (staticHandled) return true

  sendWebhookNotFound(response)
  return true
}

function startWebServer(dependencies) {
  if (!shouldStartWebServer()) return null

  const adventureHandlers = createWebAdventureHandlers(dependencies.storage)
  const resolvedDependencies = {
    ...dependencies,
    adventureHandlers,
  }

  const server = http.createServer(async (request, response) => {
    try {
      await handleWebRequest(request, response, resolvedDependencies)
    } catch (error) {
      console.error('Error procesando solicitud web:', error)
      sendJson(response, 500, { ok: false, error: 'Error interno' })
    }
  })

  const port = getWebPort()
  server.listen(port, () => {
    console.log(`Servidor web escuchando en el puerto ${port}`)
  })

  return server
}

module.exports = {
  startWebServer,
  handleWebRequest,
}
