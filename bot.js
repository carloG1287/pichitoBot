require('dotenv').config();

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

// =======================================================
// CONFIGURACIÓN PRINCIPAL
// =======================================================

// Soporta varios grupos separados por coma en .env
// Ejemplo:
// ALLOWED_GROUP_IDS=584146568168-1598410466@g.us,120363000000000000@g.us
const ALLOWED_GROUP_IDS = (process.env.ALLOWED_GROUP_IDS || '')
  .split(',')
  .map(id => id.trim())
  .filter(Boolean);

// Directorio persistente.
// En local puede ser ./data.
// En Docker/Contabo será /app/data si lo defines en docker-compose.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const MEDIA_DIR = process.env.MEDIA_DIR || path.join(__dirname, 'media');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

// Límites sanos para grupo de amigos
const LIMITS = {
  MAX_REPLIES_PER_MINUTE: Number(process.env.MAX_REPLIES_PER_MINUTE) || 20,
  MAX_REPLIES_PER_DAY: Number(process.env.MAX_REPLIES_PER_DAY) || 250
};

// Archivo donde se guarda el contador diario
const STATS_FILE = path.join(DATA_DIR, 'pichitobot-stats.json');

// =======================================================
// ÁREA PARA TUS COMANDOS Y RESPUESTAS
// =======================================================
//
// type: 'exact'
// El mensaje debe coincidir exactamente.
//
// type: 'includes'
// El mensaje puede contener esa frase dentro del texto.
//
// type: 'word'
// Detecta palabra o frase completa dentro de una oración.
//
// Nota:
// El texto se normaliza automáticamente:
// - minúsculas
// - sin acentos
// - sin signos como ¿?¡!.,;:
//

const COMMANDS = [
  {
    type: 'exact',
    triggers: [
      'hola pichitobot',
      'buenas pichitobot'
    ],
    response: 'Hola 👋 soy PichitoBot. ¿Qué fue, mano sale valito?'
  },
  {
    type: 'includes',
    triggers: [
      'pichitobot dinos como funcionas',
      'pichitobot como funcionas'
    ],
    response:
      'Picho funciona así: escribes el comando, PichitoBot lo reconoce y responde con una respuesta pregrabada. Prueba con "pichitobot comandos".'
  },
  {
    type: 'exact',
    triggers: [
      'pichitobot ayuda',
      'pichitobot comandos'
    ],
    response:
      'Comandos disponibles:\n\n' +
      '1. Hola pichitobot\n' +
      '2. pichitobot dinos como funcionas\n' +
      '3. pichitobot ayuda\n' +
      '4. Sale un valorant?\n' +
      '5. Whats sale?\n' +
      '6. quien\n' +
      '7. negro\n' +
      '8. negra\n' +
      '9. kawaii / kawai / conchita\n' +
      '10. yompina'
  },
  {
    type: 'exact',
    triggers: [
      'sale un valorant'
    ],
    response: 'Sisa mano sisa sisa'
  },
  {
    type: 'exact',
    triggers: [
      'what sale',
      'whats sale'
    ],
    response: 'Un valito? by PichitoBot'
  },
  {
    type: 'exact',
    triggers: [
      'quien'
    ],
    response: 'yo'
  },
  {
    type: 'word',
    triggers: [
      'negro'
    ],
    response: 'negro y oscuro como mi alma'
  },
  {
    type: 'word',
    triggers: [
      'negra'
    ],
    response: 'Uy no mano'
  },
  {
    type: 'word',
    triggers: [
      'israel',
      'is rael'
    ],
    response:
      'Israel, Israel, qué bonito es Israel.\n' +
      'PichitoBot fue patrocinado por el grandioso y legítimo estado de Israel.'
  },
  {
    type: 'word',
    triggers: [
      'estoy en el super'
    ],
    response: 'Noooooooojjjjjjooooooooodddddaaaaaaaaaaaaaaa apúrate.'
  }

  // EJEMPLO PARA AGREGAR OTRO COMANDO:
  //
  // {
  //   type: 'exact',
  //   triggers: [
  //     'pichitobot dame una frase'
  //   ],
  //   response: 'El que programa con sueño, debuggea con lágrimas.'
  // },
  //
  // {
  //   type: 'word',
  //   triggers: [
  //     'minecraft'
  //   ],
  //   response: 'Minecraft es paz hasta que aparece un creeper detrás de ti.'
  // }
];

// =======================================================
// AUDIOS ESPECIALES
// =======================================================
//
// El archivo debe estar en la carpeta media.
// Ejemplo:
// media/kawaii.ogg
//
// words:
// Palabras/frases exactas ya normalizadas.
//
// patterns:
// Regex para detectar derivados como kawaaaiiiii.
//

