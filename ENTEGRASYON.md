# Arkadaş sistemi: server.js'e bağlama

Dosyaları repoya şu şekilde koy:
- `friends/` klasörü  -> repo kökü
- `tests/friends.test.js` -> `tests/`
- `public/friends-ui.js` -> `public/` (ve index.html'e `<script src="friends-ui.js"></script>` ekle)

## server.js (sunucu)
```js
const path = require('node:path');
const { FriendStore } = require('./friends/friendStore');
const { attachFriends } = require('./friends/friendsSocket');

const friendStore = new FriendStore(path.join(process.env.STORAGE_DIR || './data', 'friends.json'));
const friends = attachFriends(io, {
  store: friendStore,
  getUsername: (socket) => socket.data.username,   // <-- mevcut girişteki alana göre değiştir
  userExists: (name) => /* mevcut kullanıcı kaydında ara */ true,
});
// Oyuncu dünyaya girince:  friends.setWorld(username, worldCode);
// Dünyadan çıkınca:        friends.setWorld(username, null);
```
`getUsername` ve `userExists` mevcut kimlik doğrulamana göre doldurulmalı (JWT'den gelen kullanıcı adı).

## İstemci
```js
initFriendsPanel(socket, { onJoinWorld: (code) => /* mevcut "koda katıl" fonksiyonun */ });
```

Testler: `node --test tests/friends.test.js`
