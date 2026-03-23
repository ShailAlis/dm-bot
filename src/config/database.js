function requireEnv(name) {
  return typeof process.env[name] === 'string' && process.env[name].trim().length > 0
}

function getEnv(name) {
  return requireEnv(name) ? process.env[name].trim() : ''
}

function hasFullDatabaseUrl() {
  return /^(postgres|postgresql):\/\//i.test(getEnv('DATABASE_URL'))
}

function getDatabaseConfigIssues() {
  const rawDatabaseUrl = getEnv('DATABASE_URL')
  if (hasFullDatabaseUrl()) return []

  const host = rawDatabaseUrl || getEnv('PGHOST')
  const componentRequirements = ['PGUSER', 'PGPASSWORD', 'PGDATABASE']
  const missingComponents = componentRequirements.filter((name) => !requireEnv(name))

  if (!host && !rawDatabaseUrl) {
    return [
      'Falta DATABASE_URL o bien la combinacion PGHOST/PGUSER/PGPASSWORD/PGDATABASE.',
    ]
  }

  if (!host) {
    return ['Falta PGHOST o una DATABASE_URL valida.']
  }

  if (missingComponents.length > 0) {
    if (rawDatabaseUrl && !hasFullDatabaseUrl()) {
      return [
        `DATABASE_URL no es una URL completa de Postgres. Si quieres usarla como host, faltan ${missingComponents.join(', ')}.`,
      ]
    }

    return [
      `La configuracion de Postgres esta incompleta. Faltan ${missingComponents.join(', ')}.`,
    ]
  }

  return []
}

function buildDatabasePoolConfig() {
  const rawDatabaseUrl = getEnv('DATABASE_URL')
  const ssl = getEnv('PGSSLMODE').toLowerCase() === 'disable'
    ? false
    : { rejectUnauthorized: false }

  if (hasFullDatabaseUrl()) {
    return {
      connectionString: rawDatabaseUrl,
      ssl,
    }
  }

  const host = rawDatabaseUrl || getEnv('PGHOST')
  const port = Number.parseInt(getEnv('PGPORT') || '5432', 10)

  const config = {
    ssl,
  }

  if (host) config.host = host
  if (!Number.isNaN(port)) config.port = port
  if (requireEnv('PGUSER')) config.user = getEnv('PGUSER')
  if (requireEnv('PGPASSWORD')) config.password = getEnv('PGPASSWORD')
  if (requireEnv('PGDATABASE')) config.database = getEnv('PGDATABASE')

  return config
}

module.exports = {
  getDatabaseConfigIssues,
  buildDatabasePoolConfig,
}
