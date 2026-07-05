require('dotenv').config();

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

// =======================================================
// CONFIGURACIÓN PRINCIPAL
// =======================================================

const ALLOWED_GROUP_IDS = (process.env.ALLOWED_GROUP_IDS || '')
  .split(',')
  .map(id => id.trim())
  .filter(Boolean);

// Límites sanos para grupo de amigos
const LIMITS = {
  MAX_REPLIES_PER_MINUTE: Number(process.env.MAX_REPLIES_PER_MINUTE) || 20,
  MAX_REPLIES_PER_DAY: Number(process.env.MAX_REPLIES_PER_DAY) || 250
};

// Archivo donde se guarda el contador diario
const STATS_FILE = path.join(__dirname, 'pichitobot-stats.json');

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
// Puedes agregar todos los comandos que quieras aquí.
//

const COMMANDS = [
  {
    type: 'exact',
    triggers: [
      'hola pichitobot',
      'buenas pichitobot'
    ],
    response: 'Hola 👋 soy PichitoBot. ¿Qué fue,mano sale valito?'
  },
  {
    type: 'includes',
    triggers: [
      'pichitobot dinos como funcionas',
      'pichitobot como funcionas'
    ],
    response:
      'Picho funciona así: escribes el comando, PichitoBot lo reconoce y responde con una respuesta pregrabada, Prueba con "pichitobot comandos"'
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
      '3. pichitobot ayuda\n'+
      '4. Que porqueria \n'+
      '5. Pichitobot quien es el mas picho?\n'+
      '6. Sale un valorant?\n'+
      '7. Whats sale? \n'+
      '8. quien \n'+
      '9. negro\n'+
      '10. negra \n'+
      '11. '
  },
    {
    type: 'exact',
    triggers: [
      'Que porquería'
    ],
    response:
      'Mamame las 2 bolas'
  },
  {
    type: 'exact',
    triggers: [
      'pichitobot quien es el mas picho'
    ],
    response: 'El más picho del grupo claramente es Picho, nadie es mas negro que ese mardito'
  },
 {
   type: 'exact',
   triggers: [
     'Sale un valorant?'
   ],
   response: 'Sisa mano sisa sisa'
 },
 {
   type: 'exact',
   triggers: [
     'What sale?'
   ],
   response: 'Un valito? by pichitobot'
 },
  {
   type: 'exact',
   triggers: [
     'quien'
   ],
   response: 'Me la mamo ma rika'
 },
 {
  type: 'word',
  triggers: [
    'negro'
  ],
  response: 'wakala'
},
 {
  type: 'word',
  triggers: [
    'negra'
  ],
  response: 'Uy no mano, negras no'
},
 {
  type: 'word',
  triggers: [
    'cabra'
  ],
  response: 'Nigga HOE'
},
  {
    type: 'exact',
    triggers: [
      'Probame aqui'
    ],
    response: 'Y si mejor te arreguindais de estas?'
  },

 {
  type: 'word',
  triggers: [
    'Israel',
    'israel',
    'is rael'
  ],
  response: 'Israel, Israel, qué bonito es Israel, Israel, Israel, qué bonito es Israel, Israel, Israel, en tus tierras bailaré, Israel, Israel, qué bonito es Israel \n' +
  'Pichito bot fue patrocinado por el grandioso y legitimo estado de Israel'
},
 {
  type: 'word',
  triggers: [
    'Judio'
  ],
  response: 'A mi no me van a quitar mi prepucio'
},
 {
  type: 'word',
  triggers: [
    'Prepucio'
  ],
  response: 'Me vas a arropar con tu prepucio o quereis que te arrope con el mio?'
},
 {
  type: 'word',
  triggers: [
    'Tesoro',
    'tesorito',
    'mi tesoro mas preciado'
  ],
  response: 'Yo mi tesorito lo tengo intacto pero pregunta por el de Gbu'
},

 {
  type: 'word',
  triggers: [
    'Estoy en el super'
  ],
  response: 'Noooooooojjjjjjooooooooodddddaaaaaaaaaaaaaaa Gbuuuu apurate, vos si hartais mardito'
},
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
  //   type: 'includes',
  //   triggers: [
  //     'pichitobot que opinas de minecraft'
  //   ],
  //   response: 'Minecraft es paz, hasta que aparece un creeper detrás de ti.'
  // }
];

