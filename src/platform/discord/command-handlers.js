const { AttachmentBuilder } = require('discord.js')
const { clearPendingPlayer } = require('../../core/setup')
const { generateWorldContext, callClaude } = require('../../services/dm')
const { buildDonationMessage, getDonationProviders } = require('../../services/donations')
const {
  formatAbilitiesSummary,
  formatMemorySummary,
  formatPartyStatus,
  formatXpSummary,
} = require('../../game/formatters')
const { getDiscordScopeFromChannel, getDiscordScopeFromInteraction } = require('./scope')
const {
  buildAdventureTitle,
  buildDonationButtonRows,
  buildHelpMessage,
  buildJoinSelectionComponents,
  buildJoinSelectionContent,
  getDiscordActorLabel,
  getPlayerByDiscordUserId,
  isDiscordPlayerInGame,
  isPendingPlayerExpired,
  logDiscordInteractionError,
  toDiscordMarkdown,
} = require('./utils')
const { ensureAdventureThread, createPrivateAdventureThread, closePreparationThread } = require('./threads')

function createDiscordCommandHandlers({ storage, adventureHandlers, logError = console.error }) {
  async function handleNewCommand(interaction) {
    await interaction.deferReply({ ephemeral: true })

    let newGameStep = 'leyendo opciones'

    try {
      const numPlayers = interaction.options.getInteger('jugadores', true)
      const game = storage.createEmptyGame()

      newGameStep = 'generando contexto del mundo'
      const worldContext = generateWorldContext()
      const adventureTitle = buildAdventureTitle(worldContext)

      newGameStep = 'creando o resolviendo el hilo de partida'
      const { channel: targetChannel, created: createdThread, usedFallback } = await ensureAdventureThread(interaction, adventureTitle)
      const targetScope = getDiscordScopeFromChannel(targetChannel)

      game.phase = 'setup'
      game.numPlayers = numPlayers
      game.setupSubStep = 'name'
      game.worldContext = worldContext
      game.setupBuffer = { ...game.setupBuffer, adventureTitle }
      game.scope = targetScope

      newGameStep = 'reseteando el estado previo de la partida'
      await storage.resetGame(targetScope)
      storage.clearCachedGame(targetScope)

      newGameStep = 'guardando la nueva partida'
      await storage.saveGame(targetScope, game)
      storage.setCachedGame(targetScope, game)

      newGameStep = 'respondiendo a Discord'
      if (interaction.inGuild() && targetChannel.id !== interaction.channelId) {
        await interaction.editReply({
          content: `**${adventureTitle}** creada en <#${targetChannel.id}> para ${numPlayers} jugador(es). Usa ese hilo para /unirse y jugar esta aventura.`,
        })

        if (typeof targetChannel.send === 'function') {
          await targetChannel.send([
            `**${adventureTitle}**`,
            `Nueva partida creada para **${numPlayers}** jugador(es).`,
            'Este hilo sera el espacio de esta aventura.',
            'Ahora el primer jugador ya puede usar /unirse para crear su personaje.',
          ].join('\n'))
        }
        return
      }

      await interaction.editReply({
        content: [
          `**${adventureTitle}**`,
          `Partida de Discord creada para **${numPlayers}** jugador(es).`,
          usedFallback
            ? 'No pude crear un hilo nuevo, asi que esta aventura usara el canal actual como scope.'
            : (createdThread ? 'Este hilo sera el scope de la aventura.' : 'Este hilo o canal sera el scope de la aventura.'),
          'Ahora el primer jugador ya puede usar /unirse para crear su personaje.',
        ].join('\n'),
      })
    } catch (error) {
      logDiscordInteractionError(`Error en /nueva durante: ${newGameStep}`, interaction, error, logError)
      await interaction.editReply({
        content: `Error en /nueva durante "${newGameStep}": ${error.message}`,
      }).catch(() => {})
    }
  }

  async function handleJoinCommand(interaction, scope) {
    const game = await storage.getGame(scope)
    if (!game || game.phase !== 'setup') {
      await interaction.reply({
        content: 'No hay una partida en configuracion en este canal o hilo. Usa /nueva primero.',
        ephemeral: true,
      })
      return
    }

    if (game.players.length >= game.numPlayers) {
      await interaction.reply({
        content: 'La partida ya tiene todos los personajes necesarios.',
        ephemeral: true,
      })
      return
    }

    const pendingPlayer = game.setupBuffer?.pendingPlayer
    if (pendingPlayer && isPendingPlayerExpired(pendingPlayer)) {
      clearPendingPlayer(game)
    }

    if (pendingPlayer && String(pendingPlayer.userId) !== String(interaction.user.id)) {
      await interaction.reply({
        content: `${pendingPlayer.username} esta creando personaje ahora mismo. Cuando termine, usa /unirse.`,
        ephemeral: true,
      })
      return
    }

    if (game.players.some((player) => player.platformUserId === interaction.user.id)) {
      await interaction.reply({
        content: 'Ya tienes un personaje en esta partida.',
        ephemeral: true,
      })
      return
    }

    game.setupBuffer = {
      ...game.setupBuffer,
      pendingPlayer: {
        userId: interaction.user.id,
        username: interaction.user.globalName || interaction.user.username,
        startedAt: new Date().toISOString(),
        selectedRace: game.setupBuffer?.pendingPlayer?.userId === interaction.user.id ? game.setupBuffer.pendingPlayer.selectedRace || null : null,
        selectedClass: game.setupBuffer?.pendingPlayer?.userId === interaction.user.id ? game.setupBuffer.pendingPlayer.selectedClass || null : null,
      },
    }
    await storage.saveGame(scope, game)
    storage.setCachedGame(scope, game)

    await interaction.reply({
      content: buildJoinSelectionContent(game.setupBuffer.pendingPlayer),
      components: buildJoinSelectionComponents(game.setupBuffer.pendingPlayer),
      ephemeral: true,
    })
  }

  async function handleStatusCommand(interaction, scope) {
    const game = await storage.getGame(scope)
    if (!game || game.players.length === 0) {
      await interaction.reply({
        content: 'No hay personajes creados todavia en este scope de Discord.',
        ephemeral: true,
      })
      return
    }

    await interaction.reply({
      content: toDiscordMarkdown(formatPartyStatus(game.players)),
    })
  }

  async function handleDonateCommand(interaction) {
    const providers = getDonationProviders()
    if (providers.length === 0) {
      await interaction.reply({
        content: 'Todavia no he configurado enlaces de donacion. Cuando los tengas, este comando mostrara Stripe y PayPal.',
        ephemeral: true,
      })
      return
    }

    await interaction.reply({
      content: toDiscordMarkdown(buildDonationMessage()),
      components: buildDonationButtonRows(providers),
      ephemeral: true,
    })
  }

  async function handleXpCommand(interaction, scope) {
    const game = await storage.getGame(scope)
    if (!game || game.players.length === 0) {
      await interaction.reply({
        content: 'No hay partida activa en este scope.',
        ephemeral: true,
      })
      return
    }

    await interaction.reply({
      content: toDiscordMarkdown(formatXpSummary(game.players)),
    })
  }

  async function handleAbilitiesCommand(interaction, scope) {
    const game = await storage.getGame(scope)
    if (!game || game.players.length === 0) {
      await interaction.reply({
        content: 'No hay partida activa en este scope.',
        ephemeral: true,
      })
      return
    }

    await interaction.reply({
      content: toDiscordMarkdown(formatAbilitiesSummary(game.players)),
    })
  }

  async function handleMemoryCommand(interaction, scope) {
    const game = await storage.getGame(scope)
    if (!game || !game.worldMemory?.length) {
      await interaction.reply({
        content: 'Todavia no hay memoria guardada en este scope.',
        ephemeral: true,
      })
      return
    }

    await interaction.reply({
      content: toDiscordMarkdown(formatMemorySummary(game.worldMemory)),
    })
  }

  async function handleChronicleCommand(interaction, scope) {
    const game = await storage.getGame(scope)
    if (!game || game.players.length === 0) {
      await interaction.reply({
        content: 'No hay una aventura en curso en este scope.',
        ephemeral: true,
      })
      return
    }

    const entries = await storage.getChronicleEntries(scope)
    if (!entries.length) {
      await interaction.reply({
        content: 'La cronica todavia esta vacia.',
        ephemeral: true,
      })
      return
    }

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
    const attachment = new AttachmentBuilder(Buffer.from(header + body + footer, 'utf-8'), {
      name: 'cronica_aventura.txt',
    })

    await interaction.reply({
      files: [attachment],
    })
  }

  async function handleContinueCommand(interaction, scope) {
    const game = await storage.loadGame(scope)
    if (!game || game.phase !== 'adventure') {
      await interaction.reply({
        content: 'No hay una partida de aventura guardada en este canal o hilo. Usa /nueva.',
        ephemeral: true,
      })
      return
    }

    if (!isDiscordPlayerInGame(game, interaction.user.id)) {
      await interaction.reply({
        content: 'Solo los jugadores registrados en esta partida pueden continuar la aventura.',
        ephemeral: true,
      })
      return
    }

    storage.setCachedGame(scope, game)
    await interaction.reply({
      content: 'Reanudando la aventura en este scope de Discord...',
      ephemeral: true,
    })
    await adventureHandlers.continueAdventure(scope, game, interaction.inGuild())
  }

  async function handleFollowCommand(interaction, scope) {
    const game = await storage.loadGame(scope)
    if (!game || game.phase !== 'adventure') {
      await interaction.reply({
        content: 'No hay una escena activa para continuar. Usa /nueva o /continuar.',
        ephemeral: true,
      })
      return
    }

    if (!isDiscordPlayerInGame(game, interaction.user.id)) {
      await interaction.reply({
        content: 'Solo los jugadores registrados en esta partida pueden empujar la escena hacia adelante.',
        ephemeral: true,
      })
      return
    }

    storage.setCachedGame(scope, game)
    await interaction.reply({
      content: 'Pidiendo al director de juego que continue la escena...',
      ephemeral: true,
    })
    await adventureHandlers.forceContinueNarration(scope, game, interaction.inGuild())
  }

  async function handleActCommand(interaction, scope) {
    const game = await storage.getGame(scope)
    if (!game || game.phase !== 'adventure') {
      await interaction.reply({
        content: 'No hay una aventura activa en este canal o hilo. Usa /nueva o /continuar.',
        ephemeral: true,
      })
      return
    }

    if (!isDiscordPlayerInGame(game, interaction.user.id)) {
      await interaction.reply({
        content: 'Solo los jugadores registrados en esta partida pueden actuar en la escena.',
        ephemeral: true,
      })
      return
    }

    const text = interaction.options.getString('texto', true).trim()
    const playerCharacter = getPlayerByDiscordUserId(game, interaction.user.id)
    const actorLabel = getDiscordActorLabel(game, interaction.user)
    const userMessage = playerCharacter ? `[${playerCharacter.name}]: ${text}` : `[${actorLabel}]: ${text}`

    await interaction.reply({
      content: `${actorLabel} actua...`,
      ephemeral: true,
    })

    const channel = interaction.channel
    if (channel && typeof channel.send === 'function') {
      await channel.send(`_${actorLabel} actua..._`)
    }

    let reply
    try {
      reply = await callClaude(game, userMessage)
    } catch (error) {
      if (channel && typeof channel.send === 'function') {
        await channel.send(`Error con Claude: \`${error.message}\``).catch(() => {})
      }
      await interaction.followUp({
        content: 'No se pudo procesar la accion con Claude.',
        ephemeral: true,
      }).catch(() => {})
      return
    }

    await adventureHandlers.handleDmReply(scope, game, reply, interaction.inGuild())
    await storage.saveGame(scope, game)
    storage.setCachedGame(scope, game)
  }

  async function handleHelpCommand(interaction) {
    await interaction.reply({
      content: buildHelpMessage(),
      ephemeral: true,
    })
  }

  async function handleChatInputCommand(interaction) {
    const scope = getDiscordScopeFromInteraction(interaction)

    if (interaction.commandName === 'nueva') {
      await handleNewCommand(interaction)
      return
    }

    if (interaction.commandName === 'unirse') {
      await handleJoinCommand(interaction, scope)
      return
    }

    if (interaction.commandName === 'estado') {
      await handleStatusCommand(interaction, scope)
      return
    }

    if (interaction.commandName === 'donar') {
      await handleDonateCommand(interaction)
      return
    }

    if (interaction.commandName === 'xp') {
      await handleXpCommand(interaction, scope)
      return
    }

    if (interaction.commandName === 'habilidades') {
      await handleAbilitiesCommand(interaction, scope)
      return
    }

    if (interaction.commandName === 'memoria') {
      await handleMemoryCommand(interaction, scope)
      return
    }

    if (interaction.commandName === 'cronica') {
      await handleChronicleCommand(interaction, scope)
      return
    }

    if (interaction.commandName === 'continuar') {
      await handleContinueCommand(interaction, scope)
      return
    }

    if (interaction.commandName === 'seguir') {
      await handleFollowCommand(interaction, scope)
      return
    }

    if (interaction.commandName === 'actuar') {
      await handleActCommand(interaction, scope)
      return
    }

    if (interaction.commandName === 'ayuda') {
      await handleHelpCommand(interaction)
    }
  }

  return {
    handleChatInputCommand,
  }
}

module.exports = {
  createDiscordCommandHandlers,
}
