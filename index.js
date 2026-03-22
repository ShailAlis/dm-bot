require('dotenv').config()

const TelegramBot = require('node-telegram-bot-api')
const { createPlayer } = require('./src/game/player')
const {
  formatPartyStatus,
  formatXpSummary,
  formatAbilitiesSummary,
  formatMemorySummary,
  formatMemoryHighlights,
  formatDirectorMessage,
  formatRoll,
  formatVoteProgress,
  formatVoteResult,
} = require('./src/game/formatters')
const { buildSetupPrompt, callClaude, generateWorldContext, parseDMCommands } = require('./src/services/dm')
const storage = require('./src/services/storage')
const { safeSend, sendWithActions, sendVote, sendLevelUpMessage } = require('./src/telegram/messages')

const REQUIRED_ENV_VARS = ['TELEGRAM_TOKEN', 'DATABASE_URL', 'ANTHROPIC_API_KEY']

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true })

const SETUP_STEPS = ['name', 'race', 'class', 'background', 'trait', 'motivation', 'confirm']
const PLAYER_COUNT_ACTIONS = ['1 jugador', '2 jugadores', '3 jugadores', '4 jugadores']
const YES_WORDS = new Set(['si', 'sí', 's', 'ok', 'vale', 'confirmar', 'listo'])
const RACE_OPTIONS = ['humano', 'elfo', 'enano', 'mediano', 'draconido', 'gnomo', 'semielfo', 'semiorco', 'tiflin']
const CLASS_OPTIONS = ['guerrero', 'mago', 'picaro', 'clerigo', 'barbaro', 'bardo', 'druida', 'explorador', 'paladin', 'hechicero', 'brujo', 'monje']
const EDITABLE_SETUP_FIELDS = [
  { key: 'name', label: 'Nombre' },
  { key: 'race', label: 'Raza' },
  { key: 'class', label: 'Clase' },
  { key: 'background', label: 'Trasfondo' },
  { key: 'trait', label: 'Rasgo' },
  { key: 'motivation', label: 'Motivacion' },
]

const GROUP_TELEGRAM_COMMANDS = [
  { command: 'nueva', description: 'Inicia o reinicia una partida' },
  { command: 'unirse', description: 'Une un jugador a la partida actual' },
  { command: 'continuar', description: 'Recupera la ultima aventura guardada' },
  { command: 'seguir', description: 'Fuerza a la IA a continuar una escena' },
  { command: 'estado', description: 'Muestra el estado del grupo' },
  { command: 'xp', description: 'Consulta la experiencia del grupo' },
  { command: 'habilidades', description: 'Lista las habilidades desbloqueadas' },
  { command: 'memoria', description: 'Resume decisiones, lugares y NPCs' },
  { command: 'cronica', description: 'Exporta la cronica de la aventura' },
  { command: 'ayuda', description: 'Muestra la ayuda disponible' },
]

const PRIVATE_TELEGRAM_COMMANDS = [
  { command: 'nueva', description: 'Inicia o reinicia una partida' },
  { command: 'unirse', description: 'Crea el siguiente personaje de la partida' },
  { command: 'continuar', description: 'Recupera tu ultima aventura guardada' },
  { command: 'seguir', description: 'Fuerza a la IA a continuar una escena' },
  { command: 'estado', description: 'Muestra el estado de los personajes' },
  { command: 'xp', description: 'Consulta la experiencia del grupo' },
  { command: 'habilidades', description: 'Lista las habilidades desbloqueadas' },
  { command: 'memoria', description: 'Resume decisiones, lugares y NPCs' },
  { command: 'cronica', description: 'Exporta la cronica de la aventura' },
  { command: 'ayuda', description: 'Muestra la ayuda disponible' },
]

function requireEnv(name) {
  return typeof process.env[name] === 'string' && process.env[name].trim().length > 0
}

function validateEnv() {
  const missing = REQUIRED_ENV_VARS.filter((name) => !requireEnv(name))
  if (missing.length > 0) {
    throw new Error(`Faltan variables de entorno requeridas: ${missing.join(', ')}`)
  }
}

function isPrivateChat(chat) {
  return chat.type === 'private'
}

function normalizeUserText(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,!?:;]/g, '')
}

function isPlayerCountSelection(text) {
  const normalized = normalizeUserText(text)
  return PLAYER_COUNT_ACTIONS.some((option) => normalizeUserText(option) === normalized)
}

function getPendingPlayer(game) {
  return game.setupBuffer?.pendingPlayer || null
}

function setPendingPlayer(game, userId, username) {
  game.setupBuffer = { ...game.setupBuffer, pendingPlayer: { userId, username } }
}

