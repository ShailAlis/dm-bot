const { createPlayer } = require('../../game/player')
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
} = require('../../core/setup')
const { logErrorWithContext } = require('../../core/errors')

function createTelegramSetupHandlers({
  bot,
  storage,
  safeSend,
  sendWithActions,
  saveAndCacheGame,
  startAdventure,
  isPrivateChat,
}) {
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
          logErrorWithContext('Error guardando personaje de Telegram.', error, { chatId, fromUserId, fromUsername })
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
      logErrorWithContext('Error en el flujo de setup de Telegram.', error, { chatId, fromUserId, fromUsername })
      await saveAndCacheGame(chatId, game)
      await sendSetupPrompt(chatId, buildLocalSetupPrompt(game), groupChat, replyToMessageId)
    }
  }

  async function handleJoinCommand(msg) {
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
  }

  async function handleSetupMessage(msg, game) {
    const chatId = msg.chat.id
    const userId = msg.from.id
    const username = msg.from.first_name || 'Aventurero'
    const text = msg.text.trim()
    const groupChat = !isPrivateChat(msg.chat)

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
  }

  return {
    beginNewGame,
    handleJoinCommand,
    handleSetupMessage,
  }
}

module.exports = {
  createTelegramSetupHandlers,
}
