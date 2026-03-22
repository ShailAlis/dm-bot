const { Pool } = require('pg')

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
  }
}

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS games (
      chat_id BIGINT PRIMARY KEY,
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
      telegram_user_id BIGINT,
      telegram_username TEXT,
      name TEXT,
      race TEXT,
      class TEXT,
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
      type TEXT,
      title TEXT,
      description TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS chronicle (
      id SERIAL PRIMARY KEY,
      chat_id BIGINT REFERENCES games(chat_id) ON DELETE CASCADE,
      entry TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS world_context (
      chat_id BIGINT PRIMARY KEY REFERENCES games(chat_id) ON DELETE CASCADE,
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
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS votes (
      id SERIAL PRIMARY KEY,
      chat_id BIGINT REFERENCES games(chat_id) ON DELETE CASCADE,
      question TEXT,
      options JSONB,
      votes JSONB DEFAULT '{}'::jsonb,
      required_voters JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMP DEFAULT NOW()
    );
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
    telegramUserId: player.telegram_user_id,
    telegramUsername: player.telegram_username,
  }
}

async function loadWorldContext(chatId) {
  const result = await pool.query('SELECT * FROM world_context WHERE chat_id = $1', [chatId])
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
  }
}

async function loadGame(chatId) {
  const gameResult = await pool.query('SELECT * FROM games WHERE chat_id = $1', [chatId])
  if (gameResult.rows.length === 0) return null

  const gameRow = gameResult.rows[0]
  const playersResult = await pool.query('SELECT * FROM players WHERE chat_id = $1 ORDER BY id', [chatId])
  const memoryResult = await pool.query(
    'SELECT * FROM world_memory WHERE chat_id = $1 ORDER BY created_at DESC LIMIT 30',
    [chatId],
  )
  const worldContext = await loadWorldContext(chatId)

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
  }
}

async function saveGame(chatId, game) {
  await withTransaction(async (client) => {
    await client.query(
      `
        INSERT INTO games (
          chat_id, phase, num_players, setup_step, setup_substep, setup_buffer, history, current_turn, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        ON CONFLICT (chat_id) DO UPDATE SET
          phase = $2,
          num_players = $3,
          setup_step = $4,
          setup_substep = $5,
          setup_buffer = $6,
          history = $7,
          current_turn = $8,
          updated_at = NOW()
      `,
      [
        chatId,
        game.phase,
        game.numPlayers,
        game.setupStep,
        game.setupSubStep,
        JSON.stringify(game.setupBuffer || {}),
        JSON.stringify(game.history || []),
        game.currentTurn || 0,
      ],
    )

    await client.query('DELETE FROM players WHERE chat_id = $1', [chatId])

    for (const player of game.players || []) {
      await client.query(
        `
          INSERT INTO players (
            chat_id, telegram_user_id, telegram_username, name, race, class, background, trait, motivation,
            hp, max_hp, ac, stats, inventory, conditions, xp, level, abilities
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        `,
        [
          chatId,
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

async function saveMemory(chatId, type, title, description) {
  await pool.query(
    'INSERT INTO world_memory (chat_id, type, title, description) VALUES ($1, $2, $3, $4)',
    [chatId, type, title, description],
  )
}

async function addChronicleEntry(chatId, entry) {
  await pool.query('INSERT INTO chronicle (chat_id, entry) VALUES ($1, $2)', [chatId, entry])
}

async function getChronicleEntries(chatId) {
  const result = await pool.query(
    'SELECT entry, created_at FROM chronicle WHERE chat_id = $1 ORDER BY created_at ASC',
    [chatId],
  )
  return result.rows
}

async function saveWorldContext(chatId, context) {
  await pool.query(
    `
      INSERT INTO world_context (
        chat_id, town_name, town_type, town_population, town_event, town_landmark,
        tavern_name, tavern_wealth, tavern_feature, tavern_rumor, tavern_brew_name, tavern_brew_desc,
        npc_summary, npc_pocket, npc_secret, plot_hook, encounter, curiosity, extra_rumor
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      ON CONFLICT (chat_id) DO UPDATE SET
        town_name = $2,
        town_type = $3,
        town_population = $4,
        town_event = $5,
        town_landmark = $6,
        tavern_name = $7,
        tavern_wealth = $8,
        tavern_feature = $9,
        tavern_rumor = $10,
        tavern_brew_name = $11,
        tavern_brew_desc = $12,
        npc_summary = $13,
        npc_pocket = $14,
        npc_secret = $15,
        plot_hook = $16,
        encounter = $17,
        curiosity = $18,
        extra_rumor = $19
    `,
    [
      chatId,
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
    ],
  )
}

async function createVote(chatId, question, options, requiredVoters) {
  return withTransaction(async (client) => {
    await client.query('DELETE FROM votes WHERE chat_id = $1', [chatId])
    const result = await client.query(
      `
        INSERT INTO votes (chat_id, question, options, votes, required_voters)
        VALUES ($1, $2, $3, '{}'::jsonb, $4)
        RETURNING id
      `,
      [chatId, question, JSON.stringify(options), JSON.stringify(requiredVoters)],
    )
    return result.rows[0].id
  })
}

async function getActiveVote(chatId) {
  const result = await pool.query(
    'SELECT * FROM votes WHERE chat_id = $1 ORDER BY created_at DESC LIMIT 1',
    [chatId],
  )
  return result.rows[0] || null
}

async function castVote(chatId, userId, option) {
  const vote = await getActiveVote(chatId)
  if (!vote) return null

  const votes = vote.votes || {}
  votes[String(userId)] = option
  await pool.query('UPDATE votes SET votes = $1 WHERE id = $2', [JSON.stringify(votes), vote.id])

  const required = vote.required_voters || []
  const allVoted = required.every((requiredUserId) => votes[String(requiredUserId)] !== undefined)
  return { vote: { ...vote, votes }, allVoted }
}

async function clearVote(chatId) {
  await pool.query('DELETE FROM votes WHERE chat_id = $1', [chatId])
}

async function deleteGame(chatId) {
  await pool.query('DELETE FROM games WHERE chat_id = $1', [chatId])
}

async function resetGame(chatId) {
  await withTransaction(async (client) => {
    await client.query('DELETE FROM games WHERE chat_id = $1', [chatId])
    await client.query(
      `
        INSERT INTO games (chat_id, phase, num_players, setup_step, setup_substep, setup_buffer, history, current_turn)
        VALUES ($1, 'setup', 0, 0, 'num_players', '{}'::jsonb, '[]'::jsonb, 0)
      `,
      [chatId],
    )
  })
}

async function getGame(chatId) {
  if (cache.has(chatId)) return cache.get(chatId)
  const game = await loadGame(chatId)
  if (game) {
    cache.set(chatId, game)
    return game
  }
  return createEmptyGame()
}

function setCachedGame(chatId, game) {
  cache.set(chatId, game)
}

function clearCachedGame(chatId) {
  cache.delete(chatId)
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
