// ============================================================
//  DM AUTOMÁTICO — Bot de Telegram + Claude + PostgreSQL
//  Sistema de niveles D&D 5e + Multijugador con votaciones
// ============================================================

require('dotenv').config()
const TelegramBot = require('node-telegram-bot-api')
const Anthropic = require('@anthropic-ai/sdk')
const { Pool } = require('pg')
const EEEG = require('./eeeg')

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true })
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

// ── Tabla de XP D&D 5e ───────────────────────────────────────
const XP_TABLE = [0,300,900,2700,6500,14000,23000,34000,48000,64000,85000,100000,120000,140000,165000,195000,225000,265000,305000,355000]
const PROFICIENCY_BONUS = [2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,6,6,6,6]

function getLevelFromXP(xp) {
  for (let i = XP_TABLE.length - 1; i >= 0; i--) {
    if (xp >= XP_TABLE[i]) return i + 1
  }
  return 1
}

function xpForNextLevel(level) {
  if (level >= 20) return null
  return XP_TABLE[level]
}

// ── Habilidades por clase y nivel ─────────────────────────────
const CLASS_ABILITIES = {
  guerrero: {
    2: 'Estilo de Combate adicional',
    3: 'Arquetipo Marcial elegido',
    4: 'Mejora de Característica',
    5: 'Ataque extra (2 ataques por acción)',
    6: 'Mejora de Característica',
    7: 'Rasgo de Arquetipo Marcial',
    9: 'Indomable (1/descanso largo)',
    10: 'Rasgo de Arquetipo Marcial',
    11: 'Ataque extra (3 ataques por acción)',
  },
  mago: {
    2: 'Recuperación Arcana',
    3: 'Tradición Arcana elegida',
    4: 'Mejora de Característica',
    5: 'Conjuros de nivel 3 desbloqueados',
    6: 'Rasgo de Tradición Arcana',
    7: 'Conjuros de nivel 4 desbloqueados',
    9: 'Conjuros de nivel 5 desbloqueados',
    10: 'Rasgo de Tradición Arcana',
  },
  pícaro: {
    2: 'Acción Astuta',
    3: 'Arquetipo Pícaro elegido',
    4: 'Mejora de Característica',
    5: 'Ataque Furtivo mejorado (3d6)',
    6: 'Experiencia con el Engaño y la Persuasión',
    7: 'Evasión',
    9: 'Habilidad Suprema',
    10: 'Mejora de Característica',
  },
  clérigo: {
    2: 'Canalizar Divinidad (1/descanso)',
    3: 'Conjuros de nivel 2 desbloqueados',
    4: 'Mejora de Característica',
    5: 'Destruir No-Muertos mejorado',
    6: 'Canalizar Divinidad (2/descanso)',
    7: 'Rasgo de Dominio Divino',
    9: 'Conjuros de nivel 5 desbloqueados',
    10: 'Intervención Divina',
  },
  bárbaro: {
    2: 'Ataque Descuidado + Sentido del Peligro',
    3: 'Sendero Primitivo elegido',
    4: 'Mejora de Característica',
    5: 'Ataque extra + Movimiento Rápido',
    6: 'Rasgo de Sendero Primitivo',
    7: 'Instinto Salvaje',
    9: 'Mejora de Furia Bruta',
    10: 'Mente Intimidante',
  },
  paladín: {
    2: 'Imposición de Manos mejorada + Sentido Divino',
    3: 'Juramento Sagrado elegido',
    4: 'Mejora de Característica',
    5: 'Ataque extra + Conjuros de nivel 2',
    6: 'Aura de Protección',
    7: 'Rasgo de Juramento Sagrado',
    9: 'Conjuros de nivel 3 desbloqueados',
    10: 'Aura de Valor',
  },
}

function getNewAbilities(cls, oldLevel, newLevel) {
  const abilities = CLASS_ABILITIES[cls.toLowerCase()] || {}
  const gained = []
  for (let lvl = oldLevel + 1; lvl <= newLevel; lvl++) {
    if (abilities[lvl]) gained.push(`Nivel ${lvl}: ${abilities[lvl]}`)
  }
  return gained
}

// ── HP por clase al subir de nivel ───────────────────────────
const HIT_DICE = { guerrero:10,mago:6,pícaro:8,clérigo:8,bárbaro:12,bardo:8,druida:8,explorador:10,paladín:10,hechicero:6,brujo:8,monje:8 }
function mod(s) { return Math.floor((s - 10) / 2) }
function hpGainOnLevelUp(cls, conScore) {
  const hd = HIT_DICE[cls.toLowerCase()] || 8
  const roll = Math.floor(Math.random() * hd) + 1
  return Math.max(1, roll + mod(conScore))
}

