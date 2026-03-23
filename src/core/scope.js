const crypto = require('crypto')

function toStableChatId(rawId, platform) {
  const normalized = String(rawId)
  if (/^-?\d+$/.test(normalized)) return normalized

  const hash = crypto.createHash('sha256').update(`${platform}:${normalized}`).digest('hex').slice(0, 15)
  const numeric = BigInt(`0x${hash}`)
  const safe = numeric % 9000000000000000000n
  return safe.toString()
}

function normalizeScope(scopeInput, defaultPlatform = 'telegram') {
  if (scopeInput && typeof scopeInput === 'object' && !Array.isArray(scopeInput)) {
    const platform = scopeInput.platform || defaultPlatform
    const rawId = scopeInput.id ?? scopeInput.chatId ?? scopeInput.scopeId

    return {
      id: rawId,
      chatId: toStableChatId(rawId, platform),
      platform,
      type: scopeInput.type || 'chat',
      key: `${platform}:${rawId}`,
    }
  }

  return {
    id: scopeInput,
    chatId: toStableChatId(scopeInput, defaultPlatform),
    platform: defaultPlatform,
    type: 'chat',
    key: `${defaultPlatform}:${scopeInput}`,
  }
}

function getScopeCacheKey(scopeInput, defaultPlatform = 'telegram') {
  return normalizeScope(scopeInput, defaultPlatform).key
}

module.exports = {
  normalizeScope,
  getScopeCacheKey,
}
