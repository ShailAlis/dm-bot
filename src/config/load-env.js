const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')

function decodeEnvBuffer(buffer) {
  if (!buffer || buffer.length === 0) return ''

  if (buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.toString('utf16le')
  }

  if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.allocUnsafe(buffer.length - 2)
    for (let index = 2; index < buffer.length; index += 2) {
      swapped[index - 2] = buffer[index + 1]
      swapped[index - 1] = buffer[index]
    }
    return swapped.toString('utf16le')
  }

  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.toString('utf8', 3)
  }

  return buffer.toString('utf8')
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return { filePath, loaded: false, parsed: {} }

  const buffer = fs.readFileSync(filePath)
  const content = decodeEnvBuffer(buffer)
  const parsed = dotenv.parse(content)

  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }

  return {
    filePath,
    loaded: true,
    parsed,
  }
}

function loadEnvFiles(rootDir = process.cwd()) {
  const candidates = ['.env', '.env.local'].map((file) => path.join(rootDir, file))
  return candidates.map(loadEnvFile)
}

module.exports = {
  loadEnvFiles,
}
