// ============================================================
//  DM AUTOMÁTICO — Bot de Telegram + Claude + PostgreSQL
// ============================================================

// ── package.json ─────────────────────────────────────────────
// {
//   "name": "dm-bot",
//   "version": "1.0.0",
//   "main": "index.js",
//   "scripts": { "start": "node index.js" },
//   "dependencies": {
//     "node-telegram-bot-api": "^0.64.0",
//     "@anthropic-ai/sdk": "^0.20.0",
//     "dotenv": "^16.4.5",
//     "pg": "^8.11.0"
//   }
// }

// ── .env ─────────────────────────────────────────────────────
// TELEGRAM_TOKEN=tu_token
// ANTHROPIC_API_KEY=sk-ant-xxxxxxx
// DATABASE_URL=postgresql://...

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const Anthropic = require('@anthropic-ai/sdk');
const EEEG = require('./eeeg');
const { Pool } = require('pg');

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// ── Inicializar base de datos ─────────────────────────────────
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS games (
      chat_id BIGINT PRIMARY KEY,
      phase TEXT DEFAULT 'idle',
      num_players INT DEFAULT 0,
      setup_step INT DEFAULT 0,
      setup_substep TEXT DEFAULT 'num_players',
      setup_buffer JSONB DEFAULT '{}',
      history JSONB DEFAULT '[]',
      current_turn INT DEFAULT 0,
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS players (
      id SERIAL PRIMARY KEY,
      chat_id BIGINT REFERENCES games(chat_id) ON DELETE CASCADE,
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
      inventory JSONB DEFAULT '[]',
      conditions JSONB DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS world_memory (
      id SERIAL PRIMARY KEY,
      chat_id BIGINT REFERENCES games(chat_id) ON DELETE CASCADE,
      type TEXT,  -- 'decision' | 'location' | 'npc'
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
  `);
  console.log('✅ Base de datos inicializada');
}

// ── DB: Cargar partida ────────────────────────────────────────
async function loadGame(chatId) {
  const gRes = await pool.query('SELECT * FROM games WHERE chat_id = $1', [chatId]);
  if (gRes.rows.length === 0) return null;
  const g = gRes.rows[0];

  const pRes = await pool.query('SELECT * FROM players WHERE chat_id = $1 ORDER BY id', [chatId]);
  const wRes = await pool.query('SELECT * FROM world_memory WHERE chat_id = $1 ORDER BY created_at DESC LIMIT 30', [chatId]);

  return {
    phase: g.phase,
    numPlayers: g.num_players,
    setupStep: g.setup_step,
    setupSubStep: g.setup_substep,
    setupBuffer: g.setup_buffer,
    history: g.history,
    currentTurn: g.current_turn,
    players: pRes.rows.map(p => ({
      name: p.name, race: p.race, class: p.class,
      background: p.background, trait: p.trait, motivation: p.motivation,
      hp: p.hp, maxHp: p.max_hp, ac: p.ac,
      stats: p.stats, inventory: p.inventory, conditions: p.conditions
    })),
    worldMemory: wRes.rows
  };
}

// ── DB: Guardar partida ───────────────────────────────────────
async function saveGame(chatId, game) {
  await pool.query(`
    INSERT INTO games (chat_id, phase, num_players, setup_step, setup_substep, setup_buffer, history, current_turn, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
    ON CONFLICT (chat_id) DO UPDATE SET
      phase=$2, num_players=$3, setup_step=$4, setup_substep=$5,
      setup_buffer=$6, history=$7, current_turn=$8, updated_at=NOW()
  `, [chatId, game.phase, game.numPlayers, game.setupStep,
      game.setupSubStep, JSON.stringify(game.setupBuffer),
      JSON.stringify(game.history), game.currentTurn]);

  // Borrar y reinsertar jugadores
  await pool.query('DELETE FROM players WHERE chat_id = $1', [chatId]);
  for (const p of game.players) {
    await pool.query(`
      INSERT INTO players (chat_id,name,race,class,background,trait,motivation,hp,max_hp,ac,stats,inventory,conditions)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    `, [chatId, p.name, p.race, p.class, p.background, p.trait, p.motivation,
        p.hp, p.maxHp, p.ac, JSON.stringify(p.stats),
        JSON.stringify(p.inventory), JSON.stringify(p.conditions)]);
  }
}

// ── DB: Guardar memoria del mundo ─────────────────────────────
async function saveMemory(chatId, type, title, description) {
  await pool.query(
    'INSERT INTO world_memory (chat_id, type, title, description) VALUES ($1,$2,$3,$4)',
    [chatId, type, title, description]
  );
}

// ── DB: Guardar contexto del mundo ───────────────────────────
async function saveWorldContext (chatId, ctx) {
  await pool.query(`
    INSERT INTO world_context (
      chat_id, town_name, town_type, town_population, town_event, town_landmark,
      tavern_name, tavern_wealth, tavern_feature, tavern_rumor,
      tavern_brew_name, tavern_brew_desc,
      npc_summary, npc_pocket, npc_secret,
      plot_hook, encounter, curiosity, extra_rumor
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
    ON CONFLICT (chat_id) DO UPDATE SET
      town_name=$2, town_type=$3, town_population=$4, town_event=$5, town_landmark=$6,
      tavern_name=$7, tavern_wealth=$8, tavern_feature=$9, tavern_rumor=$10,
      tavern_brew_name=$11, tavern_brew_desc=$12,
      npc_summary=$13, npc_pocket=$14, npc_secret=$15,
      plot_hook=$16, encounter=$17, curiosity=$18, extra_rumor=$19
  `, [
    chatId,
    ctx.town.name, ctx.town.type, ctx.town.population, ctx.town.event, ctx.town.landmark,
    ctx.tavern.name, ctx.tavern.wealth, ctx.tavern.feature, ctx.tavern.rumor,
    ctx.tavern.specialBrew.name, ctx.tavern.specialBrew.desc,
    ctx.npc.summary, ctx.npc.pocket, ctx.npc.secret,
    ctx.hook.summary, ctx.encounter.description, ctx.curiosity, ctx.rumor
  ])
}

// ── DB: Cargar contexto del mundo ─────────────────────────────
async function loadWorldContext (chatId) {
  const res = await pool.query('SELECT * FROM world_context WHERE chat_id = $1', [chatId])
  if (res.rows.length === 0) return null
  const r = res.rows[0]
  return {
    town: { name: r.town_name, type: r.town_type, population: r.town_population, event: r.town_event, landmark: r.town_landmark },
    tavern: { name: r.tavern_name, wealth: r.tavern_wealth, feature: r.tavern_feature, rumor: r.tavern_rumor, specialBrew: { name: r.tavern_brew_name, desc: r.tavern_brew_desc } },
    npc: { summary: r.npc_summary, pocket: r.npc_pocket, secret: r.npc_secret },
    hook: { summary: r.plot_hook },
    encounter: { description: r.encounter },
    curiosity: r.curiosity,
    rumor: r.extra_rumor
  }
}

// ── DB: Borrar partida ────────────────────────────────────────
async function deleteGame(chatId) {
  await pool.query('DELETE FROM games WHERE chat_id = $1', [chatId]);
}

// ── Estado en memoria (caché) ─────────────────────────────────
const cache = new Map();

async function getGame(chatId) {
  if (cache.has(chatId)) return cache.get(chatId);
  const game = await loadGame(chatId);
  if (game) { cache.set(chatId, game); return game; }
  return createEmptyGame();
}

function createEmptyGame() {
  return {
    phase: 'idle', players: [], numPlayers: 0,
    setupStep: 0, setupSubStep: 'num_players',
    setupBuffer: {}, history: [], currentTurn: 0, worldMemory: []
  };
}

// ── Utilidades ────────────────────────────────────────────────
function roll(sides) { return Math.floor(Math.random() * sides) + 1; }
function mod(s) { return Math.floor((s - 10) / 2); }

function genStats(cls) {
  const base = [15,14,13,12,10,8].sort(() => Math.random() - 0.5);
  const pri = {
    guerrero:[0,2,1,4,3,5], mago:[3,1,2,4,0,5], pícaro:[1,0,2,3,4,5],
    clérigo:[4,2,1,0,3,5], bárbaro:[0,2,1,5,3,4], bardo:[5,1,2,3,4,0],
    druida:[4,2,1,3,0,5], explorador:[1,0,2,4,3,5], paladín:[0,5,2,3,4,1],
    hechicero:[5,1,2,3,4,0], brujo:[5,1,2,3,4,0], monje:[4,0,2,3,1,5]
  };
  const keys = ['str','dex','con','int','wis','cha'];
  const order = pri[cls.toLowerCase()] || [0,1,2,3,4,5];
  const s = {}; keys.forEach((k,i) => s[k] = base[order[i]]); return s;
}
function genHp(cls, con) {
  const hd = {guerrero:10,mago:6,pícaro:8,clérigo:8,bárbaro:12,bardo:8,druida:8,explorador:10,paladín:10,hechicero:6,brujo:8,monje:8};
  return (hd[cls.toLowerCase()]||8) + mod(con);
}
function genAc(cls, dex) {
  if (['guerrero','paladín'].includes(cls.toLowerCase())) return 16;
  if (['clérigo','explorador','bárbaro'].includes(cls.toLowerCase())) return 13 + Math.min(mod(dex),2);
  return 10 + mod(dex);
}
function genItems(cls) {
  const it = {
    guerrero:['Espada larga','Escudo','Armadura de placas'],
    mago:['Bastón arcano','Libro de hechizos','Daga'],
    pícaro:['Espadas cortas x2','Herramientas de ladrón','Capa oscura'],
    clérigo:['Maza','Escudo sagrado','Símbolo sagrado'],
    bárbaro:['Hacha de guerra','Jabalinas x4'],
    bardo:['Laúd','Espada corta','Kit de disfraz'],
    druida:['Bastón druídico','Hierbas medicinales'],
    explorador:['Arco largo','Espada corta','Kit de supervivencia'],
    paladín:['Espada bastarda','Escudo','Símbolo sagrado'],
    hechicero:['Foco arcano','Daga','Amuleto familiar'],
    brujo:['Foco arcano','Daga','Pergamino del pacto'],
    monje:['Dardos x10','Bastón']
  };
  return it[cls.toLowerCase()] || ['Mochila','Antorcha'];
}
function createPlayer(name, race, cls, background, trait, motivation) {
  const stats = genStats(cls);
  const maxHp = genHp(cls, stats.con);
  return { name, race, class: cls, background, trait, motivation,
    hp: maxHp, maxHp, ac: genAc(cls, stats.dex), stats,
    inventory: genItems(cls), conditions: [] };
}
function formatPlayerCard(p) {
  const pct = Math.round((p.hp/p.maxHp)*10);
  const bar = '█'.repeat(pct) + '░'.repeat(10-pct);
  return `⚔️ *${p.name}* — ${p.race} ${p.class}\n` +
    `❤️ HP: ${p.hp}/${p.maxHp} [${bar}]\n` +
    `🛡️ CA: ${p.ac} | FUE:${p.stats.str} DES:${p.stats.dex} CON:${p.stats.con}\n` +
    `🎒 ${p.inventory.slice(0,4).join(', ')}\n` +
    `💭 _${p.trait}_`;
}

// ── Prompts ───────────────────────────────────────────────────
function buildSystemPrompt(game) {
  const pd = game.players.map((p,i) =>
    `J${i+1}: ${p.name} (${p.race} ${p.class}, Trasfondo:${p.background}) ` +
    `HP:${p.hp}/${p.maxHp} AC:${p.ac} FUE:${p.stats.str} DES:${p.stats.dex} CON:${p.stats.con} ` +
    `INT:${p.stats.int} SAB:${p.stats.wis} CAR:${p.stats.cha} ` +
    `Rasgo:"${p.trait}" Motivación:"${p.motivation}" Inv:[${p.inventory.join(', ')}]`
  ).join('\n');

  // Construir resumen de memoria del mundo
  const decisions = game.worldMemory?.filter(m => m.type==='decision').slice(0,5) || [];
  const locations = game.worldMemory?.filter(m => m.type==='location').slice(0,5) || [];
  const npcs = game.worldMemory?.filter(m => m.type==='npc').slice(0,5) || [];

  const memoryBlock = [
    decisions.length ? `DECISIONES CLAVE:\n${decisions.map(m=>`- ${m.title}: ${m.description}`).join('\n')}` : '',
    locations.length ? `LUGARES VISITADOS:\n${locations.map(m=>`- ${m.title}: ${m.description}`).join('\n')}` : '',
    npcs.length ? `NPCs CONOCIDOS:\n${npcs.map(m=>`- ${m.title}: ${m.description}`).join('\n')}` : ''
  ].filter(Boolean).join('\n\n');

  return `Eres un experto Director de Juego de rol de fantasía estilo D&D 5e. Diriges una partida por Telegram para ${game.players.length} jugador(es).

PERSONAJES:
${pd}

${memoryBlock ? `MEMORIA DEL MUNDO:\n${memoryBlock}` : ''}

INSTRUCCIONES:
- Narra en español con estilo literario evocador y conciso.
- Usa rasgos, motivaciones y memoria del mundo para personalizar la narrativa.
- Cuando una acción requiera tirada escribe: TIRADA:[tipo]
- Para actualizar HP: UPDATE_HP:[nombre]:[valor]
- Para añadir objeto: ADD_ITEM:[nombre]:[objeto]
- Para quitar objeto: REMOVE_ITEM:[nombre]:[objeto]
- Cuando ocurra algo importante guárdalo con:
    MEMORIA_DECISION:[título]|[descripción corta]
    MEMORIA_LUGAR:[nombre lugar]|[descripción corta]
    MEMORIA_NPC:[nombre NPC]|[descripción corta y actitud]
- Tras cada respuesta narrativa añade una entrada a la crónica con:
    CRONICA:[párrafo narrativo en tercera persona, estilo literario épico, 2-3 frases]
- Usa formato Markdown de Telegram (*negrita*, _cursiva_).

CONTEXTO DEL MUNDO (generado proceduralmente, úsalo para enriquecer la narrativa):
${buildWorldContext()}
- Máximo 3 párrafos por respuesta narrativa.
- Al final sugiere 3 acciones: ACCIONES: acción1 | acción2 | acción3`;
}

function buildSetupPrompt(game) {
  return `Eres el asistente de creación de personajes para D&D 5e en español vía Telegram. Guías paso a paso de forma breve y animada.

PASO ACTUAL: ${game.setupSubStep}
JUGADOR: ${game.setupStep + 1} de ${game.numPlayers}
DATOS RECOGIDOS: ${JSON.stringify(game.setupBuffer)}

Según el paso:
- "name": Pide el nombre del personaje de forma épica.
- "race": Lista 9 razas numeradas con descripción en 3 palabras: Humano, Elfo, Elfo Oscuro, Enano, Halfling, Gnomo, Semiorco, Tiefling, Dragonborn.
- "class": Lista 12 clases numeradas: Guerrero, Mago, Pícaro, Clérigo, Bárbaro, Bardo, Druida, Explorador, Paladín, Hechicero, Brujo, Monje.
- "background": Lista 6 trasfondos numerados adaptados a su clase y raza.
- "trait": Pide rasgo de personalidad con 4 ejemplos cortos.
- "motivation": Pregunta su motivación con 4 ejemplos.
- "confirm": Resumen épico del personaje. Escribe al final: CONFIRMAR_PERSONAJE

Cuando confirme escribe: PERSONAJE_LISTO|[nombre]|[raza]|[clase]|[trasfondo]|[rasgo]|[motivación]
Markdown de Telegram. Breve y en español.`;
}

// ── Contexto del mundo generado con EEEG ─────────────────────
function generateWorldContext () {
  const loc = EEEG.generateLocation()
  return {
    town: loc.town,
    tavern: loc.tavern,
    npc: EEEG.generateNPC(),
    hook: EEEG.generatePlotHook(),
    encounter: EEEG.generateEncounter(),
    curiosity: EEEG.generateCuriosity(),
    rumor: EEEG.generateRumor()
  }
}

function buildWorldContextString (ctx) {
  if (!ctx) return ''
  return `
CONTEXTO DEL MUNDO (generado proceduralmente, úsalo para enriquecer la narrativa):
Localización: ${ctx.town.name} (${ctx.town.type}, ~${ctx.town.population} hab.)
Evento actual: ${ctx.town.event}
Landmark: ${ctx.town.landmark}
Taberna: "${ctx.tavern.name}" (${ctx.tavern.wealth}) — ${ctx.tavern.feature}
Bebida especial: "${ctx.tavern.specialBrew.name}": ${ctx.tavern.specialBrew.desc}
Rumor en la taberna: ${ctx.tavern.rumor}
NPC notable: ${ctx.npc.summary} Lleva: ${ctx.npc.pocket}. Secreto: ${ctx.npc.secret}
Gancho de aventura: ${ctx.hook.summary}
Posible encuentro: ${ctx.encounter.description}
Objeto curioso disponible: ${ctx.curiosity}
Rumor adicional: ${ctx.rumor}
  `.trim()
}

// ── Llamada a Claude ──────────────────────────────────────────
async function callClaude(game, userMsg, sysOverride) {
  const system = sysOverride || buildSystemPrompt(game);
  const messages = [...game.history, { role: 'user', content: userMsg }];
  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000, system, messages
  });
  const text = res.content.map(b => b.text||'').join('');
  game.history.push({ role:'user', content: userMsg });
  game.history.push({ role:'assistant', content: text });
  if (game.history.length > 40) game.history = game.history.slice(-40);
  return text;
}

// ── Parsear comandos del DM ───────────────────────────────────
async function parseDMCommands(chatId, game, text) {
  let clean = text;
  const rolls = [];

  const tiradaRe = /TIRADA:(\w+(?:\s\w+)?)/gi;
  let tm;
  while ((tm = tiradaRe.exec(text)) !== null) rolls.push({ tipo: tm[1], resultado: roll(20) });
  clean = clean.replace(/TIRADA:[^\s\n]*/gi, '').trim();

  const hpRe = /UPDATE_HP:([^:]+):(\d+)/gi;
  let hm;
  while ((hm = hpRe.exec(text)) !== null) {
    const p = game.players.find(x => x.name.toLowerCase()===hm[1].trim().toLowerCase());
    if (p) p.hp = Math.max(0, Math.min(parseInt(hm[2]), p.maxHp));
  }
  clean = clean.replace(/UPDATE_HP:[^\n]*/gi, '').trim();

  const addRe = /ADD_ITEM:([^:]+):([^\n]+)/gi;
  let am;
  while ((am = addRe.exec(text)) !== null) {
    const p = game.players.find(x => x.name.toLowerCase()===am[1].trim().toLowerCase());
    if (p) p.inventory.push(am[2].trim());
  }
  clean = clean.replace(/ADD_ITEM:[^\n]*/gi, '').trim();

  const remRe = /REMOVE_ITEM:([^:]+):([^\n]+)/gi;
  let rm;
  while ((rm = remRe.exec(text)) !== null) {
    const p = game.players.find(x => x.name.toLowerCase()===rm[1].trim().toLowerCase());
    if (p) { const idx = p.inventory.indexOf(rm[2].trim()); if (idx>-1) p.inventory.splice(idx,1); }
  }
  clean = clean.replace(/REMOVE_ITEM:[^\n]*/gi, '').trim();

  // Parsear y guardar memoria del mundo
  const memTypes = [
    { re: /MEMORIA_DECISION:([^|\n]+)\|([^\n]+)/gi, type: 'decision' },
    { re: /MEMORIA_LUGAR:([^|\n]+)\|([^\n]+)/gi, type: 'location' },
    { re: /MEMORIA_NPC:([^|\n]+)\|([^\n]+)/gi, type: 'npc' }
  ];
  for (const { re, type } of memTypes) {
    let mm;
    while ((mm = re.exec(text)) !== null) {
      const title = mm[1].trim(), desc = mm[2].trim();
      await saveMemory(chatId, type, title, desc);
      if (!game.worldMemory) game.worldMemory = [];
      game.worldMemory.unshift({ type, title, description: desc });
    }
  }
  clean = clean.replace(/MEMORIA_(DECISION|LUGAR|NPC):[^\n]*/gi, '').trim();

  // Parsear y guardar crónica
  const cronicaRe = /CRONICA:([^\n]+)/gi;
  let cm;
  while ((cm = cronicaRe.exec(text)) !== null) {
    const entry = cm[1].trim();
    await pool.query('INSERT INTO chronicle (chat_id, entry) VALUES ($1, $2)', [chatId, entry]);
  }
  clean = clean.replace(/CRONICA:[^\n]*/gi, '').trim();

  let actions = [];
  const acMatch = clean.match(/ACCIONES:\s*([^\n]+)/i);
  if (acMatch) {
    actions = acMatch[1].split('|').map(a => a.trim()).filter(Boolean);
    clean = clean.replace(/ACCIONES:[^\n]*/i, '').trim();
  }

  return { clean, rolls, actions };
}

// ── Enviar con teclado ────────────────────────────────────────
async function sendWithActions(chatId, text, actions = []) {
  const opts = { parse_mode: 'Markdown' };
  if (actions.length > 0) {
    opts.reply_markup = { keyboard: actions.map(a => [{ text: a }]), resize_keyboard: true, one_time_keyboard: true };
  } else {
    opts.reply_markup = { remove_keyboard: true };
  }
  try { await bot.sendMessage(chatId, text, opts); }
  catch(e) {
    // Si falla el Markdown, reintenta sin formato
    await bot.sendMessage(chatId, text.replace(/[*_`]/g,''), { reply_markup: opts.reply_markup });
  }
}