function clearPendingPlayer(game) {
  const nextBuffer = { ...game.setupBuffer }
  delete nextBuffer.pendingPlayer
  game.setupBuffer = nextBuffer
}

function getSetupDraft(game) {
  const draft = { ...game.setupBuffer }
  delete draft.pendingPlayer
  delete draft.editMode
  return draft
}

function isEditingSetup(game) {
  return Boolean(game.setupBuffer?.editMode)
}

function parseEditableFieldSelection(value) {
  const normalized = normalizeUserText(value)
  const numeric = Number.parseInt(normalized, 10)

  if (!Number.isNaN(numeric) && numeric >= 1 && numeric <= EDITABLE_SETUP_FIELDS.length) {
    return EDITABLE_SETUP_FIELDS[numeric - 1].key
  }

  const matchedField = EDITABLE_SETUP_FIELDS.find((field) => normalizeUserText(field.label) === normalized)
  return matchedField?.key || null
}

function buildSetupSummary(game) {
  const draft = getSetupDraft(game)
  return [
    '*Resumen provisional del personaje*',
    '',
    `Nombre: ${draft.name || '-'}`,
    `Raza: ${resolveRaceValue(draft.race || '-')}`,
    `Clase: ${resolveClassValue(draft.class || '-')}`,
    `Trasfondo: ${draft.background || '-'}`,
    `Rasgo: ${draft.trait || '-'}`,
    `Motivacion: ${draft.motivation || '-'}`,
    '',
    'Si todo esta bien, responde: Si, estoy listo',
  ].join('\n')
}

function buildSetupFallback(game) {
  const step = game.setupSubStep

  if (step === 'race') {
    return 'Elige una raza para tu personaje: humano, elfo, enano, mediano, draconido, gnomo, semielfo, semiorco o tiflin.'
  }
  if (step === 'class') {
    return 'Elige una clase: guerrero, mago, picaro, clerigo, barbaro, bardo, druida, explorador, paladin, hechicero, brujo o monje.'
  }
  if (step === 'background') {
    return 'Ahora dime el trasfondo de tu personaje.'
  }
  if (step === 'trait') {
    return 'Describe un rasgo de personalidad importante de tu personaje.'
  }
  if (step === 'motivation') {
    return 'Cual es la principal motivacion de tu personaje?'
  }
  if (step === 'edit_select') {
    return 'Elige que parte del personaje quieres cambiar.'
  }
  if (step === 'confirm') {
    return buildSetupSummary(game)
  }

  return 'Sigue con la creacion del personaje.'
}

function buildLocalSetupPrompt(game) {
  const step = game.setupSubStep

  if (step === 'name') {
    return 'Como se llamara tu personaje?'
  }

  if (step === 'race') {
    return [
      '*Elige una raza*',
      '',
      '1. Humano',
      '2. Elfo',
      '3. Enano',
      '4. Mediano',
      '5. Draconido',
      '6. Gnomo',
      '7. Semielfo',
      '8. Semiorco',
      '9. Tiflin',
    ].join('\n')
  }

  if (step === 'class') {
    return [
      '*Elige una clase*',
      '',
      '1. Guerrero',
      '2. Mago',
      '3. Picaro',
      '4. Clerigo',
      '5. Barbaro',
      '6. Bardo',
      '7. Druida',
      '8. Explorador',
      '9. Paladin',
      '10. Hechicero',
      '11. Brujo',
      '12. Monje',
    ].join('\n')
  }

  if (step === 'background') {
    return 'Cual es el trasfondo de tu personaje?'
  }

  if (step === 'trait') {
    return 'Describe un rasgo de personalidad importante.'
  }

  if (step === 'motivation') {
    return 'Cual es la motivacion principal de tu personaje?'
  }

  if (step === 'edit_select') {
    return [
      '*Que quieres cambiar?*',
      '',
      '1. Nombre',
      '2. Raza',
      '3. Clase',
      '4. Trasfondo',
      '5. Rasgo',
      '6. Motivacion',
    ].join('\n')
  }

  if (step === 'confirm') {
    return `${buildSetupSummary(game)}\n\nSi quieres cambiar algo, responde: Quiero cambiar algo`
  }

  return buildSetupFallback(game)
}

