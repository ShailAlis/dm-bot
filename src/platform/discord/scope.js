const { normalizeScope } = require('../../core/scope')

function getDiscordScopeFromInteraction(interaction) {
  const channel = interaction.channel
  const isThread = typeof channel?.isThread === 'function' && channel.isThread()
  const scopeType = interaction.inGuild() ? (isThread ? 'thread' : 'channel') : 'dm'
  const scopeId = interaction.channelId || interaction.user.id

  return normalizeScope({
    platform: 'discord',
    type: scopeType,
    id: scopeId,
  }, 'discord')
}

module.exports = {
  getDiscordScopeFromInteraction,
}
