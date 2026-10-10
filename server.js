const express = require('express');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);
const allowedOrigins = (process.env.CORS_ORIGINS || 'https://codingm-eng.github.io,https://localhost,http://localhost:3000,http://localhost:8100,capacitor://localhost,http://localhost')
  .split(',').map((origin) => origin.trim()).filter(Boolean);
const io = new Server(server, { cors: { origin: allowedOrigins, methods: ['GET', 'POST'] } });

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET ortam değişkeni ayarlanmalıdır.');

const { saveStore } = require('./storage');
const DATA_DIR = process.env.STORAGE_DIR || path.join(__dirname, 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');
const VIEW_RADIUS = 64;
const VOICE_RADIUS = 40;
const MODES = new Set(['s', 'c', 'a', 'h']);
const ITEM_IDS = new Set(['eb', 'wb', 'sw', 'pk', 'st', 'ir', ...Array.from({ length: 12 }, (_, index) => String(index + 1))]);
let saved = { users: {}, worlds: {} };
if (globalThis.__XXQ_SAVED__) {
  saved = globalThis.__XXQ_SAVED__;
} else {
  try {
    saved = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
const users = new Map(Object.entries(saved.users || {}));
const worlds = new Map(Object.entries(saved.worlds || {}));
const rooms = new Map();
let persistQueue = Promise.resolve();
let persistTimer = null;

function persistStore() {
  const contents = JSON.stringify({
    users: Object.fromEntries(users),
    worlds: Object.fromEntries(worlds)
  });
  persistQueue = persistQueue.catch(() => {}).then(() => saveStore(contents));
  return persistQueue;
}

function schedulePersist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistStore().catch((error) => console.error('Dünya kaydedilemedi:', error));
  }, 250);
  persistTimer.unref();
}

function issueToken(username) {
  return jwt.sign({ username }, JWT_SECRET, { expiresIn: '7d' });
}

function normalizeUsername(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isValidUsername(username) {
  return /^[A-Za-z0-9_]{3,16}$/.test(username);
}

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.post('/api/register', async (req, res) => {
  const username = normalizeUsername(req.body.username);
  const password = req.body.password;
  if (!isValidUsername(username) || typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: 'Kullanıcı adı 3-16 karakter, şifre 8-128 karakter olmalıdır.' });
  }
  const key = username.toLowerCase();
  if (users.has(key)) return res.status(409).json({ error: 'Bu kullanıcı adı zaten alınmış.' });

  const user = { username, hash: await bcrypt.hash(password, 10) };
  users.set(key, user);
  await persistStore();
  res.json({ token: issueToken(username), username });
});

app.post('/api/login', async (req, res) => {
  const username = normalizeUsername(req.body.username);
  const password = req.body.password;
  const user = users.get(username.toLowerCase());
  if (!user || typeof password !== 'string' || !(await bcrypt.compare(password, user.hash))) {
    return res.status(400).json({ error: 'Kullanıcı adı veya şifre hatalı.' });
  }
  res.json({ token: issueToken(user.username), username: user.username });
});

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Giriş tokeni bulunamadı.'));
  jwt.verify(token, JWT_SECRET, (error, decoded) => {
    if (error) return next(new Error('Oturum geçersiz veya süresi dolmuş.'));
    socket.user = decoded;
    next();
  });
});

function getRoom(code) {
  if (!rooms.has(code)) rooms.set(code, { players: new Map(), proximity: new Set() });
  return rooms.get(code);
}

function pairKey(first, second) {
  return [first, second].sort().join(':');
}

function distanceSquared(first, second) {
  const dx = first.x - second.x;
  const dy = first.y - second.y;
  const dz = first.z - second.z;
  return dx * dx + dy * dy + dz * dz;
}

function refreshProximity(room) {
  const players = [...room.players.values()];
  const next = new Set();
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const first = players[i];
      const second = players[j];
      const key = pairKey(first.id, second.id);
      if (distanceSquared(first, second) > VIEW_RADIUS * VIEW_RADIUS) continue;
      next.add(key);
      if (!room.proximity.has(key)) {
        io.to(first.id).emit('playerJoined', second);
        io.to(second.id).emit('playerJoined', first);
      }
    }
  }
  for (const key of room.proximity) {
    if (next.has(key)) continue;
    const [firstId, secondId] = key.split(':');
    io.to(firstId).emit('playerLeft', secondId);
    io.to(secondId).emit('playerLeft', firstId);
  }
  room.proximity = next;
}

