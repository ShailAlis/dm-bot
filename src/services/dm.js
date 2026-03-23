const Anthropic = require('@anthropic-ai/sdk')
const EEEG = require('../../eeeg')
const { PROFICIENCY_BONUS, getLevelFromXP, getNewAbilities, hpGainOnLevelUp, getModifier } = require('../game/rules')
const { roll } = require('../game/player')

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function generateWorldContext() {
  const location = EEEG.generateLocation()
  return {
    town: location.town,
    tavern: location.tavern,
    npc: EEEG.generateNPC(),
    hook: EEEG.generatePlotHook(),
    encounter: EEEG.generateEncounter(),
    curiosity: EEEG.generateCuriosity(),
    rumor: EEEG.generateRumor(),
  }
}

function buildWorldContextString(context) {
  if (!context) return ''

  return [
    'CONTEXTO DEL MUNDO:',
    `Localizacion: ${context.town.name} (${context.town.type}, ~${context.town.population} habitantes)`,
    `Evento actual: ${context.town.event}`,
    `Lugar destacado: ${context.town.landmark}`,
    `Taberna: ${context.tavern.name} (${context.tavern.wealth})`,
    `Rasgo de la taberna: ${context.tavern.feature}`,
    `Bebida especial: ${context.tavern.specialBrew.name} - ${context.tavern.specialBrew.desc}`,
    `Rumor de la taberna: ${context.tavern.rumor}`,
    `NPC notable: ${context.npc.summary}`,
    `Lleva encima: ${context.npc.pocket}`,
    `Secreto: ${context.npc.secret}`,
    `Gancho narrativo: ${context.hook.summary}`,
    `Encuentro posible: ${context.encounter.description}`,
    `Objeto curioso: ${context.curiosity}`,
    `Rumor adicional: ${context.rumor}`,
  ].join('\n')
}

