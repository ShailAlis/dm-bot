const { createAdventureHandlers } = require('../../core/adventure')
const { clearPendingPlayer } = require('../../core/setup')
const { generateWorldContext, callClaude, parseDMCommands } = require('../../services/dm')
const {
  formatPartyStatus,
  formatMemoryHighlights,
  formatDirectorMessage,
  formatRoll,
} = require('../../game/formatters')
const { getActionButtonRows, getVoteButtonRows, toDiscordMarkdown, formatOptionList } = require('./utils')

function createDiscordAdventureHandlers(client, storage, logError) {
  return createAdventureHandlers({
    storage,
    parseDMCommands,
    generateWorldContext,
    callClaude,
    clearPendingPlayer,
    saveGame: (scope, game) => storage.saveGame(scope, game),
    saveWorldContext: (scope, context) => storage.saveWorldContext(scope, context),
    sendTyping: async (scope) => {
      const channel = await client.channels.fetch(scope.id).catch(() => null)
      if (channel && typeof channel.sendTyping === 'function') {
        await channel.sendTyping()
      }
    },
    sendMessage: async (scope, text) => {
      const channel = await client.channels.fetch(scope.id).catch(() => null)
      if (channel && typeof channel.send === 'function') {
        await channel.send(toDiscordMarkdown(text))
      }
    },
    sendActions: async (scope, text, actions) => {
      const channel = await client.channels.fetch(scope.id).catch(() => null)
      if (!channel || typeof channel.send !== 'function') return

      const content = actions?.length
        ? `${toDiscordMarkdown(text)}\n\n${formatOptionList(actions, 'Acciones sugeridas')}`
        : toDiscordMarkdown(text)

      const components = getActionButtonRows(actions)
      await channel.send({ content, ...(components.length ? { components } : {}) })
    },
    sendVote: async (scope, question, options, voterIds) => {
      await storage.createVote(scope, question, options, voterIds)
      const channel = await client.channels.fetch(scope.id).catch(() => null)
      if (!channel || typeof channel.send !== 'function') return

      const footer = voterIds.length > 0
        ? `\n\n*Esperando el voto de ${voterIds.length} jugador(es).*`
        : ''
      await channel.send({
        content: `**Decision de grupo**\n\n${question}\n\n${formatOptionList(options, 'Opciones de voto')}${footer}`,
        components: getVoteButtonRows(options),
      })
    },
    sendLevelUp: async (scope, levelUp) => {
      const channel = await client.channels.fetch(scope.id).catch(() => null)
      if (!channel || typeof channel.send !== 'function') return

      const abilityLines = levelUp.abilities.length
        ? `\nNuevas habilidades:\n${levelUp.abilities.map((ability) => `- ${ability}`).join('\n')}`
        : ''

      await channel.send([
        `**${levelUp.name}** sube a nivel ${levelUp.newLevel}`,
        `HP maximo: +${levelUp.hpGain}`,
        `XP total: ${levelUp.xp}${abilityLines}`,
      ].join('\n'))
    },
    sendClaudeError: async (scope, error) => {
      const channel = await client.channels.fetch(scope.id).catch(() => null)
      if (channel && typeof channel.send === 'function') {
        await channel.send(`Error con Claude: \`${error.message}\``)
      }
    },
    formatPartyStatus,
    formatMemoryHighlights,
    formatDirectorMessage,
    formatRoll,
    getPlayerVoterId: (player) => player.platformUserId || player.telegramUserId?.toString() || null,
    logError,
  })
}

module.exports = {
  createDiscordAdventureHandlers,
}
