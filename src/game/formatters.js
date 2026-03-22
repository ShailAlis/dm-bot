const { PROFICIENCY_BONUS, xpForNextLevel } = require('./rules')

function makeProgressBar(current, total, size = 10) {
  if (!total || total <= 0) return `[${'#'.repeat(size)}]`

  const safeCurrent = Math.max(0, Math.min(current, total))
  const filled = Math.round((safeCurrent / total) * size)
  return `[${'#'.repeat(filled)}${'-'.repeat(size - filled)}]`
}

function formatPlayerCard(player) {
  const nextXp = xpForNextLevel(player.level || 1)
  const proficiency = PROFICIENCY_BONUS[(player.level || 1) - 1]
  const stats = player.stats || {}

  return [
    `*${player.name}*`,
    `${player.race} ${player.class} - Nivel ${player.level || 1}`,
    `HP: ${player.hp}/${player.maxHp} ${makeProgressBar(player.hp, player.maxHp)}`,
    `CA: ${player.ac} - Competencia: +${proficiency}`,
    `FUE ${stats.str ?? '-'} - DES ${stats.dex ?? '-'} - CON ${stats.con ?? '-'}`,
    `INT ${stats.int ?? '-'} - SAB ${stats.wis ?? '-'} - CAR ${stats.cha ?? '-'}`,
    nextXp ? `XP: ${player.xp}/${nextXp}` : `XP: ${player.xp} (maximo)`,
    `Equipo: ${player.inventory.slice(0, 4).join(', ') || 'Sin equipo destacado'}`,
    `Rasgo: ${player.trait}`,
  ].join('\n')
}

function formatPartyStatus(players) {
  return `*Estado del grupo*\n\n${players.map(formatPlayerCard).join('\n\n')}`
}

function formatXpSummary(players) {
  const lines = ['*Experiencia del grupo*', '']

  players.forEach((player) => {
    const nextXp = xpForNextLevel(player.level || 1)
    const bar = makeProgressBar(player.xp || 0, nextXp || player.xp || 1)
    lines.push(`*${player.name}* - Nivel ${player.level || 1}`)
    lines.push(nextXp ? `${player.xp || 0}/${nextXp} XP ${bar}` : `${player.xp || 0} XP ${bar}`)
    lines.push('')
  })

  return lines.join('\n').trim()
}

function formatAbilitiesSummary(players) {
  const lines = ['*Habilidades del grupo*', '']

  players.forEach((player) => {
    lines.push(`*${player.name}* (${player.class} - Nivel ${player.level || 1})`)
    if (!player.abilities || player.abilities.length === 0) {
      lines.push('_Sin habilidades especiales todavia_')
    } else {
      player.abilities.forEach((ability) => lines.push(`- ${ability}`))
    }
    lines.push('')
  })

  return lines.join('\n').trim()
}

function formatMemorySummary(worldMemory) {
  const decisions = worldMemory.filter((entry) => entry.type === 'decision').slice(0, 5)
  const locations = worldMemory.filter((entry) => entry.type === 'location').slice(0, 5)
  const npcs = worldMemory.filter((entry) => entry.type === 'npc').slice(0, 5)
  const lines = ['*Memoria de la aventura*']

  if (decisions.length) {
    lines.push('')
    lines.push('*Decisiones*')
    decisions.forEach((entry) => lines.push(`- ${entry.title}: _${entry.description}_`))
  }

  if (locations.length) {
    lines.push('')
    lines.push('*Lugares*')
    locations.forEach((entry) => lines.push(`- ${entry.title}: _${entry.description}_`))
  }

  if (npcs.length) {
    lines.push('')
    lines.push('*NPCs*')
    npcs.forEach((entry) => lines.push(`- ${entry.title}: _${entry.description}_`))
  }

  return lines.join('\n')
}

function formatMemoryHighlights(worldMemory) {
  const decisions = worldMemory.filter((entry) => entry.type === 'decision').slice(0, 3)
  const locations = worldMemory.filter((entry) => entry.type === 'location').slice(0, 3)
  const npcs = worldMemory.filter((entry) => entry.type === 'npc').slice(0, 3)
  const lines = ['*Resumen de memoria*']

  if (decisions.length) lines.push(`Decisiones: ${decisions.map((entry) => entry.title).join(', ')}`)
  if (locations.length) lines.push(`Lugares: ${locations.map((entry) => entry.title).join(', ')}`)
  if (npcs.length) lines.push(`NPCs: ${npcs.map((entry) => entry.title).join(', ')}`)

  return lines.join('\n')
}

function formatDirectorMessage(text) {
  return `*Director de juego*\n\n${text}`
}

function formatLevelUp(levelUp) {
  const lines = [
    `*${levelUp.name}* sube a nivel ${levelUp.newLevel}`,
    '',
    `HP maximo: +${levelUp.hpGain}`,
    `XP total: ${levelUp.xp}`,
  ]

  if (levelUp.abilities.length > 0) {
    lines.push('')
    lines.push('*Nuevas habilidades*')
    levelUp.abilities.forEach((ability) => lines.push(`- ${ability}`))
  }

  return lines.join('\n')
}

function formatRoll(roll) {
  let suffix = ''
  if (roll.resultado === 20) suffix = ' - critico'
  if (roll.resultado === 1) suffix = ' - pifia'
  if (roll.dificultad) {
    const outcome = roll.resultado >= roll.dificultad ? ' - superada' : ' - fallida'
    return `Tirada de *${roll.tipo}* contra CD *${roll.dificultad}*: *${roll.resultado}*/20${suffix}${outcome}`
  }

  return `Tirada de *${roll.tipo}*: *${roll.resultado}*/20${suffix}`
}

function formatVoteProgress(username, choice) {
  return `*${username}* vota: _${choice}_`
}

function formatVoteResult(summary, winner) {
  return `*Votacion completada*\nResultado: ${summary}\n\nDecision del grupo: *${winner}*`
}

module.exports = {
  formatPartyStatus,
  formatXpSummary,
  formatAbilitiesSummary,
  formatMemorySummary,
  formatMemoryHighlights,
  formatDirectorMessage,
  formatLevelUp,
  formatRoll,
  formatVoteProgress,
  formatVoteResult,
}
