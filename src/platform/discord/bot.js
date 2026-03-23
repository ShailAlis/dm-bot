const {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
} = require('discord.js')
const { buildDiscordCommands } = require('./commands')
const { logDiscordInteractionError } = require('./utils')
const { createDiscordAdventureHandlers } = require('./adventure-runtime')
const { createDiscordCommandHandlers } = require('./command-handlers')
const { createDiscordComponentHandlers } = require('./component-handlers')

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
  const commandHandlers = createDiscordCommandHandlers({
    storage,
    adventureHandlers,
    logError,
  })
  const componentHandlers = createDiscordComponentHandlers({
    storage,
    adventureHandlers,
    logError,
  })

  client.once(Events.ClientReady, (readyClient) => {
    log(`Discord bot iniciado como ${readyClient.user.tag}`)
  })

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      const handledNonCommand = await componentHandlers.handleNonCommandInteraction(interaction)
      if (handledNonCommand) return

      if (!interaction.isChatInputCommand()) return
      await commandHandlers.handleChatInputCommand(interaction)
    } catch (error) {
      logDiscordInteractionError('Error manejando interaccion de Discord:', interaction, error, logError)

      const genericMessage = interaction.isChatInputCommand?.() && interaction.commandName === 'nueva'
        ? 'Ha ocurrido un error procesando /nueva. Revisa si el bot puede crear hilos en este canal o prueba dentro de un hilo existente.'
        : 'Ha ocurrido un error procesando la interaccion de Discord.'

      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: genericMessage,
          ephemeral: true,
        }).catch(() => {})
      } else {
        await interaction.reply({
          content: genericMessage,
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