function getSetupActions(game) {
  if (game.setupSubStep === 'race') {
    return [
      '1. Humano',
      '2. Elfo',
      '3. Enano',
      '4. Mediano',
      '5. Draconido',
      '6. Gnomo',
      '7. Semielfo',
      '8. Semiorco',
      '9. Tiflin',
    ]
  }

  if (game.setupSubStep === 'class') {
    return [
      '1. Guerrero',
      '2. Mago',
      '3. Picaro',
      '4. Clerigo',
      '5. Barbaro',
      '6. Bardo',
      '7. Druida',
      '8. Explorador',
      '9. Paladin',
      '10. Hechicero',
      '11. Brujo',
      '12. Monje',
    ]
  }

  if (game.setupSubStep === 'confirm') {
    return ['Si, estoy listo', 'Quiero cambiar algo']
  }

  if (game.setupSubStep === 'edit_select') {
    return EDITABLE_SETUP_FIELDS.map((field, index) => `${index + 1}. ${field.label}`)
  }

  return []
}

function buildReadyCharacterPayload(game) {
  const draft = getSetupDraft(game)
  return `PERSONAJE_LISTO|${draft.name || 'Heroe'}|${resolveRaceValue(draft.race) || 'humano'}|${resolveClassValue(draft.class) || 'guerrero'}|${draft.background || 'Aventurero'}|${draft.trait || 'Misterioso'}|${draft.motivation || 'Buscar fortuna'}`
}

function shouldCompleteSetupLocally(game, userText) {
  if (game.setupSubStep !== 'confirm') return false

  const normalized = normalizeUserText(userText)
  return (
    YES_WORDS.has(normalized) ||
    normalized === 'si estoy listo' ||
    normalized === 'sí estoy listo' ||
    (normalized.startsWith('si ') && normalized.includes('listo')) ||
    (normalized.startsWith('sí ') && normalized.includes('listo'))
  )
}

function getEligibleVoterIds(players) {
  const unique = new Set()
  for (const player of players) {
    if (player.telegramUserId) unique.add(player.telegramUserId)
  }
  return [...unique]
}

function pickRandomItem(items) {
  if (!items || items.length === 0) return null
  return items[Math.floor(Math.random() * items.length)]
}

async function saveAndCacheGame(chatId, game) {
  await storage.saveGame(chatId, game)
  storage.setCachedGame(chatId, game)
}

async function registerTelegramCommands() {
  await bot.setMyCommands(GROUP_TELEGRAM_COMMANDS, { scope: { type: 'all_group_chats' } })
  await bot.setMyCommands(PRIVATE_TELEGRAM_COMMANDS, { scope: { type: 'all_private_chats' } })
  await bot.setMyCommands(GROUP_TELEGRAM_COMMANDS, { scope: { type: 'default' } })
}

async function sendClaudeError(chatId, error) {
  await safeSend(bot, chatId, `Error con Claude:\n\`${error.message}\``)
}

async function sendSetupPrompt(chatId, text, groupChat = false, replyToMessageId = null) {
  const game = await storage.getGame(chatId)
  const actions = getSetupActions(game)

  if (actions.length > 0) {
    await sendWithActions(bot, chatId, text, actions)
    return
  }

  const options = groupChat
    ? { reply_markup: { force_reply: true }, ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}) }
    : { reply_markup: { remove_keyboard: true } }

  await safeSend(bot, chatId, text, options)
}

async function promptForCurrentPlayer(chatId, game, groupChat = false, fallbackText = 'Como se llamara tu heroe?', replyToMessageId = null) {
  await bot.sendChatAction(chatId, 'typing')
  await sendSetupPrompt(chatId, buildLocalSetupPrompt(game) || fallbackText, groupChat, replyToMessageId)
}

async function beginNewGame(msg) {
  const chatId = msg.chat.id
  const game = storage.createEmptyGame()

  game.phase = 'setup'
  game.history = []
  game.setupSubStep = 'num_players'

  await storage.resetGame(chatId)
  storage.clearCachedGame(chatId)

  await saveAndCacheGame(chatId, game)

  if (isPrivateChat(msg.chat)) {
    await sendWithActions(
      bot,
      chatId,
      '*Nueva partida creada*\n\nElige cuantos personajes quieres crear en esta partida.',
      PLAYER_COUNT_ACTIONS,
    )
    return
  }

  await sendWithActions(
    bot,
    chatId,
    '*Nueva partida creada*\n\nElige cuantos jugadores participaran. Despues, quien haya lanzado /nueva empezara con el primer personaje y el resto podra usar /unirse.',
    PLAYER_COUNT_ACTIONS,
  )
}

function extractCharacterFromReply(reply, fallbackGame) {
  const rawCharacter = reply.split('PERSONAJE_LISTO|')[1] || buildReadyCharacterPayload(fallbackGame).split('PERSONAJE_LISTO|')[1]
  const parts = rawCharacter
    .split('|')
    .map((part) => part.trim().replace(/[\r\n].*/, '').trim())

  while (parts.length < 6) parts.push('')
  return parts
}

