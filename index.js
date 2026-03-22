// ============================================================
//  DM AUTOMÁTICO — Bot de Telegram + Anthropic Claude
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
//     "dotenv": "^16.4.5"
//   }
// }

// ── .env ─────────────────────────────────────────────────────
// TELEGRAM_TOKEN=tu_token_de_botfather
// ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxxxxx

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const Anthropic = require('@anthropic-ai/sdk');

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Estado en memoria ─────────────────────────────────────────
const games = new Map();

function getGame(chatId) {
  if (!games.has(chatId)) games.set(chatId, createEmptyGame());
  return games.get(chatId);
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
  return (hd[cls.toLowerCase()] || 8) + mod(con);
}

function genAc(cls, dex) {
  if (['guerrero','paladín'].includes(cls.toLowerCase())) return 16;
  if (['clérigo','explorador','bárbaro'].includes(cls.toLowerCase())) return 13 + Math.min(mod(dex), 2);
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
  const pct = Math.round((p.hp / p.maxHp) * 10);
  const bar = '█'.repeat(pct) + '░'.repeat(10 - pct);
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

  return `Eres un experto Director de Juego de rol de fantasía estilo D&D 5e. Diriges una partida por Telegram para ${game.players.length} jugador(es).

PERSONAJES:
${pd}

INSTRUCCIONES:
- Narra en español con estilo literario evocador y conciso.
- Adapta la historia a los rasgos y motivaciones de los personajes.
- Cuando una acción requiera tirada escribe: TIRADA:[tipo]
- Para actualizar HP: UPDATE_HP:[nombre]:[valor]
- Para añadir objeto: ADD_ITEM:[nombre]:[objeto]
- Para quitar objeto: REMOVE_ITEM:[nombre]:[objeto]
- Usa formato Markdown compatible con Telegram (*negrita*, _cursiva_).
- Máximo 3 párrafos por respuesta narrativa.
- Al final de cada respuesta sugiere 3 acciones posibles con el formato:
  ACCIONES: acción1 | acción2 | acción3`;
}

function buildSetupPrompt(game) {
  return `Eres el asistente de creación de personajes para D&D 5e en español vía Telegram. Guías paso a paso de forma breve y animada.

PASO ACTUAL: ${game.setupSubStep}
JUGADOR: ${game.setupStep + 1} de ${game.numPlayers}
DATOS RECOGIDOS: ${JSON.stringify(game.setupBuffer)}

Según el paso:
- "name": Pide el nombre del personaje de forma épica.
- "race": Lista 9 razas numeradas con descripción en 3 palabras: Humano, Elfo, Elfo Oscuro, Enano, Halfling, Gnomo, Semiorco, Tiefling, Dragonborn.
- "class": Lista 12 clases numeradas con descripción en 3 palabras: Guerrero, Mago, Pícaro, Clérigo, Bárbaro, Bardo, Druida, Explorador, Paladín, Hechicero, Brujo, Monje.
- "background": Lista 6 trasfondos numerados adaptados a su clase y raza.
- "trait": Pide un rasgo de personalidad. Da 4 ejemplos cortos.
- "motivation": Pregunta su motivación en la vida. Da 4 ejemplos.
- "confirm": Haz un resumen épico del personaje y escribe al final en línea separada: CONFIRMAR_PERSONAJE

Cuando el usuario confirme, escribe en una línea: PERSONAJE_LISTO|[nombre]|[raza]|[clase]|[trasfondo]|[rasgo]|[motivación]
Usa formato Markdown de Telegram. Sé breve y en español.`;
}

// ── Llamada a Claude ──────────────────────────────────────────
async function callClaude(game, userMsg, sysOverride) {
  const system = sysOverride || buildSystemPrompt(game);
  const messages = [...game.history, { role: 'user', content: userMsg }];

  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    system,
    messages
  });

  const text = res.content.map(b => b.text || '').join('');
  game.history.push({ role: 'user', content: userMsg });
  game.history.push({ role: 'assistant', content: text });
  if (game.history.length > 40) game.history = game.history.slice(-40);
  return text;
}