// ── Setup flow ────────────────────────────────────────────────
const setupSteps = ['name','race','class','background','trait','motivation','confirm'];

async function handleSetup(chatId, game, userText) {
  await bot.sendChatAction(chatId, 'typing');
  let reply;
  try { reply = await callClaude(game, userText, buildSetupPrompt(game)); }
  catch(e) { await bot.sendMessage(chatId, `❌ Error Claude:\n\`${e.message}\``); return; }

  if (reply.includes('PERSONAJE_LISTO|')) {
    const raw = reply.split('PERSONAJE_LISTO|')[1];
    const parts = raw.split('|').map(s => s.trim().replace(/[\r\n].*/,'').trim());
    const [pname,prace,pcls,pbg,ptrait,pmot] = parts;
    const player = createPlayer(pname, prace, pcls, pbg||'Aventurero', ptrait||'Misterioso', pmot||'Buscar fortuna');
    game.players.push(player);
    game.setupStep++;
    game.setupSubStep = 'name';
    game.setupBuffer = {};
    game.history = [];
    await saveGame(chatId, game);
    cache.set(chatId, game);
    await bot.sendMessage(chatId, `✅ *${pname}* el/la ${prace} ${pcls} se une a la aventura.`, { parse_mode: 'Markdown' });
    if (game.setupStep >= game.numPlayers) { await startAdventure(chatId, game); }
    else { await bot.sendMessage(chatId, `Ahora creemos al personaje ${game.setupStep+1} de ${game.numPlayers}. ¿Cómo se llama?`); }
    return;
  }

  const idx = setupSteps.indexOf(game.setupSubStep);
  if (game.setupSubStep==='name') game.setupBuffer.name = userText;
  else if (game.setupSubStep==='race') game.setupBuffer.race = userText;
  else if (game.setupSubStep==='class') game.setupBuffer.class = userText;
  else if (game.setupSubStep==='background') game.setupBuffer.background = userText;
  else if (game.setupSubStep==='trait') game.setupBuffer.trait = userText;
  else if (game.setupSubStep==='motivation') game.setupBuffer.motivation = userText;
  if (idx < setupSteps.length-1) game.setupSubStep = setupSteps[idx+1];

  await saveGame(chatId, game);
  cache.set(chatId, game);

  const actions = reply.includes('CONFIRMAR_PERSONAJE') ? ['¡Sí, estoy listo!','Quiero cambiar algo'] : [];
  const cleanReply = reply.replace('CONFIRMAR_PERSONAJE','').trim();
  await sendWithActions(chatId, cleanReply, actions);
}