function buildCharacterDataFromSetup(reply, game) {
  const draft = getSetupDraft(game)
  const [nameFromReply, raceFromReply, classFromReply, backgroundFromReply, traitFromReply, motivationFromReply] =
    extractCharacterFromReply(reply, game)

  return {
    name: draft.name || nameFromReply || 'Heroe',
    race: resolveRaceValue(draft.race || raceFromReply || 'humano'),
    playerClass: resolveClassValue(draft.class || classFromReply || 'guerrero'),
    background: draft.background || backgroundFromReply || 'Aventurero',
    trait: draft.trait || traitFromReply || 'Misterioso',
    motivation: draft.motivation || motivationFromReply || 'Buscar fortuna',
  }
}

function resolveIndexedOption(value, options) {
  const normalized = normalizeUserText(value)
  const numeric = Number.parseInt(normalized, 10)

  if (!Number.isNaN(numeric) && numeric >= 1 && numeric <= options.length) {
    return options[numeric - 1]
  }

  const matchedOption = options.find((option) => normalizeUserText(option) === normalized)
  return matchedOption || value
}

function stripLeadingIndex(value) {
  return String(value || '').replace(/^\s*\d+\.\s*/, '').trim()
}

function resolveRaceValue(value) {
  return resolveIndexedOption(stripLeadingIndex(value), RACE_OPTIONS)
}

function resolveClassValue(value) {
  return resolveIndexedOption(stripLeadingIndex(value), CLASS_OPTIONS)
}

async function handleSetup(chatId, game, userText, fromUserId = null, fromUsername = null, groupChat = false, replyToMessageId = null) {
  try {
    await bot.sendChatAction(chatId, 'typing')

    const pendingPlayer = getPendingPlayer(game)
    const currentStepIndex = SETUP_STEPS.indexOf(game.setupSubStep)
    if (game.setupSubStep === 'edit_select') {
      const selectedField = parseEditableFieldSelection(userText)

      if (!selectedField) {
        await sendSetupPrompt(chatId, 'Elige uno de los campos del personaje para cambiar.', groupChat, replyToMessageId)
        return
      }

      game.setupSubStep = selectedField
      await saveAndCacheGame(chatId, game)
      await sendSetupPrompt(chatId, buildLocalSetupPrompt(game), groupChat, replyToMessageId)
      return
    }

    if (currentStepIndex === -1) {
      game.setupSubStep = 'name'
    }

    if (game.setupSubStep === 'name' && isPlayerCountSelection(userText)) {
      await sendSetupPrompt(chatId, 'Ese boton era solo para elegir cuantos jugadores habra. Ahora escribe el nombre del personaje.', groupChat, replyToMessageId)
      return
    }

    if (game.setupSubStep === 'name') game.setupBuffer.name = userText
    if (game.setupSubStep === 'race') game.setupBuffer.race = resolveRaceValue(userText)
    if (game.setupSubStep === 'class') game.setupBuffer.class = resolveClassValue(userText)
    if (game.setupSubStep === 'background') game.setupBuffer.background = userText
    if (game.setupSubStep === 'trait') game.setupBuffer.trait = userText
    if (game.setupSubStep === 'motivation') game.setupBuffer.motivation = userText
    if (pendingPlayer) game.setupBuffer.pendingPlayer = pendingPlayer

    if (isEditingSetup(game)) {
      game.setupSubStep = 'confirm'
      game.setupBuffer.editMode = false
    } else if (currentStepIndex >= 0 && currentStepIndex < SETUP_STEPS.length - 1) {
      game.setupSubStep = SETUP_STEPS[currentStepIndex + 1]
    }

    let reply
    if (shouldCompleteSetupLocally(game, userText)) {
      reply = buildReadyCharacterPayload(game)
    } else if (normalizeUserText(userText).includes('quiero cambiar')) {
      game.history = []
      game.setupSubStep = 'edit_select'
      game.setupBuffer = { ...game.setupBuffer, editMode: true }
      if (pendingPlayer) game.setupBuffer.pendingPlayer = pendingPlayer
      reply = buildLocalSetupPrompt(game)
    } else {
      reply = buildLocalSetupPrompt(game)
    }

    if (reply.includes('PERSONAJE_LISTO|')) {
      const characterData = buildCharacterDataFromSetup(reply, game)
      const player = createPlayer(
        characterData.name,
        characterData.race,
        characterData.playerClass,
        characterData.background,
        characterData.trait,
        characterData.motivation,
        fromUserId,
        fromUsername,
      )

      game.players.push(player)
      game.setupStep += 1
      game.setupSubStep = 'name'
      clearPendingPlayer(game)
      game.setupBuffer.editMode = false
      game.history = []

      try {
        await saveAndCacheGame(chatId, game)
      } catch (error) {
        console.error('Error guardando personaje:', error)
        await safeSend(bot, chatId, `No se pudo guardar el personaje.\n\n\`${error.message}\``)
        return
      }

      await safeSend(bot, chatId, `*${player.name}* se une a la aventura como ${player.race} ${player.class} de nivel 1.`)

      if (game.setupStep >= game.numPlayers) {
        await startAdventure(chatId, game, groupChat)
      } else if (groupChat) {
        await sendWithActions(
          bot,
          chatId,
          `Personaje ${game.setupStep} de ${game.numPlayers} completado.\n\nEl siguiente jugador puede usar /unirse para crear su personaje.`,
          ['/unirse'],
        )
      } else {
        await sendSetupPrompt(chatId, `Vamos con el personaje ${game.setupStep + 1} de ${game.numPlayers}.\n\nComo se llama?`, groupChat)
      }

      return
    }

    await saveAndCacheGame(chatId, game)
    const actions = reply.includes('CONFIRMAR_PERSONAJE') ? ['Si, estoy listo', 'Quiero cambiar algo'] : []
    const cleanReply = reply.replace('CONFIRMAR_PERSONAJE', '').trim()
    if (actions.length > 0) {
      await sendWithActions(bot, chatId, cleanReply, actions)
    } else {
      await sendSetupPrompt(chatId, cleanReply, groupChat, replyToMessageId)
    }
  } catch (error) {
    console.error('Error en handleSetup:', error)
    await saveAndCacheGame(chatId, game)
    await sendSetupPrompt(chatId, buildLocalSetupPrompt(game), groupChat, replyToMessageId)
  }
}