// ── Inicializar BD ────────────────────────────────────────────
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
      telegram_user_id BIGINT,
      telegram_username TEXT,
      name TEXT, race TEXT, class TEXT,
      background TEXT, trait TEXT, motivation TEXT,
      hp INT, max_hp INT, ac INT,
      stats JSONB, inventory JSONB DEFAULT '[]',
      conditions JSONB DEFAULT '[]',
      xp INT DEFAULT 0,
      level INT DEFAULT 1,
      abilities JSONB DEFAULT '[]'
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
      town_name TEXT, town_type TEXT, town_population INT,
      town_event TEXT, town_landmark TEXT,
      tavern_name TEXT, tavern_wealth TEXT, tavern_feature TEXT,
      tavern_rumor TEXT, tavern_brew_name TEXT, tavern_brew_desc TEXT,
      npc_summary TEXT, npc_pocket TEXT, npc_secret TEXT,
      plot_hook TEXT, encounter TEXT, curiosity TEXT, extra_rumor TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS votes (
      id SERIAL PRIMARY KEY,
      chat_id BIGINT REFERENCES games(chat_id) ON DELETE CASCADE,
      question TEXT,
      options JSONB,
      votes JSONB DEFAULT '{}',
      required_voters JSONB DEFAULT '[]',
      created_at TIMESTAMP DEFAULT NOW()
    );
  `)
  console.log('✅ Base de datos inicializada')
}

// ── DB: Cargar partida ────────────────────────────────────────
async function loadGame(chatId) {
  const gRes = await pool.query('SELECT * FROM games WHERE chat_id = $1', [chatId])
  if (gRes.rows.length === 0) return null
  const g = gRes.rows[0]
  const pRes = await pool.query('SELECT * FROM players WHERE chat_id = $1 ORDER BY id', [chatId])
  const wRes = await pool.query('SELECT * FROM world_memory WHERE chat_id = $1 ORDER BY created_at DESC LIMIT 30', [chatId])
  const ctxRes = await pool.query('SELECT * FROM world_context WHERE chat_id = $1', [chatId])
  const worldContext = ctxRes.rows.length > 0 ? await loadWorldContext(chatId) : null
  return {
    phase: g.phase, numPlayers: g.num_players,
    setupStep: g.setup_step, setupSubStep: g.setup_substep,
    setupBuffer: g.setup_buffer, history: g.history,
    currentTurn: g.current_turn,
    players: pRes.rows.map(p => ({
      name: p.name, race: p.race, class: p.class,
      background: p.background, trait: p.trait, motivation: p.motivation,
      hp: p.hp, maxHp: p.max_hp, ac: p.ac,
      stats: p.stats, inventory: p.inventory, conditions: p.conditions,
      xp: p.xp || 0, level: p.level || 1, abilities: p.abilities || [],
      telegramUserId: p.telegram_user_id, telegramUsername: p.telegram_username
    })),
    worldMemory: wRes.rows, worldContext
  }
}

// ── DB: Guardar partida ───────────────────────────────────────
async function saveGame(chatId, game) {
  await pool.query(`
    INSERT INTO games (chat_id,phase,num_players,setup_step,setup_substep,setup_buffer,history,current_turn,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
    ON CONFLICT (chat_id) DO UPDATE SET
      phase=$2,num_players=$3,setup_step=$4,setup_substep=$5,
      setup_buffer=$6,history=$7,current_turn=$8,updated_at=NOW()
  `, [chatId, game.phase, game.numPlayers, game.setupStep,
      game.setupSubStep, JSON.stringify(game.setupBuffer),
      JSON.stringify(game.history), game.currentTurn])

  await pool.query('DELETE FROM players WHERE chat_id = $1', [chatId])
  for (const p of game.players) {
    await pool.query(`
      INSERT INTO players (chat_id,telegram_user_id,telegram_username,name,race,class,background,trait,motivation,hp,max_hp,ac,stats,inventory,conditions,xp,level,abilities)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
    `, [chatId, p.telegramUserId||null, p.telegramUsername||null,
        p.name, p.race, p.class, p.background, p.trait, p.motivation,
        p.hp, p.maxHp, p.ac, JSON.stringify(p.stats),
        JSON.stringify(p.inventory), JSON.stringify(p.conditions),
        p.xp||0, p.level||1, JSON.stringify(p.abilities||[])])
  }
}

// ── DB: Memoria del mundo ────────────────────────────────────
async function saveMemory(chatId, type, title, description) {
  await pool.query('INSERT INTO world_memory (chat_id,type,title,description) VALUES ($1,$2,$3,$4)', [chatId,type,title,description])
}

// ── DB: Contexto EEEG ─────────────────────────────────────────
async function saveWorldContext(chatId, ctx) {
  await pool.query(`
    INSERT INTO world_context (chat_id,town_name,town_type,town_population,town_event,town_landmark,tavern_name,tavern_wealth,tavern_feature,tavern_rumor,tavern_brew_name,tavern_brew_desc,npc_summary,npc_pocket,npc_secret,plot_hook,encounter,curiosity,extra_rumor)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
    ON CONFLICT (chat_id) DO UPDATE SET
      town_name=$2,town_type=$3,town_population=$4,town_event=$5,town_landmark=$6,
      tavern_name=$7,tavern_wealth=$8,tavern_feature=$9,tavern_rumor=$10,
      tavern_brew_name=$11,tavern_brew_desc=$12,npc_summary=$13,npc_pocket=$14,
      npc_secret=$15,plot_hook=$16,encounter=$17,curiosity=$18,extra_rumor=$19
  `, [chatId,ctx.town.name,ctx.town.type,ctx.town.population,ctx.town.event,ctx.town.landmark,
      ctx.tavern.name,ctx.tavern.wealth,ctx.tavern.feature,ctx.tavern.rumor,
      ctx.tavern.specialBrew.name,ctx.tavern.specialBrew.desc,
      ctx.npc.summary,ctx.npc.pocket,ctx.npc.secret,
      ctx.hook.summary,ctx.encounter.description,ctx.curiosity,ctx.rumor])
}

async function loadWorldContext(chatId) {
  const res = await pool.query('SELECT * FROM world_context WHERE chat_id = $1', [chatId])
  if (res.rows.length === 0) return null
  const r = res.rows[0]
  return {
    town: { name:r.town_name,type:r.town_type,population:r.town_population,event:r.town_event,landmark:r.town_landmark },
    tavern: { name:r.tavern_name,wealth:r.tavern_wealth,feature:r.tavern_feature,rumor:r.tavern_rumor,specialBrew:{name:r.tavern_brew_name,desc:r.tavern_brew_desc} },
    npc: { summary:r.npc_summary,pocket:r.npc_pocket,secret:r.npc_secret },
    hook: { summary:r.plot_hook },
    encounter: { description:r.encounter },
    curiosity: r.curiosity, rumor: r.extra_rumor
  }
}

// ── DB: Votaciones ────────────────────────────────────────────
async function createVote(chatId, question, options, requiredVoters) {
  await pool.query('DELETE FROM votes WHERE chat_id = $1', [chatId])
  const res = await pool.query(`
    INSERT INTO votes (chat_id,question,options,votes,required_voters)
    VALUES ($1,$2,$3,'{}','$4') RETURNING id
  `, [chatId, question, JSON.stringify(options), JSON.stringify(requiredVoters)])
  return res.rows[0].id
}

async function getActiveVote(chatId) {
  const res = await pool.query('SELECT * FROM votes WHERE chat_id = $1 ORDER BY created_at DESC LIMIT 1', [chatId])
  return res.rows[0] || null
}

async function castVote(chatId, userId, option) {
  const vote = await getActiveVote(chatId)
  if (!vote) return null
  const votes = vote.votes || {}
  votes[String(userId)] = option
  await pool.query('UPDATE votes SET votes = $1 WHERE id = $2', [JSON.stringify(votes), vote.id])
  const required = vote.required_voters || []
  const allVoted = required.every(uid => votes[String(uid)] !== undefined)
  return { vote: { ...vote, votes }, allVoted }
}

async function clearVote(chatId) {
  await pool.query('DELETE FROM votes WHERE chat_id = $1', [chatId])
}

async function deleteGame(chatId) {
  await pool.query('DELETE FROM games WHERE chat_id = $1', [chatId])
}

// ── Caché ─────────────────────────────────────────────────────
const cache = new Map()
async function getGame(chatId) {
  if (cache.has(chatId)) return cache.get(chatId)
  const game = await loadGame(chatId)
  if (game) { cache.set(chatId, game); return game }
  return createEmptyGame()
}

function createEmptyGame() {
  return { phase:'idle', players:[], numPlayers:0, setupStep:0, setupSubStep:'num_players', setupBuffer:{}, history:[], currentTurn:0, worldMemory:[], worldContext:null }
}

// ── Utilidades de personaje ───────────────────────────────────
function roll(sides) { return Math.floor(Math.random() * sides) + 1 }
function genStats(cls) {
  const base=[15,14,13,12,10,8].sort(()=>Math.random()-0.5)
  const pri={guerrero:[0,2,1,4,3,5],mago:[3,1,2,4,0,5],pícaro:[1,0,2,3,4,5],clérigo:[4,2,1,0,3,5],bárbaro:[0,2,1,5,3,4],bardo:[5,1,2,3,4,0],druida:[4,2,1,3,0,5],explorador:[1,0,2,4,3,5],paladín:[0,5,2,3,4,1],hechicero:[5,1,2,3,4,0],brujo:[5,1,2,3,4,0],monje:[4,0,2,3,1,5]}
  const keys=['str','dex','con','int','wis','cha']
  const order=pri[cls.toLowerCase()]||[0,1,2,3,4,5]
  const s={}; keys.forEach((k,i)=>s[k]=base[order[i]]); return s
}
function genHp(cls,con){const hd=HIT_DICE[cls.toLowerCase()]||8;return hd+mod(con)}
function genAc(cls,dex){if(['guerrero','paladín'].includes(cls.toLowerCase()))return 16;if(['clérigo','explorador','bárbaro'].includes(cls.toLowerCase()))return 13+Math.min(mod(dex),2);return 10+mod(dex)}
function genItems(cls){const it={guerrero:['Espada larga','Escudo','Armadura de placas'],mago:['Bastón arcano','Libro de hechizos','Daga'],pícaro:['Espadas cortas x2','Herramientas de ladrón','Capa oscura'],clérigo:['Maza','Escudo sagrado','Símbolo sagrado'],bárbaro:['Hacha de guerra','Jabalinas x4'],bardo:['Laúd','Espada corta','Kit de disfraz'],druida:['Bastón druídico','Hierbas medicinales'],explorador:['Arco largo','Espada corta','Kit de supervivencia'],paladín:['Espada bastarda','Escudo','Símbolo sagrado'],hechicero:['Foco arcano','Daga','Amuleto familiar'],brujo:['Foco arcano','Daga','Pergamino del pacto'],monje:['Dardos x10','Bastón']};return it[cls.toLowerCase()]||['Mochila','Antorcha']}

function createPlayer(name,race,cls,background,trait,motivation,telegramUserId=null,telegramUsername=null){
  const stats=genStats(cls); const maxHp=genHp(cls,stats.con)
  return {name,race,class:cls,background,trait,motivation,hp:maxHp,maxHp,ac:genAc(cls,stats.dex),stats,inventory:genItems(cls),conditions:[],xp:0,level:1,abilities:[],telegramUserId,telegramUsername}
}

function formatPlayerCard(p) {
  const pct=Math.round((p.hp/p.maxHp)*10)
  const bar='█'.repeat(pct)+'░'.repeat(10-pct)
  const xpNext=xpForNextLevel(p.level)
  const xpBar=xpNext?`XP: ${p.xp}/${xpNext}`:''
  const prof=PROFICIENCY_BONUS[(p.level||1)-1]
  return `⚔️ *${p.name}* — ${p.race} ${p.class} (Nv.${p.level||1})\n` +
    `❤️ HP: ${p.hp}/${p.maxHp} [${bar}]\n` +
    `🛡️ CA: ${p.ac} | Prof: +${prof}\n` +
    `📊 FUE:${p.stats.str} DES:${p.stats.dex} CON:${p.stats.con}\n` +
    (xpBar?`✨ ${xpBar}\n`:'') +
    `🎒 ${p.inventory.slice(0,4).join(', ')}\n` +
    `💭 _${p.trait}_`
}

// ── EEEG: contexto ────────────────────────────────────────────
function generateWorldContext(){
  const loc=EEEG.generateLocation()
  return {town:loc.town,tavern:loc.tavern,npc:EEEG.generateNPC(),hook:EEEG.generatePlotHook(),encounter:EEEG.generateEncounter(),curiosity:EEEG.generateCuriosity(),rumor:EEEG.generateRumor()}
}
function buildWorldContextString(ctx){
  if(!ctx) return ''
  return `CONTEXTO DEL MUNDO:\nLocalización: ${ctx.town.name} (${ctx.town.type}, ~${ctx.town.population} hab.)\nEvento actual: ${ctx.town.event}\nLandmark: ${ctx.town.landmark}\nTaberna: "${ctx.tavern.name}" (${ctx.tavern.wealth}) — ${ctx.tavern.feature}\nBebida especial: "${ctx.tavern.specialBrew.name}": ${ctx.tavern.specialBrew.desc}\nRumor taberna: ${ctx.tavern.rumor}\nNPC notable: ${ctx.npc.summary} Lleva: ${ctx.npc.pocket}. Secreto: ${ctx.npc.secret}\nGancho: ${ctx.hook.summary}\nEncuentro posible: ${ctx.encounter.description}\nObjeto curioso: ${ctx.curiosity}\nRumor adicional: ${ctx.rumor}`
}

// ── System prompts ────────────────────────────────────────────
function buildSystemPrompt(game){
  const pd=game.players.map((p,i)=>`J${i+1}: ${p.name} (${p.race} ${p.class} Nv.${p.level||1}, XP:${p.xp||0}) HP:${p.hp}/${p.maxHp} AC:${p.ac} FUE:${p.stats.str} DES:${p.stats.dex} CON:${p.stats.con} INT:${p.stats.int} SAB:${p.stats.wis} CAR:${p.stats.cha} Prof:+${PROFICIENCY_BONUS[(p.level||1)-1]} Rasgo:"${p.trait}" Motivación:"${p.motivation}" Habilidades:[${(p.abilities||[]).join(', ')||'ninguna'}] Inv:[${p.inventory.join(', ')}]`).join('\n')
  const decisions=game.worldMemory?.filter(m=>m.type==='decision').slice(0,5)||[]
  const locations=game.worldMemory?.filter(m=>m.type==='location').slice(0,5)||[]
  const npcs=game.worldMemory?.filter(m=>m.type==='npc').slice(0,5)||[]
  const memBlock=[decisions.length?`DECISIONES:\n${decisions.map(m=>`- ${m.title}: ${m.description}`).join('\n')}` :'',locations.length?`LUGARES:\n${locations.map(m=>`- ${m.title}: ${m.description}`).join('\n')}` :'',npcs.length?`NPCs:\n${npcs.map(m=>`- ${m.title}: ${m.description}`).join('\n')}` :''].filter(Boolean).join('\n\n')
  const worldCtx=game.worldContext?buildWorldContextString(game.worldContext):''
  return `Eres un experto Director de Juego de rol de fantasía D&D 5e. Diriges para ${game.players.length} jugador(es).

PERSONAJES:\n${pd}

${memBlock?`MEMORIA:\n${memBlock}`:''}

${worldCtx}

INSTRUCCIONES:
- Narra en español con estilo literario evocador y conciso.
- Usa niveles, habilidades, rasgos y contexto del mundo en la narrativa.
- Cuando una acción requiera tirada: TIRADA:[tipo]
- Para actualizar HP: UPDATE_HP:[nombre]:[valor]
- Para dar XP tras combates, hitos o logros: XP:[nombre]:[cantidad] (usa valores D&D 5e: enemigo débil=25-50, medio=100-200, difícil=450-700, jefe=1100-2300)
- Para añadir objeto: ADD_ITEM:[nombre]:[objeto]
- Para quitar objeto: REMOVE_ITEM:[nombre]:[objeto]
- Memoria: MEMORIA_DECISION:[título]|[desc] / MEMORIA_LUGAR:[nombre]|[desc] / MEMORIA_NPC:[nombre]|[desc]
- Crónica: CRONICA:[párrafo épico 2-3 frases]
- Cuando plantees una decisión de grupo importante usa: VOTACION:[pregunta]|[opción1]|[opción2]|[opción3]
- Markdown Telegram (*negrita*, _cursiva_). Máx 3 párrafos.
- Al final: ACCIONES: acción1 | acción2 | acción3`
}

function buildSetupPrompt(game){
  return `Eres el asistente de creación de personajes para D&D 5e en español vía Telegram. Guías paso a paso de forma breve y animada.
PASO: ${game.setupSubStep} | JUGADOR: ${game.setupStep+1} de ${game.numPlayers}
DATOS: ${JSON.stringify(game.setupBuffer)}
- "name": Pide el nombre épicamente.
- "race": Lista 9 razas numeradas con descripción en 3 palabras.
- "class": Lista 12 clases numeradas con descripción en 3 palabras.
- "background": 6 trasfondos adaptados a su raza/clase.
- "trait": Rasgo de personalidad con 4 ejemplos.
- "motivation": Motivación con 4 ejemplos.
- "confirm": Resumen épico. Escribe al final: CONFIRMAR_PERSONAJE
Cuando confirme: PERSONAJE_LISTO|[nombre]|[raza]|[clase]|[trasfondo]|[rasgo]|[motivación]
Markdown Telegram. Breve y en español.`
}

// ── Llamada a Claude ──────────────────────────────────────────
async function callClaude(game, userMsg, sysOverride){
  const system=sysOverride||buildSystemPrompt(game)
  const messages=[...game.history,{role:'user',content:userMsg}]
  const res=await anthropic.messages.create({model:'claude-sonnet-4-20250514',max_tokens:1000,system,messages})
  const text=res.content.map(b=>b.text||'').join('')
  game.history.push({role:'user',content:userMsg})
  game.history.push({role:'assistant',content:text})
  if(game.history.length>40) game.history=game.history.slice(-40)
  return text
}

// ── Parsear comandos del DM ───────────────────────────────────
async function parseDMCommands(chatId, game, text){
  let clean=text
  const rolls=[]
  const levelUps=[]
  const voteData={ active:false, question:'', options:[] }

  // Tiradas
  const tiradaRe=/TIRADA:(\w+(?:\s\w+)?)/gi; let tm
  while((tm=tiradaRe.exec(text))!==null) rolls.push({tipo:tm[1],resultado:roll(20)})
  clean=clean.replace(/TIRADA:[^\s\n]*/gi,'').trim()

  // HP
  const hpRe=/UPDATE_HP:([^:]+):(\d+)/gi; let hm
  while((hm=hpRe.exec(text))!==null){const p=game.players.find(x=>x.name.toLowerCase()===hm[1].trim().toLowerCase());if(p) p.hp=Math.max(0,Math.min(parseInt(hm[2]),p.maxHp))}
  clean=clean.replace(/UPDATE_HP:[^\n]*/gi,'').trim()

  // XP y posible subida de nivel
  const xpRe=/XP:([^:]+):(\d+)/gi; let xm
  while((xm=xpRe.exec(text))!==null){
    const p=game.players.find(x=>x.name.toLowerCase()===xm[1].trim().toLowerCase())
    if(p){
      const gained=parseInt(xm[2])
      const oldLevel=p.level||1
      p.xp=(p.xp||0)+gained
      const newLevel=getLevelFromXP(p.xp)
      if(newLevel>oldLevel){
        const hpGain=hpGainOnLevelUp(p.class,p.stats.con)
        p.maxHp+=hpGain; p.hp=Math.min(p.hp+hpGain,p.maxHp)
        const newAbilities=getNewAbilities(p.class,oldLevel,newLevel)
        p.abilities=[...(p.abilities||[]),...newAbilities]
        p.level=newLevel
        levelUps.push({name:p.name,oldLevel,newLevel,hpGain,abilities:newAbilities,xp:p.xp})
      }
    }
  }
  clean=clean.replace(/XP:[^\n]*/gi,'').trim()

  // Items
  const addRe=/ADD_ITEM:([^:]+):([^\n]+)/gi; let am
  while((am=addRe.exec(text))!==null){const p=game.players.find(x=>x.name.toLowerCase()===am[1].trim().toLowerCase());if(p) p.inventory.push(am[2].trim())}
  clean=clean.replace(/ADD_ITEM:[^\n]*/gi,'').trim()
  const remRe=/REMOVE_ITEM:([^:]+):([^\n]+)/gi; let rm
  while((rm=remRe.exec(text))!==null){const p=game.players.find(x=>x.name.toLowerCase()===rm[1].trim().toLowerCase());if(p){const idx=p.inventory.indexOf(rm[2].trim());if(idx>-1)p.inventory.splice(idx,1)}}
  clean=clean.replace(/REMOVE_ITEM:[^\n]*/gi,'').trim()

  // Memoria
  const memTypes=[{re:/MEMORIA_DECISION:([^|\n]+)\|([^\n]+)/gi,type:'decision'},{re:/MEMORIA_LUGAR:([^|\n]+)\|([^\n]+)/gi,type:'location'},{re:/MEMORIA_NPC:([^|\n]+)\|([^\n]+)/gi,type:'npc'}]
  for(const {re,type} of memTypes){let mm;while((mm=re.exec(text))!==null){const title=mm[1].trim(),desc=mm[2].trim();await saveMemory(chatId,type,title,desc);if(!game.worldMemory)game.worldMemory=[];game.worldMemory.unshift({type,title,description:desc})}}
  clean=clean.replace(/MEMORIA_(DECISION|LUGAR|NPC):[^\n]*/gi,'').trim()

  // Crónica
  const cronicaRe=/CRONICA:([^\n]+)/gi; let cm
  while((cm=cronicaRe.exec(text))!==null) await pool.query('INSERT INTO chronicle (chat_id,entry) VALUES ($1,$2)',[chatId,cm[1].trim()])
  clean=clean.replace(/CRONICA:[^\n]*/gi,'').trim()

  // Votación
  const votaRe=/VOTACION:([^|\n]+)\|([^\n]+)/i
  const vm=clean.match(votaRe)
  if(vm){
    voteData.active=true
    voteData.question=vm[1].trim()
    voteData.options=vm[2].split('|').map(o=>o.trim()).filter(Boolean)
    clean=clean.replace(votaRe,'').trim()
  }

  // Acciones
  let actions=[]
  const acMatch=clean.match(/ACCIONES:\s*([^\n]+)/i)
  if(acMatch){actions=acMatch[1].split('|').map(a=>a.trim()).filter(Boolean);clean=clean.replace(/ACCIONES:[^\n]*/i,'').trim()}

  return {clean,rolls,actions,levelUps,voteData}
}

// ── Enviar con teclado ────────────────────────────────────────
async function sendWithActions(chatId, text, actions=[]){
  const opts={parse_mode:'Markdown'}
  if(actions.length>0) opts.reply_markup={keyboard:actions.map(a=>[{text:a}]),resize_keyboard:true,one_time_keyboard:true}
  else opts.reply_markup={remove_keyboard:true}
  try{await bot.sendMessage(chatId,text,opts)}
  catch(e){await bot.sendMessage(chatId,text.replace(/[*_`]/g,''),{reply_markup:opts.reply_markup})}
}

