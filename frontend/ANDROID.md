# Base Familiar — App Android (Capacitor)

Este guia descreve como empacotar o frontend React existente como aplicativo Android, **sem reescrever** o sistema.

## Pré-requisitos

- Node.js 20+
- [Android Studio](https://developer.android.com/studio) (SDK + emulador ou telemóvel USB)
- Variáveis de ambiente do Supabase em `frontend/.env` (mesmas do deploy web):

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

> O build Android embute o `.env` no momento do `npm run build`. Confirme que as chaves estão corretas antes de gerar o APK/AAB.

## Comandos rápidos

```bash
cd frontend
npm install
npm run dev          # testar web local
npm run build        # build de produção → dist/
npm run cap:sync     # build + copiar para android/
npm run cap:open     # abrir no Android Studio
```

## Primeira configuração (já feita no repo)

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android
npm install @capacitor/app @capacitor/status-bar @capacitor/splash-screen @capacitor/keyboard
npx cap add android
npx cap sync android
```

Identificador do app: `com.basefamiliar.app`  
Nome exibido: **Base Familiar**

## Gerar APK de teste (debug)

1. `npm run cap:sync`
2. `npm run cap:open`
3. No Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**
4. APK em: `android/app/build/outputs/apk/debug/app-debug.apk`

Ou via terminal (com Gradle no PATH):

```bash
cd android
./gradlew assembleDebug
```

## Gerar AAB para Play Store (release)

1. Criar keystore (uma vez):

```bash
keytool -genkey -v -keystore base-familiar-release.keystore -alias basefamiliar -keyalg RSA -keysize 2048 -validity 10000
```

2. Em `android/`, criar `keystore.properties` (não commitar):

```properties
storeFile=../base-familiar-release.keystore
storePassword=SUA_SENHA
keyAlias=basefamiliar
keyPassword=SUA_SENHA
```

3. Configurar assinatura em `android/app/build.gradle` (bloco `signingConfigs` + `buildTypes.release`).

4. Gerar AAB:

```bash
cd android
./gradlew bundleRelease
```

Saída: `android/app/build/outputs/bundle/release/app-release.aab`

## Play Store — checklist

| Item | Onde |
|------|------|
| `versionCode` / `versionName` | `android/app/build.gradle` |
| Ícone adaptativo | `android/app/src/main/res/mipmap-*` |
| Splash | `android/app/src/main/res/drawable/splash.png` |
| Permissão INTERNET | já incluída pelo Capacitor |
| Política de privacidade | URL no Play Console |
| Screenshots telemóvel | 1080×1920 ou similar |
| Target SDK | Android Studio → SDK Manager (API 34+) |

## O que o Capacitor preserva

- Layout mobile (menu inferior, cabeçalho, módulos criança/pai)
- Lógica React + Supabase inalterada
- Textos em português
- Safe area (`viewport-fit=cover` + `env(safe-area-inset-*)`)

## Ajustes nativos incluídos

- `src/lib/capacitorNative.js` — barra de estado, splash, botão voltar Android
- Classe CSS `capacitor-native` — força layout mobile e padding safe area
- PWA/service worker **desativado** dentro do app nativo (evita conflitos)

## Atualizar o app após mudanças no código

```bash
npm run cap:sync
```

Depois recompilar no Android Studio ou `./gradlew assembleDebug`.

## Resolução de problemas

| Problema | Solução |
|----------|---------|
| Tela branca ao abrir | Verificar `base: './'` no `vite.config.js` e correr `npm run cap:sync` |
| Menu inferior cortado | Confirmar `viewport-fit=cover` no `index.html` |
| API não responde | Verificar `.env` e permissão INTERNET |
| Gradle lento | Android Studio → File → Invalidate Caches |
