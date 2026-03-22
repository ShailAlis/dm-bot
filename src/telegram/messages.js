const { formatLevelUp } = require('../game/formatters')

async function safeSend(bot, chatId, text, options = {}) {
  const sendOptions = { parse_mode: 'Markdown', ...options }

  try {
    await bot.sendMessage(chatId, text, sendOptions)
  } catch (error) {
    const fallbackText = text.replace(/[*_`]/g, '')
    const fallbackOptions = { ...sendOptions }
    delete fallbackOptions.parse_mode
    await bot.sendMessage(chatId, fallbackText, fallbackOptions)
  }
}

async function sendWithActions(bot, chatId, text, actions = []) {
  const replyMarkup = actions.length > 0
    ? {
        keyboard: actions.map((action) => [{ text: action }]),
        resize_keyboard: true,
        one_time_keyboard: true,
      }
    : { remove_keyboard: true }

  await safeSend(bot, chatId, text, { reply_markup: replyMarkup })
}

async function sendVote(bot, chatId, question, options, requiredVoters, storage) {
  const keyboard = {
    inline_keyboard: [options.map((option, index) => ({ text: option, callback_data: `vote_${index}` }))],
  }
  const footer = requiredVoters.length > 0
    ? `\n\n_Esperando el voto de ${requiredVoters.length} jugador(es)._`
    : ''

  await storage.createVote(chatId, question, options, requiredVoters)
  await safeSend(bot, chatId, `*Decisión de grupo*\n\n${question}${footer}`, { reply_markup: keyboard })
}

async function sendLevelUpMessage(bot, chatId, levelUp) {
  await safeSend(bot, chatId, formatLevelUp(levelUp))
}

module.exports = {
  safeSend,
  sendWithActions,
  sendVote,
  sendLevelUpMessage,
}