// ── Enviar votación con botones inline ────────────────────────
async function sendVote(chatId, question, options, requiredVoters){
  const keyboard={inline_keyboard:[options.map((_,i)=>({text:options[i],callback_data:`vote_${i}`}))]}
  const voterList=requiredVoters.length>0?`\n\n_Esperando voto de ${requiredVoters.length} jugador(es)_`:''
  await pool.query('DELETE FROM votes WHERE chat_id=$1',[chatId])
  await pool.query(`INSERT INTO votes (chat_id,question,options,votes,required_voters) VALUES ($1,$2,$3,'{}','$4')`,[chatId,question,JSON.stringify(options),JSON.stringify(requiredVoters)])
  await bot.sendMessage(chatId,`🗳️ *Decisión de grupo*\n\n${question}${voterList}`,{parse_mode:'Markdown',reply_markup:keyboard})
}

// ── Setup de personajes ───────────────────────────────────────
const setupSteps=['name','race','class','background','trait','motivation','confirm']

async function handleSetup(chatId, game, userText, fromUserId=null, fromUsername=null){
  await bot.sendChatAction(chatId,'typing')
  let reply
  try{reply=await callClaude(game,userText,buildSetupPrompt(game))}
  catch(e){await bot.sendMessage(chatId,`❌ Error Claude:\n\`${e.message}\``);return}

  if(reply.includes('PERSONAJE_LISTO|')){
    const raw=reply.split('PERSONAJE_LISTO|')[1]
    const parts=raw.split('|').map(s=>s.trim().replace(/[\r\n].*/,'').trim())
    const [pname,prace,pcls,pbg,ptrait,pmot]=parts
    const player=createPlayer(pname,prace,pcls,pbg||'Aventurero',ptrait||'Misterioso',pmot||'Buscar fortuna',fromUserId,fromUsername)
    game.players.push(player)
    game.setupStep++; game.setupSubStep='name'; game.setupBuffer={}; game.history=[]
    await saveGame(chatId,game); cache.set(chatId,game)
    await bot.sendMessage(chatId,`✅ *${pname}* el/la ${prace} ${pcls} (Nv.1) se une a la aventura.`,{parse_mode:'Markdown'})
    if(game.setupStep>=game.numPlayers) await startAdventure(chatId,game)
    else await bot.sendMessage(chatId,`Ahora creemos al personaje ${game.setupStep+1} de ${game.numPlayers}. ¿Cómo se llama?`)
    return
  }

  const idx=setupSteps.indexOf(game.setupSubStep)
  if(game.setupSubStep==='name') game.setupBuffer.name=userText
  else if(game.setupSubStep==='race') game.setupBuffer.race=userText
  else if(game.setupSubStep==='class') game.setupBuffer.class=userText
  else if(game.setupSubStep==='background') game.setupBuffer.background=userText
  else if(game.setupSubStep==='trait') game.setupBuffer.trait=userText
  else if(game.setupSubStep==='motivation') game.setupBuffer.motivation=userText
  if(idx<setupSteps.length-1) game.setupSubStep=setupSteps[idx+1]
  await saveGame(chatId,game); cache.set(chatId,game)
  const actions=reply.includes('CONFIRMAR_PERSONAJE')?['¡Sí, estoy listo!','Quiero cambiar algo']:[]
  const cleanReply=reply.replace('CONFIRMAR_PERSONAJE','').trim()
  await sendWithActions(chatId,cleanReply,actions)
}

