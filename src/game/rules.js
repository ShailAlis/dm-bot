const XP_TABLE = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
  85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000,
]

const PROFICIENCY_BONUS = [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6]

const CLASS_ABILITIES = {
  guerrero: {
    2: 'Estilo de combate adicional',
    3: 'Arquetipo marcial elegido',
    4: 'Mejora de característica',
    5: 'Ataque extra (2 ataques por acción)',
    6: 'Mejora de característica',
    7: 'Rasgo de arquetipo marcial',
    9: 'Indomable (1/descanso largo)',
    10: 'Rasgo de arquetipo marcial',
    11: 'Ataque extra (3 ataques por acción)',
  },
  mago: {
    2: 'Recuperación arcana',
    3: 'Tradición arcana elegida',
    4: 'Mejora de característica',
    5: 'Conjuros de nivel 3 desbloqueados',
    6: 'Rasgo de tradición arcana',
    7: 'Conjuros de nivel 4 desbloqueados',
    9: 'Conjuros de nivel 5 desbloqueados',
    10: 'Rasgo de tradición arcana',
  },
  pícaro: {
    2: 'Acción astuta',
    3: 'Arquetipo pícaro elegido',
    4: 'Mejora de característica',
    5: 'Ataque furtivo mejorado (3d6)',
    6: 'Pericia en Engaño y Persuasión',
    7: 'Evasión',
    9: 'Habilidad suprema',
    10: 'Mejora de característica',
  },
  clérigo: {
    2: 'Canalizar divinidad (1/descanso)',
    3: 'Conjuros de nivel 2 desbloqueados',
    4: 'Mejora de característica',
    5: 'Destruir no-muertos mejorado',
    6: 'Canalizar divinidad (2/descanso)',
    7: 'Rasgo de dominio divino',
    9: 'Conjuros de nivel 5 desbloqueados',
    10: 'Intervención divina',
  },
  bárbaro: {
    2: 'Ataque descuidado y Sentido del peligro',
    3: 'Sendero primitivo elegido',
    4: 'Mejora de característica',
    5: 'Ataque extra y Movimiento rápido',
    6: 'Rasgo de sendero primitivo',
    7: 'Instinto salvaje',
    9: 'Mejora de furia bruta',
    10: 'Mente intimidante',
  },
  paladín: {
    2: 'Imposición de manos mejorada y Sentido divino',
    3: 'Juramento sagrado elegido',
    4: 'Mejora de característica',
    5: 'Ataque extra y conjuros de nivel 2',
    6: 'Aura de protección',
    7: 'Rasgo de juramento sagrado',
    9: 'Conjuros de nivel 3 desbloqueados',
    10: 'Aura de valor',
  },
}

const HIT_DICE = {
  guerrero: 10,
  mago: 6,
  pícaro: 8,
  clérigo: 8,
  bárbaro: 12,
  bardo: 8,
  druida: 8,
  explorador: 10,
  paladín: 10,
  hechicero: 6,
  brujo: 8,
  monje: 8,
}

function getLevelFromXP(xp) {
  for (let i = XP_TABLE.length - 1; i >= 0; i -= 1) {
    if (xp >= XP_TABLE[i]) return i + 1
  }
  return 1
}

function xpForNextLevel(level) {
  if (level >= 20) return null
  return XP_TABLE[level]
}

function getNewAbilities(playerClass, oldLevel, newLevel) {
  const abilities = CLASS_ABILITIES[playerClass.toLowerCase()] || {}
  const gained = []

  for (let level = oldLevel + 1; level <= newLevel; level += 1) {
    if (abilities[level]) gained.push(`Nivel ${level}: ${abilities[level]}`)
  }

  return gained
}

function getModifier(score) {
  return Math.floor((score - 10) / 2)
}

function hpGainOnLevelUp(playerClass, constitutionScore) {
  const hitDice = HIT_DICE[playerClass.toLowerCase()] || 8
  const roll = Math.floor(Math.random() * hitDice) + 1
  return Math.max(1, roll + getModifier(constitutionScore))
}

module.exports = {
  PROFICIENCY_BONUS,
  HIT_DICE,
  getLevelFromXP,
  xpForNextLevel,
  getNewAbilities,
  getModifier,
  hpGainOnLevelUp,
}
