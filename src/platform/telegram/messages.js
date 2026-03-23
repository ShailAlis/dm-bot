const { formatLevelUp } = require('../../game/formatters')
const { logErrorWithContext } = require('../../core/errors')

async function safeSend(bot, chatId, text, options = {}) {
  const sendOptions = { parse_mode: 'Markdown', ...options }

  try {
    await bot.sendMessage(chatId, text, sendOptions)
    return true
  } catch (error) {
    const fallbackText = text.replace(/[*_`]/g, '')
    const fallbackOptions = { ...sendOptions }
    delete fallbackOptions.parse_mode

    try {
      await bot.sendMessage(chatId, fallbackText, fallbackOptions)
      return true
    } catch (fallbackError) {
      logErrorWithContext('No se pudo enviar mensaje por Telegram ni con fallback.', fallbackError, {
        chatId,
        originalError: error.message,
        textPreview: String(text || '').slice(0, 160),
      })
      return false
    }
  }
}

async function sendWithActions(bot, chatId, text, actions = []) {
  const columns = getButtonColumns(actions)
  const keyboardRows = actions.reduce((rows, action) => {
    const currentRow = rows[rows.length - 1]
    if (!currentRow || currentRow.length >= columns) {
      rows.push([{ text: action }])
    } else {
      currentRow.push({ text: action })
    }
    return rows
  }, [])

  const replyMarkup = actions.length > 0
    ? {
        keyboard: keyboardRows,
        resize_keyboard: true,
        one_time_keyboard: false,
        is_persistent: true,
        input_field_placeholder: 'Elige una opcion o escribe una respuesta',
      }
    : { remove_keyboard: true }

  await safeSend(bot, chatId, text, { reply_markup: replyMarkup })
}

async function sendLinkButtons(bot, chatId, text, links = []) {
  const keyboard = {
    inline_keyboard: links.map((link) => [{ text: link.label, url: link.url }]),
  }

  return safeSend(bot, chatId, text, { reply_markup: keyboard })
}

function buildInlineKeyboard(options, columns = 2) {
  const rows = []

  for (let index = 0; index < options.length; index += columns) {
    const slice = options.slice(index, index + columns)
    rows.push(
      slice.map((option, offset) => ({
        text: option,
        callback_data: `vote_${index + offset}`,
      })),
    )
  }

  return rows
}

function getVoteColumns(options) {
  const longestOption = options.reduce((max, option) => Math.max(max, String(option || '').length), 0)
  return longestOption > 18 ? 1 : 2
}

function getButtonColumns(options) {
  const longestOption = options.reduce((max, option) => Math.max(max, String(option || '').length), 0)
  return longestOption > 18 ? 1 : 2
}

async function sendVote(bot, chatId, question, options, requiredVoters, storage) {
  if (!Array.isArray(options) || options.length < 2) {
    logErrorWithContext('Intento de crear votacion invalida en Telegram.', new Error('Opciones insuficientes'), {
      chatId,
      question,
      options,
    })
    return false
  }

  const columns = getVoteColumns(options)
  const keyboard = {
    inline_keyboard: buildInlineKeyboard(options, columns),
  }
  const footer = requiredVoters.length > 0
    ? `\n\n_Esperando el voto de ${requiredVoters.length} jugador(es)._`
    : ''

  await storage.createVote(chatId, question, options, requiredVoters)
  return safeSend(bot, chatId, `*Decision de grupo*\n\n${question}${footer}`, { reply_markup: keyboard })
}

async function sendLevelUpMessage(bot, chatId, levelUp) {
  await safeSend(bot, chatId, formatLevelUp(levelUp))
}

module.exports = {
  safeSend,
  sendWithActions,
  sendLinkButtons,
  sendVote,
  sendLevelUpMessage,
}