async function startAdventure(chatId, game){
  game.phase='adventure'; game.history=[]
  const worldContext=generateWorldContext(); game.worldContext=worldContext
  await saveWorldContext(chatId,worldContext)
  await saveGame(chatId,game); cache.set(chatId,game)
  await bot.sendChatAction(chatId,'typing')
  const cards=game.players.map(formatPlayerCard).join('\n\n')
  await bot.sendMessage(chatId,`🗡️ *¡La aventura comienza!*\n\n${cards}`,{parse_mode:'Markdown'})
  const names=game.players.map(p=>`${p.name} (${p.race} ${p.class} Nv.1, motivación:"${p.motivation}")`).join(', ')
  let reply
  try{reply=await callClaude(game,`Comienza la aventura para: ${names}. Crea una escena de apertura misteriosa que use trasfondos y motivaciones. Deja la primera decisión en sus manos.`)}
  catch(e){await bot.sendMessage(chatId,`❌ Error Claude:\n\`${e.message}\``);return}
  const {clean,actions,voteData}=await parseDMCommands(chatId,game,reply)
  if(voteData.active){
    const voterIds=game.players.map(p=>p.telegramUserId).filter(Boolean)
    await sendVote(chatId,voteData.question,voteData.options,voterIds)
  } else {
    await sendWithActions(chatId,`🎲 *Director de Juego*\n\n${clean}`,actions)
  }
  await saveGame(chatId,game); cache.set(chatId,game)
}

