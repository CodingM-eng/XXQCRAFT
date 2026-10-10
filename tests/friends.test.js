'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { FriendStore } = require('../friends/friendStore');
const { attachFriends } = require('../friends/friendsSocket');

test('istek, kabul, listeleme', () => {
  const s = new FriendStore();
  assert.deepEqual(s.sendRequest('Ali', 'veli'), { status: 'pending' });
  assert.deepEqual(s.list('veli').incoming, ['ali']);
  s.accept('veli', 'ali');
  assert.ok(s.areFriends('ali', 'VELI'));
  assert.deepEqual(s.list('ali').outgoing, []);
});

test('karşılıklı istek otomatik arkadaş yapar', () => {
  const s = new FriendStore();
  s.sendRequest('a', 'b');
  assert.deepEqual(s.sendRequest('b', 'a'), { status: 'friends' });
  assert.ok(s.areFriends('a', 'b'));
});

test('hata durumları', () => {
  const s = new FriendStore();
  assert.throws(() => s.sendRequest('a', 'a'), { code: 'SELF' });
  assert.throws(() => s.sendRequest('a', 'x', { userExists: () => false }), { code: 'NOT_FOUND' });
  s.sendRequest('a', 'b');
  assert.throws(() => s.sendRequest('a', 'b'), { code: 'ALREADY_SENT' });
  assert.throws(() => s.accept('a', 'b'), { code: 'NO_REQUEST' });
  s.accept('b', 'a');
  assert.throws(() => s.sendRequest('a', 'b'), { code: 'ALREADY_FRIENDS' });
  s.remove('a', 'b');
  assert.ok(!s.areFriends('b', 'a'));
  assert.throws(() => s.remove('a', 'b'), { code: 'NOT_FRIENDS' });
});

test('reddet ve iptal', () => {
  const s = new FriendStore();
  s.sendRequest('a', 'b');
  s.decline('b', 'a');
  assert.deepEqual(s.list('a').outgoing, []);
  s.sendRequest('a', 'b');
  s.cancel('a', 'b');
  assert.deepEqual(s.list('b').incoming, []);
});

test('diske kaydeder ve geri yükler; bozuk dosyada çökmez', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xxq-'));
  const file = path.join(dir, 'sub', 'friends.json');
  const s = new FriendStore(file);
  s.sendRequest('a', 'b');
  s.accept('b', 'a');
  assert.ok(new FriendStore(file).areFriends('a', 'b'));
  fs.writeFileSync(file, '{bozuk');
  assert.deepEqual(new FriendStore(file).list('a').friends, []);
});

// Sahte Socket.IO
function fakeIo() {
  const handlers = {};
  const emitted = [];
  const io = {
    on: (ev, fn) => (handlers[ev] = fn),
    to: (room) => ({ emit: (ev, data) => emitted.push({ room, ev, data }) }),
  };
  const connect = (username, id) => {
    const h = {};
    const socket = {
      id, data: { username },
      join() {}, on: (ev, fn) => (h[ev] = fn),
    };
    handlers.connection(socket);
    return { call: (ev, ...args) => new Promise((res) => h[ev](...args, res)), h };
  };
  return { io, emitted, connect };
}

test('socket: çevrim içi durumu, istek bildirimi, davet', async () => {
  const store = new FriendStore();
  const { io, emitted, connect } = fakeIo();
  const api = attachFriends(io, { store, getUsername: (s) => s.data.username });
  const ali = connect('ali', 's1');
  const veli = connect('veli', 's2');
  assert.ok(api.isOnline('ali'));

  assert.deepEqual(await ali.call('friends:request', 'veli'), { ok: true, status: 'pending' });
  assert.ok(emitted.some((e) => e.ev === 'friends:incoming' && e.room === 'friends:veli'));
  assert.equal((await veli.call('friends:accept', 'ali')).ok, true);

  assert.equal((await ali.call('friends:invite', 'veli')).code, 'NO_WORLD');
  api.setWorld('ali', 'ABC123');
  assert.equal((await ali.call('friends:invite', 'veli')).ok, true);
  assert.ok(emitted.some((e) => e.ev === 'friends:invited' && e.data.worldCode === 'ABC123'));
  assert.deepEqual(api.presenceOf('ali'), { online: true, worldCode: 'ABC123' });

  const st = await veli.call('friends:list');
  assert.equal(st.friends[0].worldCode, 'ABC123');

  // arkadaş olmayan kişiye davet gitmez
  const mallory = connect('mallory', 's3');
  assert.equal((await mallory.call('friends:invite', 'ali')).code, 'NOT_FRIENDS');

  // misafir (kullanıcı adı yok) için dinleyici kurulmaz
  assert.deepEqual(Object.keys(connect('', 's4').h), []);

  veli.h.disconnect();
  assert.ok(!api.isOnline('veli'));
});
