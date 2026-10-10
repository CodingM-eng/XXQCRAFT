'use strict';
// Sunucuyu başlatmadan önce kayıtlı veriyi (varsa buluttan) yükler.
const { loadStore, usingPostgres } = require('./storage');

loadStore()
  .then((saved) => {
    if (saved) globalThis.__XXQ_SAVED__ = saved;
    console.log(usingPostgres() ? 'Depolama: Postgres' : 'Depolama: yerel dosya');
    require('./server');
  })
  .catch((error) => {
    console.error('Depolama yüklenemedi, sunucu başlatılmıyor:', error.message);
    process.exit(1);
  });
