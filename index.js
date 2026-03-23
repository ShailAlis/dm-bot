require('dotenv').config()

const storage = require('./src/services/storage')
const { startTelegramBot } = require('./src/platform/telegram/bot')
const { hasDiscordEnv, startDiscordBot } = require('./src/platform/discord/bot')
const { logErrorWithContext } = require('./src/core/errors')
const { startWebhookServer } = require('./src/services/webhooks')

const REQUIRED_ENV_VARS = ['TELEGRAM_TOKEN', 'DATABASE_URL', 'ANTHROPIC_API_KEY']

process.on('unhandledRejection', (reason) => {
  logErrorWithContext('Promesa no controlada en el proceso principal.', reason)
})

process.on('uncaughtExceptionMonitor', (error) => {
  logErrorWithContext('Excepcion no capturada observada en el proceso principal.', error)
})

function requireEnv(name) {
  return typeof process.env[name] === 'string' && process.env[name].trim().length > 0
}

function validateEnv() {
  const missing = REQUIRED_ENV_VARS.filter((name) => !requireEnv(name))
  if (missing.length > 0) {
    throw new Error(`Faltan variables de entorno requeridas: ${missing.join(', ')}`)
  }
}

async function bootstrap() {
  validateEnv()
  await storage.initDB()
  await startTelegramBot({ storage })
  startWebhookServer()

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
