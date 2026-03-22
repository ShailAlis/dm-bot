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
const { callClaude, generateWorldContext, parseDMCommands } = require('./src/services/dm')
const storage = require('./src/services/storage')
const { safeSend, sendWithActions, sendVote, sendLevelUpMessage } = require('./src/telegram/messages')

const REQUIRED_ENV_VARS = ['TELEGRAM_TOKEN', 'DATABASE_URL', 'ANTHROPIC_API_KEY']

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true })

const SETUP_STEPS = ['name', 'race', 'class', 'background', 'trait', 'motivation', 'confirm']
const PLAYER_COUNT_ACTIONS = ['1 jugador', '2 jugadores', '3 jugadores', '4 jugadores']
const YES_WORDS = new Set(['si', 'sí', 's', 'ok', 'vale', 'confirmar', 'listo'])

const GROUP_TELEGRAM_COMMANDS = [
  { command: 'nueva', description: 'Inicia o reinicia una partida' },
  { command: 'unirse', description: 'Une un jugador a la partida actual' },
  { command: 'continuar', description: 'Recupera la ultima aventura guardada' },
  { command: 'estado', description: 'Muestra el estado del grupo' },
  { command: 'xp', description: 'Consulta la experiencia del grupo' },
  { command: 'habilidades', description: 'Lista las habilidades desbloqueadas' },
  { command: 'memoria', description: 'Resume decisiones, lugares y NPCs' },
  { command: 'cronica', description: 'Exporta la cronica de la aventura' },
  { command: 'ayuda', description: 'Muestra la ayuda disponible' },
]

const PRIVATE_TELEGRAM_COMMANDS = [
  { command: 'nueva', description: 'Inicia una aventura en este chat' },
  { command: 'continuar', description: 'Recupera tu ultima aventura guardada' },
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
  return draft
}

