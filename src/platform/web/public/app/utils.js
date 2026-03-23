import { PROFICIENCY_BONUS, XP_TABLE } from './config.js'

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]))
}

export function statModifier(value) {
  if (typeof value !== 'number') return '-'
  const modifier = Math.floor((value - 10) / 2)
  return `${value} (${modifier >= 0 ? '+' : ''}${modifier})`
}

export function makeProgressBar(current, total, size = 10) {
  if (!total || total <= 0) return `[${'#'.repeat(size)}]`
  const safeCurrent = Math.max(0, Math.min(current, total))
  const filled = Math.round((safeCurrent / total) * size)
  return `[${'#'.repeat(filled)}${'-'.repeat(size - filled)}]`
}

export function xpForNextLevel(level) {
  if (!level || level >= 20) return null
  return XP_TABLE[level]
}

export function renderPlayerSheet(player) {
  const level = player.level || 1
  const proficiency = PROFICIENCY_BONUS[level - 1] || 2
  const nextXp = xpForNextLevel(level)
  const stats = player.stats || {}
  const inventory = Array.isArray(player.inventory) && player.inventory.length
    ? player.inventory.slice(0, 4).join(', ')
    : 'Sin equipo destacado'

  const lines = [
    player.name,
    `${player.race} ${player.class} - Nivel ${level}`,
    `HP: ${player.hp}/${player.maxHp} ${makeProgressBar(player.hp, player.maxHp)}`,
    `CA: ${player.ac} - Competencia: +${proficiency}`,
    `FUE ${statModifier(stats.str)} - DES ${statModifier(stats.dex)} - CON ${statModifier(stats.con)}`,
    `INT ${statModifier(stats.int)} - SAB ${statModifier(stats.wis)} - CAR ${statModifier(stats.cha)}`,
    nextXp ? `XP: ${player.xp || 0}/${nextXp}` : `XP: ${player.xp || 0} (maximo)`,
    `Equipo: ${inventory}`,
    `Rasgo: ${player.trait || 'Sin rasgo destacado'}`,
  ]

  return `
    <article class="player-card player-sheet">
      <pre class="player-sheet-text">${esc(lines.join('\n'))}</pre>
    </article>
  `
}

export function formatDonationMessage(message) {
  return String(message || '')
    .replace(/\*/g, '')
    .replace(/^- /gm, '')
    .trim()
}

export function generateActorId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID()
  return `actor-${Date.now()}-${Math.random().toString(36).slice(2)}`
}
