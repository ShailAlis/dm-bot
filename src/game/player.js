const { HIT_DICE, getModifier, normalizeClassKey } = require('./rules')

const STAT_PRIORITY = {
  guerrero: ['str', 'con', 'dex', 'wis', 'cha', 'int'],
  mago: ['int', 'con', 'dex', 'wis', 'cha', 'str'],
  picaro: ['dex', 'int', 'cha', 'con', 'wis', 'str'],
  clerigo: ['wis', 'con', 'str', 'cha', 'dex', 'int'],
  barbaro: ['str', 'con', 'dex', 'wis', 'cha', 'int'],
  bardo: ['cha', 'dex', 'con', 'wis', 'int', 'str'],
  druida: ['wis', 'con', 'dex', 'int', 'cha', 'str'],
  explorador: ['dex', 'wis', 'con', 'str', 'int', 'cha'],
  paladin: ['str', 'cha', 'con', 'wis', 'dex', 'int'],
  hechicero: ['cha', 'con', 'dex', 'wis', 'int', 'str'],
  brujo: ['cha', 'con', 'dex', 'int', 'wis', 'str'],
  monje: ['dex', 'wis', 'con', 'int', 'cha', 'str'],
}

const STAT_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha']

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
  const scores = [16, 15, 13, 11, 10, 8]
  const preferredOrder = STAT_PRIORITY[normalizeClassKey(playerClass)] || STAT_KEYS
  const order = [
    ...preferredOrder.filter((key) => STAT_KEYS.includes(key)),
    ...STAT_KEYS.filter((key) => !preferredOrder.includes(key)),
  ].slice(0, STAT_KEYS.length)
  const stats = {}

  order.forEach((key, index) => {
    stats[key] = scores[index]
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