// =======================================================
// ESTADO INTERNO DEL BOT
// =======================================================

const repliesThisMinute = [];
let yompinaStep = 0;

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
    const stats = JSON.parse(raw);

    if (stats.date !== today) {
      return {
        date: today,
        repliesToday: 0
      };
    }

    return {
      date: stats.date,
      repliesToday: Number(stats.repliesToday) || 0
    };
  } catch (error) {
    console.error('No se pudo leer el archivo de estadísticas. Se reiniciará el contador diario.');
    return {
      date: today,
      repliesToday: 0
    };
  }
}

function saveStats(stats) {
  fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2), 'utf8');
}

let stats = loadStats();

function normalizeText(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[¿?¡!.,;:()[\]{}"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function textHasWholeWord(text, word) {
  const safeWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(^|\\s)${safeWord}(\\s|$)`, 'i');

  return regex.test(text);
}

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

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasWholeWord(text, trigger) {
  const safeTrigger = escapeRegex(trigger);

  // Detecta palabra/frase completa.
  // "negro" detecta "pantalon negro"
  // pero no detecta "negroni".
  const regex = new RegExp(`(^|\\s)${safeTrigger}(\\s|$)`, 'i');

  return regex.test(text);
}

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

function cleanOldMinuteReplies() {
  const now = Date.now();
  const oneMinuteAgo = now - 60_000;

  while (repliesThisMinute.length > 0 && repliesThisMinute[0] < oneMinuteAgo) {
    repliesThisMinute.shift();
  }
}

function canReply() {
  // Reiniciar contador diario si cambió el día
  const today = getTodayKey();

  if (stats.date !== today) {
    stats = {
      date: today,
      repliesToday: 0
    };

    saveStats(stats);
  }

  // Límite por minuto
  cleanOldMinuteReplies();

  if (repliesThisMinute.length >= LIMITS.MAX_REPLIES_PER_MINUTE) {
    return {
      allowed: false,
      reason: 'Límite de respuestas por minuto alcanzado.'
    };
  }

  // Límite por día
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

const AUDIO_TRIGGERS = {
  kawaii: {
    file: 'kawaii.ogg',
    asVoice: true,

    // Palabras exactas
    words: [
      'kawaii',
      'kawai',
      'conchita'
    ],

    // Patrones flexibles
    patterns: [
      /\bkawa+i+\b/i,      // kawai, kawaii, kawaaaiiiii
      /\bconchi+ta+\b/i   // conchita, conchitaa, conchiiiiita
    ]
  }
};

function matchesAudioTrigger(text, config) {
  const wordMatch = config.words.some(word => {
    return textHasWholeWord(text, normalizeText(word));
  });

  if (wordMatch) return true;

  const patternMatch = config.patterns.some(pattern => {
    return pattern.test(text);
  });

  return patternMatch;
}
// =======================================================
// CLIENTE DE WHATSAPP
// =======================================================

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: 'pichitobot'
  }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  }
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

    // Solo el grupo permitido
  if (!ALLOWED_GROUP_IDS.includes(chat.id._serialized)) return;

    const text = normalizeText(msg.body);

    if (!text) return;

    // Audios especiales:
    // Detecta palabras exactas o patrones como kawai, kawaii, kawaaaiiiii, conchita, etc.
    for (const audioConfig of Object.values(AUDIO_TRIGGERS)) {
      if (matchesAudioTrigger(text, audioConfig)) {
        const audioPath = path.join(__dirname, 'media', audioConfig.file);

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

client.initialize();