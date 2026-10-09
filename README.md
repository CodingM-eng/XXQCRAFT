# XXQCRAFT

## Sunucuyu çalıştırma

Node.js 20 veya üzeri gerekir.

```powershell
npm ci
$env:JWT_SECRET = (node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
npm start
```

Sunucu `http://localhost:3000` adresinde açılır. `JWT_SECRET` değerini herkese açık kaynak koduna eklemeyin; dağıtım ortamında gizli ortam değişkeni olarak ayarlayın.

## Android APK

GitHub Actions, `main` dalına her push işleminde Android debug APK'sını oluşturur. APK'yı deponun **Actions** sekmesindeki `XXQCRAFT-Apk` artifact'inden indirebilirsiniz. İş akışı ayrıca manuel olarak da çalıştırılabilir.