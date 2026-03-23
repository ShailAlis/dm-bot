const { computeVoteOutcome } = require('../../core/voting')
const { logErrorWithContext } = require('../../core/errors')

function createTelegramVoteHandler({
  bot,
  storage,
  safeSend,
  callClaude,
  sendClaudeError,
  handleDmReply,
  saveAndCacheGame,
  isPrivateChat,
  formatVoteProgress,
  formatVoteResult,
}) {
  async function handleCallbackQuery(query) {
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
      logErrorWithContext('Error manejando callback de votacion en Telegram.', error, {
        queryId: query?.id,
        chatId: query?.message?.chat?.id,
        userId: query?.from?.id,
      })
      await bot.answerCallbackQuery(query.id, { text: 'Ha ocurrido un error.' })
    }
  }

  return {
    handleCallbackQuery,
  }
}

module.exports = {
  createTelegramVoteHandler,
}