function buildSetupSummary(game) {
  const draft = getSetupDraft(game)
  return [
    '*Resumen provisional del personaje*',
    '',
    `Nombre: ${draft.name || '-'}`,
    `Raza: ${draft.race || '-'}`,
    `Clase: ${draft.class || '-'}`,
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

  if (step === 'confirm') {
    return `${buildSetupSummary(game)}\n\nSi quieres cambiar algo, responde: Quiero cambiar algo`
  }

  return buildSetupFallback(game)
}

function buildReadyCharacterPayload(game) {
  const draft = getSetupDraft(game)
  return `PERSONAJE_LISTO|${draft.name || 'Heroe'}|${draft.race || 'Humano'}|${draft.class || 'Guerrero'}|${draft.background || 'Aventurero'}|${draft.trait || 'Misterioso'}|${draft.motivation || 'Buscar fortuna'}`
}

function shouldCompleteSetupLocally(game, userText) {
  return game.setupSubStep === 'confirm' && YES_WORDS.has(normalizeUserText(userText))
}

function getEligibleVoterIds(players) {
  const unique = new Set()
  for (const player of players) {
    if (player.telegramUserId) unique.add(player.telegramUserId)
  }
  return [...unique]
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

async function promptForCurrentPlayer(chatId, game, fallbackText = 'Como se llamara tu heroe?') {
  await bot.sendChatAction(chatId, 'typing')
  await safeSend(bot, chatId, buildLocalSetupPrompt(game) || fallbackText)
}

async function beginNewGame(msg) {
  const chatId = msg.chat.id
  const username = msg.from.first_name || 'Jugador'
  const game = storage.createEmptyGame()

  game.phase = 'setup'
  game.history = []
  game.setupSubStep = 'num_players'

  await storage.resetGame(chatId)
  storage.clearCachedGame(chatId)

  if (isPrivateChat(msg.chat)) {
    game.numPlayers = 1
    game.setupSubStep = 'name'
    setPendingPlayer(game, msg.from.id, username)
    await saveAndCacheGame(chatId, game)
    await safeSend(bot, chatId, '*Nueva partida creada*\n\nEmpezamos directamente con tu personaje.')
    await promptForCurrentPlayer(chatId, game)
    return
  }

  await saveAndCacheGame(chatId, game)
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

async function handleSetup(chatId, game, userText, fromUserId = null, fromUsername = null, groupChat = false) {
  await bot.sendChatAction(chatId, 'typing')

  const pendingPlayer = getPendingPlayer(game)
  const currentStepIndex = SETUP_STEPS.indexOf(game.setupSubStep)
  if (currentStepIndex === -1) {
    game.setupSubStep = 'name'
  }

  if (game.setupSubStep === 'name') game.setupBuffer.name = userText
  if (game.setupSubStep === 'race') game.setupBuffer.race = userText
  if (game.setupSubStep === 'class') game.setupBuffer.class = userText
  if (game.setupSubStep === 'background') game.setupBuffer.background = userText
  if (game.setupSubStep === 'trait') game.setupBuffer.trait = userText
  if (game.setupSubStep === 'motivation') game.setupBuffer.motivation = userText
  if (pendingPlayer) game.setupBuffer.pendingPlayer = pendingPlayer

  if (currentStepIndex >= 0 && currentStepIndex < SETUP_STEPS.length - 1) {
    game.setupSubStep = SETUP_STEPS[currentStepIndex + 1]
  }

  let reply
  if (shouldCompleteSetupLocally(game, userText)) {
    reply = buildReadyCharacterPayload(game)
  } else if (normalizeUserText(userText).includes('quiero cambiar')) {
    game.history = []
    game.setupSubStep = 'name'
    game.setupBuffer = {}
    if (pendingPlayer) game.setupBuffer.pendingPlayer = pendingPlayer
    reply = buildLocalSetupPrompt(game)
  } else {
    reply = buildLocalSetupPrompt(game)
  }

  if (reply.includes('PERSONAJE_LISTO|')) {
    const [name, race, playerClass, background, trait, motivation] = extractCharacterFromReply(reply, game)
    const player = createPlayer(
      name || 'Heroe',
      race || 'Humano',
      playerClass || 'Guerrero',
      background || 'Aventurero',
      trait || 'Misterioso',
      motivation || 'Buscar fortuna',
      fromUserId,
      fromUsername,
    )

    game.players.push(player)
    game.setupStep += 1
    game.setupSubStep = 'name'
    clearPendingPlayer(game)
    game.history = []

    await saveAndCacheGame(chatId, game)
    await safeSend(bot, chatId, `*${player.name}* se une a la aventura como ${player.race} ${player.class} de nivel 1.`)

    if (game.setupStep >= game.numPlayers) {
      await startAdventure(chatId, game)
    } else if (groupChat) {
      await sendWithActions(
        bot,
        chatId,
        `Personaje ${game.setupStep} de ${game.numPlayers} completado.\n\nEl siguiente jugador puede usar /unirse para crear su personaje.`,
        ['/unirse'],
      )
    } else {
      await safeSend(bot, chatId, `Vamos con el personaje ${game.setupStep + 1} de ${game.numPlayers}.\n\nComo se llama?`)
    }

    return
  }

  await saveAndCacheGame(chatId, game)
  const actions = reply.includes('CONFIRMAR_PERSONAJE') ? ['Si, estoy listo', 'Quiero cambiar algo'] : []
  const cleanReply = reply.replace('CONFIRMAR_PERSONAJE', '').trim()
  await sendWithActions(bot, chatId, cleanReply, actions)
}

async function handleDmReply(chatId, game, reply) {
  const { clean, rolls, actions, levelUps, voteData } = await parseDMCommands(chatId, game, reply, storage)

  for (const currentRoll of rolls) {
    await safeSend(bot, chatId, formatRoll(currentRoll))
  }

  for (const levelUp of levelUps) {
    await sendLevelUpMessage(bot, chatId, levelUp)
  }

  const voterIds = getEligibleVoterIds(game.players)
  if (voteData.active && voterIds.length >= 2) {
    await sendVote(bot, chatId, voteData.question, voteData.options, voterIds, storage)
    return
  }

  const fallbackActions = voteData.active && voteData.options.length > 0 ? voteData.options : actions
  await sendWithActions(bot, chatId, formatDirectorMessage(clean), fallbackActions)
}

async function startAdventure(chatId, game) {
  game.phase = 'adventure'
  game.history = []
  game.worldContext = generateWorldContext()
  clearPendingPlayer(game)

  await storage.saveWorldContext(chatId, game.worldContext)
  await saveAndCacheGame(chatId, game)

  await bot.sendChatAction(chatId, 'typing')
  await safeSend(bot, chatId, `*La aventura comienza*\n\n${formatPartyStatus(game.players)}`)

  const names = game.players
    .map((player) => `${player.name} (${player.race} ${player.class}, motivacion: "${player.motivation}")`)
    .join(', ')

  let reply
  try {
    reply = await callClaude(
      game,
      `Comienza la aventura para: ${names}. Crea una escena de apertura misteriosa y deja la primera decision en sus manos.`,
    )
  } catch (error) {
    await sendClaudeError(chatId, error)
    return
  }

  await handleDmReply(chatId, game, reply)
  await saveAndCacheGame(chatId, game)
}

async function continueAdventure(chatId, game) {
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

  await handleDmReply(chatId, game, reply)
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

    const winner = Object.entries(counts).sort((left, right) => right[1] - left[1])[0][0]
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

    await handleDmReply(chatId, game, reply)
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

  if (isPrivateChat(msg.chat)) {
    await safeSend(bot, chatId, 'En chat privado no hace falta /unirse. Usa /nueva para empezar.')
    return
  }

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
  await promptForCurrentPlayer(chatId, game)
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
  await continueAdventure(chatId, game)
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
          }

          await promptForCurrentPlayer(chatId, game)
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

      await handleSetup(chatId, game, text, userId, username, groupChat)
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

      await handleDmReply(chatId, game, reply)
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
