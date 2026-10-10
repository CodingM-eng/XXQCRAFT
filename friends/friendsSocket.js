'use strict';
// Socket.IO bağdaştırıcısı: çevrim içi durumu, istekler ve dünya daveti.
// server.js içinde:
//   const friends = attachFriends(io, { store, getUsername: (socket) => socket.data.username });
//   friends.setWorld(username, worldCode)   // oyuncu dünyaya girince / çıkınca (null)

const { FriendError, norm } = require('./friendStore');

function attachFriends(io, { store, getUsername, userExists = () => true }) {
  const sockets = new Map(); // kullanıcı -> Set<socket.id>
  const worlds = new Map(); // kullanıcı -> dünya kodu

  const room = (name) => `friends:${norm(name)}`;
  const isOnline = (name) => (sockets.get(norm(name))?.size || 0) > 0;
  const presenceOf = (name) => ({ online: isOnline(name), worldCode: worlds.get(norm(name)) || null });

  function pushList(name) {
    io.to(room(name)).emit('friends:list', store.list(name, presenceOf));
  }

  function notifyFriends(name) {
    for (const f of store.list(name).friends) pushList(f.name);
  }

  function reply(ack, fn) {
    try {
      const result = fn();
      if (typeof ack === 'function') ack({ ok: true, ...(result || {}) });
    } catch (err) {
      if (err instanceof FriendError) {
        if (typeof ack === 'function') ack({ ok: false, code: err.code, error: err.message });
      } else {
        console.error('[friends]', err);
        if (typeof ack === 'function') ack({ ok: false, code: 'SERVER', error: 'Sunucu hatası' });
      }
    }
  }

  io.on('connection', (socket) => {
    const me = norm(getUsername(socket));
    if (!me) return; // giriş yapmamış (misafir) kullanıcı: arkadaş sistemi yok

    socket.join(room(me));
    if (!sockets.has(me)) sockets.set(me, new Set());
    sockets.get(me).add(socket.id);
    pushList(me);
    notifyFriends(me);

    socket.on('friends:list', (ack) => reply(ack, () => store.list(me, presenceOf)));

    socket.on('friends:request', (to, ack) =>
      reply(ack, () => {
        const res = store.sendRequest(me, to, { userExists });
        pushList(me);
        pushList(to);
        if (res.status === 'pending') io.to(room(to)).emit('friends:incoming', { from: me });
        return res;
      }));

    socket.on('friends:accept', (other, ack) =>
      reply(ack, () => {
        store.accept(me, other);
        pushList(me);
        pushList(other);
      }));

    socket.on('friends:decline', (other, ack) =>
      reply(ack, () => {
        store.decline(me, other);
        pushList(me);
        pushList(other);
      }));

    socket.on('friends:cancel', (other, ack) =>
      reply(ack, () => {
        store.cancel(me, other);
        pushList(me);
        pushList(other);
      }));

    socket.on('friends:remove', (other, ack) =>
      reply(ack, () => {
        store.remove(me, other);
        pushList(me);
        pushList(other);
      }));

    // Arkadaşını bulunduğun dünyaya davet et (yalnızca arkadaşlara)
    socket.on('friends:invite', (other, ack) =>
      reply(ack, () => {
        if (!store.areFriends(me, other)) throw new FriendError('NOT_FRIENDS', 'Arkadaş değilsiniz');
        const code = worlds.get(me);
        if (!code) throw new FriendError('NO_WORLD', 'Önce bir dünyada olmalısın');
        io.to(room(other)).emit('friends:invited', { from: me, worldCode: code });
      }));

    socket.on('disconnect', () => {
      const set = sockets.get(me);
      if (set) {
        set.delete(socket.id);
        if (set.size === 0) {
          sockets.delete(me);
          worlds.delete(me);
        }
      }
      notifyFriends(me);
    });
  });

  return {
    isOnline,
    presenceOf,
    setWorld(username, worldCode) {
      const name = norm(username);
      if (worldCode) worlds.set(name, worldCode);
      else worlds.delete(name);
      notifyFriends(name);
    },
  };
}

module.exports = { attachFriends };