// ── Parsear comandos del DM ───────────────────────────────────
function parseDMCommands(game, text) {
  let clean = text;
  const rolls = [];

  const tiradaRe = /TIRADA:(\w+(?:\s\w+)?)/gi;
  let tm;
  while ((tm = tiradaRe.exec(text)) !== null) rolls.push({ tipo: tm[1], resultado: roll(20) });
  clean = clean.replace(/TIRADA:[^\s\n]*/gi, '').trim();

  const hpRe = /UPDATE_HP:([^:]+):(\d+)/gi;
  let hm;
  while ((hm = hpRe.exec(text)) !== null) {
    const p = game.players.find(x => x.name.toLowerCase() === hm[1].trim().toLowerCase());
    if (p) p.hp = Math.max(0, Math.min(parseInt(hm[2]), p.maxHp));
  }
  clean = clean.replace(/UPDATE_HP:[^\n]*/gi, '').trim();

  const addRe = /ADD_ITEM:([^:]+):([^\n]+)/gi;
  let am;
  while ((am = addRe.exec(text)) !== null) {
    const p = game.players.find(x => x.name.toLowerCase() === am[1].trim().toLowerCase());
    if (p) p.inventory.push(am[2].trim());
  }
  clean = clean.replace(/ADD_ITEM:[^\n]*/gi, '').trim();

  const remRe = /REMOVE_ITEM:([^:]+):([^\n]+)/gi;
  let rm;
  while ((rm = remRe.exec(text)) !== null) {
    const p = game.players.find(x => x.name.toLowerCase() === rm[1].trim().toLowerCase());
    if (p) { const idx = p.inventory.indexOf(rm[2].trim()); if (idx > -1) p.inventory.splice(idx, 1); }
  }
  clean = clean.replace(/REMOVE_ITEM:[^\n]*/gi, '').trim();

  let actions = [];
  const acMatch = clean.match(/ACCIONES:\s*([^\n]+)/i);
  if (acMatch) {
    actions = acMatch[1].split('|').map(a => a.trim()).filter(Boolean);
    clean = clean.replace(/ACCIONES:[^\n]*/i, '').trim();
  }

  return { clean, rolls, actions };
}

// ── Enviar con teclado de acciones ────────────────────────────
async function sendWithActions(chatId, text, actions = []) {
  const opts = { parse_mode: 'Markdown' };
  if (actions.length > 0) {
    opts.reply_markup = {
      keyboard: actions.map(a => [{ text: a }]),
      resize_keyboard: true,
      one_time_keyboard: true
    };
  } else {
    opts.reply_markup = { remove_keyboard: true };
  }
  await bot.sendMessage(chatId, text, opts);
}

// ── Setup flow ────────────────────────────────────────────────
const setupSteps = ['name','race','class','background','trait','motivation','confirm'];

async function handleSetup(chatId, game, userText) {
  await bot.sendChatAction(chatId, 'typing');
  let reply;
  try {
    reply = await callClaude(game, userText, buildSetupPrompt(game));
  } catch(e) {
    await bot.sendMessage(chatId, `❌ Error Claude:\n\`${e.message}\``);
    console.error('Claude error (setup):', e);
    return;
  }

  if (reply.includes('PERSONAJE_LISTO|')) {
    const raw = reply.split('PERSONAJE_LISTO|')[1];
    const parts = raw.split('|').map(s => s.trim().replace(/[\r\n].*/,'').trim());
    const [pname, prace, pcls, pbg, ptrait, pmot] = parts;
    const player = createPlayer(pname, prace, pcls, pbg||'Aventurero', ptrait||'Misterioso', pmot||'Buscar fortuna');
    game.players.push(player);
    game.setupStep++;
    game.setupSubStep = 'name';
    game.setupBuffer = {};
    game.history = [];
    await bot.sendMessage(chatId, `✅ *${pname}* el/la ${prace} ${pcls} se une a la aventura.`, { parse_mode: 'Markdown' });
    if (game.setupStep >= game.numPlayers) {
      await startAdventure(chatId, game);
    } else {
      await bot.sendMessage(chatId, `Ahora creemos al personaje ${game.setupStep + 1} de ${game.numPlayers}. ¿Cómo se llama?`);
    }
    return;
  }

  const idx = setupSteps.indexOf(game.setupSubStep);
  if (game.setupSubStep === 'name') game.setupBuffer.name = userText;
  else if (game.setupSubStep === 'race') game.setupBuffer.race = userText;
  else if (game.setupSubStep === 'class') game.setupBuffer.class = userText;
  else if (game.setupSubStep === 'background') game.setupBuffer.background = userText;
  else if (game.setupSubStep === 'trait') game.setupBuffer.trait = userText;
  else if (game.setupSubStep === 'motivation') game.setupBuffer.motivation = userText;
  if (idx < setupSteps.length - 1) game.setupSubStep = setupSteps[idx + 1];

  const actions = reply.includes('CONFIRMAR_PERSONAJE') ? ['¡Sí, estoy listo!', 'Quiero cambiar algo'] : [];
  const cleanReply = reply.replace('CONFIRMAR_PERSONAJE', '').trim();
  await sendWithActions(chatId, cleanReply, actions);
}