async function startAdventure(chatId, game) {
  game.phase = 'adventure';
  game.history = [];
  await saveGame(chatId, game);
  cache.set(chatId, game);
  await bot.sendChatAction(chatId, 'typing');
  const cards = game.players.map(formatPlayerCard).join('\n\n');
  await bot.sendMessage(chatId, `🗡️ *¡La aventura comienza!*\n\n${cards}`, { parse_mode: 'Markdown' });
  const names = game.players.map(p=>`${p.name} (${p.race} ${p.class}, motivación:"${p.motivation}")`).join(', ');
  let reply;
  try { reply = await callClaude(game, `Comienza la aventura para: ${names}. Crea una escena de apertura misteriosa que use los trasfondos y motivaciones. Deja la primera decisión en sus manos.`); }
  catch(e) { await bot.sendMessage(chatId, `❌ Error Claude:\n\`${e.message}\``); return; }
  const { clean, actions } = await parseDMCommands(chatId, game, reply);
  await saveGame(chatId, game);
  cache.set(chatId, game);
  await sendWithActions(chatId, `🎲 *Director de Juego*\n\n${clean}`, actions);
}

// ── Comandos ──────────────────────────────────────────────────
bot.onText(/\/start|\/nueva/, async (msg) => {
  const chatId = msg.chat.id;
  const game = createEmptyGame();
  game.phase = 'setup';
  game.setupSubStep = 'num_players';
  await deleteGame(chatId);
  await saveGame(chatId, game);
  cache.set(chatId, game);
  await sendWithActions(chatId,
    '⚔️ *¡Bienvenido al DM Automático!*\n\n¿Cuántos jugadores participarán? (1-4)',
    ['1 jugador','2 jugadores','3 jugadores','4 jugadores']
  );
});

