const { ChannelType } = require('discord.js')
const { buildAdventureTitle, buildThreadName, logDiscordInteractionError } = require('./utils')
const { getDiscordScopeFromChannel } = require('./scope')

async function ensureAdventureThread(interaction, adventureTitle = null) {
  const channel = interaction.channel
  const isThread = typeof channel?.isThread === 'function' && channel.isThread()

  if (!interaction.inGuild() || isThread) {
    return { channel, created: false, usedFallback: false }
  }

  if (!channel?.threads || typeof channel.threads.create !== 'function') {
    return { channel, created: false, usedFallback: true }
  }

  try {
    const thread = await channel.threads.create({
      name: buildThreadName(interaction, adventureTitle),
      autoArchiveDuration: 1440,
      reason: `Nueva partida creada por ${interaction.user.tag}`,
    })
    return { channel: thread, created: true, usedFallback: false }
  } catch (error) {
    logDiscordInteractionError('No se pudo crear el hilo de aventura; se usara el canal actual.', interaction, error)
    return { channel, created: false, usedFallback: true }
  }
}

async function createPrivateAdventureThread(interaction, game, logError = console.error) {
  if (!interaction.inGuild()) return null

  const currentChannel = interaction.channel
  const parentChannel = typeof currentChannel?.isThread === 'function' && currentChannel.isThread()
    ? currentChannel.parent
    : currentChannel

  if (!parentChannel?.threads || typeof parentChannel.threads.create !== 'function') {
    return null
  }

  try {
    const adventureTitle = game?.setupBuffer?.adventureTitle || buildAdventureTitle(game?.worldContext)
    const privateThread = await parentChannel.threads.create({
      name: buildThreadName(interaction, adventureTitle, 'mesa'),
      autoArchiveDuration: 1440,
      type: ChannelType.PrivateThread,
      invitable: false,
      reason: `Mesa privada para la partida de ${interaction.user.tag}`,
    })

    for (const player of game.players || []) {
      if (player.platform === 'discord' && player.platformUserId) {
        await privateThread.members.add(player.platformUserId).catch((error) => {
          logError('No se pudo anadir un jugador al hilo privado de la partida:', {
            threadId: privateThread.id,
            playerId: player.platformUserId,
          }, error)
        })
      }
    }

    return privateThread
  } catch (error) {
    logError('No se pudo crear el hilo privado de aventura.', {
      guildId: interaction.guildId || null,
      channelId: interaction.channelId || null,
    }, error)
    return null
  }
}

async function closePreparationThread(channel, privateThreadId, logError = console.error) {
  if (!channel || typeof channel.send !== 'function') return

  await channel.send([
    '**Preparacion cerrada**',
    `La partida continua a partir de ahora en <#${privateThreadId}>.`,
    'Este espacio queda solo como historial de creacion del grupo.',
  ].join('\n')).catch(() => {})

  const isThread = typeof channel.isThread === 'function' && channel.isThread()
  if (!isThread) return

  if (typeof channel.setLocked === 'function') {
    await channel.setLocked(true, 'La partida se ha movido a una mesa privada').catch((error) => {
      logError('No se pudo bloquear el hilo de preparacion.', { channelId: channel.id }, error)
    })
  }

  if (typeof channel.setArchived === 'function') {
    await channel.setArchived(true, 'La partida se ha movido a una mesa privada').catch((error) => {
      logError('No se pudo archivar el hilo de preparacion.', { channelId: channel.id }, error)
    })
  }
}

module.exports = {
  ensureAdventureThread,
  createPrivateAdventureThread,
  closePreparationThread,
  getDiscordScopeFromChannel,
}
