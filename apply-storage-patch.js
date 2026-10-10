'use strict';
// server.js ve package.json dosyalarını depolama katmanını kullanacak şekilde günceller.
// Kullanım: node apply-storage-patch.js
const fs = require('node:fs');

function patchFile(file, fn) {
  const src = fs.readFileSync(file, 'utf8');
  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  const out = fn(src.replace(/\r\n/g, '\n'));
  fs.writeFileSync(file, out.replace(/\n/g, eol));
}

function mustReplace(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`Bulunamadı: ${label}. server.js beklenenden farklı, değişiklik yapılmadı.`);
  return text.replace(from, () => to);
}

patchFile('server.js', (text) => {
  if (text.includes("require('./storage')")) {
    console.log('server.js zaten güncellenmiş, atlandı.');
    return text;
  }
  text = mustReplace(
    text,
    'const DATA_DIR = process.env.STORAGE_DIR',
    "const { saveStore } = require('./storage');\nconst DATA_DIR = process.env.STORAGE_DIR",
    'DATA_DIR satırı'
  );
  text = mustReplace(
    text,
    `let saved = { users: {}, worlds: {} };
try {
  saved = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}`,
    `let saved = { users: {}, worlds: {} };
if (globalThis.__XXQ_SAVED__) {
  saved = globalThis.__XXQ_SAVED__;
} else {
  try {
    saved = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}`,
    'veri yükleme bloğu'
  );
  text = mustReplace(
    text,
    `  persistQueue = persistQueue.then(async () => {
    await fs.promises.mkdir(DATA_DIR, { recursive: true });
    const temporaryFile = \`\${STORE_FILE}.tmp\`;
    await fs.promises.writeFile(temporaryFile, contents);
    await fs.promises.rename(temporaryFile, STORE_FILE);
  });`,
    `  persistQueue = persistQueue.catch(() => {}).then(() => saveStore(contents));`,
    'kaydetme bloğu'
  );
  return text;
});

patchFile('package.json', (text) => {
  const pkg = JSON.parse(text);
  pkg.scripts = pkg.scripts || {};
  pkg.scripts.start = 'node start.js';
  return JSON.stringify(pkg, null, 2) + '\n';
});

console.log('Tamam: server.js ve package.json güncellendi.');