function buildSystemPrompt(game) {
  const playersDescription = game.players
    .map((player, index) => (
      `J${index + 1}: ${player.name} (${player.race} ${player.class} Nv.${player.level || 1}, XP:${player.xp || 0}) `
      + `HP:${player.hp}/${player.maxHp} AC:${player.ac} `
      + `FUE:${player.stats.str} DES:${player.stats.dex} CON:${player.stats.con} `
      + `INT:${player.stats.int} SAB:${player.stats.wis} CAR:${player.stats.cha} `
      + `Prof:+${PROFICIENCY_BONUS[(player.level || 1) - 1]} `
      + `Rasgo:"${player.trait}" Motivacion:"${player.motivation}" `
      + `Habilidades:[${(player.abilities || []).join(', ') || 'ninguna'}] `
      + `Inv:[${player.inventory.join(', ')}]`
    ))
    .join('\n')

  const decisions = game.worldMemory?.filter((entry) => entry.type === 'decision').slice(0, 5) || []
  const locations = game.worldMemory?.filter((entry) => entry.type === 'location').slice(0, 5) || []
  const npcs = game.worldMemory?.filter((entry) => entry.type === 'npc').slice(0, 5) || []
  const memoryBlocks = [
    decisions.length ? `DECISIONES:\n${decisions.map((entry) => `- ${entry.title}: ${entry.description}`).join('\n')}` : '',
    locations.length ? `LUGARES:\n${locations.map((entry) => `- ${entry.title}: ${entry.description}`).join('\n')}` : '',
    npcs.length ? `NPCS:\n${npcs.map((entry) => `- ${entry.title}: ${entry.description}`).join('\n')}` : '',
  ].filter(Boolean)
  const hiddenMemory = (game.hiddenMemory || []).slice(-12)
  const hiddenMemoryBlock = hiddenMemory.length
    ? `MEMORIA_OCULTA_DEL_DJ:\n${hiddenMemory.map((entry) => `- ${entry}`).join('\n')}`
    : ''
  const worldContext = game.worldContext ? buildWorldContextString(game.worldContext) : ''

  return `Eres un Director de Juego experto en D&D 5e. Diriges para ${game.players.length} jugador(es).

PERSONAJES:
${playersDescription}

${memoryBlocks.length ? `MEMORIA:\n${memoryBlocks.join('\n\n')}` : ''}

${hiddenMemoryBlock}

${worldContext}

INSTRUCCIONES:
- Narra en espanol con un estilo claro, evocador y facil de seguir.
- Usa niveles, habilidades, rasgos y contexto del mundo en la narrativa.
- Prioriza frases comprensibles y decisiones concretas.
- Narra SOLO lo que los personajes jugadores pueden percibir directamente, inferir de forma razonable o recordar.
- No reveles planes, identidades, movimientos, conversaciones ni consecuencias fuera de la percepcion actual del grupo.
- Como Director de Juego SI puedes llevar la cuenta interna de sucesos ocultos, pero debes registrarlos con lineas separadas usando: OCULTO:[hecho breve]
- Todo lo que vaya en OCULTO es solo para memoria interna del DJ y no debe mostrarse a los jugadores en la narracion visible.
- Los jugadores solo pueden decidir las acciones, palabras e intenciones de sus propios personajes.
- Nunca ofrezcas opciones que permitan decidir directamente por NPCs, enemigos, aliados o criaturas del mundo.
- Los NPCs actuan, responden y toman decisiones solo bajo tu control como Director de Juego.
- Si un jugador intenta forzar la decision de un NPC, reconduce la escena y describe como reacciona ese NPC por su propia voluntad.
- Cuando una accion requiera tirada, usa SIEMPRE una linea separada con este formato exacto: TIRADA:[personaje]|[tipo y motivo]|[dificultad]
- En [personaje] escribe SIEMPRE el nombre exacto del personaje jugador que hace la tirada
- En [tipo y motivo] escribe una descripcion breve y legible que incluya tanto la habilidad o atributo como el motivo narrativo de la tirada
- El motivo debe explicar que intenta conseguir o comprobar el personaje, por ejemplo: Percepcion (SAB) para oir pasos tras la puerta
- Ejemplos validos: TIRADA:Aria|Percepcion (SAB) para oir pasos tras la puerta|15 o TIRADA:Borin|Atletismo (FUE) para apartar la estatua|13
- En [dificultad] escribe solo un numero entero de CD o dificultad a superar
- No uses corchetes, parentesis extra, ni texto adicional alrededor del comando. No escribas cosas como "Haz una TIRADA:[...]" ni "[TIRADA:...]"
- Cada tirada debe ocupar su propia linea y no compartir linea con otros comandos
- Para actualizar HP: UPDATE_HP:[nombre]:[valor]
- Para dar XP: XP:[nombre]:[cantidad]
- Para anadir objeto: ADD_ITEM:[nombre]:[objeto]
- Para quitar objeto: REMOVE_ITEM:[nombre]:[objeto]
- Memoria: MEMORIA_DECISION:[titulo]|[desc] / MEMORIA_LUGAR:[nombre]|[desc] / MEMORIA_NPC:[nombre]|[desc]
- Cronica: CRONICA:[parrafo epico de 2-3 frases]
- Para una decision de grupo importante: VOTACION:[pregunta]|[opcion1]|[opcion2]|[opcion3]
- Usa Markdown sencillo de Telegram (*negrita*, _cursiva_). Maximo 3 parrafos.
- Al final: ACCIONES: accion1 | accion2 | accion3`
}

function buildSetupPrompt(game) {
  const draft = { ...game.setupBuffer }
  delete draft.pendingPlayer

  return `Eres el asistente de creacion de personajes de D&D 5e en Telegram.
Guia paso a paso en espanol, con frases breves, claras y animadas.

PASO: ${game.setupSubStep}
JUGADOR: ${game.setupStep + 1} de ${game.numPlayers}
DATOS: ${JSON.stringify(draft)}

- "name": pide el nombre del personaje.
- "race": lista 9 razas numeradas con una descripcion de 3 palabras.
- "class": lista 12 clases numeradas con una descripcion de 3 palabras.
- "background": ofrece 6 trasfondos adaptados a su raza y clase.
- "trait": propone un rasgo de personalidad con 4 ejemplos.
- "motivation": propone una motivacion con 4 ejemplos.
- "confirm": resume el personaje y termina con CONFIRMAR_PERSONAJE.
- Cuando confirme, responde con: PERSONAJE_LISTO|[nombre]|[raza]|[clase]|[trasfondo]|[rasgo]|[motivacion]

Usa Markdown sencillo de Telegram.`
}

