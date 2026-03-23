const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js')
const {
  JOIN_MODAL_ID,
  JOIN_RACE_SELECT_ID,
  JOIN_CLASS_SELECT_ID,
  JOIN_CONTINUE_BUTTON_ID,
  VOTE_BUTTON_PREFIX,
  ACTION_BUTTON_PREFIX,
  RACE_OPTIONS,
  CLASS_OPTIONS,
} = require('./constants')

function buildHelpMessage() {
  return [
    '**Discord beta**',
    '',
    'Comandos disponibles por ahora:',
    '/nueva jugadores:<1-4> - crea una nueva partida en un hilo propio',
    '/unirse - abre el formulario para crear tu personaje',
    '/actuar texto:<...> - envia una accion narrativa al director de juego',
    '/continuar - recupera la aventura guardada en este scope',
    '/seguir - fuerza la continuacion de la escena actual',
    '/donar - muestra enlaces para apoyar el proyecto',
    '/estado - muestra las fichas del grupo si ya existen',
    '/xp - muestra la experiencia del grupo',
    '/habilidades - muestra las habilidades desbloqueadas',
    '/memoria - resume lugares, NPCs y decisiones',
    '/cronica - exporta la cronica de la aventura',
    '/ayuda - muestra este resumen',
    '',
    'Esta beta ya crea partidas, personajes, escenas y progreso compartido en scopes de Discord.',
  ].join('\n')
}

function buildDonationButtonRows(providers) {
  if (!Array.isArray(providers) || providers.length === 0) return []

  return providers.map((provider) => (
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel(String(provider.label || 'Donar').slice(0, 80))
        .setStyle(ButtonStyle.Link)
        .setURL(provider.url),
    )
  ))
}