// ── Callback de votaciones ────────────────────────────────────
bot.on('callback_query', async (query) => {
  const chatId=query.message.chat.id
  const userId=query.from.id
  const username=query.from.first_name||'Jugador'
  const optionIdx=parseInt(query.data.replace('vote_',''))
  const game=await getGame(chatId)
  if(!game||game.phase!=='adventure') return bot.answerCallbackQuery(query.id,{text:'No hay votación activa.'})

  const vote=await getActiveVote(chatId)
  if(!vote) return bot.answerCallbackQuery(query.id,{text:'No hay votación activa.'})

  const options=vote.options
  const chosen=options[optionIdx]
  if(!chosen) return bot.answerCallbackQuery(query.id,{text:'Opción inválida.'})

  const {vote:updatedVote,allVoted}=await castVote(chatId,userId,chosen)
  await bot.answerCallbackQuery(query.id,{text:`✅ Votaste: "${chosen}"`})
  await bot.sendMessage(chatId,`🗳️ *${username}* vota: _${chosen}_`,{parse_mode:'Markdown'})

  if(allVoted){
    await clearVote(chatId)
    // Contar votos
    const counts={}
    Object.values(updatedVote.votes).forEach(v=>{counts[v]=(counts[v]||0)+1})
    const winner=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0]
    const summary=Object.entries(counts).map(([opt,n])=>`${opt}: ${n} voto(s)`).join(', ')
    await bot.sendMessage(chatId,`✅ *Todos han votado*\nResultado: ${summary}\n\n🏆 Decisión del grupo: *${winner}*`,{parse_mode:'Markdown'})
    await bot.sendChatAction(chatId,'typing')
    let reply
    try{reply=await callClaude(game,`El grupo ha decidido por votación: "${winner}". Narra las consecuencias de esta decisión.`)}
    catch(e){await bot.sendMessage(chatId,`❌ Error Claude:\n\`${e.message}\``);return}
    const {clean,rolls,actions,levelUps,voteData}=await parseDMCommands(chatId,game,reply)
    for(const r of rolls){const crit=r.resultado===20?' ✨ ¡CRÍTICO!':r.resultado===1?' 💀 ¡PIFIA!':'';await bot.sendMessage(chatId,`🎲 Tirada de *${r.tipo}*: *${r.resultado}*/20${crit}`,{parse_mode:'Markdown'})}
    for(const lu of levelUps) await sendLevelUp(chatId,lu)
    if(voteData.active){
      const voterIds=game.players.map(p=>p.telegramUserId).filter(Boolean)
      await sendVote(chatId,voteData.question,voteData.options,voterIds)
    } else {
      await sendWithActions(chatId,`🎲 *Director de Juego*\n\n${clean}`,actions)
    }
    await saveGame(chatId,game); cache.set(chatId,game)
  }
})

