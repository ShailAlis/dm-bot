const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  ModalBuilder,
  Partials,
  REST,
  Routes,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js')
const { createPlayer } = require('../../game/player')
const {
  formatAbilitiesSummary,
  formatVoteProgress,
  formatVoteResult,
  formatXpSummary,
  formatMemorySummary,
  formatPartyStatus,
  formatMemoryHighlights,
  formatDirectorMessage,
  formatRoll,
} = require('../../game/formatters')
const { generateWorldContext, callClaude, parseDMCommands } = require('../../services/dm')
const { buildDonationMessage, getDonationProviders } = require('../../services/donations')
const { createAdventureHandlers } = require('../../core/adventure')
const { clearPendingPlayer, resolveRaceValue, resolveClassValue } = require('../../core/setup')
const { computeVoteOutcome } = require('../../core/voting')
const { buildDiscordCommands } = require('./commands')
const { getDiscordScopeFromChannel, getDiscordScopeFromInteraction } = require('./scope')

const JOIN_MODAL_ID = 'discord_join_character'
const JOIN_RACE_SELECT_ID = 'discord_join_race'
const JOIN_CLASS_SELECT_ID = 'discord_join_class'
const JOIN_CONTINUE_BUTTON_ID = 'discord_join_continue'
const VOTE_BUTTON_PREFIX = 'vote:'
const ACTION_BUTTON_PREFIX = 'action:'

const RACE_OPTIONS = ['humano', 'elfo', 'enano', 'mediano', 'draconido', 'gnomo', 'semielfo', 'semiorco', 'tiflin']
const CLASS_OPTIONS = ['guerrero', 'mago', 'picaro', 'clerigo', 'barbaro', 'bardo', 'druida', 'explorador', 'paladin', 'hechicero', 'brujo', 'monje']

function hasDiscordEnv() {
  return Boolean(process.env.DISCORD_TOKEN && process.env.DISCORD_CLIENT_ID)
}

async function registerDiscordCommands(token, clientId, guildId) {
  const commands = buildDiscordCommands().map((command) => command.toJSON())
  const rest = new REST({ version: '10' }).setToken(token)
  const route = guildId
    ? Routes.applicationGuildCommands(clientId, guildId)
    : Routes.applicationCommands(clientId)

  await rest.put(route, { body: commands })
}

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