const AUDIO_TRIGGERS = {
  kawaii: {
    file: 'kawaii.ogg',
    asVoice: true,
    words: [
      'kawaii',
      'kawai',
      'conchita'
    ],
    patterns: [
      /\bkawa+i+\b/i,       // kawai, kawaii, kawaaaiiiii
      /\bconchi+ta+\b/i    // conchita, conchitaa, conchiiiiita
    ]
  }

  // EJEMPLO PARA OTRO AUDIO:
  //
  // minecraft: {
  //   file: 'minecraft.ogg',
  //   asVoice: true,
  //   words: [
  //     'minecraft',
  //     'maincra'
  //   ],
  //   patterns: [
  //     /\bminecra+ft\b/i,
  //     /\bmaincra+\b/i
  //   ]
  // }
};

// =======================================================
// ESTADO INTERNO DEL BOT
// =======================================================

const repliesThisMinute = [];
let yompinaStep = 0;

// =======================================================
// FUNCIONES DE UTILIDAD
// =======================================================

function getTodayKey() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function loadStats() {
  const today = getTodayKey();

  if (!fs.existsSync(STATS_FILE)) {
    return {
      date: today,
      repliesToday: 0
    };
  }

  try {
    const raw = fs.readFileSync(STATS_FILE, 'utf8');
    const currentStats = JSON.parse(raw);

    if (currentStats.date !== today) {
      return {
        date: today,
        repliesToday: 0
      };
    }

    return {
      date: currentStats.date,
      repliesToday: Number(currentStats.repliesToday) || 0
    };
  } catch (error) {
    console.error('No se pudo leer el archivo de estadísticas. Se reiniciará el contador diario.');

    return {
      date: today,
      repliesToday: 0
    };
  }
}

function saveStats(currentStats) {
  fs.writeFileSync(STATS_FILE, JSON.stringify(currentStats, null, 2), 'utf8');
}

let stats = loadStats();

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[¿?¡!.,;:()[\]{}"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasWholeWord(text, trigger) {
  const safeTrigger = escapeRegex(trigger);

  // Detecta palabra/frase completa.
  // "negro" detecta "pantalon negro"
  // pero no detecta "negroni".
  const regex = new RegExp(`(^|\\s)${safeTrigger}(\\s|$)`, 'i');

  return regex.test(text);
}

function textHasWholeWord(text, word) {
  return hasWholeWord(text, normalizeText(word));
}

// =======================================================
// COMANDO ESPECIAL YOMPINA
// =======================================================
//
// Lógica:
// Mensaje 1 con yompina => FHAAAAA
// Mensaje 2 seguido con yompina => BI
// Se reinicia.
// Si llega otro mensaje sin yompina, se rompe la secuencia.
//

function getYompinaResponse(text) {
  const hasYompina = textHasWholeWord(text, 'yompina');

  if (!hasYompina) {
    yompinaStep = 0;
    return null;
  }

  if (yompinaStep === 0) {
    yompinaStep = 1;
    return 'FHAAAAA';
  }

  yompinaStep = 0;
  return 'BI';
}

// =======================================================
// DETECCIÓN DE COMANDOS
// =======================================================

function findCommands(text) {
  const matchedCommands = [];

  for (const command of COMMANDS) {
    const normalizedTriggers = command.triggers.map(trigger => normalizeText(trigger));

    if (command.type === 'exact') {
      const found = normalizedTriggers.some(trigger => text === trigger);

      if (found) {
        matchedCommands.push(command);
      }
    }

    if (command.type === 'includes') {
      const found = normalizedTriggers.some(trigger => text.includes(trigger));

      if (found) {
        matchedCommands.push(command);
      }
    }

    if (command.type === 'word') {
      const found = normalizedTriggers.some(trigger => hasWholeWord(text, trigger));

      if (found) {
        matchedCommands.push(command);
      }
    }
  }

  return matchedCommands;
}

function matchesAudioTrigger(text, config) {
  const wordMatch = config.words.some(word => {
    return textHasWholeWord(text, word);
  });

  if (wordMatch) return true;

  const patternMatch = config.patterns.some(pattern => {
    return pattern.test(text);
  });

  return patternMatch;
}

// =======================================================
// LÍMITES DE RESPUESTAS
// =======================================================

function cleanOldMinuteReplies() {
  const now = Date.now();
  const oneMinuteAgo = now - 60_000;

  while (repliesThisMinute.length > 0 && repliesThisMinute[0] < oneMinuteAgo) {
    repliesThisMinute.shift();
  }
}

function canReply() {
  const today = getTodayKey();

  if (stats.date !== today) {
    stats = {
      date: today,
      repliesToday: 0
    };

    saveStats(stats);
  }

  cleanOldMinuteReplies();

  if (repliesThisMinute.length >= LIMITS.MAX_REPLIES_PER_MINUTE) {
    return {
      allowed: false,
      reason: 'Límite de respuestas por minuto alcanzado.'
    };
  }

  if (stats.repliesToday >= LIMITS.MAX_REPLIES_PER_DAY) {
    return {
      allowed: false,
      reason: 'Límite de respuestas diarias alcanzado.'
    };
  }

  return {
    allowed: true,
    reason: 'OK'
  };
}

