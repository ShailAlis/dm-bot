const { HIT_DICE, getModifier } = require('./rules')

const STAT_PRIORITY = {
  guerrero: [0, 2, 1, 4, 3, 5],
  mago: [3, 1, 2, 4, 0, 5],
  pícaro: [1, 0, 2, 3, 4, 5],
  clérigo: [4, 2, 1, 0, 3, 5],
  bárbaro: [0, 2, 1, 5, 3, 4],
  bardo: [5, 1, 2, 3, 4, 0],
  druida: [4, 2, 1, 3, 0, 5],
  explorador: [1, 0, 2, 4, 3, 5],
  paladín: [0, 5, 2, 3, 4, 1],
  hechicero: [5, 1, 2, 3, 4, 0],
  brujo: [5, 1, 2, 3, 4, 0],
  monje: [4, 0, 2, 3, 1, 5],
}

const STARTING_ITEMS = {
  guerrero: ['Espada larga', 'Escudo', 'Armadura de placas'],
  mago: ['Bastón arcano', 'Libro de hechizos', 'Daga'],
  pícaro: ['Espadas cortas x2', 'Herramientas de ladrón', 'Capa oscura'],
  clérigo: ['Maza', 'Escudo sagrado', 'Símbolo sagrado'],
  bárbaro: ['Hacha de guerra', 'Jabalinas x4'],
  bardo: ['Laúd', 'Espada corta', 'Kit de disfraz'],
  druida: ['Bastón druídico', 'Hierbas medicinales'],
  explorador: ['Arco largo', 'Espada corta', 'Kit de supervivencia'],
  paladín: ['Espada bastarda', 'Escudo', 'Símbolo sagrado'],
  hechicero: ['Foco arcano', 'Daga', 'Amuleto familiar'],
  brujo: ['Foco arcano', 'Daga', 'Pergamino del pacto'],
  monje: ['Dardos x10', 'Bastón'],
}

function roll(sides) {
  return Math.floor(Math.random() * sides) + 1
}

function generateStats(playerClass) {
  const base = [15, 14, 13, 12, 10, 8].sort(() => Math.random() - 0.5)
  const order = STAT_PRIORITY[playerClass.toLowerCase()] || [0, 1, 2, 3, 4, 5]
  const keys = ['str', 'dex', 'con', 'int', 'wis', 'cha']
  const stats = {}

  keys.forEach((key, index) => {
    stats[key] = base[order[index]]
  })

  return stats
}

function generateHitPoints(playerClass, constitutionScore) {
  const hitDice = HIT_DICE[playerClass.toLowerCase()] || 8
  return hitDice + getModifier(constitutionScore)
}

function generateArmorClass(playerClass, dexterityScore) {
  const normalizedClass = playerClass.toLowerCase()

  if (['guerrero', 'paladín'].includes(normalizedClass)) return 16
  if (['clérigo', 'explorador', 'bárbaro'].includes(normalizedClass)) {
    return 13 + Math.min(getModifier(dexterityScore), 2)
  }

  return 10 + getModifier(dexterityScore)
}

function generateItems(playerClass) {
  return STARTING_ITEMS[playerClass.toLowerCase()] || ['Mochila', 'Antorcha']
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
