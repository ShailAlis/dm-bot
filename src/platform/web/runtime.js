const { createAdventureHandlers } = require('../../core/adventure')
const { clearPendingPlayer } = require('../../core/setup')
const { generateWorldContext, callClaude, parseDMCommands } = require('../../services/dm')
const {
  formatPartyStatus,
  formatMemoryHighlights,
  formatDirectorMessage,
  formatLevelUp,
  formatRoll,
  formatVoteProgress,
  formatVoteResult,
} = require('../../game/formatters')

function createWebAdventureHandlers(storage) {
  return createAdventureHandlers({
    storage,
    parseDMCommands,
    generateWorldContext,
    callClaude,
    clearPendingPlayer,
    saveGame: (scope, game) => storage.saveGame(scope, game),
    saveWorldContext: (scope, context) => storage.saveWorldContext(scope, context),
    sendTyping: async () => {},
    sendMessage: async (scope, text) => {
      await storage.addGameEvent(scope, 'message', { text })
    },
    sendActions: async (scope, text, actions) => {
      await storage.addGameEvent(scope, 'actions', { text, actions: actions || [] })
    },
    sendVote: async (scope, question, options, voterIds) => {
      const voteId = await storage.createVote(scope, question, options, voterIds)
      await storage.addGameEvent(scope, 'vote', {
        voteId,
        question,
        options,
        requiredVoters: voterIds,
      })
    },
    sendLevelUp: async (scope, levelUp) => {
      await storage.addGameEvent(scope, 'level_up', {
        levelUp,
        text: formatLevelUp(levelUp),
      })
    },
    sendClaudeError: async (scope, error) => {
      await storage.addGameEvent(scope, 'error', {
        message: error.message,
      })
    },
    formatPartyStatus,
    formatMemoryHighlights,
    formatDirectorMessage,
    formatRoll,
    getPlayerVoterId: (player) => player.platformUserId || player.telegramUserId?.toString() || player.name,
    logError: console.error,
  })
}

async function addVoteProgressEvent(storage, scope, actor, choice) {
  await storage.addGameEvent(scope, 'vote_progress', {
    actor,
    choice,
    text: formatVoteProgress(actor, choice),
  })
}

async function addVoteResultEvent(storage, scope, summary, winner) {
  await storage.addGameEvent(scope, 'vote_result', {
    summary,
    winner,
    text: formatVoteResult(summary, winner),
  })
}

module.exports = {
  createWebAdventureHandlers,
  addVoteProgressEvent,
  addVoteResultEvent,
}
