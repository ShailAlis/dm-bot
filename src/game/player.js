const { HIT_DICE, getModifier, normalizeClassKey } = require('./rules')

const STAT_PRIORITY = {
  guerrero: [0, 2, 1, 4, 3, 5],
  mago: [3, 1, 2, 4, 0, 5],
  picaro: [1, 0, 2, 3, 4, 5],
  clerigo: [4, 2, 1, 0, 3, 5],
  barbaro: [0, 2, 1, 5, 3, 4],
  bardo: [5, 1, 2, 3, 4, 0],
  druida: [4, 2, 1, 3, 0, 5],
  explorador: [1, 0, 2, 4, 3, 5],
  paladin: [0, 5, 2, 3, 4, 1],
  hechicero: [5, 1, 2, 3, 4, 0],
  brujo: [5, 1, 2, 3, 4, 0],
  monje: [4, 0, 2, 3, 1, 5],
}

const STARTING_ITEMS = {
  guerrero: ['Espada larga', 'Escudo', 'Armadura de placas'],
  mago: ['Baston arcano', 'Libro de hechizos', 'Daga'],
  picaro: ['Espadas cortas x2', 'Herramientas de ladron', 'Capa oscura'],
  clerigo: ['Maza', 'Escudo sagrado', 'Simbolo sagrado'],
  barbaro: ['Hacha de guerra', 'Jabalinas x4'],
  bardo: ['Laud', 'Espada corta', 'Kit de disfraz'],
  druida: ['Baston druidico', 'Hierbas medicinales'],
  explorador: ['Arco largo', 'Espada corta', 'Kit de supervivencia'],
  paladin: ['Espada bastarda', 'Escudo', 'Simbolo sagrado'],
  hechicero: ['Foco arcano', 'Daga', 'Amuleto familiar'],
  brujo: ['Foco arcano', 'Daga', 'Pergamino del pacto'],
  monje: ['Dardos x10', 'Baston'],
}

function roll(sides) {
  return Math.floor(Math.random() * sides) + 1
}

function generateStats(playerClass) {
  const base = [15, 14, 13, 12, 10, 8].sort(() => Math.random() - 0.5)
  const order = STAT_PRIORITY[normalizeClassKey(playerClass)] || [0, 1, 2, 3, 4, 5]
  const keys = ['str', 'dex', 'con', 'int', 'wis', 'cha']
  const stats = {}

  keys.forEach((key, index) => {
    stats[key] = base[order[index]]
  })

  return stats
}

function generateHitPoints(playerClass, constitutionScore) {
  const hitDice = HIT_DICE[normalizeClassKey(playerClass)] || 8
  return hitDice + getModifier(constitutionScore)
}

function generateArmorClass(playerClass, dexterityScore) {
  const normalizedClass = normalizeClassKey(playerClass)

  if (['guerrero', 'paladin'].includes(normalizedClass)) return 16
  if (['clerigo', 'explorador', 'barbaro'].includes(normalizedClass)) {
    return 13 + Math.min(getModifier(dexterityScore), 2)
  }

  return 10 + getModifier(dexterityScore)
}

function generateItems(playerClass) {
  return STARTING_ITEMS[normalizeClassKey(playerClass)] || ['Mochila', 'Antorcha']
}

function createPlayer(
  name,
  race,
  playerClass,
  background,
  trait,
  motivation,
  telegramUserId = null,
  telegramUsername = null,
) {
  const stats = generateStats(playerClass)
  const maxHp = generateHitPoints(playerClass, stats.con)

  return {
    name,
    race,
    class: playerClass,
    background,
    trait,
    motivation,
    hp: maxHp,
    maxHp,
    ac: generateArmorClass(playerClass, stats.dex),
    stats,
    inventory: generateItems(playerClass),
    conditions: [],
    xp: 0,
    level: 1,
    abilities: [],
    telegramUserId,
    telegramUsername,
  }
}

module.exports = {
  roll,
  createPlayer,
}
