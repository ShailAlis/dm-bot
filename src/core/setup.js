const SETUP_STEPS = ['name', 'race', 'class', 'background', 'trait', 'motivation', 'confirm']
const PLAYER_COUNT_ACTIONS = ['1 jugador', '2 jugadores', '3 jugadores', '4 jugadores']
const YES_WORDS = new Set(['si', 'sí', 's', 'ok', 'vale', 'confirmar', 'listo'])
const RACE_OPTIONS = ['humano', 'elfo', 'enano', 'mediano', 'draconido', 'gnomo', 'semielfo', 'semiorco', 'tiflin']
const CLASS_OPTIONS = ['guerrero', 'mago', 'picaro', 'clerigo', 'barbaro', 'bardo', 'druida', 'explorador', 'paladin', 'hechicero', 'brujo', 'monje']
const EDITABLE_SETUP_FIELDS = [
  { key: 'name', label: 'Nombre' },
  { key: 'race', label: 'Raza' },
  { key: 'class', label: 'Clase' },
  { key: 'background', label: 'Trasfondo' },
  { key: 'trait', label: 'Rasgo' },
  { key: 'motivation', label: 'Motivacion' },
]

function normalizeUserText(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,!?:;]/g, '')
}

function isPlayerCountSelection(text) {
  const normalized = normalizeUserText(text)
  return PLAYER_COUNT_ACTIONS.some((option) => normalizeUserText(option) === normalized)
}

function getPendingPlayer(game) {
  return game.setupBuffer?.pendingPlayer || null
}

function setPendingPlayer(game, userId, username) {
  game.setupBuffer = { ...game.setupBuffer, pendingPlayer: { userId, username } }
}

function clearPendingPlayer(game) {
  const nextBuffer = { ...game.setupBuffer }
  delete nextBuffer.pendingPlayer
  game.setupBuffer = nextBuffer
}

function getSetupDraft(game) {
  const draft = { ...game.setupBuffer }
  delete draft.pendingPlayer
  delete draft.editMode
  return draft
}

function isEditingSetup(game) {
  return Boolean(game.setupBuffer?.editMode)
}

function parseEditableFieldSelection(value) {
  const normalized = normalizeUserText(value)
  const numeric = Number.parseInt(normalized, 10)

  if (!Number.isNaN(numeric) && numeric >= 1 && numeric <= EDITABLE_SETUP_FIELDS.length) {
    return EDITABLE_SETUP_FIELDS[numeric - 1].key
  }

  const matchedField = EDITABLE_SETUP_FIELDS.find((field) => normalizeUserText(field.label) === normalized)
  return matchedField?.key || null
}

function resolveIndexedOption(value, options) {
  const normalized = normalizeUserText(value)
  const numeric = Number.parseInt(normalized, 10)

  if (!Number.isNaN(numeric) && numeric >= 1 && numeric <= options.length) {
    return options[numeric - 1]
  }

  const matchedOption = options.find((option) => normalizeUserText(option) === normalized)
  return matchedOption || value
}

function stripLeadingIndex(value) {
  return String(value || '').replace(/^\s*\d+\.\s*/, '').trim()
}

function resolveRaceValue(value) {
  return resolveIndexedOption(stripLeadingIndex(value), RACE_OPTIONS)
}

function resolveClassValue(value) {
  return resolveIndexedOption(stripLeadingIndex(value), CLASS_OPTIONS)
}

function buildSetupSummary(game) {
  const draft = getSetupDraft(game)
  return [
    '*Resumen provisional del personaje*',
    '',
    `Nombre: ${draft.name || '-'}`,
    `Raza: ${resolveRaceValue(draft.race || '-')}`,
    `Clase: ${resolveClassValue(draft.class || '-')}`,
    `Trasfondo: ${draft.background || '-'}`,
    `Rasgo: ${draft.trait || '-'}`,
    `Motivacion: ${draft.motivation || '-'}`,
    '',
    'Si todo esta bien, responde: Si, estoy listo',
  ].join('\n')
}

function buildSetupFallback(game) {
  const step = game.setupSubStep

  if (step === 'race') {
    return 'Elige una raza para tu personaje: humano, elfo, enano, mediano, draconido, gnomo, semielfo, semiorco o tiflin.'
  }
  if (step === 'class') {
    return 'Elige una clase: guerrero, mago, picaro, clerigo, barbaro, bardo, druida, explorador, paladin, hechicero, brujo o monje.'
  }
  if (step === 'background') {
    return 'Ahora dime el trasfondo de tu personaje.'
  }
  if (step === 'trait') {
    return 'Describe un rasgo de personalidad importante de tu personaje.'
  }
  if (step === 'motivation') {
    return 'Cual es la principal motivacion de tu personaje?'
  }
  if (step === 'edit_select') {
    return 'Elige que parte del personaje quieres cambiar.'
  }
  if (step === 'confirm') {
    return buildSetupSummary(game)
  }

  return 'Sigue con la creacion del personaje.'
}

