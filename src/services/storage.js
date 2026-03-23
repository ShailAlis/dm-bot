const { Pool } = require('pg')
const { getScopeCacheKey, normalizeScope } = require('../core/scope')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

const cache = new Map()

async function withTransaction(callback) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await callback(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

function createEmptyGame() {
  return {
    phase: 'idle',
    players: [],
    numPlayers: 0,
    setupStep: 0,
    setupSubStep: 'num_players',
    setupBuffer: {},
    history: [],
    currentTurn: 0,
    worldMemory: [],
    worldContext: null,
    scope: null,
  }
}

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS games (
      chat_id BIGINT PRIMARY KEY,
      scope_key TEXT,
      platform TEXT DEFAULT 'telegram',
      scope_type TEXT DEFAULT 'chat',
      phase TEXT DEFAULT 'idle',
      num_players INT DEFAULT 0,
      setup_step INT DEFAULT 0,
      setup_substep TEXT DEFAULT 'num_players',
      setup_buffer JSONB DEFAULT '{}'::jsonb,
      history JSONB DEFAULT '[]'::jsonb,
      current_turn INT DEFAULT 0,
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS players (
      id SERIAL PRIMARY KEY,
      chat_id BIGINT REFERENCES games(chat_id) ON DELETE CASCADE,
      scope_key TEXT,
      platform TEXT DEFAULT 'telegram',
      platform_user_id TEXT,
      platform_username TEXT,
      telegram_user_id BIGINT,
      telegram_username TEXT,
      name TEXT,
      race TEXT,
      "class" TEXT,
      background TEXT,
      trait TEXT,
      motivation TEXT,
      hp INT,
      max_hp INT,
      ac INT,
      stats JSONB,
      inventory JSONB DEFAULT '[]'::jsonb,
      conditions JSONB DEFAULT '[]'::jsonb,
      xp INT DEFAULT 0,
      level INT DEFAULT 1,
      abilities JSONB DEFAULT '[]'::jsonb
    );

    CREATE TABLE IF NOT EXISTS world_memory (
      id SERIAL PRIMARY KEY,
      chat_id BIGINT REFERENCES games(chat_id) ON DELETE CASCADE,
      scope_key TEXT,
      platform TEXT DEFAULT 'telegram',
      type TEXT,
      title TEXT,
      description TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS chronicle (
      id SERIAL PRIMARY KEY,
      chat_id BIGINT REFERENCES games(chat_id) ON DELETE CASCADE,
      scope_key TEXT,
      platform TEXT DEFAULT 'telegram',
      entry TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS world_context (
      chat_id BIGINT PRIMARY KEY REFERENCES games(chat_id) ON DELETE CASCADE,
      scope_key TEXT,
      platform TEXT DEFAULT 'telegram',
      town_name TEXT,
      town_type TEXT,
      town_population INT,
      town_event TEXT,
      town_landmark TEXT,
      tavern_name TEXT,
      tavern_wealth TEXT,
      tavern_feature TEXT,
      tavern_rumor TEXT,
      tavern_brew_name TEXT,
      tavern_brew_desc TEXT,
      npc_summary TEXT,
      npc_pocket TEXT,
      npc_secret TEXT,
      plot_hook TEXT,
      encounter TEXT,
      curiosity TEXT,
      extra_rumor TEXT,
      extra_context JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS votes (
      id SERIAL PRIMARY KEY,
      chat_id BIGINT REFERENCES games(chat_id) ON DELETE CASCADE,
      scope_key TEXT,
      platform TEXT DEFAULT 'telegram',
      question TEXT,
      options JSONB,
      votes JSONB DEFAULT '{}'::jsonb,
      required_voters JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `)

  await pool.query(`
    ALTER TABLE games ADD COLUMN IF NOT EXISTS scope_key TEXT;
    ALTER TABLE games ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'telegram';
    ALTER TABLE games ADD COLUMN IF NOT EXISTS scope_type TEXT DEFAULT 'chat';
    ALTER TABLE players ADD COLUMN IF NOT EXISTS telegram_user_id BIGINT;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS telegram_username TEXT;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS scope_key TEXT;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'telegram';
    ALTER TABLE players ADD COLUMN IF NOT EXISTS platform_user_id TEXT;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS platform_username TEXT;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS background TEXT;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS trait TEXT;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS motivation TEXT;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS max_hp INT;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS ac INT;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS stats JSONB DEFAULT '{}'::jsonb;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS inventory JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS conditions JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS xp INT DEFAULT 0;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS level INT DEFAULT 1;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS abilities JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE players ADD COLUMN IF NOT EXISTS "class" TEXT;

    ALTER TABLE games ADD COLUMN IF NOT EXISTS setup_substep TEXT DEFAULT 'num_players';
    ALTER TABLE games ADD COLUMN IF NOT EXISTS setup_buffer JSONB DEFAULT '{}'::jsonb;
    ALTER TABLE games ADD COLUMN IF NOT EXISTS history JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE games ADD COLUMN IF NOT EXISTS current_turn INT DEFAULT 0;
    ALTER TABLE games ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

    ALTER TABLE world_memory ADD COLUMN IF NOT EXISTS scope_key TEXT;
    ALTER TABLE world_memory ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'telegram';
    ALTER TABLE chronicle ADD COLUMN IF NOT EXISTS scope_key TEXT;
    ALTER TABLE chronicle ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'telegram';
    ALTER TABLE world_context ADD COLUMN IF NOT EXISTS scope_key TEXT;
    ALTER TABLE world_context ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'telegram';
    ALTER TABLE world_context ADD COLUMN IF NOT EXISTS extra_context JSONB DEFAULT '{}'::jsonb;
    ALTER TABLE votes ADD COLUMN IF NOT EXISTS scope_key TEXT;
    ALTER TABLE votes ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'telegram';
  `)

  await pool.query(`
    UPDATE games
    SET platform = COALESCE(NULLIF(platform, ''), 'telegram'),
        scope_type = COALESCE(NULLIF(scope_type, ''), 'chat'),
        scope_key = COALESCE(NULLIF(scope_key, ''), CONCAT(COALESCE(NULLIF(platform, ''), 'telegram'), ':', chat_id::text))
    WHERE scope_key IS NULL
       OR scope_key = ''
       OR platform IS NULL
       OR platform = ''
       OR scope_type IS NULL
       OR scope_type = '';

    UPDATE players
    SET platform = COALESCE(NULLIF(platform, ''), 'telegram'),
        scope_key = COALESCE(NULLIF(scope_key, ''), CONCAT(COALESCE(NULLIF(platform, ''), 'telegram'), ':', chat_id::text)),
        platform_user_id = COALESCE(NULLIF(platform_user_id, ''), telegram_user_id::text),
        platform_username = COALESCE(NULLIF(platform_username, ''), telegram_username)
    WHERE scope_key IS NULL
       OR scope_key = ''
       OR platform IS NULL
       OR platform = ''
       OR (telegram_user_id IS NOT NULL AND (platform_user_id IS NULL OR platform_user_id = ''))
       OR (telegram_username IS NOT NULL AND (platform_username IS NULL OR platform_username = ''));

    UPDATE world_memory
    SET platform = COALESCE(NULLIF(platform, ''), 'telegram'),
        scope_key = COALESCE(NULLIF(scope_key, ''), CONCAT(COALESCE(NULLIF(platform, ''), 'telegram'), ':', chat_id::text))
    WHERE scope_key IS NULL
       OR scope_key = ''
       OR platform IS NULL
       OR platform = '';

    UPDATE chronicle
    SET platform = COALESCE(NULLIF(platform, ''), 'telegram'),
        scope_key = COALESCE(NULLIF(scope_key, ''), CONCAT(COALESCE(NULLIF(platform, ''), 'telegram'), ':', chat_id::text))
    WHERE scope_key IS NULL
       OR scope_key = ''
       OR platform IS NULL
       OR platform = '';

    UPDATE world_context
    SET platform = COALESCE(NULLIF(platform, ''), 'telegram'),
        scope_key = COALESCE(NULLIF(scope_key, ''), CONCAT(COALESCE(NULLIF(platform, ''), 'telegram'), ':', chat_id::text))
    WHERE scope_key IS NULL
       OR scope_key = ''
       OR platform IS NULL
       OR platform = '';

    UPDATE votes
    SET platform = COALESCE(NULLIF(platform, ''), 'telegram'),
        scope_key = COALESCE(NULLIF(scope_key, ''), CONCAT(COALESCE(NULLIF(platform, ''), 'telegram'), ':', chat_id::text))
    WHERE scope_key IS NULL
       OR scope_key = ''
       OR platform IS NULL
       OR platform = '';
  `)

  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS games_scope_key_idx ON games(scope_key)')
  await pool.query('CREATE INDEX IF NOT EXISTS players_scope_key_idx ON players(scope_key)')
  await pool.query('CREATE INDEX IF NOT EXISTS world_memory_scope_key_idx ON world_memory(scope_key)')
  await pool.query('CREATE INDEX IF NOT EXISTS chronicle_scope_key_idx ON chronicle(scope_key)')
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS world_context_scope_key_idx ON world_context(scope_key)')
  await pool.query('CREATE INDEX IF NOT EXISTS votes_scope_key_idx ON votes(scope_key)')

  await pool.query(`
    UPDATE players
    SET max_hp = COALESCE(max_hp, hp),
        xp = COALESCE(xp, 0),
        level = COALESCE(level, 1),
        inventory = COALESCE(inventory, '[]'::jsonb),
        conditions = COALESCE(conditions, '[]'::jsonb),
        abilities = COALESCE(abilities, '[]'::jsonb),
        stats = COALESCE(stats, '{}'::jsonb),
        platform = COALESCE(NULLIF(platform, ''), 'telegram')
    WHERE max_hp IS NULL
       OR xp IS NULL
       OR level IS NULL
       OR inventory IS NULL
       OR conditions IS NULL
       OR abilities IS NULL
       OR stats IS NULL
       OR platform IS NULL
       OR platform = '';
  `)
}

function mapPlayerRow(player) {
  return {
    name: player.name,
    race: player.race,
    class: player.class,
    background: player.background,
    trait: player.trait,
    motivation: player.motivation,
    hp: player.hp,
    maxHp: player.max_hp,
    ac: player.ac,
    stats: player.stats || {},
    inventory: player.inventory || [],
    conditions: player.conditions || [],
    xp: player.xp || 0,
    level: player.level || 1,
    abilities: player.abilities || [],
    platform: player.platform || 'telegram',
    platformUserId: player.platform_user_id,
    platformUsername: player.platform_username,
    telegramUserId: player.telegram_user_id,
    telegramUsername: player.telegram_username,
  }
}

async function loadWorldContext(scopeInput) {
  const scope = normalizeScope(scopeInput)
  const result = await pool.query('SELECT * FROM world_context WHERE scope_key = $1', [scope.key])
  if (result.rows.length === 0) return null

  const row = result.rows[0]
  return {
    town: {
      name: row.town_name,
      type: row.town_type,
      population: row.town_population,
      event: row.town_event,
      landmark: row.town_landmark,
    },
    tavern: {
      name: row.tavern_name,
      wealth: row.tavern_wealth,
      feature: row.tavern_feature,
      rumor: row.tavern_rumor,
      specialBrew: {
        name: row.tavern_brew_name,
        desc: row.tavern_brew_desc,
      },
    },
    npc: {
      summary: row.npc_summary,
      pocket: row.npc_pocket,
      secret: row.npc_secret,
    },
    hook: { summary: row.plot_hook },
    encounter: { description: row.encounter },
    curiosity: row.curiosity,
    rumor: row.extra_rumor,
    extraContext: row.extra_context || {},
  }
}

async function loadGame(scopeInput) {
  const scope = normalizeScope(scopeInput)
  const gameResult = await pool.query('SELECT * FROM games WHERE scope_key = $1', [scope.key])
  if (gameResult.rows.length === 0) return null

  const gameRow = gameResult.rows[0]
  const playersResult = await pool.query('SELECT * FROM players WHERE scope_key = $1 ORDER BY id', [scope.key])
  const memoryResult = await pool.query(
    'SELECT * FROM world_memory WHERE scope_key = $1 ORDER BY created_at DESC LIMIT 30',
    [scope.key],
  )
  const worldContext = await loadWorldContext(scope)

  return {
    phase: gameRow.phase || 'idle',
    numPlayers: gameRow.num_players || 0,
    setupStep: gameRow.setup_step || 0,
    setupSubStep: gameRow.setup_substep || 'num_players',
    setupBuffer: gameRow.setup_buffer || {},
    history: gameRow.history || [],
    currentTurn: gameRow.current_turn || 0,
    players: playersResult.rows.map(mapPlayerRow),
    worldMemory: memoryResult.rows || [],
    worldContext,
    scope,
  }
}

async function saveGame(scopeInput, game) {
  const scope = normalizeScope(scopeInput)
  await withTransaction(async (client) => {
    await client.query(
      `
        INSERT INTO games (
          chat_id, scope_key, platform, scope_type, phase, num_players, setup_step, setup_substep, setup_buffer, history, current_turn, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
        ON CONFLICT (scope_key) DO UPDATE SET
          chat_id = $1,
          platform = $3,
          scope_type = $4,
          phase = $5,
          num_players = $6,
          setup_step = $7,
          setup_substep = $8,
          setup_buffer = $9,
          history = $10,
          current_turn = $11,
          updated_at = NOW()
      `,
      [
        scope.chatId,
        scope.key,
        scope.platform,
        scope.type,
        game.phase,
        game.numPlayers,
        game.setupStep,
        game.setupSubStep,
        JSON.stringify(game.setupBuffer || {}),
        JSON.stringify(game.history || []),
        game.currentTurn || 0,
      ],
    )

    await client.query('DELETE FROM players WHERE scope_key = $1', [scope.key])

    for (const player of game.players || []) {
      await client.query(
        `
          INSERT INTO players (
            chat_id, scope_key, platform, platform_user_id, platform_username,
            telegram_user_id, telegram_username, name, race, "class", background, trait, motivation,
            hp, max_hp, ac, stats, inventory, conditions, xp, level, abilities
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
        `,
        [
          scope.chatId,
          scope.key,
          scope.platform,
          player.platformUserId || player.telegramUserId?.toString() || null,
          player.platformUsername || player.telegramUsername || null,
          player.telegramUserId || null,
          player.telegramUsername || null,
          player.name,
          player.race,
          player.class,
          player.background,
          player.trait,
          player.motivation,
          player.hp,
          player.maxHp,
          player.ac,
          JSON.stringify(player.stats || {}),
          JSON.stringify(player.inventory || []),
          JSON.stringify(player.conditions || []),
          player.xp || 0,
          player.level || 1,
          JSON.stringify(player.abilities || []),
        ],
      )
    }
  })
}

async function saveMemory(scopeInput, type, title, description) {
  const scope = normalizeScope(scopeInput)
  await pool.query(
    'INSERT INTO world_memory (chat_id, scope_key, platform, type, title, description) VALUES ($1, $2, $3, $4, $5, $6)',
    [scope.chatId, scope.key, scope.platform, type, title, description],
  )
}

async function addChronicleEntry(scopeInput, entry) {
  const scope = normalizeScope(scopeInput)
  await pool.query('INSERT INTO chronicle (chat_id, scope_key, platform, entry) VALUES ($1, $2, $3, $4)', [
    scope.chatId,
    scope.key,
    scope.platform,
    entry,
  ])
}

async function getChronicleEntries(scopeInput) {
  const scope = normalizeScope(scopeInput)
  const result = await pool.query(
    'SELECT entry, created_at FROM chronicle WHERE scope_key = $1 ORDER BY created_at ASC',
    [scope.key],
  )
  return result.rows
}

async function saveWorldContext(scopeInput, context) {
  const scope = normalizeScope(scopeInput)
  await pool.query(
    `
      INSERT INTO world_context (
        chat_id, scope_key, platform, town_name, town_type, town_population, town_event, town_landmark,
        tavern_name, tavern_wealth, tavern_feature, tavern_rumor, tavern_brew_name, tavern_brew_desc,
        npc_summary, npc_pocket, npc_secret, plot_hook, encounter, curiosity, extra_rumor, extra_context
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
      ON CONFLICT (scope_key) DO UPDATE SET
        chat_id = $1,
        platform = $3,
        town_name = $4,
        town_type = $5,
        town_population = $6,
        town_event = $7,
        town_landmark = $8,
        tavern_name = $9,
        tavern_wealth = $10,
        tavern_feature = $11,
        tavern_rumor = $12,
        tavern_brew_name = $13,
        tavern_brew_desc = $14,
        npc_summary = $15,
        npc_pocket = $16,
        npc_secret = $17,
        plot_hook = $18,
        encounter = $19,
        curiosity = $20,
        extra_rumor = $21,
        extra_context = $22
    `,
    [
      scope.chatId,
      scope.key,
      scope.platform,
      context.town.name,
      context.town.type,
      context.town.population,
      context.town.event,
      context.town.landmark,
      context.tavern.name,
      context.tavern.wealth,
      context.tavern.feature,
      context.tavern.rumor,
      context.tavern.specialBrew.name,
      context.tavern.specialBrew.desc,
      context.npc.summary,
      context.npc.pocket,
      context.npc.secret,
      context.hook.summary,
      context.encounter.description,
      context.curiosity,
      context.rumor,
      JSON.stringify(context.extraContext || {}),
    ],
  )
}

async function createVote(scopeInput, question, options, requiredVoters) {
  const scope = normalizeScope(scopeInput)
  return withTransaction(async (client) => {
    await client.query('DELETE FROM votes WHERE scope_key = $1', [scope.key])
    const result = await client.query(
      `
        INSERT INTO votes (chat_id, scope_key, platform, question, options, votes, required_voters)
        VALUES ($1, $2, $3, $4, $5, '{}'::jsonb, $6)
        RETURNING id
      `,
      [scope.chatId, scope.key, scope.platform, question, JSON.stringify(options), JSON.stringify(requiredVoters)],
    )
    return result.rows[0].id
  })
}

async function getActiveVote(scopeInput) {
  const scope = normalizeScope(scopeInput)
  const result = await pool.query(
    'SELECT * FROM votes WHERE scope_key = $1 ORDER BY created_at DESC LIMIT 1',
    [scope.key],
  )
  return result.rows[0] || null
}

async function castVote(scopeInput, userId, option) {
  const vote = await getActiveVote(scopeInput)
  if (!vote) return null

  const votes = vote.votes || {}
  votes[String(userId)] = option
  await pool.query('UPDATE votes SET votes = $1 WHERE id = $2', [JSON.stringify(votes), vote.id])

  const required = vote.required_voters || []
  const allVoted = required.every((requiredUserId) => votes[String(requiredUserId)] !== undefined)
  return { vote: { ...vote, votes }, allVoted }
}

async function clearVote(scopeInput) {
  const scope = normalizeScope(scopeInput)
  await pool.query('DELETE FROM votes WHERE scope_key = $1', [scope.key])
}

async function deleteGame(scopeInput) {
  const scope = normalizeScope(scopeInput)
  await pool.query('DELETE FROM games WHERE scope_key = $1', [scope.key])
}

async function resetGame(scopeInput) {
  const scope = normalizeScope(scopeInput)
  await withTransaction(async (client) => {
    await client.query('DELETE FROM games WHERE scope_key = $1', [scope.key])
    await client.query(
      `
        INSERT INTO games (
          chat_id, scope_key, platform, scope_type, phase, num_players, setup_step, setup_substep, setup_buffer, history, current_turn
        )
        VALUES ($1, $2, $3, $4, 'setup', 0, 0, 'num_players', '{}'::jsonb, '[]'::jsonb, 0)
      `,
      [scope.chatId, scope.key, scope.platform, scope.type],
    )
  })
}

async function getGame(scopeInput) {
  const cacheKey = getScopeCacheKey(scopeInput)
  if (cache.has(cacheKey)) return cache.get(cacheKey)
  const game = await loadGame(scopeInput)
  if (game) {
    cache.set(cacheKey, game)
    return game
  }
  return { ...createEmptyGame(), scope: normalizeScope(scopeInput) }
}

function setCachedGame(scopeInput, game) {
  cache.set(getScopeCacheKey(scopeInput), game)
}

function clearCachedGame(scopeInput) {
  cache.delete(getScopeCacheKey(scopeInput))
}

module.exports = {
  pool,
  initDB,
  loadGame,
  saveGame,
  saveMemory,
  addChronicleEntry,
  getChronicleEntries,
  saveWorldContext,
  createVote,
  getActiveVote,
  castVote,
  clearVote,
  deleteGame,
  resetGame,
  getGame,
  setCachedGame,
  clearCachedGame,
  createEmptyGame,
}