function registerReply() {
  const now = Date.now();

  repliesThisMinute.push(now);

  stats.repliesToday += 1;
  saveStats(stats);
}

// =======================================================
// ENVÍO SEGURO DE RESPUESTAS
// =======================================================

async function safeReply(msg, response) {
  const permission = canReply();

  if (!permission.allowed) {
    console.log(`Respuesta bloqueada: ${permission.reason}`);
    return;
  }

  await msg.reply(response);
  registerReply();

  console.log(`Respuesta enviada. Total de hoy: ${stats.repliesToday}/${LIMITS.MAX_REPLIES_PER_DAY}`);
}

async function safeSendAudio(chat, audioPath, options = {}) {
  const permission = canReply();

  if (!permission.allowed) {
    console.log(`Audio bloqueado: ${permission.reason}`);
    return;
  }

  if (!fs.existsSync(audioPath)) {
    console.error(`No existe el audio: ${audioPath}`);
    return;
  }

  const media = MessageMedia.fromFilePath(audioPath);

  await chat.sendMessage(media, {
    sendAudioAsVoice: options.asVoice ?? true
  });

  registerReply();

  console.log(`Audio enviado. Total de hoy: ${stats.repliesToday}/${LIMITS.MAX_REPLIES_PER_DAY}`);
}

// =======================================================
// VALIDACIONES DE ARRANQUE
// =======================================================

if (ALLOWED_GROUP_IDS.length === 0) {
  console.warn('ADVERTENCIA: No hay grupos configurados en ALLOWED_GROUP_IDS.');
  console.warn('Crea un archivo .env con ALLOWED_GROUP_IDS=ID_DEL_GRUPO@g.us');
}

// =======================================================
// CLIENTE DE WHATSAPP
// =======================================================

const puppeteerConfig = {
  headless: true,
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-software-rasterizer',
    '--disable-crash-reporter',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-sync',
    '--disable-default-apps',
    '--mute-audio',
    '--no-first-run',
    '--no-zygote'
  ]
};

if (process.env.PUPPETEER_EXECUTABLE_PATH) {
  puppeteerConfig.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
}

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: process.env.WWEBJS_CLIENT_ID || 'pichitobot',
    dataPath: path.join(DATA_DIR, 'wwebjs_auth')
  }),
  puppeteer: puppeteerConfig
});

client.on('qr', qr => {
  console.log('Escanea este QR con WhatsApp:');
  qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
  console.log('Sesión autenticada correctamente.');
});

client.on('auth_failure', msg => {
  console.error('Error de autenticación:', msg);
});

client.on('ready', () => {
  console.log('PichitoBot está activo.');
  console.log(`DATA_DIR: ${DATA_DIR}`);
  console.log(`MEDIA_DIR: ${MEDIA_DIR}`);
  console.log(`Grupos permitidos: ${ALLOWED_GROUP_IDS.join(', ') || 'ninguno configurado'}`);
  console.log(`Respuestas de hoy: ${stats.repliesToday}/${LIMITS.MAX_REPLIES_PER_DAY}`);
});

client.on('message', async msg => {
  try {
    // Evita que el bot se responda a sí mismo
    if (msg.fromMe) return;

    const chat = await msg.getChat();

    // Solo grupos
    if (!chat.isGroup) return;

    // Solo grupos permitidos
    if (!ALLOWED_GROUP_IDS.includes(chat.id._serialized)) return;

    const text = normalizeText(msg.body);

    if (!text) return;

    // Audios especiales:
    // Detecta palabras exactas o patrones como kawai, kawaii, kawaaaiiiii, conchita, etc.
    for (const audioConfig of Object.values(AUDIO_TRIGGERS)) {
      if (matchesAudioTrigger(text, audioConfig)) {
        const audioPath = path.join(MEDIA_DIR, audioConfig.file);

        await safeSendAudio(chat, audioPath, {
          asVoice: audioConfig.asVoice
        });

        return;
      }
    }

    const responses = [];

    // Comando especial con contador:
    // 1er "yompina" seguido = FHAAAAA
    // 2do "yompina" seguido = BI
    // Luego se reinicia.
    const yompinaResponse = getYompinaResponse(text);

    if (yompinaResponse) {
      responses.push(yompinaResponse);
    }

    // Busca TODOS los demás comandos que coincidan en el mismo mensaje
    const commands = findCommands(text);

    for (const command of commands) {
      responses.push(command.response);
    }

    // Si no encontró nada, no responde
    if (responses.length === 0) return;

    // Une todas las respuestas encontradas en un solo mensaje
    const response = responses.join('\n');

    await safeReply(msg, response);
  } catch (error) {
    console.error('Error procesando mensaje:', error);
  }
});

client.on('disconnected', reason => {
  console.log('Cliente desconectado:', reason);
});

// Cierre limpio para Docker/PM2
process.on('SIGINT', async () => {
  console.log('Cerrando PichitoBot...');
  await client.destroy();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Cerrando PichitoBot...');
  await client.destroy();
  process.exit(0);
});

client.initialize();