function leaveWorld(socket) {
  const code = socket.data.worldCode;
  if (!code) return;
  const room = rooms.get(code);
  socket.data.worldCode = null;
  if (!room) return;
  room.players.delete(socket.id);
  socket.leave(code);
  for (const key of room.proximity) {
    if (!key.split(':').includes(socket.id)) continue;
    const [firstId, secondId] = key.split(':');
    const otherId = firstId === socket.id ? secondId : firstId;
    io.to(otherId).emit('playerLeft', socket.id);
  }
  room.proximity = new Set([...room.proximity].filter((key) => !key.split(':').includes(socket.id)));
  if (room.players.size === 0) rooms.delete(code);
}

function makeWorldCode() {
  let code;
  do {
    code = crypto.randomBytes(3).toString('hex').toUpperCase();
  } while (worlds.has(code));
  return code;
}

function worldSnapshot(world) {
  const blocks = Object.entries(world.blocks).map(([key, b]) => {
    const [x, y, z] = key.split(',').map(Number);
    return { x, y, z, b };
  });
  world.drops ||= [];
  return { code: world.code, name: world.name, mode: world.mode, seed: world.seed, blocks, drops: world.drops };
}

async function joinWorld(socket, code) {
  const world = worlds.get(code);
  if (!world) throw new Error('Bu dünya kodu bulunamadı.');
  leaveWorld(socket);

  const room = getRoom(code);
  const player = {
    id: socket.id,
    name: socket.user.username,
    x: 46 + Math.random() * 4,
    y: 35,
    z: 46 + Math.random() * 4,
    yaw: 0,
    voiceEnabled: false
  };
  socket.data.worldCode = code;
  socket.join(code);
  room.players.set(socket.id, player);
  refreshProximity(room);
  await persistQueue;

  return {
    world: worldSnapshot(world),
    player,
    players: [...room.players.values()].filter((other) => other.id !== socket.id && distanceSquared(player, other) <= VIEW_RADIUS * VIEW_RADIUS)
  };
}

