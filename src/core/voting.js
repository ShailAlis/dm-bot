function getEligibleVoterIds(players, getPlayerVoterId = (player) => player.telegramUserId) {
  const unique = new Set()
  for (const player of players) {
    const voterId = getPlayerVoterId(player)
    if (voterId) unique.add(voterId)
  }
  return [...unique]
}

function pickRandomItem(items) {
  if (!items || items.length === 0) return null
  return items[Math.floor(Math.random() * items.length)]
}

function computeVoteOutcome(votes, pickWinner = pickRandomItem) {
  const counts = {}
  Object.values(votes || {}).forEach((currentChoice) => {
    counts[currentChoice] = (counts[currentChoice] || 0) + 1
  })

  const entries = Object.entries(counts)
  if (entries.length === 0) {
    return {
      counts,
      winner: null,
      summary: '',
    }
  }

  const sortedCounts = entries.sort((left, right) => right[1] - left[1])
  const topVotes = sortedCounts[0][1]
  const tiedWinners = sortedCounts.filter(([, totalVotes]) => totalVotes === topVotes).map(([option]) => option)

  return {
    counts,
    winner: pickWinner(tiedWinners),
    summary: sortedCounts.map(([option, totalVotes]) => `${option}: ${totalVotes} voto(s)`).join(', '),
  }
}

module.exports = {
  getEligibleVoterIds,
  pickRandomItem,
  computeVoteOutcome,
}
