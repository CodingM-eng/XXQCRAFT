const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { io } = require('socket.io-client');

const projectRoot = path.join(__dirname, '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xxqcraft-test-'));
let port;
let baseUrl;
let serverProcess;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const freePort = probe.address().port;
      probe.close((error) => error ? reject(error) : resolve(freePort));
    });
  });
}

async function startServer() {
  const output = [];
  serverProcess = spawn(process.execPath, ['server.js'], {
    cwd: projectRoot,
    env: { ...process.env, PORT: String(port), JWT_SECRET: 'test-only-secret', STORAGE_DIR: dataDir },
    stdio: ['ignore', 'ignore', 'pipe']
  });
  serverProcess.stderr.on('data', (chunk) => output.push(chunk.toString()));
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {}
    if (serverProcess.exitCode !== null) throw new Error(`Server exited with ${serverProcess.exitCode}: ${output.join('')}`);
    await delay(100);
  }
  throw new Error(`Server did not start in time on port ${port}: ${output.join('')}`);
}

async function stopServer() {
  if (!serverProcess || serverProcess.exitCode !== null) return;
  const exited = once(serverProcess, 'exit');
  serverProcess.kill();
  await exited;
}

async function register(username) {
  const response = await fetch(`${baseUrl}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'test-password-123' })
  });
  assert.equal(response.status, 200);
  return response.json();
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(baseUrl, { auth: { token }, reconnection: false, timeout: 5000 });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

function emitAck(socket, event, payload) {
  return new Promise((resolve, reject) => {
    socket.timeout(5000).emit(event, payload, (error, result) => error ? reject(error) : resolve(result));
  });
}

function waitForEvent(socket, event, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, listener);
      reject(new Error(`Timed out waiting for ${event}`));
    }, 5000);
    const listener = (value) => {
      if (!predicate(value)) return;
      clearTimeout(timeout);
      socket.off(event, listener);
      resolve(value);
    };
    socket.on(event, listener);
  });
}

test('world rooms sync players, blocks, voice signals, and persist across restart', async (t) => {
  const sockets = [];
  t.after(async () => {
    sockets.forEach((socket) => socket.disconnect());
    await stopServer();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  port = await findFreePort();
  baseUrl = `http://127.0.0.1:${port}`;
  await startServer();
  const owner = await register('WorldOwner');
  const friend = await register('WorldFriend');
  const ownerSocket = await connect(owner.token);
  const friendSocket = await connect(friend.token);
  sockets.push(ownerSocket, friendSocket);

  const created = await emitAck(ownerSocket, 'createWorld', { name: 'Test world', seed: 123, mode: 'c' });
  assert.equal(created.ok, true);
  assert.match(created.world.code, /^[A-F0-9]{6}$/);
  assert.equal(created.world.seed, 123);

  const playerJoined = waitForEvent(ownerSocket, 'playerJoined', (player) => player.id === friendSocket.id);
  const joined = await emitAck(friendSocket, 'joinWorld', { code: created.world.code });
  assert.equal(joined.ok, true);
  await playerJoined;

  const movementReceived = waitForEvent(friendSocket, 'playerMoved', (player) => player.id === ownerSocket.id && player.x === 51);
  ownerSocket.emit('playerMove', { x: 51, y: 35, z: 51, yaw: 0.5 });
  await movementReceived;

  const blockReceived = waitForEvent(ownerSocket, 'blockChange', (block) => block.x === 3 && block.y === 4 && block.z === 5);
  assert.equal((await emitAck(friendSocket, 'blockChange', { x: 3, y: 4, z: 5, b: 2 })).ok, true);
  await blockReceived;

  const voiceEnabled = waitForEvent(ownerSocket, 'voiceState', (state) => state.id === friendSocket.id && state.enabled);
  friendSocket.emit('voiceState', true);
  await voiceEnabled;
  const ownerVoiceEnabled = waitForEvent(friendSocket, 'voiceState', (state) => state.id === ownerSocket.id && state.enabled);
  ownerSocket.emit('voiceState', true);
  await ownerVoiceEnabled;

  const signalReceived = waitForEvent(ownerSocket, 'voiceSignal', (message) => message.from === friendSocket.id);
  const signalResult = await emitAck(friendSocket, 'voiceSignal', {
    target: ownerSocket.id,
    signal: { description: { type: 'offer', sdp: 'test-sdp' } }
  });
  assert.equal(signalResult.ok, true);
  await signalReceived;

  ownerSocket.emit('playerMove', { x: 48, y: 35, z: 48, yaw: 0 });
  friendSocket.emit('playerMove', { x: 48, y: 35, z: 48, yaw: 0 });
  const dropReceived = waitForEvent(friendSocket, 'itemDropped', (drop) => drop.item === '4' && drop.count === 2);
  const dropped = await emitAck(ownerSocket, 'dropItem', { item: '4', count: 2 });
  assert.equal(dropped.ok, true);
  await dropReceived;

  const dropRemoved = waitForEvent(ownerSocket, 'itemPickedUp', (event) => event.id === dropped.drop.id);
  const pickup = await emitAck(friendSocket, 'pickupDrop', dropped.drop.id);
  assert.equal(pickup.ok, true);
  assert.equal(pickup.item, '4');
  await dropRemoved;

  const chatReceived = waitForEvent(friendSocket, 'chatMessage', (message) => message.text === 'Hello from test');
  const chat = await emitAck(ownerSocket, 'chatMessage', '  Hello from test  ');
  assert.equal(chat.ok, true);
  assert.equal(chat.message.name, 'WorldOwner');
  await chatReceived;

  const persistedDrop = await emitAck(ownerSocket, 'dropItem', { item: 'st', count: 3 });
  assert.equal(persistedDrop.ok, true);

  const playerLeft = waitForEvent(friendSocket, 'playerLeft', (id) => id === ownerSocket.id);
  ownerSocket.emit('playerMove', { x: 96, y: 35, z: 96, yaw: 0 });
  await playerLeft;

  await delay(350);
  ownerSocket.disconnect();
  friendSocket.disconnect();
  sockets.length = 0;
  await stopServer();

  await startServer();
  const returningUser = await connect(owner.token);
  sockets.push(returningUser);
  const restored = await emitAck(returningUser, 'joinWorld', { code: created.world.code });
  assert.equal(restored.ok, true);
  assert.deepEqual(restored.world.blocks, [{ x: 3, y: 4, z: 5, b: 2 }]);
  assert.deepEqual(restored.world.drops.map(({ item, count }) => ({ item, count })), [{ item: 'st', count: 3 }]);
});