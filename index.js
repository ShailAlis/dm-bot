require('dotenv').config()

const storage = require('./src/services/storage')
const { startTelegramBot } = require('./src/platform/telegram/bot')
const { hasDiscordEnv, startDiscordBot } = require('./src/platform/discord/bot')
const { startWebServer } = require('./src/platform/web/server')
const { logErrorWithContext } = require('./src/core/errors')

process.on('unhandledRejection', (reason) => {
  logErrorWithContext('Promesa no controlada en el proceso principal.', reason)
})

process.on('uncaughtExceptionMonitor', (error) => {
  logErrorWithContext('Excepcion no capturada observada en el proceso principal.', error)
})

function requireEnv(name) {
  return typeof process.env[name] === 'string' && process.env[name].trim().length > 0
}

function isDisabled(name) {
  return ['1', 'true', 'si', 'yes'].includes(String(process.env[name] || '').trim().toLowerCase())
}

function hasWebEnv() {
  return !isDisabled('WEB_DISABLED')
}

function hasTelegramEnv() {
  return requireEnv('TELEGRAM_TOKEN')
}

function validateEnv() {
  const wantsTelegram = hasTelegramEnv()
  const wantsDiscord = hasDiscordEnv()
  const wantsWeb = hasWebEnv()
  const activePlatforms = [
    wantsTelegram ? 'telegram' : null,
    wantsDiscord ? 'discord' : null,
    wantsWeb ? 'web' : null,
  ].filter(Boolean)

  if (activePlatforms.length === 0) {
    throw new Error(
      'No hay ninguna plataforma configurada para arrancar. Define TELEGRAM_TOKEN, o DISCORD_TOKEN + DISCORD_CLIENT_ID, o PORT/WEB_PORT.',
    )
  }

  const requiredEnvVars = ['DATABASE_URL']
  if (activePlatforms.some((platform) => ['telegram', 'discord', 'web'].includes(platform))) {
    requiredEnvVars.push('ANTHROPIC_API_KEY')
  }

  const missing = requiredEnvVars.filter((name) => !requireEnv(name))
  if (missing.length > 0) {
    throw new Error(`Faltan variables de entorno requeridas: ${missing.join(', ')}`)
  }
}

async function bootstrap() {
  validateEnv()
  await storage.initDB()

  if (hasTelegramEnv()) {
    await startTelegramBot({ storage })
    console.log('Integracion de Telegram activada')
  } else {
    console.log('Integracion de Telegram desactivada (falta TELEGRAM_TOKEN)')
  }

  if (hasWebEnv()) {
    startWebServer({ storage })
    console.log('Integracion web activada')
  } else {
    console.log('Integracion web desactivada (falta PORT o WEB_PORT)')
  }

  if (hasDiscordEnv()) {
    try {
      await startDiscordBot({ storage })
      console.log('Integracion de Discord activada')
    } catch (error) {
      console.error('No se pudo iniciar la integracion de Discord:', error.message)
      console.error('Telegram seguira funcionando mientras revisas DISCORD_TOKEN y DISCORD_CLIENT_ID')
    }
  } else {
    console.log('Integracion de Discord desactivada (faltan DISCORD_TOKEN y/o DISCORD_CLIENT_ID)')
  }

  console.log('Bot DM Automatico iniciado')
}

bootstrap().catch((error) => {
  console.error('No se pudo iniciar el bot:', error)
  process.exit(1)
})