io.on('connection', (socket) => {
  socket.data.worldCode = null;

  socket.on('createWorld', async (payload = {}, ack = () => {}) => {
    try {
      const name = typeof payload.name === 'string' ? payload.name.trim().slice(0, 32) : '';
      const mode = MODES.has(payload.mode) ? payload.mode : 's';
      const enteredSeed = Number(payload.seed);
      const seed = Number.isSafeInteger(enteredSeed) && enteredSeed > 0 ? enteredSeed : crypto.randomInt(1, 2147483647);
      const code = makeWorldCode();
      const world = {
        code,
        name: name || 'Yeni Dünya',
        mode,
        seed,
        owner: socket.user.username,
        createdAt: new Date().toISOString(),
        blocks: {},
        drops: []
      };
      worlds.set(code, world);
      await persistStore();
      ack({ ok: true, ...(await joinWorld(socket, code)) });
    } catch (error) {
      ack({ ok: false, error: error.message || 'Dünya oluşturulamadı.' });
    }
  });

  socket.on('joinWorld', async (payload = {}, ack = () => {}) => {
    try {
      const code = typeof payload.code === 'string' ? payload.code.trim().toUpperCase() : '';
      if (!/^[A-F0-9]{6}$/.test(code)) throw new Error('6 karakterli dünya kodunu girin.');
      ack({ ok: true, ...(await joinWorld(socket, code)) });
    } catch (error) {
      ack({ ok: false, error: error.message || 'Dünyaya katılınamadı.' });
    }
  });

  socket.on('playerMove', (data = {}) => {
    const code = socket.data.worldCode;
    const room = rooms.get(code);
    const player = room && room.players.get(socket.id);
    if (!player) return;
    const values = [data.x, data.y, data.z, data.yaw].map(Number);
    if (!values.every(Number.isFinite)) return;
    [player.x, player.y, player.z, player.yaw] = values;
    player.x = Math.max(0, Math.min(96, player.x));
    player.y = Math.max(0, Math.min(128, player.y));
    player.z = Math.max(0, Math.min(96, player.z));
    refreshProximity(room);
    for (const other of room.players.values()) {
      if (other.id !== socket.id && distanceSquared(player, other) <= VIEW_RADIUS * VIEW_RADIUS) {
        io.to(other.id).emit('playerMoved', player);
      }
    }
  });

  socket.on('blockChange', (change = {}, ack = () => {}) => {
    const code = socket.data.worldCode;
    const world = worlds.get(code);
    const x = Number(change.x);
    const y = Number(change.y);
    const z = Number(change.z);
    const block = Number(change.b);
    if (!world || ![x, y, z, block].every(Number.isInteger) || x < 0 || x >= 96 || y < 0 || y >= 48 || z < 0 || z >= 96 || block < 0 || block > 12) {
      return ack({ ok: false, error: 'Geçersiz blok değişikliği.' });
    }
    const key = `${x},${y},${z}`;
    if (block === 0) delete world.blocks[key];
    else world.blocks[key] = block;
    world.updatedAt = new Date().toISOString();
    schedulePersist();
    socket.to(code).emit('blockChange', { x, y, z, b: block });
    ack({ ok: true });
  });

  socket.on('dropItem', (data = {}, ack = () => {}) => {
    const code = socket.data.worldCode;
    const world = worlds.get(code);
    const room = rooms.get(code);
    const player = room && room.players.get(socket.id);
    const item = String(data.item);
    const count = Number(data.count);
    if (!world || !player || !ITEM_IDS.has(item) || !Number.isInteger(count) || count < 1 || count > 64) {
      return ack({ ok: false, error: 'Geçersiz eşya düşürme isteği.' });
    }
    world.drops ||= [];
    const drop = {
      id: crypto.randomUUID(),
      item,
      count,
      owner: socket.id,
      x: player.x,
      y: player.y + 0.5,
      z: player.z
    };
    world.drops.push(drop);
    schedulePersist();
    io.to(code).emit('itemDropped', drop);
    ack({ ok: true, drop });
  });

  socket.on('pickupDrop', (dropId, ack = () => {}) => {
    const code = socket.data.worldCode;
    const world = worlds.get(code);
    const room = rooms.get(code);
    const player = room && room.players.get(socket.id);
    if (!world || !player || typeof dropId !== 'string') return ack({ ok: false, error: 'Eşya alınamadı.' });
    world.drops ||= [];
    const index = world.drops.findIndex((drop) => drop.id === dropId);
    if (index < 0 || distanceSquared(player, world.drops[index]) > 3.5 * 3.5) return ack({ ok: false, error: 'Eşya yakında değil.' });
    const [drop] = world.drops.splice(index, 1);
    schedulePersist();
    io.to(code).emit('itemPickedUp', { id: drop.id, by: socket.id });
    ack({ ok: true, item: drop.item, count: drop.count });
  });

  socket.on('chatMessage', (message, ack = () => {}) => {
    const code = socket.data.worldCode;
    const player = rooms.get(code)?.players.get(socket.id);
    const text = typeof message === 'string' ? message.trim().slice(0, 160) : '';
    if (!player || !text) return ack({ ok: false, error: 'Sohbet mesajı boş veya geçersiz.' });
    const chatMessage = { name: player.name, text, timestamp: Date.now() };
    socket.to(code).emit('chatMessage', chatMessage);
    ack({ ok: true, message: chatMessage });
  });

  socket.on('voiceState', (enabled) => {
    const code = socket.data.worldCode;
    const room = rooms.get(code);
    const player = room && room.players.get(socket.id);
    if (!player) return;
    player.voiceEnabled = enabled === true;
    for (const other of room.players.values()) {
      if (other.id !== socket.id && distanceSquared(player, other) <= VOICE_RADIUS * VOICE_RADIUS) {
        io.to(other.id).emit('voiceState', { id: player.id, enabled: player.voiceEnabled });
      }
    }
  });

  socket.on('voiceSignal', ({ target, signal } = {}, ack = () => {}) => {
    const code = socket.data.worldCode;
    const room = rooms.get(code);
    const sender = room && room.players.get(socket.id);
    const recipient = room && room.players.get(target);
    if (!sender || !recipient || !sender.voiceEnabled || !recipient.voiceEnabled || distanceSquared(sender, recipient) > VOICE_RADIUS * VOICE_RADIUS) {
      return ack({ ok: false, error: 'Ses bağlantısı için oyuncular aynı dünyada ve yakın olmalıdır.' });
    }
    io.to(target).emit('voiceSignal', { from: socket.id, signal });
    ack({ ok: true });
  });

  socket.on('disconnect', () => leaveWorld(socket));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`XXQCRAFT sunucusu ${PORT} portunda aktif.`));