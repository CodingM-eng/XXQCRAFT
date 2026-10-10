// XXQCRAFT arkadaş paneli. Kullanım (oyun istemcisinde, giriş yapıldıktan sonra):
//   initFriendsPanel(socket, { onJoinWorld: (code) => joinWorldByCode(code) });
// Panel F tuşuyla veya sağ üstteki "Arkadaşlar" düğmesiyle açılır.
(function (global) {
  'use strict';

  function el(tag, props = {}, ...kids) {
    const n = document.createElement(tag);
    Object.assign(n, props);
    for (const k of kids) n.append(k);
    return n;
  }

  function initFriendsPanel(socket, { onJoinWorld } = {}) {
    const style = el('style', { textContent: `
      #xxq-fbtn{position:fixed;top:8px;right:8px;z-index:50;padding:6px 10px;font:600 13px Arial;
        background:#2f5d3a;color:#fff;border:2px solid #1b3a23;cursor:pointer}
      #xxq-fp{position:fixed;top:44px;right:8px;width:280px;max-height:70vh;overflow:auto;z-index:50;
        background:rgba(20,20,20,.92);color:#eee;font:13px Arial;padding:10px;border:2px solid #555;display:none}
      #xxq-fp h4{margin:10px 0 4px;font-size:12px;color:#9c9;text-transform:uppercase}
      #xxq-fp .row{display:flex;gap:6px;align-items:center;padding:3px 0}
      #xxq-fp .row span{flex:1;overflow:hidden;text-overflow:ellipsis}
      #xxq-fp .dot{width:9px;height:9px;border-radius:50%;background:#777;flex:none}
      #xxq-fp .dot.on{background:#4c4}
      #xxq-fp button{font:12px Arial;padding:2px 7px;cursor:pointer}
      #xxq-fp input{width:62%;padding:3px}
      #xxq-fmsg{color:#fc6;min-height:16px;margin-top:4px}
      #xxq-toast{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:60;
        background:#222;color:#fff;border:2px solid #4c4;padding:8px 12px;font:13px Arial;display:none}
    ` });
    const btn = el('button', { id: 'xxq-fbtn', textContent: 'Arkadaşlar (F)' });
    const panel = el('div', { id: 'xxq-fp' });
    const toast = el('div', { id: 'xxq-toast' });
    document.head.append(style);
    document.body.append(btn, panel, toast);

    const msg = el('div', { id: 'xxq-fmsg' });
    const input = el('input', { placeholder: 'Kullanıcı adı', maxLength: 32 });
    const addBtn = el('button', { textContent: 'Ekle' });
    const lists = el('div');
    panel.append(el('b', { textContent: 'Arkadaşlar' }), el('div', { style: 'margin-top:6px' }, input, ' ', addBtn), msg, lists);

    const say = (t) => { msg.textContent = t || ''; };
    const call = (ev, arg) => socket.emit(ev, arg, (r) => { if (!r.ok) say(r.error); else say(''); });

    addBtn.onclick = () => {
      const name = input.value.trim();
      if (!name) return;
      socket.emit('friends:request', name, (r) => {
        say(r.ok ? (r.status === 'friends' ? 'Artık arkadaşsınız!' : 'İstek gönderildi') : r.error);
        if (r.ok) input.value = '';
      });
    };
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') addBtn.onclick(); });

    function section(title, rows) {
      if (!rows.length) return null;
      const box = el('div', {}, el('h4', { textContent: title }));
      rows.forEach((r) => box.append(r));
      return box;
    }
    function row(name, ...buttons) {
      return el('div', { className: 'row' }, el('span', { textContent: name }), ...buttons);
    }
    function mini(text, fn) { return el('button', { textContent: text, onclick: fn }); }

    function render(state) {
      lists.replaceChildren();
      const friendRows = state.friends
        .slice().sort((a, b) => b.online - a.online || a.name.localeCompare(b.name))
        .map((f) => {
          const r = el('div', { className: 'row' },
            el('i', { className: 'dot' + (f.online ? ' on' : '') }),
            el('span', { textContent: f.name + (f.worldCode ? ' (dünyada)' : '') }));
          if (f.worldCode && onJoinWorld) r.append(mini('Katıl', () => onJoinWorld(f.worldCode)));
          if (f.online) r.append(mini('Davet', () => call('friends:invite', f.name)));
          r.append(mini('✕', () => { if (confirm(f.name + ' arkadaşlıktan çıkarılsın mı?')) call('friends:remove', f.name); }));
          return r;
        });
      const incoming = state.incoming.map((n) => row(n,
        mini('Kabul', () => call('friends:accept', n)), mini('Reddet', () => call('friends:decline', n))));
      const outgoing = state.outgoing.map((n) => row(n, mini('İptal', () => call('friends:cancel', n))));
      [section('Arkadaşlar', friendRows), section('Gelen istekler', incoming), section('Gönderilen', outgoing)]
        .filter(Boolean).forEach((s) => lists.append(s));
      btn.textContent = 'Arkadaşlar (F)' + (state.incoming.length ? ` •${state.incoming.length}` : '');
    }

    let toastTimer;
    function notify(text, action) {
      toast.replaceChildren(text);
      if (action) toast.append(' ', mini(action.label, () => { action.run(); toast.style.display = 'none'; }));
      toast.style.display = 'block';
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => (toast.style.display = 'none'), 8000);
    }

    socket.on('friends:list', render);
    socket.on('friends:incoming', ({ from }) => notify(`${from} sana arkadaşlık isteği gönderdi`));
    socket.on('friends:invited', ({ from, worldCode }) =>
      notify(`${from} seni dünyasına davet etti`, onJoinWorld && { label: 'Katıl', run: () => onJoinWorld(worldCode) }));

    const toggle = () => { panel.style.display = panel.style.display === 'block' ? 'none' : 'block'; };
    btn.onclick = toggle;
    document.addEventListener('keydown', (e) => {
      const t = e.target && e.target.tagName;
      if ((e.key === 'f' || e.key === 'F') && t !== 'INPUT' && t !== 'TEXTAREA') toggle();
    });
    socket.emit('friends:list', (r) => { if (r.ok) render(r); });
  }

  global.initFriendsPanel = initFriendsPanel;
})(window);
