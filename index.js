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
const { safeSend, sendWithActions, sendVote, sendLevelUpMessage } = require('./src/platform/telegram/messages')
const {
  GROUP_TELEGRAM_COMMANDS,
  PRIVATE_TELEGRAM_COMMANDS,
} = require('./src/platform/telegram/commands')
const {
  SETUP_STEPS,
  PLAYER_COUNT_ACTIONS,
  normalizeUserText,
  isPlayerCountSelection,
  getPendingPlayer,
  setPendingPlayer,
  clearPendingPlayer,
  isEditingSetup,
  parseEditableFieldSelection,
  buildLocalSetupPrompt,
  getSetupActions,
  buildReadyCharacterPayload,
  shouldCompleteSetupLocally,
  buildCharacterDataFromSetup,
  resolveRaceValue,
  resolveClassValue,
} = require('./src/core/setup')
const { computeVoteOutcome } = require('./src/core/voting')
const { createAdventureHandlers } = require('./src/core/adventure')
const { hasDiscordEnv, startDiscordBot } = require('./src/platform/discord/bot')
const { logErrorWithContext } = require('./src/core/errors')

const REQUIRED_ENV_VARS = ['TELEGRAM_TOKEN', 'DATABASE_URL', 'ANTHROPIC_API_KEY']

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true })

process.on('unhandledRejection', (reason) => {
  logErrorWithContext('Promesa no controlada en el proceso principal.', reason)
})

process.on('uncaughtExceptionMonitor', (error) => {
  logErrorWithContext('Excepcion no capturada observada en el proceso principal.', error)
})

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

const {
  handleDmReply,
  startAdventure,
  continueAdventure,
  forceContinueNarration,
} = createAdventureHandlers({
  storage,
  parseDMCommands,
  generateWorldContext,
  callClaude,
  clearPendingPlayer,
  saveGame: saveAndCacheGame,
  saveWorldContext: (chatId, context) => storage.saveWorldContext(chatId, context),
  sendTyping: (chatId) => bot.sendChatAction(chatId, 'typing'),
  sendMessage: (chatId, text) => safeSend(bot, chatId, text),
  sendActions: (chatId, text, actions) => sendWithActions(bot, chatId, text, actions),
  sendVote: (chatId, question, options, voterIds) => sendVote(bot, chatId, question, options, voterIds, storage),
  sendLevelUp: (chatId, levelUp) => sendLevelUpMessage(bot, chatId, levelUp),
  sendClaudeError,
  formatPartyStatus,
  formatMemoryHighlights,
  formatDirectorMessage,
  formatRoll,
  getPlayerVoterId: (player) => player.telegramUserId,
})

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
  try {
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
  } catch (error) {
    logErrorWithContext('Error iniciando una nueva partida en Telegram.', error, { chatId: msg?.chat?.id })
    await safeSend(bot, msg.chat.id, 'No se pudo crear la nueva partida. Intentalo de nuevo en unos segundos.')
  }
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

    const { winner, summary } = computeVoteOutcome(result.vote.votes)

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
  if (hasDiscordEnv()) {
    try {
      await startDiscordBot({ storage })
      console.log('Integracion de Discord activada')
    } catch (error) {
      console.error('No se pudo iniciar la integracion de Discord:', error.message)
      console.error('Telegram seguira funcionando mientras revisas DISCORD_TOKEN y DISCORD_CLIENT_ID')
    }
  } else {
    console.log('Integracion de Discord desactivada (faltan DISCORD_TOKEN y/o DISCORD_CLIENT_ID)')
  }
  console.log('Bot DM Automatico iniciado')
}

bootstrap().catch((error) => {
  console.error('No se pudo iniciar el bot:', error)
  process.exit(1)
})
