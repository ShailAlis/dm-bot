function normalizeScope(scopeInput, defaultPlatform = 'telegram') {
  if (scopeInput && typeof scopeInput === 'object' && !Array.isArray(scopeInput)) {
    const platform = scopeInput.platform || defaultPlatform
    const rawId = scopeInput.id ?? scopeInput.chatId ?? scopeInput.scopeId

    return {
      id: rawId,
      chatId: rawId,
      platform,
      type: scopeInput.type || 'chat',
      key: `${platform}:${rawId}`,
    }
  }

  return {
    id: scopeInput,
    chatId: scopeInput,
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
