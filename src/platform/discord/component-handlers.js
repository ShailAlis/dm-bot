const { createPlayer } = require('../../game/player')
const { formatVoteProgress, formatVoteResult } = require('../../game/formatters')
const { clearPendingPlayer, resolveRaceValue, resolveClassValue } = require('../../core/setup')
const { computeVoteOutcome } = require('../../core/voting')
const { callClaude } = require('../../services/dm')
const {
  JOIN_MODAL_ID,
  JOIN_RACE_SELECT_ID,
  JOIN_CLASS_SELECT_ID,
  JOIN_CONTINUE_BUTTON_ID,
  VOTE_BUTTON_PREFIX,
  ACTION_BUTTON_PREFIX,
} = require('./constants')
const { getDiscordScopeFromChannel, getDiscordScopeFromInteraction } = require('./scope')
const {
  buildJoinModal,
  buildJoinSelectionComponents,
  buildJoinSelectionContent,
  getDiscordActorLabel,
  getPlayerByDiscordUserId,
  isDiscordPlayerInGame,
  isPendingPlayerExpired,
  logDiscordInteractionError,
  parseCharacterDetails,
  toDiscordMarkdown,
} = require('./utils')
const { createPrivateAdventureThread, closePreparationThread } = require('./threads')

function createDiscordComponentHandlers({ storage, adventureHandlers, logError = console.error }) {
  async function handleJoinModal(interaction) {
    const scope = getDiscordScopeFromInteraction(interaction)
    const game = await storage.getGame(scope)

    if (!game || game.phase !== 'setup') {
      await interaction.reply({
        content: 'No hay una partida en configuracion en este canal o hilo. Usa /nueva primero.',
        ephemeral: true,
      })
      return true
    }

    if (!game.numPlayers) {
      await interaction.reply({
        content: 'La partida aun no tiene numero de jugadores configurado.',
        ephemeral: true,
      })
      return true
    }

    if (game.players.length >= game.numPlayers) {
      await interaction.reply({
        content: 'La partida ya tiene todos los personajes necesarios.',
        ephemeral: true,
      })
      return true
    }

    const pendingPlayer = game.setupBuffer?.pendingPlayer
    if (pendingPlayer && isPendingPlayerExpired(pendingPlayer)) {
      clearPendingPlayer(game)
    }

    const platformUserId = interaction.user.id
    if (pendingPlayer && String(pendingPlayer.userId) !== String(platformUserId)) {
      await interaction.reply({
        content: `${pendingPlayer.username} esta creando personaje ahora mismo. Cuando termine, usa /unirse.`,
        ephemeral: true,
      })
      return true
    }

    if (!pendingPlayer?.selectedRace || !pendingPlayer?.selectedClass) {
      await interaction.reply({
        content: 'Antes de completar el personaje debes elegir una raza y una clase desde los desplegables.',
        ephemeral: true,
      })
      return true
    }

    if (game.players.some((player) => player.platformUserId === platformUserId || player.telegramUserId === platformUserId)) {
      await interaction.reply({
        content: 'Ya tienes un personaje en esta partida.',
        ephemeral: true,
      })
      return true
    }

    const details = parseCharacterDetails(interaction.fields.getTextInputValue('details'))
    const player = createPlayer(
      interaction.fields.getTextInputValue('name').trim(),
      resolveRaceValue(pendingPlayer.selectedRace),
      resolveClassValue(pendingPlayer.selectedClass),
      interaction.fields.getTextInputValue('background').trim(),
      details.trait,
      details.motivation,
    )

    player.platform = 'discord'
    player.platformUserId = interaction.user.id
    player.platformUsername = interaction.user.username

    game.players.push(player)
    game.setupStep += 1
    game.setupSubStep = 'name'
    game.history = []
    game.scope = scope
    clearPendingPlayer(game)

    if (game.setupStep >= game.numPlayers) {
      await interaction.reply({
        content: `**${player.name}** completa el grupo. Estoy preparando la mesa privada de la aventura...`,
        ephemeral: true,
      })

      let adventureScope = scope
      const privateThread = await createPrivateAdventureThread(interaction, game, logError)

      if (privateThread) {
        adventureScope = getDiscordScopeFromChannel(privateThread)
        game.scope = adventureScope

        await storage.saveGame(adventureScope, game)
        storage.setCachedGame(adventureScope, game)
        await storage.deleteGame(scope)
        storage.clearCachedGame(scope)

        await closePreparationThread(interaction.channel, privateThread.id, logError)

        if (typeof privateThread.send === 'function') {
          await privateThread.send([
            `**Mesa privada lista** para ${game.players.length} jugador(es).`,
            'A partir de ahora solo los personajes registrados y el bot deberian participar aqui.',
          ].join('\n')).catch(() => {})
        }
      } else {
        await storage.saveGame(scope, game)
        storage.setCachedGame(scope, game)

        await interaction.followUp({
          content: 'No pude cerrar la mesa en un hilo privado, asi que seguire en este hilo con restriccion logica de jugador.',
          ephemeral: true,
        }).catch(() => {})
      }

      await adventureHandlers.startAdventure(adventureScope, game, interaction.inGuild())
    } else {
      await storage.saveGame(scope, game)
      storage.setCachedGame(scope, game)

      await interaction.reply({
        content: `**${player.name}** se une a la aventura como ${player.race} ${player.class} de nivel 1.`,
      })

      await interaction.followUp({
        content: `Personaje ${game.setupStep} de ${game.numPlayers} completado. El siguiente jugador puede usar /unirse.`,
      })
    }

    return true
  }

  async function handleJoinSelect(interaction) {
    const scope = getDiscordScopeFromInteraction(interaction)
    const game = await storage.getGame(scope)

    if (!game || game.phase !== 'setup') {
      await interaction.reply({
        content: 'No hay una partida en configuracion en este canal o hilo. Usa /nueva primero.',
        ephemeral: true,
      })
      return true
    }

    const pendingPlayer = game.setupBuffer?.pendingPlayer
    if (!pendingPlayer || String(pendingPlayer.userId) !== String(interaction.user.id)) {
      await interaction.reply({
        content: 'Ahora mismo no eres quien esta creando personaje en esta partida. Usa /unirse para empezar tu turno.',
        ephemeral: true,
      })
      return true
    }

    if (isPendingPlayerExpired(pendingPlayer)) {
      clearPendingPlayer(game)
      await storage.saveGame(scope, game)
      storage.setCachedGame(scope, game)
      await interaction.reply({
        content: 'Tu turno de creacion habia caducado. Usa /unirse para retomarlo.',
        ephemeral: true,
      })
      return true
    }

    const selectedValue = interaction.values?.[0]
    if (interaction.customId === JOIN_RACE_SELECT_ID) {
      pendingPlayer.selectedRace = resolveRaceValue(selectedValue)
    }

    if (interaction.customId === JOIN_CLASS_SELECT_ID) {
      pendingPlayer.selectedClass = resolveClassValue(selectedValue)
    }

    game.setupBuffer = { ...game.setupBuffer, pendingPlayer }
    await storage.saveGame(scope, game)
    storage.setCachedGame(scope, game)

    await interaction.update({
      content: buildJoinSelectionContent(pendingPlayer),
      components: buildJoinSelectionComponents(pendingPlayer),
    })
    return true
  }

  async function handleJoinContinue(interaction) {
    const scope = getDiscordScopeFromInteraction(interaction)
    const game = await storage.getGame(scope)

    if (!game || game.phase !== 'setup') {
      await interaction.reply({
        content: 'No hay una partida en configuracion en este canal o hilo. Usa /nueva primero.',
        ephemeral: true,
      })
      return true
    }

    const pendingPlayer = game.setupBuffer?.pendingPlayer
    if (!pendingPlayer || String(pendingPlayer.userId) !== String(interaction.user.id)) {
      await interaction.reply({
        content: 'Ahora mismo no eres quien esta creando personaje en esta partida. Usa /unirse para empezar tu turno.',
        ephemeral: true,
      })
      return true
    }

    if (!pendingPlayer.selectedRace || !pendingPlayer.selectedClass) {
      await interaction.reply({
        content: 'Primero debes elegir una raza y una clase.',
        ephemeral: true,
      })
      return true
    }

    await interaction.showModal(buildJoinModal())
    return true
  }

  async function handleVoteButton(interaction) {
    let voteStep = 'cargando scope de votacion'

    try {
      const scope = getDiscordScopeFromInteraction(interaction)

      voteStep = 'buscando la votacion activa'
      const vote = await storage.getActiveVote(scope)

      if (!vote) {
        await interaction.reply({
          content: 'No hay una votacion activa en este scope.',
          ephemeral: true,
        })
        return true
      }

      voteStep = 'validando la opcion elegida'
      const optionIndex = Number.parseInt(interaction.customId.slice(VOTE_BUTTON_PREFIX.length), 10)
      const choice = vote.options?.[optionIndex]

      if (!choice) {
        await interaction.reply({
          content: 'La opcion de voto ya no es valida.',
          ephemeral: true,
        })
        return true
      }

      const requiredVoters = (vote.required_voters || []).map(String)
      if (!requiredVoters.includes(String(interaction.user.id))) {
        await interaction.reply({
          content: 'Solo los jugadores de esta partida pueden votar en esta decision.',
          ephemeral: true,
        })
        return true
      }

      voteStep = 'confirmando el voto al usuario'
      await interaction.reply({
        content: `Has votado: "${choice}"`,
        ephemeral: true,
      })

      voteStep = 'registrando el voto en storage'
      const result = await storage.castVote(scope, interaction.user.id, choice)
      if (!result) {
        throw new Error('storage.castVote devolvio null')
      }

      const channel = interaction.channel
      if (channel && typeof channel.send === 'function') {
        voteStep = 'anunciando el voto en el hilo'
        const game = await storage.getGame(scope)
        const actorLabel = getDiscordActorLabel(game, interaction.user)
        await channel.send(toDiscordMarkdown(formatVoteProgress(actorLabel, choice)))
      }

      if (!result.allVoted) return true

      voteStep = 'limpiando la votacion completada'
      await storage.clearVote(scope)

      voteStep = 'calculando el resultado de la votacion'
      const { winner, summary } = computeVoteOutcome(result.vote.votes)
      if (channel && typeof channel.send === 'function') {
        voteStep = 'anunciando el resultado de la votacion'
        await channel.send(toDiscordMarkdown(formatVoteResult(summary, winner)))
      }

      voteStep = 'recuperando la partida para aplicar consecuencias'
      const game = await storage.getGame(scope)
      if (!game || game.phase !== 'adventure') return true

      voteStep = 'pidiendo consecuencias a Claude'
      let reply
      try {
        reply = await callClaude(game, `El grupo ha decidido por votacion: "${winner}". Narra las consecuencias.`)
      } catch (error) {
        if (channel && typeof channel.send === 'function') {
          await channel.send(`Error con Claude: \`${error.message}\``).catch(() => {})
        }
        return true
      }

      voteStep = 'procesando la respuesta del director de juego'
      await adventureHandlers.handleDmReply(scope, game, reply, interaction.inGuild())

      voteStep = 'guardando la partida tras la votacion'
      await storage.saveGame(scope, game)
      storage.setCachedGame(scope, game)
      return true
    } catch (error) {
      logDiscordInteractionError(`Error en votacion de Discord durante: ${voteStep}`, interaction, error, logError)

      const detailedMessage = `Error en la votacion durante "${voteStep}": ${error.message}`
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: detailedMessage,
          ephemeral: true,
        }).catch(() => {})
      } else {
        await interaction.reply({
          content: detailedMessage,
          ephemeral: true,
        }).catch(() => {})
      }
      return true
    }
  }

  async function handleActionButton(interaction) {
    const scope = getDiscordScopeFromInteraction(interaction)
    const game = await storage.getGame(scope)
    if (!game || game.phase !== 'adventure') {
      await interaction.reply({
        content: 'No hay una aventura activa en este scope.',
        ephemeral: true,
      })
      return true
    }

    if (!isDiscordPlayerInGame(game, interaction.user.id)) {
      await interaction.reply({
        content: 'Solo los jugadores registrados en esta partida pueden actuar en este hilo.',
        ephemeral: true,
      })
      return true
    }

    const text = decodeURIComponent(interaction.customId.slice(ACTION_BUTTON_PREFIX.length))
    const playerCharacter = getPlayerByDiscordUserId(game, interaction.user.id)
    const actorLabel = getDiscordActorLabel(game, interaction.user)
    const userMessage = playerCharacter ? `[${playerCharacter.name}]: ${text}` : `[${actorLabel}]: ${text}`

    await interaction.reply({
      content: `Has elegido: "${text}"`,
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
      return true
    }

    await adventureHandlers.handleDmReply(scope, game, reply, interaction.inGuild())
    await storage.saveGame(scope, game)
    storage.setCachedGame(scope, game)
    return true
  }

  async function handleNonCommandInteraction(interaction) {
    if (interaction.isModalSubmit() && interaction.customId === JOIN_MODAL_ID) {
      return handleJoinModal(interaction)
    }

    if (interaction.isStringSelectMenu() && [JOIN_RACE_SELECT_ID, JOIN_CLASS_SELECT_ID].includes(interaction.customId)) {
      return handleJoinSelect(interaction)
    }

    if (interaction.isButton() && interaction.customId === JOIN_CONTINUE_BUTTON_ID) {
      return handleJoinContinue(interaction)
    }

    if (interaction.isButton() && interaction.customId.startsWith(VOTE_BUTTON_PREFIX)) {
      return handleVoteButton(interaction)
    }

    if (interaction.isButton() && interaction.customId.startsWith(ACTION_BUTTON_PREFIX)) {
      return handleActionButton(interaction)
    }

    return false
  }

  return {
    handleNonCommandInteraction,
  }
}

module.exports = {
  createDiscordComponentHandlers,
}
