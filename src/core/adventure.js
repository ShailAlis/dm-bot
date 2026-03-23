const { getEligibleVoterIds } = require('./voting')

function createAdventureHandlers({
  storage,
  parseDMCommands,
  generateWorldContext,
  callClaude,
  clearPendingPlayer,
  saveGame,
  saveWorldContext,
  sendTyping,
  sendMessage,
  sendActions,
  sendVote,
  sendLevelUp,
  sendClaudeError,
  formatPartyStatus,
  formatMemoryHighlights,
  formatDirectorMessage,
  formatRoll,
  getPlayerVoterId,
  logError = console.error,
}) {
  async function handleDmReply(scopeId, game, reply, groupPlay = false) {
    const { clean, rolls, actions, levelUps, voteData } = await parseDMCommands(scopeId, game, reply, storage)
    const formattedNarration = formatDirectorMessage(clean)

    for (const currentRoll of rolls) {
      await sendMessage(scopeId, formatRoll(currentRoll))
    }

    for (const levelUp of levelUps) {
      await sendLevelUp(scopeId, levelUp)
    }

    const voterIds = getEligibleVoterIds(game.players, getPlayerVoterId)
    if (voteData.active && voterIds.length >= 2) {
      await sendMessage(scopeId, formattedNarration)
      await sendVote(scopeId, voteData.question, voteData.options, voterIds)
      return
    }

    if (groupPlay && voterIds.length >= 2 && actions.length >= 2) {
      await sendMessage(scopeId, formattedNarration)
      await sendVote(scopeId, 'Que hace el grupo?', actions, voterIds)
      return
    }

    const fallbackActions = voteData.active && voteData.options.length > 0 ? voteData.options : actions
    await sendActions(scopeId, formattedNarration, fallbackActions)
  }

  async function startAdventure(scopeId, game, groupPlay = false) {
    try {
      game.phase = 'adventure'
      game.history = []
      clearPendingPlayer(game)

      try {
        if (!game.worldContext) {
          game.worldContext = generateWorldContext()
        }
        await saveWorldContext(scopeId, game.worldContext)
      } catch (error) {
        logError('No se pudo generar o guardar el contexto del mundo:', error)
        game.worldContext = null
      }

      await saveGame(scopeId, game)

      await sendTyping(scopeId)
      await sendMessage(scopeId, `*La aventura comienza*\n\n${formatPartyStatus(game.players)}`)

      const names = game.players
        .map((player) => `${player.name} (${player.race} ${player.class}, motivacion: "${player.motivation}")`)
        .join(', ')

      const reply = await callClaude(
        game,
        `Comienza la aventura para: ${names}. Crea una escena de apertura misteriosa y deja la primera decision en sus manos.`,
      )

      await handleDmReply(scopeId, game, reply, groupPlay)
      await saveGame(scopeId, game)
    } catch (error) {
      logError('Error en startAdventure:', error)
      await sendMessage(scopeId, 'La aventura ha comenzado, pero hubo un problema al preparar la primera escena. Usa /continuar para seguir.')
      await saveGame(scopeId, game)
    }
  }

  async function continueAdventure(scopeId, game, groupPlay = false) {
    await sendMessage(scopeId, `*Continuando la aventura*\n\n${formatPartyStatus(game.players)}`)

    if (game.worldMemory?.length) {
      await sendMessage(scopeId, formatMemoryHighlights(game.worldMemory))
    }

    await sendTyping(scopeId)
    let reply
    try {
      reply = await callClaude(game, 'Retoma la aventura con un breve resumen de lo ocurrido y plantea la situacion actual.')
    } catch (error) {
      await sendClaudeError(scopeId, error)
      return
    }

    await handleDmReply(scopeId, game, reply, groupPlay)
    await saveGame(scopeId, game)
  }

  async function forceContinueNarration(scopeId, game, groupPlay = false) {
    await sendTyping(scopeId)

    let reply
    try {
      reply = await callClaude(
        game,
        'La narracion anterior se ha quedado a medias. Continua inmediatamente desde el ultimo instante, sin resumir ni reiniciar la escena. Avanza solo un poco, deja claro que los jugadores siguen teniendo la iniciativa y termina siempre con 2 o 3 decisiones concretas que sus personajes puedan tomar ahora mismo.',
      )
    } catch (error) {
      await sendClaudeError(scopeId, error)
      return
    }

    await handleDmReply(scopeId, game, reply, groupPlay)
    await saveGame(scopeId, game)
  }

  return {
    handleDmReply,
    startAdventure,
    continueAdventure,
    forceContinueNarration,
  }
}

module.exports = {
  createAdventureHandlers,
}
