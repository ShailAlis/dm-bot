function serializeError(error) {
  if (!error) {
    return {
      name: 'Error',
      message: 'Error desconocido',
      stack: null,
    }
  }

  if (error instanceof Error) {
    return {
      name: error.name || 'Error',
      message: error.message || 'Error sin mensaje',
      stack: error.stack || null,
      code: error.code,
      status: error.status,
    }
  }

  return {
    name: 'NonError',
    message: typeof error === 'string' ? error : JSON.stringify(error),
    stack: null,
  }
}

function describeError(error) {
  const serialized = serializeError(error)
  return serialized.message || 'Error desconocido'
}

function logErrorWithContext(message, error, context = {}, logger = console.error) {
  logger(message, {
    context,
    error: serializeError(error),
  })
}

module.exports = {
  serializeError,
  describeError,
  logErrorWithContext,
}