async function startAdventure(chatId, game) {
  game.phase = 'adventure';
  game.history = [];
  await bot.sendChatAction(chatId, 'typing');

  const cards = game.players.map(formatPlayerCard).join('\n\n');
  await bot.sendMessage(chatId, `🗡️ *¡La aventura comienza!*\n\n${cards}`, { parse_mode: 'Markdown' });

  const names = game.players.map(p => `${p.name} (${p.race} ${p.class}, motivación: "${p.motivation}")`).join(', ');
  let reply;
  try {
    reply = await callClaude(game,
      `Comienza la aventura para: ${names}. Crea una escena de apertura misteriosa que use los trasfondos y motivaciones de cada personaje. Deja la primera decisión en sus manos.`
    );
  } catch(e) {
    await bot.sendMessage(chatId, `❌ Error Claude:\n\`${e.message}\``);
    console.error('Claude error (startAdventure):', e);
    return;
  }

  const { clean, actions } = parseDMCommands(game, reply);
  await sendWithActions(chatId, `🎲 *Director de Juego*\n\n${clean}`, actions);
}

// ── Comandos ──────────────────────────────────────────────────
bot.onText(/\/start|\/nueva/, async (msg) => {
  const chatId = msg.chat.id;
  games.set(chatId, createEmptyGame());
  const game = getGame(chatId);
  game.phase = 'setup';
  game.setupSubStep = 'num_players';
  await sendWithActions(chatId,
    '⚔️ *¡Bienvenido al DM Automático!*\n\n¿Cuántos jugadores participarán? (1-4)',
    ['1 jugador','2 jugadores','3 jugadores','4 jugadores']
  );
});

bot.onText(/\/estado/, async (msg) => {
  const chatId = msg.chat.id;
  const game = getGame(chatId);
  if (game.players.length === 0) {
    await bot.sendMessage(chatId, 'No hay ninguna partida activa. Usa /nueva para comenzar.');
    return;
  }
  const cards = game.players.map(formatPlayerCard).join('\n\n');
  await bot.sendMessage(chatId, `📋 *Estado de los personajes*\n\n${cards}`, { parse_mode: 'Markdown' });
});

bot.onText(/\/ayuda/, async (msg) => {
  await bot.sendMessage(msg.chat.id,
    `🎲 *Comandos disponibles*\n\n` +
    `/nueva — Iniciar o reiniciar una partida\n` +
    `/estado — Ver fichas de todos los personajes\n` +
    `/ayuda — Mostrar esta ayuda\n\n` +
    `Durante la aventura escribe libremente lo que hace tu personaje.`,
    { parse_mode: 'Markdown' }
  );
});

// ── Mensajes de texto ─────────────────────────────────────────
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;
  const chatId = msg.chat.id;
  const game = getGame(chatId);
  const text = msg.text.trim();

  if (game.phase === 'idle') {
    await bot.sendMessage(chatId, 'Usa /nueva para comenzar una partida. ⚔️');
    return;
  }

  if (game.phase === 'setup') {
    if (game.setupSubStep === 'num_players') {
      const n = parseInt(text);
      if (n >= 1 && n <= 4) {
        game.numPlayers = n;
        game.setupSubStep = 'name';
        await bot.sendChatAction(chatId, 'typing');
        let r;
        try {
          r = await callClaude(game, 'Pide el nombre del primer personaje de forma épica.', buildSetupPrompt(game));
        } catch(e) {
          r = '¿Cómo se llamará tu héroe?';
          console.error('Claude error (num_players):', e);
        }
        await bot.sendMessage(chatId, r, { parse_mode: 'Markdown' });
      } else {
        await sendWithActions(chatId, 'Por favor elige entre 1 y 4 jugadores:', ['1 jugador','2 jugadores','3 jugadores','4 jugadores']);
      }
    } else {
      await handleSetup(chatId, game, text);
    }
    return;
  }

  if (game.phase === 'adventure') {
    await bot.sendChatAction(chatId, 'typing');
    const sender = msg.from.first_name || 'Aventurero';
    const userMsg = game.players.length > 1 ? `[${sender}]: ${text}` : text;
    let reply;
    try {
      reply = await callClaude(game, userMsg);
    } catch(e) {
      await bot.sendMessage(chatId, `❌ Error Claude:\n\`${e.message}\``);
      console.error('Claude error (adventure):', e);
      return;
    }

    const { clean, rolls, actions } = parseDMCommands(game, reply);
    for (const r of rolls) {
      const crit = r.resultado === 20 ? ' ✨ ¡CRÍTICO!' : r.resultado === 1 ? ' 💀 ¡PIFIA!' : '';
      await bot.sendMessage(chatId, `🎲 Tirada de *${r.tipo}*: *${r.resultado}*/20${crit}`, { parse_mode: 'Markdown' });
    }
    await sendWithActions(chatId, `🎲 *Director de Juego*\n\n${clean}`, actions);
  }
});

console.log('🎲 Bot DM Automático con Claude iniciado...');