async function callClaude(game, userMessage, systemOverride) {
  const system = systemOverride || buildSystemPrompt(game)
  const messages = [...game.history, { role: 'user', content: userMessage }]
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1000,
    system,
    messages,
  })
  const text = response.content.map((block) => block.text || '').join('')
  game.lastClaudeMeta = {
    stopReason: response.stop_reason || null,
    text,
  }

  game.history.push({ role: 'user', content: userMessage })
  game.history.push({ role: 'assistant', content: text })
  if (game.history.length > 40) game.history = game.history.slice(-40)

  return text
}

function findPlayerByName(game, name) {
  return game.players.find((player) => player.name.toLowerCase() === name.trim().toLowerCase())
}

function parseOptionList(rawValue) {
  return String(rawValue || '')
    .split(/\r?\n|\|/)
    .map((option) => option.trim())
    .map((option) => option.replace(/^[-*]\s*/, ''))
    .map((option) => option.replace(/^\d+[.)]\s*/, ''))
    .filter(Boolean)
}

function normalizeRollType(rawValue) {
  return String(rawValue || '')
    .trim()
    .replace(/^[\[(]+/, '')
    .replace(/[\])]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseRollCommand(rawValue) {
  const parts = String(rawValue || '').split('|').map((part) => part.trim()).filter(Boolean)
  let actorName = null
  let rawType = ''
  let rawDifficulty = ''

  if (parts.length >= 3) {
    ;[actorName, rawType, rawDifficulty] = parts
  } else {
    ;[rawType, rawDifficulty] = parts
  }

  const type = normalizeRollType(rawType)
  const difficulty = Number.parseInt(rawDifficulty, 10)

  return {
    actorName,
    type,
    difficulty: Number.isNaN(difficulty) ? null : difficulty,
  }
}

function getStatKeyFromRollType(rollType) {
  const match = String(rollType || '').toUpperCase().match(/\((FUE|DES|CON|INT|SAB|CAR)\)/)
  if (!match) return null

  const statMap = {
    FUE: 'str',
    DES: 'dex',
    CON: 'con',
    INT: 'int',
    SAB: 'wis',
    CAR: 'cha',
  }

  return statMap[match[1]] || null
}

async function parseDMCommands(chatId, game, text, storage) {
  let clean = text
  const rolls = []
  const levelUps = []
  const voteData = { active: false, question: '', options: [] }

  for (const match of text.matchAll(/OCULTO:\s*([^\n]+)/gi)) {
    if (!game.hiddenMemory) game.hiddenMemory = []
    game.hiddenMemory.push(match[1].trim())
  }
  if (game.hiddenMemory?.length > 30) game.hiddenMemory = game.hiddenMemory.slice(-30)
  clean = clean.replace(/OCULTO:\s*[^\n]*/gi, '').trim()

  for (const match of text.matchAll(/TIRADA:\s*([^\n]+)/gi)) {
    const rollData = parseRollCommand(match[1])
    if (rollData.type) {
      const player = rollData.actorName ? findPlayerByName(game, rollData.actorName) : null
      const statKey = getStatKeyFromRollType(rollData.type)
      const abilityScore = player && statKey ? player.stats?.[statKey] : null
      const modifier = abilityScore ? getModifier(abilityScore) : 0
      const baseRoll = roll(20)

      rolls.push({
        actor: player?.name || rollData.actorName || null,
        tipo: rollData.type,
        dificultad: rollData.difficulty,
        tiradaBase: baseRoll,
        modificador: modifier,
        resultado: baseRoll + modifier,
      })
    }
  }
  clean = clean.replace(/TIRADA:\s*[^\n]*/gi, '').trim()

  for (const match of text.matchAll(/UPDATE_HP:([^:]+):(\d+)/gi)) {
    const player = findPlayerByName(game, match[1])
    if (player) player.hp = Math.max(0, Math.min(Number.parseInt(match[2], 10), player.maxHp))
  }
  clean = clean.replace(/UPDATE_HP:[^\n]*/gi, '').trim()

  for (const match of text.matchAll(/XP:([^:]+):(\d+)/gi)) {
    const player = findPlayerByName(game, match[1])
    if (!player) continue

    const gainedXp = Number.parseInt(match[2], 10)
    const oldLevel = player.level || 1
    player.xp = (player.xp || 0) + gainedXp

    const newLevel = getLevelFromXP(player.xp)
    if (newLevel > oldLevel) {
      const hpGain = hpGainOnLevelUp(player.class, player.stats.con)
      const abilities = getNewAbilities(player.class, oldLevel, newLevel)
      player.maxHp += hpGain
      player.hp = Math.min(player.hp + hpGain, player.maxHp)
      player.level = newLevel
      player.abilities = [...(player.abilities || []), ...abilities]
      levelUps.push({ name: player.name, oldLevel, newLevel, hpGain, abilities, xp: player.xp })
    }
  }
  clean = clean.replace(/XP:[^\n]*/gi, '').trim()

  for (const match of text.matchAll(/ADD_ITEM:([^:]+):([^\n]+)/gi)) {
    const player = findPlayerByName(game, match[1])
    if (player) player.inventory.push(match[2].trim())
  }
  clean = clean.replace(/ADD_ITEM:[^\n]*/gi, '').trim()

  for (const match of text.matchAll(/REMOVE_ITEM:([^:]+):([^\n]+)/gi)) {
    const player = findPlayerByName(game, match[1])
    if (!player) continue
    const itemName = match[2].trim()
    const itemIndex = player.inventory.indexOf(itemName)
    if (itemIndex >= 0) player.inventory.splice(itemIndex, 1)
  }
  clean = clean.replace(/REMOVE_ITEM:[^\n]*/gi, '').trim()

  const memoryPatterns = [
    { regex: /MEMORIA_DECISION:([^|\n]+)\|([^\n]+)/gi, type: 'decision' },
    { regex: /MEMORIA_LUGAR:([^|\n]+)\|([^\n]+)/gi, type: 'location' },
    { regex: /MEMORIA_NPC:([^|\n]+)\|([^\n]+)/gi, type: 'npc' },
  ]

  for (const { regex, type } of memoryPatterns) {
    for (const match of text.matchAll(regex)) {
      const title = match[1].trim()
      const description = match[2].trim()
      await storage.saveMemory(chatId, type, title, description)
      if (!game.worldMemory) game.worldMemory = []
      game.worldMemory.unshift({ type, title, description })
    }
  }
  clean = clean.replace(/MEMORIA_(DECISION|LUGAR|NPC):[^\n]*/gi, '').trim()

  for (const match of text.matchAll(/CRONICA:([^\n]+)/gi)) {
    await storage.addChronicleEntry(chatId, match[1].trim())
  }
  clean = clean.replace(/CRONICA:[^\n]*/gi, '').trim()

  const voteMatch = clean.match(/VOTACION:\s*([\s\S]*?)(?=\n[A-Z_]+:|$)/i)
  if (voteMatch) {
    const voteLines = voteMatch[1]
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
    const inlineParts = voteMatch[1].split('|').map((part) => part.trim()).filter(Boolean)

    let question = ''
    let options = []

    if (inlineParts.length >= 3) {
      question = inlineParts[0]
      options = inlineParts.slice(1)
    } else if (voteLines.length >= 2) {
      question = voteLines[0].replace(/\|$/, '').trim()
      options = parseOptionList(voteLines.slice(1).join('\n'))
    }

    if (question && options.length > 0) {
      voteData.active = true
      voteData.question = question
      voteData.options = options
    }
    clean = clean.replace(/VOTACION:\s*([\s\S]*?)(?=\n[A-Z_]+:|$)/i, '').trim()
  }

  let actions = []
  const actionsMatch = clean.match(/ACCIONES:\s*([\s\S]*?)(?=\n[A-Z_]+:|$)/i)
  if (actionsMatch) {
    actions = parseOptionList(actionsMatch[1])
    clean = clean.replace(/ACCIONES:\s*([\s\S]*?)(?=\n[A-Z_]+:|$)/i, '').trim()
  }

  return { clean, rolls, actions, levelUps, voteData }
}

module.exports = {
  generateWorldContext,
  buildSetupPrompt,
  callClaude,
  parseDMCommands,
}