async function handleDmReply(chatId, game, reply, groupChat = false) {
  const { clean, rolls, actions, levelUps, voteData } = await parseDMCommands(chatId, game, reply, storage)
  const formattedNarration = formatDirectorMessage(clean)

  for (const currentRoll of rolls) {
    await safeSend(bot, chatId, formatRoll(currentRoll))
  }

  for (const levelUp of levelUps) {
    await sendLevelUpMessage(bot, chatId, levelUp)
  }

  const voterIds = getEligibleVoterIds(game.players)
  if (voteData.active && voterIds.length >= 2) {
    await safeSend(bot, chatId, formattedNarration)
    await sendVote(bot, chatId, voteData.question, voteData.options, voterIds, storage)
    return
  }

  if (groupChat && voterIds.length >= 2 && actions.length >= 2) {
    await safeSend(bot, chatId, formattedNarration)
    await sendVote(bot, chatId, 'Que hace el grupo?', actions, voterIds, storage)
    return
  }

  const fallbackActions = voteData.active && voteData.options.length > 0 ? voteData.options : actions
  await sendWithActions(bot, chatId, formattedNarration, fallbackActions)
}

async function startAdventure(chatId, game, groupChat = false) {
  try {
    game.phase = 'adventure'
    game.history = []
    clearPendingPlayer(game)

    try {
      game.worldContext = generateWorldContext()
      await storage.saveWorldContext(chatId, game.worldContext)
    } catch (error) {
      console.error('No se pudo generar o guardar el contexto del mundo:', error)
      game.worldContext = null
    }

    await saveAndCacheGame(chatId, game)

    await bot.sendChatAction(chatId, 'typing')
    await safeSend(bot, chatId, `*La aventura comienza*\n\n${formatPartyStatus(game.players)}`)

    const names = game.players
      .map((player) => `${player.name} (${player.race} ${player.class}, motivacion: "${player.motivation}")`)
      .join(', ')

    const reply = await callClaude(
      game,
      `Comienza la aventura para: ${names}. Crea una escena de apertura misteriosa y deja la primera decision en sus manos.`,
    )

    await handleDmReply(chatId, game, reply, groupChat)
    await saveAndCacheGame(chatId, game)
  } catch (error) {
    console.error('Error en startAdventure:', error)
    await safeSend(bot, chatId, 'La aventura ha comenzado, pero hubo un problema al preparar la primera escena. Usa /continuar para seguir.')
    await saveAndCacheGame(chatId, game)
  }
}

