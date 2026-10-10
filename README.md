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

Oyuncular kayıt olup giriş yaptıktan sonra dünya oluşturabilir. Oyun, kendisini sunan Node sunucusuna otomatik bağlanır; aynı HTTPS hostu kullanan arkadaşlar 6 karakterli dünya koduyla katılır. GitHub Pages Node sunucusu çalıştırmadığı için tek başına çevrim içi oyun sağlamaz. Dünya değişiklikleri sunucuda saklandığından host çalıştığı sürece dünya sahibi oyunda olmasa da arkadaşları erişebilir. Oyuncu konumları yalnızca 64 blok yakınındaki oyunculara iletilir; mikrofon izni verilince ses WebRTC ile doğrudan yakın oyuncular arasında taşınır. Ses bağlantısı bazı ağlarda TURN sunucusu gerektirebilir.

Hayatta kalma, macera ve zorlayıcı modlar boş envanterle başlar; yaratıcı modda envanter boş kalır ama çantadaki yaratıcı katalogdan yapı blokları alınabilir. Hayatta kalmada can ve açlık azalabilir, düşme hasarı vardır. Bilgisayarda WASD ile yürü, fareyi kilitlemek için oyun alanına tıkla; sol tık kırar, sağ tık koyar, `1–9` veya fare tekerleği hotbar seçer, `Q` eldeki eşyayı atar, `E` çantayı açar, `T` sohbeti, `Escape` ayarları açar. Ayarlardan bakış hassasiyeti ve görüş açısı değişir. Telefonda joystick ve ekrandaki eylem düğmelerini kullan; Ayar düğmesi aynı menüyü açar. Çantada 36 slot, slot taşıma/yığın bırakma ve tahta, çubuk, alet/kılıç, kova tarifleri bulunur. Boş kovayla su kaynağına sağ tıklayıp doldur, dolu kovayla bir kez dök.

Oyun Node sunucusundan açılırsa giriş ve Socket.IO aynı origin'e otomatik bağlanır; sunucu adresi elle girilmez. Pages üzerinden açıldığında yalnızca çevrim dışı misafir modu çalışır. Android APK'sını çevrim içi kullanmak için Node hostuna bağlayacak bir dağıtım yapılandırması gerekir. Sunucuya yakın oyuncu filtrelemesi ağ trafiğini azaltır; gerçek çok-bölgeli sunucu yönlendirmesi ve garantili düşük ping için ayrıca bölgesel sunucu altyapısı gerekir.

## Telefon ve bilgisayarda birlikte oynama

Telefon ve bilgisayar aynı web oyununu açar, oyun Node sunucusundan sunuluyorsa sunucuya otomatik bağlanır ve aynı 6 karakterli oda kodunu kullanır. Telefon Bedrock benzeri joystick/dokunmatik düğmeleri; bilgisayar Java benzeri WASD, fare, hotbar ve `E` envanter kısayolunu kullanır. Bu oyun kendi ortak protokolünü kullanır; resmi Minecraft Java veya Bedrock istemcileriyle doğrudan uyumlu değildir.

Sunucu entegrasyon testleri `npm test` ile çalıştırılır.

## Android APK

GitHub Actions, `main` dalına her push işleminde Android debug APK'sını oluşturur ve otomatik artan sürüm kodu verir. Son APK'yı deponun **Actions** sekmesindeki `XXQCRAFT-Apk` artifact'inden indirebilirsiniz. Yeni APK otomatik üretilir ama Android güvenlik nedeniyle yüklenmiş uygulamayı sessizce güncellemez; kullanıcı yeni APK'yı kurmalı veya uygulama Play Store/private dağıtım imzasıyla yayımlanmalıdır.