# XXQCRAFT

## Sunucuyu çalıştırma

Node.js 22 veya üzeri gerekir.

```powershell
npm ci
$env:JWT_SECRET = (node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
npm start
```

Sunucu `http://localhost:3000` adresinde açılır. `JWT_SECRET` değerini herkese açık kaynak koduna eklemeyin; dağıtım ortamında gizli ortam değişkeni olarak ayarlayın.

## Çevrim içi dünyalar ve ses

GitHub Pages yalnızca web istemcisini sunar; giriş, kalıcı dünyalar ve çok oyunculu oyun için bu Node.js sunucusunu sürekli çalışan bir HTTPS hizmetinde ayrıca dağıtın. Hizmette `JWT_SECRET` için gizli bir değer, `CORS_ORIGINS=https://codingm-eng.github.io,https://localhost` ve kalıcı diskte bir `STORAGE_DIR` tanımlayın. Kalıcı disk olmadan sunucu yeniden başlatılırsa hesaplar ve dünyalar kaybolabilir.

Oyuncular kayıt olup giriş yaptıktan sonra dünya oluşturabilir. Oluşan 6 karakterli kodu arkadaşlarıyla paylaşırlar; arkadaşlar aynı sunucu adresini girip bu kodla katılır. Dünya değişiklikleri sunucuda saklandığından dünya sahibi oyunda olmasa da arkadaşları erişebilir. Oyuncu konumları yalnızca 64 blok yakınındaki oyunculara iletilir; mikrofon izni verilince ses WebRTC ile doğrudan yakın oyuncular arasında taşınır. Ses bağlantısı bazı ağlarda TURN sunucusu gerektirebilir.

Tüm modlar boş envanterle başlar. Hayatta kalma modunda oyuncu bloklarla çarpışır, zıplar ve düşer. WASD ile yürü, fareyi kilitlemek için oyun alanına tıkla; sol tık kırar, sağ tık koyar. Telefonda ekrandaki dokunmatik kontrolleri kullan. `E` ile 36 slotlu envanteri aç; eşyaları slotlara taşı, yığın bırak veya tariflerden tahta, çubuk, tahta alet/kılıç ve kova üret. Boş kovayla su kaynağına sağ tıklayıp doldur, dolu kovayla suyu bir kez dök; kırılan bloklar envantere gelir ve yerleştirilen bloklar stoktan düşer.

Web istemcisinde sunucunun HTTPS adresini giriş ekranına girin. Android uygulamasında da aynı adres kullanılabilir. Sunucuya yakın oyuncu filtrelemesi ağ trafiğini azaltır; gerçek çok-bölgeli sunucu yönlendirmesi ve garantili düşük ping için ayrıca bölgesel sunucu altyapısı gerekir.

## Telefon ve bilgisayarda birlikte oynama

Telefon ve bilgisayar aynı web oyununu açar, aynı HTTPS oyun sunucusuna bağlanır ve aynı 6 karakterli oda kodunu kullanır. Telefon Bedrock benzeri joystick/dokunmatik düğmeleri; bilgisayar Java benzeri WASD, fare, sol/sağ tık ve `E` envanter kısayolunu kullanır. Bu oyun kendi ortak protokolünü kullanır; resmi Minecraft Java veya Bedrock istemcileriyle doğrudan uyumlu değildir.

Sunucu entegrasyon testleri `npm test` ile çalıştırılır.

## Android APK

GitHub Actions, `main` dalına her push işleminde Android debug APK'sını oluşturur. APK'yı deponun **Actions** sekmesindeki `XXQCRAFT-Apk` artifact'inden indirebilirsiniz. İş akışı ayrıca manuel olarak da çalıştırılabilir.