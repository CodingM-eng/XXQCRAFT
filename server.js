const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET ortam değişkeni ayarlanmalıdır.');
}
const users = new Map(); // Gerçek kullanımda veritabanına bağlanabilir
const worldChanges = [];
const players = new Map();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Kayıt Ol
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password || password.length < 6) {
    return res.status(400).json({ error: 'Kullanıcı adı ve en az 6 haneli şifre girin.' });
  }
  if (users.has(username)) {
    return res.status(400).json({ error: 'Bu kullanıcı adı zaten alınmış.' });
  }
  const hash = await bcrypt.hash(password, 10);
  users.set(username, { username, hash });
  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, username });
});

// Giriş Yap
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = users.get(username);
  if (!user || !(await bcrypt.compare(password, user.hash))) {
    return res.status(400).json({ error: 'Kullanıcı adı veya şifre hatalı.' });
  }
  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, username });
});

// Socket.io Çok Oyunculu İletişim
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Giriş tokeni bulunamadı.'));
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return next(new Error('Yetkisiz bağlantı.'));
    socket.user = decoded;
    next();
  });
});

io.on('connection', (socket) => {
  const username = socket.user.username;
  players.set(socket.id, { id: socket.id, name: username, x: 48, y: 30, z: 48, yaw: 0 });

  socket.emit('worldChanges', worldChanges);
  socket.emit('players', Array.from(players.values()));
  socket.broadcast.emit('playerJoined', players.get(socket.id));

  socket.on('playerMove', (data) => {
    const pl = players.get(socket.id);
    if (pl) {
      Object.assign(pl, data);
      socket.broadcast.emit('playerMoved', pl);
    }
  });

  socket.on('blockChange', (change) => {
    worldChanges.push(change);
    socket.broadcast.emit('blockChange', change);
  });

  socket.on('disconnect', () => {
    players.delete(socket.id);
    io.emit('playerLeft', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`XXQCRAFT sunucusu ${PORT} portunda aktif.`));