const {
  GROUP_TELEGRAM_COMMANDS,
  PRIVATE_TELEGRAM_COMMANDS,
} = require('./commands')

function isPrivateChat(chat) {
  return chat.type === 'private'
}

async function saveAndCacheGame(storage, chatId, game) {
  await storage.saveGame(chatId, game)
  storage.setCachedGame(chatId, game)
}

async function registerTelegramCommands(bot) {
  await bot.setMyCommands(GROUP_TELEGRAM_COMMANDS, { scope: { type: 'all_group_chats' } })
  await bot.setMyCommands(PRIVATE_TELEGRAM_COMMANDS, { scope: { type: 'all_private_chats' } })
  await bot.setMyCommands(GROUP_TELEGRAM_COMMANDS, { scope: { type: 'default' } })
}

function buildHelpLines(privateChat) {
  if (privateChat) {
    return [
      '*Comandos disponibles*',
      '',
      '/nueva - Empieza una partida y crea tu personaje automaticamente',
      '/continuar - Retoma la ultima partida guardada',
      '/seguir - Fuerza a la IA a continuar una escena cortada',
      '/donar - Muestra formas de apoyar el proyecto',
      '/resetvotacion - Limpia una votacion atascada',
      '/estado - Muestra las fichas del grupo',
      '/xp - Muestra la experiencia y el progreso de nivel',
      '/habilidades - Muestra las habilidades desbloqueadas',
      '/memoria - Resume lugares, NPCs y decisiones',
      '/cronica - Exporta la cronica en un archivo .txt',
      '/ayuda - Muestra esta ayuda',
    ]
  }

  return [
    '*Comandos disponibles*',
    '',
    '/nueva - Crea una partida nueva y arranca el primer personaje',
    '/unirse - Se apunta el siguiente jugador y crea su personaje',
    '/continuar - Retoma la ultima partida guardada',
    '/seguir - Fuerza a la IA a continuar una escena cortada',
    '/donar - Muestra formas de apoyar el proyecto',
    '/resetvotacion - Limpia una votacion atascada',
    '/estado - Muestra las fichas del grupo',
    '/xp - Muestra la experiencia y el progreso de nivel',
    '/habilidades - Muestra las habilidades desbloqueadas',
    '/memoria - Resume lugares, NPCs y decisiones',
    '/cronica - Exporta la cronica en un archivo .txt',
    '/ayuda - Muestra esta ayuda',
  ]
}

async function sendChronicleDocument(bot, chatId, game, entries) {
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
}

module.exports = {
  isPrivateChat,
  saveAndCacheGame,
  registerTelegramCommands,
  buildHelpLines,
  sendChronicleDocument,
}