bot.onText(/\/continuar/, async (msg) => {
  const chatId = msg.chat.id;
  const game = await loadGame(chatId);
  if (!game || game.phase !== 'adventure') {
    await bot.sendMessage(chatId, 'No hay ninguna partida guardada. Usa /nueva para comenzar.');
    return;
  }
  cache.set(chatId, game);
  const cards = game.players.map(formatPlayerCard).join('\n\n');
  await bot.sendMessage(chatId, `🗡️ *¡Continuando la aventura!*\n\n${cards}`, { parse_mode: 'Markdown' });

  // Resumen de memoria
  const decisions = game.worldMemory?.filter(m=>m.type==='decision').slice(0,3)||[];
  const locations = game.worldMemory?.filter(m=>m.type==='location').slice(0,3)||[];
  const npcs = game.worldMemory?.filter(m=>m.type==='npc').slice(0,3)||[];
  let memMsg = '📜 *Memoria de la aventura:*\n';
  if (decisions.length) memMsg += `\n⚡ *Decisiones:* ${decisions.map(m=>m.title).join(', ')}`;
  if (locations.length) memMsg += `\n🗺️ *Lugares:* ${locations.map(m=>m.title).join(', ')}`;
  if (npcs.length) memMsg += `\n👤 *NPCs:* ${npcs.map(m=>m.title).join(', ')}`;
  await bot.sendMessage(chatId, memMsg, { parse_mode: 'Markdown' });

  await bot.sendChatAction(chatId, 'typing');
  let reply;
  try { reply = await callClaude(game, 'Retoma la aventura con un breve resumen de lo ocurrido y plantea la situación actual. Deja la siguiente decisión en manos de los jugadores.'); }
  catch(e) { await bot.sendMessage(chatId, `❌ Error Claude:\n\`${e.message}\``); return; }
  const { clean, actions } = await parseDMCommands(chatId, game, reply);
  await saveGame(chatId, game);
  cache.set(chatId, game);
  await sendWithActions(chatId, `🎲 *Director de Juego*\n\n${clean}`, actions);
});

