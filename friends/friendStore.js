'use strict';
// XXQCRAFT arkadaş sistemi çekirdeği. Bağımlılık yok, sadece Node 22+.
// Veri: { users: { [kullanici]: { friends: [], incoming: [], outgoing: [] } } }

const fs = require('node:fs');
const path = require('node:path');

class FriendError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const norm = (name) => String(name || '').trim().toLowerCase();

class FriendStore {
  /** @param {string|null} filePath null ise yalnızca bellekte çalışır (test için) */
  constructor(filePath = null) {
    this.filePath = filePath;
    this.data = { users: {} };
    if (filePath && fs.existsSync(filePath)) {
      try {
        this.data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (!this.data.users) this.data = { users: {} };
      } catch {
        // Bozuk dosya: yedekle ve temiz başla
        fs.renameSync(filePath, `${filePath}.bozuk-${Date.now()}`);
        this.data = { users: {} };
      }
    }
  }

  _user(name) {
    const key = norm(name);
    if (!key) throw new FriendError('BAD_USER', 'Geçersiz kullanıcı adı');
    if (!this.data.users[key]) {
      this.data.users[key] = { friends: [], incoming: [], outgoing: [] };
    }
    return this.data.users[key];
  }

  _save() {
    if (!this.filePath) return;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.filePath); // atomik yazma: yarım dosya kalmaz
  }

  /** İstek gönder. Karşı taraf zaten sana istek attıysa otomatik kabul edilir. */
  sendRequest(from, to, { userExists = () => true } = {}) {
    const a = norm(from);
    const b = norm(to);
    if (!b) throw new FriendError('BAD_USER', 'Kullanıcı adı boş');
    if (a === b) throw new FriendError('SELF', 'Kendini ekleyemezsin');
    if (!userExists(b)) throw new FriendError('NOT_FOUND', 'Kullanıcı bulunamadı');

    const ua = this._user(a);
    const ub = this._user(b);
    if (ua.friends.includes(b)) throw new FriendError('ALREADY_FRIENDS', 'Zaten arkadaşsınız');
    if (ua.outgoing.includes(b)) throw new FriendError('ALREADY_SENT', 'İstek zaten gönderilmiş');

    if (ua.incoming.includes(b)) {
      this._accept(a, b);
      this._save();
      return { status: 'friends' };
    }
    ua.outgoing.push(b);
    ub.incoming.push(a);
    this._save();
    return { status: 'pending' };
  }

  _accept(me, other) {
    const um = this._user(me);
    const uo = this._user(other);
    um.incoming = um.incoming.filter((n) => n !== other);
    uo.outgoing = uo.outgoing.filter((n) => n !== me);
    if (!um.friends.includes(other)) um.friends.push(other);
    if (!uo.friends.includes(me)) uo.friends.push(me);
  }

  accept(me, other) {
    const a = norm(me);
    const b = norm(other);
    if (!this._user(a).incoming.includes(b)) {
      throw new FriendError('NO_REQUEST', 'Bu kullanıcıdan istek yok');
    }
    this._accept(a, b);
    this._save();
  }

  decline(me, other) {
    const a = norm(me);
    const b = norm(other);
    const ua = this._user(a);
    if (!ua.incoming.includes(b)) throw new FriendError('NO_REQUEST', 'Bu kullanıcıdan istek yok');
    ua.incoming = ua.incoming.filter((n) => n !== b);
    this._user(b).outgoing = this._user(b).outgoing.filter((n) => n !== a);
    this._save();
  }

  cancel(me, other) {
    const a = norm(me);
    const b = norm(other);
    const ua = this._user(a);
    if (!ua.outgoing.includes(b)) throw new FriendError('NO_REQUEST', 'Gönderilmiş istek yok');
    ua.outgoing = ua.outgoing.filter((n) => n !== b);
    this._user(b).incoming = this._user(b).incoming.filter((n) => n !== a);
    this._save();
  }

  remove(me, other) {
    const a = norm(me);
    const b = norm(other);
    const ua = this._user(a);
    if (!ua.friends.includes(b)) throw new FriendError('NOT_FRIENDS', 'Arkadaş değilsiniz');
    ua.friends = ua.friends.filter((n) => n !== b);
    this._user(b).friends = this._user(b).friends.filter((n) => n !== a);
    this._save();
  }

  areFriends(a, b) {
    return this._user(a).friends.includes(norm(b));
  }

  /** @param {(name:string)=>object|null} presenceOf çevrim içi bilgisi: {online, worldCode} */
  list(me, presenceOf = () => null) {
    const u = this._user(me);
    return {
      friends: u.friends.map((name) => {
        const p = presenceOf(name) || {};
        return { name, online: !!p.online, worldCode: p.worldCode || null };
      }),
      incoming: [...u.incoming],
      outgoing: [...u.outgoing],
    };
  }
}

module.exports = { FriendStore, FriendError, norm };