async function continueAdventure(chatId, game, groupChat = false) {
  await safeSend(bot, chatId, `*Continuando la aventura*\n\n${formatPartyStatus(game.players)}`)

  if (game.worldMemory?.length) {
    await safeSend(bot, chatId, formatMemoryHighlights(game.worldMemory))
  }

  await bot.sendChatAction(chatId, 'typing')
  let reply
  try {
    reply = await callClaude(game, 'Retoma la aventura con un breve resumen de lo ocurrido y plantea la situacion actual.')
  } catch (error) {
    await sendClaudeError(chatId, error)
    return
  }

  await handleDmReply(chatId, game, reply, groupChat)
  await saveAndCacheGame(chatId, game)
}

async function forceContinueNarration(chatId, game, groupChat = false) {
  await bot.sendChatAction(chatId, 'typing')

  let reply
  try {
    reply = await callClaude(
      game,
      'La narracion anterior se ha quedado a medias. Continua inmediatamente desde el ultimo instante, sin resumir ni reiniciar la escena. Avanza solo un poco, deja claro que los jugadores siguen teniendo la iniciativa y termina siempre con 2 o 3 decisiones concretas que sus personajes puedan tomar ahora mismo.',
    )
  } catch (error) {
    await sendClaudeError(chatId, error)
    return
  }

  await handleDmReply(chatId, game, reply, groupChat)
  await saveAndCacheGame(chatId, game)
}

bot.on('callback_query', async (query) => {
  try {
    const chatId = query.message.chat.id
    const userId = query.from.id
    const username = query.from.first_name || 'Jugador'
    const optionIndex = Number.parseInt(query.data.replace('vote_', ''), 10)
    const game = await storage.getGame(chatId)

    if (!game || game.phase !== 'adventure') {
      await bot.answerCallbackQuery(query.id, { text: 'No hay una votacion activa.' })
      return
    }

    const vote = await storage.getActiveVote(chatId)
    if (!vote) {
      await bot.answerCallbackQuery(query.id, { text: 'No hay una votacion activa.' })
      return
    }

    const choice = vote.options?.[optionIndex]
    if (!choice) {
      await bot.answerCallbackQuery(query.id, { text: 'La opcion no es valida.' })
      return
    }

    const result = await storage.castVote(chatId, userId, choice)
    if (!result) {
      await bot.answerCallbackQuery(query.id, { text: 'No se pudo registrar el voto.' })
      return
    }

    await bot.answerCallbackQuery(query.id, { text: `Has votado: "${choice}"` })
    await safeSend(bot, chatId, formatVoteProgress(username, choice))

    if (!result.allVoted) return

    await storage.clearVote(chatId)

    const counts = {}
    Object.values(result.vote.votes).forEach((currentChoice) => {
      counts[currentChoice] = (counts[currentChoice] || 0) + 1
    })

    const sortedCounts = Object.entries(counts).sort((left, right) => right[1] - left[1])
    const topVotes = sortedCounts[0][1]
    const tiedWinners = sortedCounts.filter(([, totalVotes]) => totalVotes === topVotes).map(([option]) => option)
    const winner = pickRandomItem(tiedWinners)
    const summary = Object.entries(counts)
      .map(([option, totalVotes]) => `${option}: ${totalVotes} voto(s)`)
      .join(', ')

    await safeSend(bot, chatId, formatVoteResult(summary, winner))
    await bot.sendChatAction(chatId, 'typing')

    let reply
    try {
      reply = await callClaude(game, `El grupo ha decidido por votacion: "${winner}". Narra las consecuencias.`)
    } catch (error) {
      await sendClaudeError(chatId, error)
      return
    }

    await handleDmReply(chatId, game, reply, !isPrivateChat(query.message.chat))
    await saveAndCacheGame(chatId, game)
  } catch (error) {
    console.error('Error manejando votacion:', error)
    await bot.answerCallbackQuery(query.id, { text: 'Ha ocurrido un error.' })
  }
})

bot.onText(/\/start|\/nueva/, async (msg) => {
  await beginNewGame(msg)
})