// ── Notificación de subida de nivel ──────────────────────────
async function sendLevelUp(chatId, lu){
  let msg=`🎉 *¡${lu.name} ha subido al nivel ${lu.newLevel}!*\n\n`
  msg+=`❤️ HP máximo: +${lu.hpGain}\n`
  msg+=`✨ XP total: ${lu.xp}\n`
  if(lu.abilities.length>0){msg+=`\n🌟 *Nuevas habilidades:*\n`;lu.abilities.forEach(a=>{msg+=`• ${a}\n`})}
  await bot.sendMessage(chatId,msg,{parse_mode:'Markdown'})
}

// ── Comandos ──────────────────────────────────────────────────
bot.onText(/\/start|\/nueva/, async (msg) => {
  const chatId=msg.chat.id
  const game=createEmptyGame(); game.phase='setup'; game.setupSubStep='num_players'
  await deleteGame(chatId)
  await pool.query(`INSERT INTO games (chat_id,phase,num_players,setup_step,setup_substep,setup_buffer,history,current_turn) VALUES ($1,'setup',0,0,'num_players','{}','[]',0)`,[chatId])
  cache.set(chatId,game)
  const isGroup=msg.chat.type!=='private'
  const groupNote=isGroup?'\n\n_Estáis en un grupo. Cada jugador deberá crear su personaje por turno._':''
  await sendWithActions(chatId,`⚔️ *¡Bienvenido al DM Automático!*${groupNote}\n\n¿Cuántos jugadores participarán? (1-4)`,['1 jugador','2 jugadores','3 jugadores','4 jugadores'])
})

