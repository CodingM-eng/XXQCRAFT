'use strict';
// XXQCRAFT depolama katmanı.
// DATABASE_URL tanımlıysa veri Postgres'e (bulut), değilse eskisi gibi store.json dosyasına yazılır.

const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = process.env.STORAGE_DIR || path.join(__dirname, 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');
const KEY = 'store';

let pool = null;
let tableReady = null;

function usingPostgres() {
  return Boolean(process.env.DATABASE_URL);
}

function getPool() {
  if (pool) return pool;
  const { Pool } = require('pg');
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.delete('sslmode'); // SSL ayarını aşağıda kendimiz veriyoruz
  pool = new Pool({
    connectionString: url.toString(),
    max: 3,
    ssl: process.env.DATABASE_SSL === 'off' ? false : { rejectUnauthorized: false },
  });
  pool.on('error', (error) => console.error('Veritabanı bağlantı hatası:', error.message));
  return pool;
}

function ensureTable() {
  if (!tableReady) {
    tableReady = getPool().query(
      `CREATE TABLE IF NOT EXISTS xxq_kv (
         key text PRIMARY KEY,
         value text NOT NULL,
         updated_at timestamptz NOT NULL DEFAULT now()
       )`
    );
  }
  return tableReady;
}

/**
 * Açılışta çağrılır. Postgres kullanılıyorsa kayıtlı veriyi döndürür.
 * Dosya modunda null döner (server.js dosyayı kendisi okur).
 * Bağlanılamazsa HATA FIRLATIR: boş veriyle başlayıp eski veriyi ezmemek için.
 */
async function loadStore() {
  if (!usingPostgres()) return null;
  await ensureTable();
  const result = await getPool().query('SELECT value FROM xxq_kv WHERE key = $1', [KEY]);
  if (result.rows.length === 0) return { users: {}, worlds: {} };
  return JSON.parse(result.rows[0].value);
}

/** @param {string} contents JSON metni */
async function saveStore(contents) {
  if (usingPostgres()) {
    await ensureTable();
    await getPool().query(
      `INSERT INTO xxq_kv (key, value, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [KEY, contents]
    );
    return;
  }
  await fs.promises.mkdir(DATA_DIR, { recursive: true });
  const temporaryFile = `${STORE_FILE}.tmp`;
  await fs.promises.writeFile(temporaryFile, contents);
  await fs.promises.rename(temporaryFile, STORE_FILE);
}

module.exports = { loadStore, saveStore, usingPostgres };