bot.onText(/\/unirse/, async (msg) => {
  const chatId = msg.chat.id
  const userId = msg.from.id
  const username = msg.from.first_name || 'Jugador'
  const game = await storage.getGame(chatId)

  if (!game || game.phase !== 'setup') {
    await safeSend(bot, chatId, 'No hay una partida en configuracion. Usa /nueva primero.')
    return
  }

  if (!game.numPlayers) {
    await safeSend(bot, chatId, 'Primero hay que indicar cuantos jugadores participaran.')
    return
  }

  if (game.players.length >= game.numPlayers) {
    await safeSend(bot, chatId, 'La partida ya tiene todos los personajes necesarios.')
    return
  }

  if (game.players.some((player) => player.telegramUserId === userId)) {
    await safeSend(bot, chatId, `${username}, ya tienes un personaje en esta partida.`)
    return
  }

  const pendingPlayer = getPendingPlayer(game)
  if (pendingPlayer && pendingPlayer.userId !== userId) {
    await safeSend(bot, chatId, `${pendingPlayer.username} esta creando su personaje ahora mismo. Cuando termine, usa /unirse.`)
    return
  }

  if (pendingPlayer && pendingPlayer.userId === userId) {
    await safeSend(bot, chatId, `${username}, ya estabas creando tu personaje. Sigue respondiendo al asistente.`)
    return
  }

  game.setupSubStep = 'name'
  game.history = []
  game.setupBuffer = {}
  setPendingPlayer(game, userId, username)
  await saveAndCacheGame(chatId, game)

  await safeSend(bot, chatId, `*${username}* se une a la partida. Vamos a crear tu personaje.`)
  await promptForCurrentPlayer(chatId, game, !isPrivateChat(msg.chat), 'Como se llamara tu heroe?', msg.message_id)
})

bot.onText(/\/estado/, async (msg) => {
  const game = await storage.getGame(msg.chat.id)
  if (!game || game.players.length === 0) {
    await safeSend(bot, msg.chat.id, 'No hay partida activa. Usa /nueva.')
    return
  }

  await safeSend(bot, msg.chat.id, formatPartyStatus(game.players))
})

bot.onText(/\/xp/, async (msg) => {
  const game = await storage.getGame(msg.chat.id)
  if (!game || game.players.length === 0) {
    await safeSend(bot, msg.chat.id, 'No hay partida activa.')
    return
  }

  await safeSend(bot, msg.chat.id, formatXpSummary(game.players))
})

bot.onText(/\/habilidades/, async (msg) => {
  const game = await storage.getGame(msg.chat.id)
  if (!game || game.players.length === 0) {
    await safeSend(bot, msg.chat.id, 'No hay partida activa.')
    return
  }

  await safeSend(bot, msg.chat.id, formatAbilitiesSummary(game.players))
})

bot.onText(/\/continuar/, async (msg) => {
  const chatId = msg.chat.id
  const game = await storage.loadGame(chatId)

  if (!game || game.phase !== 'adventure') {
    await safeSend(bot, chatId, 'No hay una partida guardada. Usa /nueva.')
    return
  }

  storage.setCachedGame(chatId, game)
  await continueAdventure(chatId, game, !isPrivateChat(msg.chat))
})

bot.onText(/\/seguir/, async (msg) => {
  const chatId = msg.chat.id
  const game = await storage.loadGame(chatId)

  if (!game || game.phase !== 'adventure') {
    await safeSend(bot, chatId, 'No hay una aventura activa para continuar. Usa /nueva o /continuar.')
    return
  }

  storage.setCachedGame(chatId, game)
  await forceContinueNarration(chatId, game, !isPrivateChat(msg.chat))
})

bot.onText(/\/memoria/, async (msg) => {
  const game = await storage.getGame(msg.chat.id)
  if (!game || !game.worldMemory?.length) {
    await safeSend(bot, msg.chat.id, 'Todavia no hay memoria guardada.')
    return
  }

  await safeSend(bot, msg.chat.id, formatMemorySummary(game.worldMemory))
})

bot.onText(/\/cronica/, async (msg) => {
  const chatId = msg.chat.id
  const game = await storage.getGame(chatId)

  if (!game || game.players.length === 0) {
    await safeSend(bot, chatId, 'No hay una aventura en curso.')
    return
  }

  const entries = await storage.getChronicleEntries(chatId)
  if (entries.length === 0) {
    await safeSend(bot, chatId, 'La cronica todavia esta vacia.')
    return
  }

  const heroes = game.players
    .map((player) => `${player.name} (${player.race} ${player.class}, nivel ${player.level || 1})`)
    .join(', ')

  const header = [
    'CRONICA DE LA AVENTURA',
    '='.repeat(40),
    `Heroes: ${heroes}`,
    '='.repeat(40),
    '',
  ].join('\n')
  const body = entries.map((entry, index) => `${index + 1}. ${entry.entry}`).join('\n\n')
  const footer = `\n\n${'='.repeat(40)}\nFin de la cronica - ${new Date().toLocaleDateString('es-ES')}`
  const buffer = Buffer.from(header + body + footer, 'utf-8')

  await bot.sendDocument(chatId, buffer, {}, {
    filename: 'cronica_aventura.txt',
    contentType: 'text/plain',
  })
})