function slugifyThreadPart(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'aventura'
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

async function ensureAdventureThread(interaction, adventureTitle = null) {
  const channel = interaction.channel
  const isThread = typeof channel?.isThread === 'function' && channel.isThread()

  if (!interaction.inGuild() || isThread) {
    return { channel, created: false, usedFallback: false }
  }

  if (!channel?.threads || typeof channel.threads.create !== 'function') {
    return { channel, created: false, usedFallback: true }
  }

  try {
    const thread = await channel.threads.create({
      name: buildThreadName(interaction, adventureTitle),
      autoArchiveDuration: 1440,
      reason: `Nueva partida creada por ${interaction.user.tag}`,
    })
    return { channel: thread, created: true, usedFallback: false }
  } catch (error) {
    logDiscordInteractionError('No se pudo crear el hilo de aventura; se usara el canal actual.', interaction, error)
    return { channel, created: false, usedFallback: true }
  }
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

async function createPrivateAdventureThread(interaction, game, logError = console.error) {
  if (!interaction.inGuild()) return null

  const currentChannel = interaction.channel
  const parentChannel = typeof currentChannel?.isThread === 'function' && currentChannel.isThread()
    ? currentChannel.parent
    : currentChannel

  if (!parentChannel?.threads || typeof parentChannel.threads.create !== 'function') {
    return null
  }

  try {
    const adventureTitle = game?.setupBuffer?.adventureTitle || buildAdventureTitle(game?.worldContext)
    const privateThread = await parentChannel.threads.create({
      name: buildThreadName(interaction, adventureTitle, 'mesa'),
      autoArchiveDuration: 1440,
      type: ChannelType.PrivateThread,
      invitable: false,
      reason: `Mesa privada para la partida de ${interaction.user.tag}`,
    })

    for (const player of game.players || []) {
      if (player.platform === 'discord' && player.platformUserId) {
        await privateThread.members.add(player.platformUserId).catch((error) => {
          logError('No se pudo anadir un jugador al hilo privado de la partida:', {
            threadId: privateThread.id,
            playerId: player.platformUserId,
          }, error)
        })
      }
    }

    return privateThread
  } catch (error) {
    logError('No se pudo crear el hilo privado de aventura.', {
      guildId: interaction.guildId || null,
      channelId: interaction.channelId || null,
    }, error)
    return null
  }
}

async function closePreparationThread(channel, privateThreadId, logError = console.error) {
  if (!channel || typeof channel.send !== 'function') return

  await channel.send([
    '**Preparacion cerrada**',
    `La partida continua a partir de ahora en <#${privateThreadId}>.`,
    'Este espacio queda solo como historial de creacion del grupo.',
  ].join('\n')).catch(() => {})

  const isThread = typeof channel.isThread === 'function' && channel.isThread()
  if (!isThread) return

  if (typeof channel.setLocked === 'function') {
    await channel.setLocked(true, 'La partida se ha movido a una mesa privada').catch((error) => {
      logError('No se pudo bloquear el hilo de preparacion.', { channelId: channel.id }, error)
    })
  }

  if (typeof channel.setArchived === 'function') {
    await channel.setArchived(true, 'La partida se ha movido a una mesa privada').catch((error) => {
      logError('No se pudo archivar el hilo de preparacion.', { channelId: channel.id }, error)
    })
  }
}

function createDiscordAdventureHandlers(client, storage, logError) {
  return createAdventureHandlers({
    storage,
    parseDMCommands,
    generateWorldContext,
    callClaude,
    clearPendingPlayer,
    saveGame: (scope, game) => storage.saveGame(scope, game),
    saveWorldContext: (scope, context) => storage.saveWorldContext(scope, context),
    sendTyping: async (scope) => {
      const channel = await client.channels.fetch(scope.id).catch(() => null)
      if (channel && typeof channel.sendTyping === 'function') {
        await channel.sendTyping()
      }
    },
    sendMessage: async (scope, text) => {
      const channel = await client.channels.fetch(scope.id).catch(() => null)
      if (channel && typeof channel.send === 'function') {
        await channel.send(toDiscordMarkdown(text))
      }
    },
    sendActions: async (scope, text, actions) => {
      const channel = await client.channels.fetch(scope.id).catch(() => null)
      if (!channel || typeof channel.send !== 'function') return

      const content = actions?.length
        ? `${toDiscordMarkdown(text)}\n\n**Acciones sugeridas**\n${actions.map((action, index) => `${index + 1}. ${action}`).join('\n')}`
        : toDiscordMarkdown(text)

      const components = getActionButtonRows(actions)
      await channel.send({ content, ...(components.length ? { components } : {}) })
    },
    sendVote: async (scope, question, options, voterIds) => {
      await storage.createVote(scope, question, options, voterIds)
      const channel = await client.channels.fetch(scope.id).catch(() => null)
      if (!channel || typeof channel.send !== 'function') return

      const footer = voterIds.length > 0
        ? `\n\n*Esperando el voto de ${voterIds.length} jugador(es).*`
        : ''
      await channel.send({
        content: `**Decision de grupo**\n\n${question}${footer}`,
        components: getVoteButtonRows(options),
      })
    },
    sendLevelUp: async (scope, levelUp) => {
      const channel = await client.channels.fetch(scope.id).catch(() => null)
      if (!channel || typeof channel.send !== 'function') return

      const abilityLines = levelUp.abilities.length
        ? `\nNuevas habilidades:\n${levelUp.abilities.map((ability) => `- ${ability}`).join('\n')}`
        : ''

      await channel.send([
        `**${levelUp.name}** sube a nivel ${levelUp.newLevel}`,
        `HP maximo: +${levelUp.hpGain}`,
        `XP total: ${levelUp.xp}${abilityLines}`,
      ].join('\n'))
    },
    sendClaudeError: async (scope, error) => {
      const channel = await client.channels.fetch(scope.id).catch(() => null)
      if (channel && typeof channel.send === 'function') {
        await channel.send(`Error con Claude: \`${error.message}\``)
      }
    },
    formatPartyStatus,
    formatMemoryHighlights,
    formatDirectorMessage,
    formatRoll,
    getPlayerVoterId: (player) => player.platformUserId || player.telegramUserId?.toString() || null,
    logError,
  })
}

async function startDiscordBot({ storage, log = console.log, logError = console.error }) {
  const token = process.env.DISCORD_TOKEN
  const clientId = process.env.DISCORD_CLIENT_ID
  const guildId = process.env.DISCORD_GUILD_ID

  if (!token || !clientId) {
    return null
  }

  await registerDiscordCommands(token, clientId, guildId)

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
    partials: [Partials.Channel],
  })
  const adventureHandlers = createDiscordAdventureHandlers(client, storage, logError)

  client.once(Events.ClientReady, (readyClient) => {
    log(`Discord bot iniciado como ${readyClient.user.tag}`)
  })

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isModalSubmit() && interaction.customId === JOIN_MODAL_ID) {
        const scope = getDiscordScopeFromInteraction(interaction)
        const game = await storage.getGame(scope)

        if (!game || game.phase !== 'setup') {
          await interaction.reply({
            content: 'No hay una partida en configuracion en este canal o hilo. Usa /nueva primero.',
            ephemeral: true,
          })
          return
        }

        if (!game.numPlayers) {
          await interaction.reply({
            content: 'La partida aun no tiene numero de jugadores configurado.',
            ephemeral: true,
          })
          return
        }

        if (game.players.length >= game.numPlayers) {
          await interaction.reply({
            content: 'La partida ya tiene todos los personajes necesarios.',
            ephemeral: true,
          })
          return
        }

        const pendingPlayer = game.setupBuffer?.pendingPlayer
        if (pendingPlayer && isPendingPlayerExpired(pendingPlayer)) {
          clearPendingPlayer(game)
        }

        const platformUserId = interaction.user.id
        if (pendingPlayer && String(pendingPlayer.userId) !== String(platformUserId)) {
          await interaction.reply({
            content: `${pendingPlayer.username} esta creando personaje ahora mismo. Cuando termine, usa /unirse.`,
            ephemeral: true,
          })
          return
        }

        if (!pendingPlayer?.selectedRace || !pendingPlayer?.selectedClass) {
          await interaction.reply({
            content: 'Antes de completar el personaje debes elegir una raza y una clase desde los desplegables.',
            ephemeral: true,
          })
          return
        }

        if (game.players.some((player) => player.platformUserId === platformUserId || player.telegramUserId === platformUserId)) {
          await interaction.reply({
            content: 'Ya tienes un personaje en esta partida.',
            ephemeral: true,
          })
          return
        }

        const details = parseCharacterDetails(interaction.fields.getTextInputValue('details'))
        const player = createPlayer(
          interaction.fields.getTextInputValue('name').trim(),
          resolveRaceValue(pendingPlayer.selectedRace),
          resolveClassValue(pendingPlayer.selectedClass),
          interaction.fields.getTextInputValue('background').trim(),
          details.trait,
          details.motivation,
        )

        player.platform = 'discord'
        player.platformUserId = interaction.user.id
        player.platformUsername = interaction.user.username

        game.players.push(player)
        game.setupStep += 1
        game.setupSubStep = 'name'
        game.history = []
        game.scope = scope
        clearPendingPlayer(game)

        if (game.setupStep >= game.numPlayers) {
          await interaction.reply({
            content: `**${player.name}** completa el grupo. Estoy preparando la mesa privada de la aventura...`,
            ephemeral: true,
          })

          let adventureScope = scope
          const privateThread = await createPrivateAdventureThread(interaction, game, logError)

          if (privateThread) {
            adventureScope = getDiscordScopeFromChannel(privateThread)
            game.scope = adventureScope

            await storage.saveGame(adventureScope, game)
            storage.setCachedGame(adventureScope, game)
            await storage.deleteGame(scope)
            storage.clearCachedGame(scope)

            await closePreparationThread(interaction.channel, privateThread.id, logError)

            if (typeof privateThread.send === 'function') {
              await privateThread.send([
                `**Mesa privada lista** para ${game.players.length} jugador(es).`,
                'A partir de ahora solo los personajes registrados y el bot deberian participar aqui.',
              ].join('\n')).catch(() => {})
            }
          } else {
            await storage.saveGame(scope, game)
            storage.setCachedGame(scope, game)

            await interaction.followUp({
              content: 'No pude cerrar la mesa en un hilo privado, asi que seguire en este hilo con restriccion logica de jugador.',
              ephemeral: true,
            }).catch(() => {})
          }

          await adventureHandlers.startAdventure(adventureScope, game, interaction.inGuild())
        } else {
          await storage.saveGame(scope, game)
          storage.setCachedGame(scope, game)

          await interaction.reply({
            content: `**${player.name}** se une a la aventura como ${player.race} ${player.class} de nivel 1.`,
          })

          await interaction.followUp({
            content: `Personaje ${game.setupStep} de ${game.numPlayers} completado. El siguiente jugador puede usar /unirse.`,
          })
        }
        return
      }

      if (interaction.isStringSelectMenu() && [JOIN_RACE_SELECT_ID, JOIN_CLASS_SELECT_ID].includes(interaction.customId)) {
        const scope = getDiscordScopeFromInteraction(interaction)
        const game = await storage.getGame(scope)

        if (!game || game.phase !== 'setup') {
          await interaction.reply({
            content: 'No hay una partida en configuracion en este canal o hilo. Usa /nueva primero.',
            ephemeral: true,
          })
          return
        }

        const pendingPlayer = game.setupBuffer?.pendingPlayer
        if (!pendingPlayer || String(pendingPlayer.userId) !== String(interaction.user.id)) {
          await interaction.reply({
            content: 'Ahora mismo no eres quien esta creando personaje en esta partida. Usa /unirse para empezar tu turno.',
            ephemeral: true,
          })
          return
        }

        if (isPendingPlayerExpired(pendingPlayer)) {
          clearPendingPlayer(game)
          await storage.saveGame(scope, game)
          storage.setCachedGame(scope, game)
          await interaction.reply({
            content: 'Tu turno de creacion habia caducado. Usa /unirse para retomarlo.',
            ephemeral: true,
          })
          return
        }

        const selectedValue = interaction.values?.[0]
        if (interaction.customId === JOIN_RACE_SELECT_ID) {
          pendingPlayer.selectedRace = resolveRaceValue(selectedValue)
        }

        if (interaction.customId === JOIN_CLASS_SELECT_ID) {
          pendingPlayer.selectedClass = resolveClassValue(selectedValue)
        }

        game.setupBuffer = { ...game.setupBuffer, pendingPlayer }
        await storage.saveGame(scope, game)
        storage.setCachedGame(scope, game)

        await interaction.update({
          content: buildJoinSelectionContent(pendingPlayer),
          components: buildJoinSelectionComponents(pendingPlayer),
        })
        return
      }

      if (interaction.isButton() && interaction.customId === JOIN_CONTINUE_BUTTON_ID) {
        const scope = getDiscordScopeFromInteraction(interaction)
        const game = await storage.getGame(scope)

        if (!game || game.phase !== 'setup') {
          await interaction.reply({
            content: 'No hay una partida en configuracion en este canal o hilo. Usa /nueva primero.',
            ephemeral: true,
          })
          return
        }

        const pendingPlayer = game.setupBuffer?.pendingPlayer
        if (!pendingPlayer || String(pendingPlayer.userId) !== String(interaction.user.id)) {
          await interaction.reply({
            content: 'Ahora mismo no eres quien esta creando personaje en esta partida. Usa /unirse para empezar tu turno.',
            ephemeral: true,
          })
          return
        }

        if (!pendingPlayer.selectedRace || !pendingPlayer.selectedClass) {
          await interaction.reply({
            content: 'Primero debes elegir una raza y una clase.',
            ephemeral: true,
          })
          return
        }

        await interaction.showModal(buildJoinModal())
        return
      }

      if (interaction.isButton() && interaction.customId.startsWith(VOTE_BUTTON_PREFIX)) {
        let voteStep = 'cargando scope de votacion'

        try {
          const scope = getDiscordScopeFromInteraction(interaction)

          voteStep = 'buscando la votacion activa'
          const vote = await storage.getActiveVote(scope)

          if (!vote) {
            await interaction.reply({
              content: 'No hay una votacion activa en este scope.',
              ephemeral: true,
            })
            return
          }

          voteStep = 'validando la opcion elegida'
          const optionIndex = Number.parseInt(interaction.customId.slice(VOTE_BUTTON_PREFIX.length), 10)
          const choice = vote.options?.[optionIndex]

          if (!choice) {
            await interaction.reply({
              content: 'La opcion de voto ya no es valida.',
              ephemeral: true,
            })
            return
          }

          const requiredVoters = (vote.required_voters || []).map(String)
          if (!requiredVoters.includes(String(interaction.user.id))) {
            await interaction.reply({
              content: 'Solo los jugadores de esta partida pueden votar en esta decision.',
              ephemeral: true,
            })
            return
          }

          voteStep = 'confirmando el voto al usuario'
          await interaction.reply({
            content: `Has votado: "${choice}"`,
            ephemeral: true,
          })

          voteStep = 'registrando el voto en storage'
          const result = await storage.castVote(scope, interaction.user.id, choice)
          if (!result) {
            throw new Error('storage.castVote devolvio null')
          }

          const channel = interaction.channel
          if (channel && typeof channel.send === 'function') {
            voteStep = 'anunciando el voto en el hilo'
            const game = await storage.getGame(scope)
            const actorLabel = getDiscordActorLabel(game, interaction.user)
            await channel.send(toDiscordMarkdown(formatVoteProgress(actorLabel, choice)))
          }

          if (!result.allVoted) return

          voteStep = 'limpiando la votacion completada'
          await storage.clearVote(scope)

          voteStep = 'calculando el resultado de la votacion'
          const { winner, summary } = computeVoteOutcome(result.vote.votes)
          if (channel && typeof channel.send === 'function') {
            voteStep = 'anunciando el resultado de la votacion'
            await channel.send(toDiscordMarkdown(formatVoteResult(summary, winner)))
          }

          voteStep = 'recuperando la partida para aplicar consecuencias'
          const game = await storage.getGame(scope)
          if (!game || game.phase !== 'adventure') return

          voteStep = 'pidiendo consecuencias a Claude'
          let reply
          try {
            reply = await callClaude(game, `El grupo ha decidido por votacion: "${winner}". Narra las consecuencias.`)
          } catch (error) {
            if (channel && typeof channel.send === 'function') {
              await channel.send(`Error con Claude: \`${error.message}\``).catch(() => {})
            }
            return
          }

          voteStep = 'procesando la respuesta del director de juego'
          await adventureHandlers.handleDmReply(scope, game, reply, interaction.inGuild())

          voteStep = 'guardando la partida tras la votacion'
          await storage.saveGame(scope, game)
          storage.setCachedGame(scope, game)
        } catch (error) {
          logDiscordInteractionError(`Error en votacion de Discord durante: ${voteStep}`, interaction, error, logError)

          const detailedMessage = `Error en la votacion durante "${voteStep}": ${error.message}`
          if (interaction.deferred || interaction.replied) {
            await interaction.followUp({
              content: detailedMessage,
              ephemeral: true,
            }).catch(() => {})
          } else {
            await interaction.reply({
              content: detailedMessage,
              ephemeral: true,
            }).catch(() => {})
          }
        }
        return
      }

      if (interaction.isButton() && interaction.customId.startsWith(ACTION_BUTTON_PREFIX)) {
        const scope = getDiscordScopeFromInteraction(interaction)
        const game = await storage.getGame(scope)
        if (!game || game.phase !== 'adventure') {
          await interaction.reply({
            content: 'No hay una aventura activa en este scope.',
            ephemeral: true,
          })
          return
        }

        if (!isDiscordPlayerInGame(game, interaction.user.id)) {
          await interaction.reply({
            content: 'Solo los jugadores registrados en esta partida pueden actuar en este hilo.',
            ephemeral: true,
          })
          return
        }

        const text = decodeURIComponent(interaction.customId.slice(ACTION_BUTTON_PREFIX.length))
        const playerCharacter = getPlayerByDiscordUserId(game, interaction.user.id)
        const actorLabel = getDiscordActorLabel(game, interaction.user)
        const userMessage = playerCharacter ? `[${playerCharacter.name}]: ${text}` : `[${actorLabel}]: ${text}`

        await interaction.reply({
          content: `Has elegido: "${text}"`,
          ephemeral: true,
        })

        const channel = interaction.channel
        if (channel && typeof channel.send === 'function') {
          await channel.send(`_${actorLabel} actua..._`)
        }

        let reply
        try {
          reply = await callClaude(game, userMessage)
        } catch (error) {
          if (channel && typeof channel.send === 'function') {
            await channel.send(`Error con Claude: \`${error.message}\``).catch(() => {})
          }
          return
        }

        await adventureHandlers.handleDmReply(scope, game, reply, interaction.inGuild())
        await storage.saveGame(scope, game)
        storage.setCachedGame(scope, game)
        return
      }

      if (!interaction.isChatInputCommand()) return

      const scope = getDiscordScopeFromInteraction(interaction)

      if (interaction.commandName === 'nueva') {
        await interaction.deferReply({ ephemeral: true })

        let newGameStep = 'leyendo opciones'

        try {
          const numPlayers = interaction.options.getInteger('jugadores', true)
          const game = storage.createEmptyGame()

          newGameStep = 'generando contexto del mundo'
          const worldContext = generateWorldContext()
          const adventureTitle = buildAdventureTitle(worldContext)

          newGameStep = 'creando o resolviendo el hilo de partida'
          const { channel: targetChannel, created: createdThread, usedFallback } = await ensureAdventureThread(interaction, adventureTitle)
          const targetScope = getDiscordScopeFromChannel(targetChannel)

          game.phase = 'setup'
          game.numPlayers = numPlayers
          game.setupSubStep = 'name'
          game.worldContext = worldContext
          game.setupBuffer = { ...game.setupBuffer, adventureTitle }
          game.scope = targetScope

          newGameStep = 'reseteando el estado previo de la partida'
          await storage.resetGame(targetScope)
          storage.clearCachedGame(targetScope)

          newGameStep = 'guardando la nueva partida'
          await storage.saveGame(targetScope, game)
          storage.setCachedGame(targetScope, game)

          newGameStep = 'respondiendo a Discord'
          if (interaction.inGuild() && targetChannel.id !== interaction.channelId) {
            await interaction.editReply({
              content: `**${adventureTitle}** creada en <#${targetChannel.id}> para ${numPlayers} jugador(es). Usa ese hilo para /unirse y jugar esta aventura.`,
            })

            if (typeof targetChannel.send === 'function') {
              await targetChannel.send([
                `**${adventureTitle}**`,
                `Nueva partida creada para **${numPlayers}** jugador(es).`,
                'Este hilo sera el espacio de esta aventura.',
                'Ahora el primer jugador ya puede usar /unirse para crear su personaje.',
              ].join('\n'))
            }
            return
          }

          await interaction.editReply({
            content: [
              `**${adventureTitle}**`,
              `Partida de Discord creada para **${numPlayers}** jugador(es).`,
              usedFallback
                ? 'No pude crear un hilo nuevo, asi que esta aventura usara el canal actual como scope.'
                : (createdThread ? 'Este hilo sera el scope de la aventura.' : 'Este hilo o canal sera el scope de la aventura.'),
              'Ahora el primer jugador ya puede usar /unirse para crear su personaje.',
            ].join('\n'),
          })
        } catch (error) {
          logDiscordInteractionError(`Error en /nueva durante: ${newGameStep}`, interaction, error, logError)
          await interaction.editReply({
            content: `Error en /nueva durante "${newGameStep}": ${error.message}`,
          }).catch(() => {})
        }
        return
      }

      if (interaction.commandName === 'unirse') {
        const game = await storage.getGame(scope)
        if (!game || game.phase !== 'setup') {
          await interaction.reply({
            content: 'No hay una partida en configuracion en este canal o hilo. Usa /nueva primero.',
            ephemeral: true,
          })
          return
        }

        if (game.players.length >= game.numPlayers) {
          await interaction.reply({
            content: 'La partida ya tiene todos los personajes necesarios.',
            ephemeral: true,
          })
          return
        }

        const pendingPlayer = game.setupBuffer?.pendingPlayer
        if (pendingPlayer && isPendingPlayerExpired(pendingPlayer)) {
          clearPendingPlayer(game)
        }

        if (pendingPlayer && String(pendingPlayer.userId) !== String(interaction.user.id)) {
          await interaction.reply({
            content: `${pendingPlayer.username} esta creando personaje ahora mismo. Cuando termine, usa /unirse.`,
            ephemeral: true,
          })
          return
        }

        if (game.players.some((player) => player.platformUserId === interaction.user.id)) {
          await interaction.reply({
            content: 'Ya tienes un personaje en esta partida.',
            ephemeral: true,
          })
          return
        }

        game.setupBuffer = {
          ...game.setupBuffer,
          pendingPlayer: {
            userId: interaction.user.id,
            username: interaction.user.globalName || interaction.user.username,
            startedAt: new Date().toISOString(),
            selectedRace: game.setupBuffer?.pendingPlayer?.userId === interaction.user.id ? game.setupBuffer.pendingPlayer.selectedRace || null : null,
            selectedClass: game.setupBuffer?.pendingPlayer?.userId === interaction.user.id ? game.setupBuffer.pendingPlayer.selectedClass || null : null,
          },
        }
        await storage.saveGame(scope, game)
        storage.setCachedGame(scope, game)

        await interaction.reply({
          content: buildJoinSelectionContent(game.setupBuffer.pendingPlayer),
          components: buildJoinSelectionComponents(game.setupBuffer.pendingPlayer),
          ephemeral: true,
        })
        return
      }

      if (interaction.commandName === 'estado') {
        const game = await storage.getGame(scope)
        if (!game || game.players.length === 0) {
          await interaction.reply({
            content: 'No hay personajes creados todavia en este scope de Discord.',
            ephemeral: true,
          })
          return
        }

        await interaction.reply({
          content: toDiscordMarkdown(formatPartyStatus(game.players)),
        })
        return
      }

      if (interaction.commandName === 'donar') {
        const providers = getDonationProviders()
        if (providers.length === 0) {
          await interaction.reply({
            content: 'Todavia no he configurado enlaces de donacion. Cuando los tengas, este comando mostrara Stripe y PayPal.',
            ephemeral: true,
          })
          return
        }

        await interaction.reply({
          content: toDiscordMarkdown(buildDonationMessage()),
          components: buildDonationButtonRows(providers),
          ephemeral: true,
        })
        return
      }

      if (interaction.commandName === 'xp') {
        const game = await storage.getGame(scope)
        if (!game || game.players.length === 0) {
          await interaction.reply({
            content: 'No hay partida activa en este scope.',
            ephemeral: true,
          })
          return
        }

        await interaction.reply({
          content: toDiscordMarkdown(formatXpSummary(game.players)),
        })
        return
      }

      if (interaction.commandName === 'habilidades') {
        const game = await storage.getGame(scope)
        if (!game || game.players.length === 0) {
          await interaction.reply({
            content: 'No hay partida activa en este scope.',
            ephemeral: true,
          })
          return
        }

        await interaction.reply({
          content: toDiscordMarkdown(formatAbilitiesSummary(game.players)),
        })
        return
      }

      if (interaction.commandName === 'memoria') {
        const game = await storage.getGame(scope)
        if (!game || !game.worldMemory?.length) {
          await interaction.reply({
            content: 'Todavia no hay memoria guardada en este scope.',
            ephemeral: true,
          })
          return
        }

        await interaction.reply({
          content: toDiscordMarkdown(formatMemorySummary(game.worldMemory)),
        })
        return
      }

      if (interaction.commandName === 'cronica') {
        const game = await storage.getGame(scope)
        if (!game || game.players.length === 0) {
          await interaction.reply({
            content: 'No hay una aventura en curso en este scope.',
            ephemeral: true,
          })
          return
        }

        const entries = await storage.getChronicleEntries(scope)
        if (!entries.length) {
          await interaction.reply({
            content: 'La cronica todavia esta vacia.',
            ephemeral: true,
          })
          return
        }

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
        const attachment = new AttachmentBuilder(Buffer.from(header + body + footer, 'utf-8'), {
          name: 'cronica_aventura.txt',
        })

        await interaction.reply({
          files: [attachment],
        })
        return
      }

      if (interaction.commandName === 'continuar') {
        const game = await storage.loadGame(scope)
        if (!game || game.phase !== 'adventure') {
          await interaction.reply({
            content: 'No hay una partida de aventura guardada en este canal o hilo. Usa /nueva.',
            ephemeral: true,
          })
          return
        }

        if (!isDiscordPlayerInGame(game, interaction.user.id)) {
          await interaction.reply({
            content: 'Solo los jugadores registrados en esta partida pueden continuar la aventura.',
            ephemeral: true,
          })
          return
        }

        storage.setCachedGame(scope, game)
        await interaction.reply({
          content: 'Reanudando la aventura en este scope de Discord...',
          ephemeral: true,
        })
        await adventureHandlers.continueAdventure(scope, game, interaction.inGuild())
        return
      }

      if (interaction.commandName === 'seguir') {
        const game = await storage.loadGame(scope)
        if (!game || game.phase !== 'adventure') {
          await interaction.reply({
            content: 'No hay una escena activa para continuar. Usa /nueva o /continuar.',
            ephemeral: true,
          })
          return
        }

        if (!isDiscordPlayerInGame(game, interaction.user.id)) {
          await interaction.reply({
            content: 'Solo los jugadores registrados en esta partida pueden empujar la escena hacia adelante.',
            ephemeral: true,
          })
          return
        }

        storage.setCachedGame(scope, game)
        await interaction.reply({
          content: 'Pidiendo al director de juego que continue la escena...',
          ephemeral: true,
        })
        await adventureHandlers.forceContinueNarration(scope, game, interaction.inGuild())
        return
      }

      if (interaction.commandName === 'actuar') {
        const game = await storage.getGame(scope)
        if (!game || game.phase !== 'adventure') {
          await interaction.reply({
            content: 'No hay una aventura activa en este canal o hilo. Usa /nueva o /continuar.',
            ephemeral: true,
          })
          return
        }

        if (!isDiscordPlayerInGame(game, interaction.user.id)) {
          await interaction.reply({
            content: 'Solo los jugadores registrados en esta partida pueden actuar en la escena.',
            ephemeral: true,
          })
          return
        }

        const text = interaction.options.getString('texto', true).trim()
        const playerCharacter = getPlayerByDiscordUserId(game, interaction.user.id)
        const actorLabel = getDiscordActorLabel(game, interaction.user)
        const userMessage = playerCharacter ? `[${playerCharacter.name}]: ${text}` : `[${actorLabel}]: ${text}`

        await interaction.reply({
          content: `${actorLabel} actua...`,
          ephemeral: true,
        })

        const channel = interaction.channel
        if (channel && typeof channel.send === 'function') {
          await channel.send(`_${actorLabel} actua..._`)
        }

        let reply
        try {
          reply = await callClaude(game, userMessage)
        } catch (error) {
          if (channel && typeof channel.send === 'function') {
            await channel.send(`Error con Claude: \`${error.message}\``).catch(() => {})
          }
          await interaction.followUp({
            content: 'No se pudo procesar la accion con Claude.',
            ephemeral: true,
          }).catch(() => {})
          return
        }

        await adventureHandlers.handleDmReply(scope, game, reply, interaction.inGuild())
        await storage.saveGame(scope, game)
        storage.setCachedGame(scope, game)
        return
      }

      if (interaction.commandName === 'ayuda') {
        await interaction.reply({
          content: buildHelpMessage(),
          ephemeral: true,
        })
      }
    } catch (error) {
      logDiscordInteractionError('Error manejando interaccion de Discord:', interaction, error, logError)

      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: interaction.isChatInputCommand?.() && interaction.commandName === 'nueva'
            ? 'Ha ocurrido un error procesando /nueva. Revisa si el bot puede crear hilos en este canal o prueba dentro de un hilo existente.'
            : 'Ha ocurrido un error procesando la interaccion de Discord.',
          ephemeral: true,
        }).catch(() => {})
      } else {
        await interaction.reply({
          content: interaction.isChatInputCommand?.() && interaction.commandName === 'nueva'
            ? 'Ha ocurrido un error procesando /nueva. Revisa si el bot puede crear hilos en este canal o prueba dentro de un hilo existente.'
            : 'Ha ocurrido un error procesando la interaccion de Discord.',
          ephemeral: true,
        }).catch(() => {})
      }
    }
  })

  await client.login(token)
  return client
}

module.exports = {
  hasDiscordEnv,
  startDiscordBot,
}
