const { normalizeScope } = require('../../core/scope')

function getDiscordScopeFromChannel(channel) {
  const isThread = typeof channel?.isThread === 'function' && channel.isThread()
  const scopeType = channel?.guild ? (isThread ? 'thread' : 'channel') : 'dm'
  const scopeId = channel?.id

  return normalizeScope({
    platform: 'discord',
    type: scopeType,
    id: scopeId,
  }, 'discord')
}

function getDiscordScopeFromInteraction(interaction) {
  return getDiscordScopeFromChannel(interaction.channel || { id: interaction.channelId || interaction.user.id, guild: interaction.guild })
}

module.exports = {
  getDiscordScopeFromChannel,
  getDiscordScopeFromInteraction,
}