bot.onText(/\/ayuda/, async (msg) => {
  const helpLines = isPrivateChat(msg.chat)
    ? [
        '*Comandos disponibles*',
        '',
        '/nueva - Empieza una partida y crea tu personaje automaticamente',
        '/continuar - Retoma la ultima partida guardada',
        '/seguir - Fuerza a la IA a continuar una escena cortada',
        '/estado - Muestra las fichas del grupo',
        '/xp - Muestra la experiencia y el progreso de nivel',
        '/habilidades - Muestra las habilidades desbloqueadas',
        '/memoria - Resume lugares, NPCs y decisiones',
        '/cronica - Exporta la cronica en un archivo .txt',
        '/ayuda - Muestra esta ayuda',
      ]
    : [
        '*Comandos disponibles*',
        '',
        '/nueva - Crea una partida nueva y arranca el primer personaje',
        '/unirse - Se apunta el siguiente jugador y crea su personaje',
        '/continuar - Retoma la ultima partida guardada',
        '/seguir - Fuerza a la IA a continuar una escena cortada',
        '/estado - Muestra las fichas del grupo',
        '/xp - Muestra la experiencia y el progreso de nivel',
        '/habilidades - Muestra las habilidades desbloqueadas',
        '/memoria - Resume lugares, NPCs y decisiones',
        '/cronica - Exporta la cronica en un archivo .txt',
        '/ayuda - Muestra esta ayuda',
      ]

  await safeSend(bot, msg.chat.id, helpLines.join('\n'))
})

bot.on('message', async (msg) => {
  try {
    if (!msg.text || msg.text.startsWith('/')) return

    const chatId = msg.chat.id
    const userId = msg.from.id
    const username = msg.from.first_name || 'Aventurero'
    const text = msg.text.trim()
    const game = await storage.getGame(chatId)
    const groupChat = !isPrivateChat(msg.chat)

    if (game.phase === 'idle') {
      await safeSend(bot, chatId, 'Usa /nueva para comenzar o /continuar para retomar la aventura.')
      return
    }

    if (game.phase === 'setup') {
      if (game.setupSubStep === 'num_players') {
      const playerCount = Number.parseInt(text, 10)
      if (playerCount >= 1 && playerCount <= 4) {
        game.numPlayers = playerCount
        game.setupSubStep = 'name'
        setPendingPlayer(game, userId, username)
        await saveAndCacheGame(chatId, game)

        if (groupChat) {
          await safeSend(bot, chatId, `Perfecto, seran ${playerCount} jugadores.\n\nEmpezamos con tu personaje. Cuando termines, el resto podra usar /unirse.`)
        } else {
          await safeSend(bot, chatId, `Perfecto, crearas ${playerCount} personaje(s) en esta partida.\n\nEmpezamos con el primero.`)
        }

        await promptForCurrentPlayer(chatId, game, groupChat, 'Como se llamara tu heroe?', msg.message_id)
        } else {
          await sendWithActions(bot, chatId, 'Elige un numero entre 1 y 4 jugadores.', PLAYER_COUNT_ACTIONS)
        }
        return
      }

      if (groupChat) {
        const pendingPlayer = getPendingPlayer(game)
        if (!pendingPlayer) {
          await safeSend(bot, chatId, 'Ahora mismo nadie esta creando personaje. El siguiente jugador puede usar /unirse.')
          return
        }

        if (pendingPlayer.userId !== userId) {
          await safeSend(bot, chatId, `${pendingPlayer.username} esta creando personaje ahora mismo. Cuando termine, usa /unirse.`)
          return
        }
      }

      await handleSetup(chatId, game, text, userId, username, groupChat, msg.message_id)
      return
    }

    if (game.phase === 'adventure') {
      const playerCharacter = game.players.find((player) => player.telegramUserId === userId)
      const actorLabel = playerCharacter ? playerCharacter.name : username

      await safeSend(bot, chatId, `_${actorLabel} actua..._`)
      await bot.sendChatAction(chatId, 'typing')

      const userMessage = playerCharacter ? `[${playerCharacter.name}]: ${text}` : `[${username}]: ${text}`
      let reply
      try {
        reply = await callClaude(game, userMessage)
      } catch (error) {
        await sendClaudeError(chatId, error)
        return
      }

      await handleDmReply(chatId, game, reply, groupChat)
      await saveAndCacheGame(chatId, game)
    }
  } catch (error) {
    console.error('Error manejando mensaje:', error)
    await safeSend(bot, msg.chat.id, 'Ha ocurrido un error procesando el mensaje. Intentalo de nuevo.')
  }
})

async function bootstrap() {
  validateEnv()
  await storage.initDB()
  await registerTelegramCommands()
  console.log('Bot DM Automatico iniciado')
}

bootstrap().catch((error) => {
  console.error('No se pudo iniciar el bot:', error)
  process.exit(1)
})