bot.onText(/\/estado/, async (msg) => {
  const chatId = msg.chat.id;
  const game = await getGame(chatId);
  if (!game || game.players.length===0) { await bot.sendMessage(chatId, 'No hay partida activa. Usa /nueva.'); return; }
  const cards = game.players.map(formatPlayerCard).join('\n\n');
  await bot.sendMessage(chatId, `📋 *Estado de los personajes*\n\n${cards}`, { parse_mode: 'Markdown' });
});

bot.onText(/\/memoria/, async (msg) => {
  const chatId = msg.chat.id;
  const game = await getGame(chatId);
  if (!game || !game.worldMemory?.length) { await bot.sendMessage(chatId, 'Aún no hay memoria guardada.'); return; }
  const decisions = game.worldMemory.filter(m=>m.type==='decision').slice(0,5);
  const locations = game.worldMemory.filter(m=>m.type==='location').slice(0,5);
  const npcs = game.worldMemory.filter(m=>m.type==='npc').slice(0,5);
  let msg2 = '📜 *Memoria de la aventura*\n';
  if (decisions.length) msg2 += `\n⚡ *Decisiones importantes:*\n${decisions.map(m=>`• ${m.title}: _${m.description}_`).join('\n')}`;
  if (locations.length) msg2 += `\n\n🗺️ *Lugares visitados:*\n${locations.map(m=>`• ${m.title}: _${m.description}_`).join('\n')}`;
  if (npcs.length) msg2 += `\n\n👤 *NPCs conocidos:*\n${npcs.map(m=>`• ${m.title}: _${m.description}_`).join('\n')}`;
  await bot.sendMessage(chatId, msg2, { parse_mode: 'Markdown' });
});