// Comando para unirse en grupo (crea tu personaje)
bot.onText(/\/unirse/, async (msg) => {
  const chatId=msg.chat.id; const userId=msg.from.id; const username=msg.from.first_name||'Jugador'
  const game=await getGame(chatId)
  if(!game||game.phase!=='setup'){await bot.sendMessage(chatId,'No hay una partida en configuración. Usa /nueva primero.');return}
  if(game.players.some(p=>p.telegramUserId===userId)){await bot.sendMessage(chatId,`${username}, ya tienes un personaje en esta partida.`);return}
  await bot.sendMessage(chatId,`👤 *${username}* se une a la partida. Vamos a crear tu personaje...`,{parse_mode:'Markdown'})
  await bot.sendChatAction(chatId,'typing')
  let r; try{r=await callClaude(game,'Pide el nombre del personaje de forma épica.',buildSetupPrompt(game))}catch(e){r='¿Cómo se llamará tu héroe?'}
  await bot.sendMessage(chatId,r,{parse_mode:'Markdown'})
  game._pendingUser={userId,username}
  cache.set(chatId,game)
})

bot.onText(/\/estado/, async (msg) => {
  const chatId=msg.chat.id; const game=await getGame(chatId)
  if(!game||game.players.length===0){await bot.sendMessage(chatId,'No hay partida activa. Usa /nueva.');return}
  const cards=game.players.map(formatPlayerCard).join('\n\n')
  await bot.sendMessage(chatId,`📋 *Estado de los personajes*\n\n${cards}`,{parse_mode:'Markdown'})
})

bot.onText(/\/xp/, async (msg) => {
  const chatId=msg.chat.id; const game=await getGame(chatId)
  if(!game||game.players.length===0){await bot.sendMessage(chatId,'No hay partida activa.');return}
  let txt='📊 *Experiencia del grupo*\n\n'
  for(const p of game.players){
    const next=xpForNextLevel(p.level||1)
    const pct=next?Math.round(((p.xp||0)/next)*100):100
    const bar='█'.repeat(Math.floor(pct/10))+'░'.repeat(10-Math.floor(pct/10))
    txt+=`⚔️ *${p.name}* Nv.${p.level||1}\n${p.xp||0}/${next||'MAX'} XP [${bar}] ${pct}%\n\n`
  }
  await bot.sendMessage(chatId,txt,{parse_mode:'Markdown'})
})

bot.onText(/\/habilidades/, async (msg) => {
  const chatId=msg.chat.id; const game=await getGame(chatId)
  if(!game||game.players.length===0){await bot.sendMessage(chatId,'No hay partida activa.');return}
  let txt='🌟 *Habilidades del grupo*\n\n'
  for(const p of game.players){
    txt+=`⚔️ *${p.name}* (${p.class} Nv.${p.level||1})\n`
    if((p.abilities||[]).length===0) txt+='_Sin habilidades especiales aún_\n\n'
    else{(p.abilities||[]).forEach(a=>{txt+=`• ${a}\n`});txt+='\n'}
  }
  await bot.sendMessage(chatId,txt,{parse_mode:'Markdown'})
})

bot.onText(/\/continuar/, async (msg) => {
  const chatId=msg.chat.id; const game=await loadGame(chatId)
  if(!game||game.phase!=='adventure'){await bot.sendMessage(chatId,'No hay partida guardada. Usa /nueva.');return}
  cache.set(chatId,game)
  const cards=game.players.map(formatPlayerCard).join('\n\n')
  await bot.sendMessage(chatId,`🗡️ *¡Continuando la aventura!*\n\n${cards}`,{parse_mode:'Markdown'})
  const decisions=game.worldMemory?.filter(m=>m.type==='decision').slice(0,3)||[]
  const locations=game.worldMemory?.filter(m=>m.type==='location').slice(0,3)||[]
  const npcs=game.worldMemory?.filter(m=>m.type==='npc').slice(0,3)||[]
  let memMsg='📜 *Memoria de la aventura:*'
  if(decisions.length) memMsg+=`\n⚡ *Decisiones:* ${decisions.map(m=>m.title).join(', ')}`
  if(locations.length) memMsg+=`\n🗺️ *Lugares:* ${locations.map(m=>m.title).join(', ')}`
  if(npcs.length) memMsg+=`\n👤 *NPCs:* ${npcs.map(m=>m.title).join(', ')}`
  await bot.sendMessage(chatId,memMsg,{parse_mode:'Markdown'})
  await bot.sendChatAction(chatId,'typing')
  let reply; try{reply=await callClaude(game,'Retoma la aventura con un breve resumen de lo ocurrido y plantea la situación actual.')}
  catch(e){await bot.sendMessage(chatId,`❌ Error Claude:\n\`${e.message}\``);return}
  const {clean,actions,voteData}=await parseDMCommands(chatId,game,reply)
  if(voteData.active){const voterIds=game.players.map(p=>p.telegramUserId).filter(Boolean);await sendVote(chatId,voteData.question,voteData.options,voterIds)}
  else await sendWithActions(chatId,`🎲 *Director de Juego*\n\n${clean}`,actions)
  await saveGame(chatId,game); cache.set(chatId,game)
})

