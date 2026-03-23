const TelegramBot = require('node-telegram-bot-api')
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
} = require('../../game/formatters')
const { callClaude, generateWorldContext, parseDMCommands } = require('../../services/dm')
const { buildDonationMessage, getDonationProviders } = require('../../services/donations')
const { safeSend, sendWithActions, sendVote, sendLevelUpMessage, sendLinkButtons } = require('./messages')
const { createAdventureHandlers } = require('../../core/adventure')
const { clearPendingPlayer } = require('../../core/setup')
const { createTelegramSetupHandlers } = require('./setup')
const { createTelegramVoteHandler } = require('./votes')
const {
  isPrivateChat,
  saveAndCacheGame,
  registerTelegramCommands,
  buildHelpLines,
  sendChronicleDocument,
} = require('./helpers')
const { logErrorWithContext } = require('../../core/errors')

function createTelegramBot() {
  return new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true })
}

async function startTelegramBot({ storage }) {
  const bot = createTelegramBot()

  async function persistGame(chatId, game) {
    await saveAndCacheGame(storage, chatId, game)
  }

  async function sendClaudeError(chatId, error) {
    await safeSend(bot, chatId, `Error con Claude:\n\`${error.message}\``)
  }

  const adventureHandlers = createAdventureHandlers({
    storage,
    parseDMCommands,
    generateWorldContext,
    callClaude,
    clearPendingPlayer,
    saveGame: persistGame,
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

  const setupHandlers = createTelegramSetupHandlers({
    bot,
    storage,
    safeSend,
    sendWithActions,
    saveAndCacheGame: persistGame,
    startAdventure: adventureHandlers.startAdventure,
    isPrivateChat,
  })

  const voteHandler = createTelegramVoteHandler({
    bot,
    storage,
    safeSend,
    callClaude,
    sendClaudeError,
    handleDmReply: adventureHandlers.handleDmReply,
    saveAndCacheGame: persistGame,
    isPrivateChat,
    formatVoteProgress,
    formatVoteResult,
  })

  bot.on('callback_query', voteHandler.handleCallbackQuery)

  bot.onText(/\/start|\/nueva/, async (msg) => {
    await setupHandlers.beginNewGame(msg)
  })

  bot.onText(/\/unirse/, async (msg) => {
    await setupHandlers.handleJoinCommand(msg)
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
    await adventureHandlers.continueAdventure(chatId, game, !isPrivateChat(msg.chat))
  })

  bot.onText(/\/seguir/, async (msg) => {
    const chatId = msg.chat.id
    const game = await storage.loadGame(chatId)

    if (!game || game.phase !== 'adventure') {
      await safeSend(bot, chatId, 'No hay una aventura activa para continuar. Usa /nueva o /continuar.')
      return
    }

    storage.setCachedGame(chatId, game)
    await adventureHandlers.forceContinueNarration(chatId, game, !isPrivateChat(msg.chat))
  })

  bot.onText(/\/donar/, async (msg) => {
    const chatId = msg.chat.id
    const providers = getDonationProviders()

    if (providers.length === 0) {
      await safeSend(bot, chatId, 'Todavia no he configurado enlaces de donacion. Cuando los tengas, este comando mostrara Stripe y PayPal.')
      return
    }

    await sendLinkButtons(bot, chatId, buildDonationMessage(), providers)
  })

  bot.onText(/\/resetvotacion/, async (msg) => {
    const chatId = msg.chat.id
    const vote = await storage.getActiveVote(chatId)
    await storage.clearVote(chatId)

    if (!vote) {
      await safeSend(bot, chatId, 'No habia una votacion activa. El estado de votacion se ha limpiado igualmente.')
      return
    }

    await safeSend(bot, chatId, `Se ha eliminado la votacion activa:\n\n*${vote.question}*`)
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

    await sendChronicleDocument(bot, chatId, game, entries)
  })

  bot.onText(/\/ayuda/, async (msg) => {
    await safeSend(bot, msg.chat.id, buildHelpLines(isPrivateChat(msg.chat)).join('\n'))
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
        await setupHandlers.handleSetupMessage(msg, game)
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

        await adventureHandlers.handleDmReply(chatId, game, reply, groupChat)
        await persistGame(chatId, game)
      }
    } catch (error) {
      logErrorWithContext('Error manejando mensaje de Telegram.', error, {
        chatId: msg?.chat?.id,
        userId: msg?.from?.id,
      })
      await safeSend(bot, msg.chat.id, 'Ha ocurrido un error procesando el mensaje. Intentalo de nuevo.')
    }
  })

  await registerTelegramCommands(bot)
  return bot
}

module.exports = {
  startTelegramBot,
}