bot.onText(/\/cronica/, async (msg) => {
  const chatId = msg.chat.id;
  const game = await getGame(chatId);
  if (!game || game.players.length === 0) {
    await bot.sendMessage(chatId, 'No hay ninguna aventura en curso. Usa /nueva para comenzar.');
    return;
  }
  const res = await pool.query('SELECT entry, created_at FROM chronicle WHERE chat_id = $1 ORDER BY created_at ASC', [chatId]);
  if (res.rows.length === 0) {
    await bot.sendMessage(chatId, 'La crónica está vacía todavía. ¡Juega un poco más!');
    return;
  }
  const heroes = game.players.map(p => `${p.name} el/la ${p.race} ${p.class}`).join(', ');
  const header = `CRÓNICA DE LA AVENTURA\n${'═'.repeat(40)}\nHéroes: ${heroes}\n${'═'.repeat(40)}\n\n`;
  const body = res.rows.map((r, i) => `${i + 1}. ${r.entry}`).join('\n\n');
  const footer = `\n\n${'═'.repeat(40)}\nFin de la crónica — ${new Date().toLocaleDateString('es-ES')}`;
  const content = header + body + footer;
  const buf = Buffer.from(content, 'utf-8');
  await bot.sendDocument(chatId, buf, {}, { filename: 'cronica_aventura.txt', contentType: 'text/plain' });
});