bot.onText(/\/memoria/, async (msg) => {
  const chatId=msg.chat.id; const game=await getGame(chatId)
  if(!game||!game.worldMemory?.length){await bot.sendMessage(chatId,'Aún no hay memoria guardada.');return}
  const decisions=game.worldMemory.filter(m=>m.type==='decision').slice(0,5)
  const locations=game.worldMemory.filter(m=>m.type==='location').slice(0,5)
  const npcs=game.worldMemory.filter(m=>m.type==='npc').slice(0,5)
  let msg2='📜 *Memoria de la aventura*\n'
  if(decisions.length) msg2+=`\n⚡ *Decisiones:*\n${decisions.map(m=>`• ${m.title}: _${m.description}_`).join('\n')}`
  if(locations.length) msg2+=`\n\n🗺️ *Lugares:*\n${locations.map(m=>`• ${m.title}: _${m.description}_`).join('\n')}`
  if(npcs.length) msg2+=`\n\n👤 *NPCs:*\n${npcs.map(m=>`• ${m.title}: _${m.description}_`).join('\n')}`
  await bot.sendMessage(chatId,msg2,{parse_mode:'Markdown'})
})

bot.onText(/\/cronica/, async (msg) => {
  const chatId=msg.chat.id; const game=await getGame(chatId)
  if(!game||game.players.length===0){await bot.sendMessage(chatId,'No hay aventura en curso.');return}
  const res=await pool.query('SELECT entry,created_at FROM chronicle WHERE chat_id=$1 ORDER BY created_at ASC',[chatId])
  if(res.rows.length===0){await bot.sendMessage(chatId,'La crónica está vacía todavía.');return}
  const heroes=game.players.map(p=>`${p.name} el/la ${p.race} ${p.class} (Nv.${p.level||1})`).join(', ')
  const header=`CRÓNICA DE LA AVENTURA\n${'═'.repeat(40)}\nHéroes: ${heroes}\n${'═'.repeat(40)}\n\n`
  const body=res.rows.map((r,i)=>`${i+1}. ${r.entry}`).join('\n\n')
  const footer=`\n\n${'═'.repeat(40)}\nFin de la crónica — ${new Date().toLocaleDateString('es-ES')}`
  const buf=Buffer.from(header+body+footer,'utf-8')
  await bot.sendDocument(chatId,buf,{},{filename:'cronica_aventura.txt',contentType:'text/plain'})
})

bot.onText(/\/ayuda/, async (msg) => {
  await bot.sendMessage(msg.chat.id,
    `🎲 *Comandos disponibles*\n\n`+
    `/nueva — Iniciar o reiniciar una partida\n`+
    `/unirse — Unirse a una partida en grupo\n`+
    `/continuar — Retomar la última partida guardada\n`+
    `/estado — Ver fichas de personajes\n`+
    `/xp — Ver experiencia y progreso de nivel\n`+
    `/habilidades — Ver habilidades desbloqueadas\n`+
    `/memoria — Ver lugares, NPCs y decisiones\n`+
    `/cronica — Exportar la crónica como .txt\n`+
    `/ayuda — Mostrar esta ayuda`,
    {parse_mode:'Markdown'})
})

// ── Mensajes de texto ─────────────────────────────────────────
bot.on('message', async (msg) => {
  if(!msg.text||msg.text.startsWith('/')) return
  const chatId=msg.chat.id; const userId=msg.from.id; const username=msg.from.first_name||'Aventurero'
  const game=await getGame(chatId); const text=msg.text.trim()

  if(game.phase==='idle'){await bot.sendMessage(chatId,'Usa /nueva para comenzar o /continuar para retomar. ⚔️');return}

  if(game.phase==='setup'){
    if(game.setupSubStep==='num_players'){
      const n=parseInt(text)
      if(n>=1&&n<=4){
        game.numPlayers=n; game.setupSubStep='name'
        await bot.sendChatAction(chatId,'typing')
        let r; try{r=await callClaude(game,'Pide el nombre del primer personaje de forma épica.',buildSetupPrompt(game))}catch(e){r='¿Cómo se llamará tu héroe?'}
        await saveGame(chatId,game); cache.set(chatId,game)
        await bot.sendMessage(chatId,r,{parse_mode:'Markdown'})
      } else await sendWithActions(chatId,'Por favor elige entre 1 y 4 jugadores:',['1 jugador','2 jugadores','3 jugadores','4 jugadores'])
    } else {
      await handleSetup(chatId,game,text,userId,username)
    }
    return
  }

  if(game.phase==='adventure'){
    // En grupo: identificar el personaje del jugador
    const playerChar=game.players.find(p=>p.telegramUserId===userId)
    const label=playerChar?`⚔️ ${playerChar.name}`:`⚔️ ${username}`
    await bot.sendMessage(chatId,`_${label} actúa..._`,{parse_mode:'Markdown'})
    await bot.sendChatAction(chatId,'typing')
    const userMsg=playerChar?`[${playerChar.name}]: ${text}`:`[${username}]: ${text}`
    let reply; try{reply=await callClaude(game,userMsg)}
    catch(e){await bot.sendMessage(chatId,`❌ Error Claude:\n\`${e.message}\``);return}
    const {clean,rolls,actions,levelUps,voteData}=await parseDMCommands(chatId,game,reply)
    for(const r of rolls){const crit=r.resultado===20?' ✨ ¡CRÍTICO!':r.resultado===1?' 💀 ¡PIFIA!':'';await bot.sendMessage(chatId,`🎲 Tirada de *${r.tipo}*: *${r.resultado}*/20${crit}`,{parse_mode:'Markdown'})}
    for(const lu of levelUps) await sendLevelUp(chatId,lu)
    if(voteData.active){
      const voterIds=game.players.map(p=>p.telegramUserId).filter(Boolean)
      await sendVote(chatId,voteData.question,voteData.options,voterIds)
    } else {
      await sendWithActions(chatId,`🎲 *Director de Juego*\n\n${clean}`,actions)
    }
    await saveGame(chatId,game); cache.set(chatId,game)
  }
})

// ── Arranque ──────────────────────────────────────────────────
initDB().then(()=>console.log('🎲 Bot DM Automático iniciado — Sistema completo'))