function cleanAdventureTitle(value) {
  return String(value || '')
    .replace(/[*_`~]/g, '')
    .replace(/[|:#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildAdventureTitle(worldContext = null) {
  const townName = worldContext?.town?.name || 'Ravenhollow'
  const hookName = cleanAdventureTitle(worldContext?.hook?.summary || 'El eco olvidado')
  const templates = [
    `Las sombras de ${townName}`,
    `El secreto de ${townName}`,
    `Ecos sobre ${townName}`,
    `La noche de ${townName}`,
    `${hookName} en ${townName}`,
  ]

  return cleanAdventureTitle(templates[Math.floor(Math.random() * templates.length)]).slice(0, 90)
}

function buildThreadName(interaction, adventureTitle = null, suffix = '') {
  const title = cleanAdventureTitle(adventureTitle || buildAdventureTitle())
  const fullTitle = suffix ? `${title} - ${suffix}` : title
  return fullTitle.slice(0, 100)
}

function logDiscordInteractionError(message, interaction, error, logError = console.error) {
  const context = {
    command: interaction?.isChatInputCommand?.() ? interaction.commandName : interaction?.customId,
    guildId: interaction?.guildId || null,
    channelId: interaction?.channelId || null,
    userId: interaction?.user?.id || null,
  }
  logError(message, context, error)
}

function toDiscordMarkdown(text) {
  return String(text || '')
    .replace(/\*([^*\n]+)\*/g, '**$1**')
    .replace(/_([^_\n]+)_/g, '*$1*')
}

function chunkButtons(options, columns = 2) {
  const rows = []

  for (let index = 0; index < options.length; index += columns) {
    const slice = options.slice(index, index + columns)
    rows.push(
      new ActionRowBuilder().addComponents(
        ...slice.map((option, offset) => (
          new ButtonBuilder()
            .setCustomId(`${VOTE_BUTTON_PREFIX}${index + offset}`)
            .setLabel(String(option).slice(0, 80))
            .setStyle(ButtonStyle.Secondary)
        )),
      ),
    )
  }

  return rows
}

function getVoteButtonRows(options) {
  const longestOption = options.reduce((max, option) => Math.max(max, String(option || '').length), 0)
  return chunkButtons(options, longestOption > 24 ? 1 : 2)
}

function encodeActionCustomId(action) {
  const encoded = encodeURIComponent(String(action || ''))
  const customId = `${ACTION_BUTTON_PREFIX}${encoded}`
  return customId.length <= 100 ? customId : null
}

function getActionButtonRows(actions) {
  const eligibleActions = (actions || [])
    .slice(0, 5)
    .map((action) => ({ action, customId: encodeActionCustomId(action) }))
    .filter((entry) => entry.customId)

  if (eligibleActions.length === 0) return []

  const rows = []
  for (let index = 0; index < eligibleActions.length; index += 1) {
    const current = eligibleActions[index]
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(current.customId)
          .setLabel(String(current.action).slice(0, 80))
          .setStyle(ButtonStyle.Primary),
      ),
    )
  }

  return rows
}

function capitalizeLabel(value) {
  const text = String(value || '')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function buildJoinSelectionContent(pendingPlayer) {
  const selectedRace = pendingPlayer?.selectedRace ? capitalizeLabel(pendingPlayer.selectedRace) : '_Sin elegir_'
  const selectedClass = pendingPlayer?.selectedClass ? capitalizeLabel(pendingPlayer.selectedClass) : '_Sin elegir_'

  return [
    '**Crear personaje**',
    '',
    `Raza: ${selectedRace}`,
    `Clase: ${selectedClass}`,
    '',
    'Selecciona raza y clase en los desplegables. Cuando ambas esten definidas, pulsa **Continuar** para abrir el formulario con nombre, trasfondo, rasgo y motivacion.',
  ].join('\n')
}

function buildJoinSelectionComponents(pendingPlayer) {
  const raceSelect = new StringSelectMenuBuilder()
    .setCustomId(JOIN_RACE_SELECT_ID)
    .setPlaceholder('Elige una raza')
    .addOptions(
      RACE_OPTIONS.map((race) => ({
        label: capitalizeLabel(race),
        value: race,
        default: pendingPlayer?.selectedRace === race,
      })),
    )

  const classSelect = new StringSelectMenuBuilder()
    .setCustomId(JOIN_CLASS_SELECT_ID)
    .setPlaceholder('Elige una clase')
    .addOptions(
      CLASS_OPTIONS.map((playerClass) => ({
        label: capitalizeLabel(playerClass),
        value: playerClass,
        default: pendingPlayer?.selectedClass === playerClass,
      })),
    )

  const canContinue = Boolean(pendingPlayer?.selectedRace && pendingPlayer?.selectedClass)
  const continueButton = new ButtonBuilder()
    .setCustomId(JOIN_CONTINUE_BUTTON_ID)
    .setLabel('Continuar')
    .setStyle(ButtonStyle.Success)
    .setDisabled(!canContinue)

  return [
    new ActionRowBuilder().addComponents(raceSelect),
    new ActionRowBuilder().addComponents(classSelect),
    new ActionRowBuilder().addComponents(continueButton),
  ]
}

function buildJoinModal() {
  return new ModalBuilder()
    .setCustomId(JOIN_MODAL_ID)
    .setTitle('Crear personaje')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('name')
          .setLabel('Nombre del personaje')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(50),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('background')
          .setLabel('Trasfondo')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('details')
          .setLabel('Rasgo | Motivacion')
          .setPlaceholder('Valiente y temerario | Proteger a su familia')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(300),
      ),
    )
}

function parseCharacterDetails(rawValue) {
  const [trait, motivation] = String(rawValue || '')
    .split('|')
    .map((part) => part.trim())

  return {
    trait: trait || 'Misterioso',
    motivation: motivation || 'Buscar fortuna',
  }
}

function getPlayerByDiscordUserId(game, userId) {
  return game?.players?.find((player) => String(player.platformUserId) === String(userId)) || null
}

function getDiscordActorLabel(game, user, fallback = 'Jugador') {
  const playerCharacter = getPlayerByDiscordUserId(game, user?.id)
  return playerCharacter?.name || user?.globalName || user?.username || fallback
}

function isDiscordPlayerInGame(game, userId) {
  return Boolean(getPlayerByDiscordUserId(game, userId))
}

function isPendingPlayerExpired(pendingPlayer, maxAgeMs = 10 * 60 * 1000) {
  if (!pendingPlayer?.startedAt) return false
  const startedAt = new Date(pendingPlayer.startedAt).getTime()
  if (Number.isNaN(startedAt)) return false
  return (Date.now() - startedAt) > maxAgeMs
}

function buildChronicleAttachment(game, entries) {
  const heroes = game.players
    .map((player) => `${player.name} (${player.race} ${player.class}, nivel ${player.level || 1})`)
    .join(', ')

  const header = [
    'CRONICA DE LA AVENTURA',
    '='.repeat(40),
    `Heroes: ${heroes}`,
    '='.repeat(40),
    '',
  ].join('\n')
  const body = entries.map((entry, index) => `${index + 1}. ${entry.entry}`).join('\n\n')
  const footer = `\n\n${'='.repeat(40)}\nFin de la cronica - ${new Date().toLocaleDateString('es-ES')}`

  return new AttachmentBuilder(Buffer.from(header + body + footer, 'utf-8'), {
    name: 'cronica_aventura.txt',
  })
}

module.exports = {
  buildHelpMessage,
  buildDonationButtonRows,
  cleanAdventureTitle,
  buildAdventureTitle,
  buildThreadName,
  logDiscordInteractionError,
  toDiscordMarkdown,
  getVoteButtonRows,
  getActionButtonRows,
  buildJoinSelectionContent,
  buildJoinSelectionComponents,
  buildJoinModal,
  parseCharacterDetails,
  getPlayerByDiscordUserId,
  getDiscordActorLabel,
  isDiscordPlayerInGame,
  isPendingPlayerExpired,
  buildChronicleAttachment,
}