bot.onText(/\/ayuda/, async (msg) => {
  await bot.sendMessage(msg.chat.id,
    `🎲 *Comandos disponibles*\n\n` +
    `/nueva — Iniciar o reiniciar una partida\n` +
    `/continuar — Retomar la última partida guardada\n` +
    `/estado — Ver fichas de personajes\n` +
    `/memoria — Ver lugares, NPCs y decisiones recordadas\n` +
    `/ayuda — Mostrar esta ayuda`,
    { parse_mode: 'Markdown' }
  );
});

// ── Mensajes de texto ─────────────────────────────────────────
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;
  const chatId = msg.chat.id;
  const game = await getGame(chatId);
  const text = msg.text.trim();

  if (game.phase==='idle') { await bot.sendMessage(chatId, 'Usa /nueva para comenzar o /continuar para retomar una partida. ⚔️'); return; }

  if (game.phase==='setup') {
    if (game.setupSubStep==='num_players') {
      const n = parseInt(text);
      if (n>=1 && n<=4) {
        game.numPlayers = n; game.setupSubStep = 'name';
        await bot.sendChatAction(chatId, 'typing');
        let r;
        try { r = await callClaude(game, 'Pide el nombre del primer personaje de forma épica.', buildSetupPrompt(game)); }
        catch(e) { r = '¿Cómo se llamará tu héroe?'; }
        await saveGame(chatId, game); cache.set(chatId, game);
        await bot.sendMessage(chatId, r, { parse_mode: 'Markdown' });
      } else {
        await sendWithActions(chatId, 'Por favor elige entre 1 y 4 jugadores:', ['1 jugador','2 jugadores','3 jugadores','4 jugadores']);
      }
    } else { await handleSetup(chatId, game, text); }
    return;
  }

  if (game.phase==='adventure') {
    await bot.sendChatAction(chatId, 'typing');
    const sender = msg.from.first_name || 'Aventurero';
    const userMsg = game.players.length>1 ? `[${sender}]: ${text}` : text;
    let reply;
    try { reply = await callClaude(game, userMsg); }
    catch(e) { await bot.sendMessage(chatId, `❌ Error Claude:\n\`${e.message}\``); return; }
    const { clean, rolls, actions } = await parseDMCommands(chatId, game, reply);
    for (const r of rolls) {
      const crit = r.resultado===20?' ✨ ¡CRÍTICO!':r.resultado===1?' 💀 ¡PIFIA!':'';
      await bot.sendMessage(chatId, `🎲 Tirada de *${r.tipo}*: *${r.resultado}*/20${crit}`, { parse_mode: 'Markdown' });
    }
    await saveGame(chatId, game);
    cache.set(chatId, game);
    await sendWithActions(chatId, `🎲 *Director de Juego*\n\n${clean}`, actions);
  }
});

// ── Arranque ──────────────────────────────────────────────────
initDB().then(() => console.log('🎲 Bot DM Automático con Claude + PostgreSQL iniciado...'));