function buildLocalSetupPrompt(game) {
  const step = game.setupSubStep

  if (step === 'name') {
    return 'Como se llamara tu personaje?'
  }

  if (step === 'race') {
    return [
      '*Elige una raza*',
      '',
      '1. Humano',
      '2. Elfo',
      '3. Enano',
      '4. Mediano',
      '5. Draconido',
      '6. Gnomo',
      '7. Semielfo',
      '8. Semiorco',
      '9. Tiflin',
    ].join('\n')
  }

  if (step === 'class') {
    return [
      '*Elige una clase*',
      '',
      '1. Guerrero',
      '2. Mago',
      '3. Picaro',
      '4. Clerigo',
      '5. Barbaro',
      '6. Bardo',
      '7. Druida',
      '8. Explorador',
      '9. Paladin',
      '10. Hechicero',
      '11. Brujo',
      '12. Monje',
    ].join('\n')
  }

  if (step === 'background') {
    return 'Cual es el trasfondo de tu personaje?'
  }

  if (step === 'trait') {
    return 'Describe un rasgo de personalidad importante.'
  }

  if (step === 'motivation') {
    return 'Cual es la motivacion principal de tu personaje?'
  }

  if (step === 'edit_select') {
    return [
      '*Que quieres cambiar?*',
      '',
      '1. Nombre',
      '2. Raza',
      '3. Clase',
      '4. Trasfondo',
      '5. Rasgo',
      '6. Motivacion',
    ].join('\n')
  }

  if (step === 'confirm') {
    return `${buildSetupSummary(game)}\n\nSi quieres cambiar algo, responde: Quiero cambiar algo`
  }

  return buildSetupFallback(game)
}

function getSetupActions(game) {
  if (game.setupSubStep === 'race') {
    return [
      '1. Humano',
      '2. Elfo',
      '3. Enano',
      '4. Mediano',
      '5. Draconido',
      '6. Gnomo',
      '7. Semielfo',
      '8. Semiorco',
      '9. Tiflin',
    ]
  }

  if (game.setupSubStep === 'class') {
    return [
      '1. Guerrero',
      '2. Mago',
      '3. Picaro',
      '4. Clerigo',
      '5. Barbaro',
      '6. Bardo',
      '7. Druida',
      '8. Explorador',
      '9. Paladin',
      '10. Hechicero',
      '11. Brujo',
      '12. Monje',
    ]
  }

  if (game.setupSubStep === 'confirm') {
    return ['Si, estoy listo', 'Quiero cambiar algo']
  }

  if (game.setupSubStep === 'edit_select') {
    return EDITABLE_SETUP_FIELDS.map((field, index) => `${index + 1}. ${field.label}`)
  }

  return []
}

function buildReadyCharacterPayload(game) {
  const draft = getSetupDraft(game)
  return `PERSONAJE_LISTO|${draft.name || 'Heroe'}|${resolveRaceValue(draft.race) || 'humano'}|${resolveClassValue(draft.class) || 'guerrero'}|${draft.background || 'Aventurero'}|${draft.trait || 'Misterioso'}|${draft.motivation || 'Buscar fortuna'}`
}

function shouldCompleteSetupLocally(game, userText) {
  if (game.setupSubStep !== 'confirm') return false

  const normalized = normalizeUserText(userText)
  return (
    YES_WORDS.has(normalized) ||
    normalized === 'si estoy listo' ||
    normalized === 'sí estoy listo' ||
    (normalized.startsWith('si ') && normalized.includes('listo')) ||
    (normalized.startsWith('sí ') && normalized.includes('listo'))
  )
}

function extractCharacterFromReply(reply, fallbackGame) {
  const rawCharacter = reply.split('PERSONAJE_LISTO|')[1] || buildReadyCharacterPayload(fallbackGame).split('PERSONAJE_LISTO|')[1]
  const parts = rawCharacter
    .split('|')
    .map((part) => part.trim().replace(/[\r\n].*/, '').trim())

  while (parts.length < 6) parts.push('')
  return parts
}

function buildCharacterDataFromSetup(reply, game) {
  const draft = getSetupDraft(game)
  const [nameFromReply, raceFromReply, classFromReply, backgroundFromReply, traitFromReply, motivationFromReply] =
    extractCharacterFromReply(reply, game)

  return {
    name: draft.name || nameFromReply || 'Heroe',
    race: resolveRaceValue(draft.race || raceFromReply || 'humano'),
    playerClass: resolveClassValue(draft.class || classFromReply || 'guerrero'),
    background: draft.background || backgroundFromReply || 'Aventurero',
    trait: draft.trait || traitFromReply || 'Misterioso',
    motivation: draft.motivation || motivationFromReply || 'Buscar fortuna',
  }
}

module.exports = {
  SETUP_STEPS,
  PLAYER_COUNT_ACTIONS,
  RACE_OPTIONS,
  CLASS_OPTIONS,
  normalizeUserText,
  isPlayerCountSelection,
  getPendingPlayer,
  setPendingPlayer,
  clearPendingPlayer,
  getSetupDraft,
  isEditingSetup,
  parseEditableFieldSelection,
  buildLocalSetupPrompt,
  getSetupActions,
  buildReadyCharacterPayload,
  shouldCompleteSetupLocally,
  buildCharacterDataFromSetup,
  resolveRaceValue,
  resolveClassValue,
}
