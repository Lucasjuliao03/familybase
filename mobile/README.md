# FamilyBase Mobile

Versão React Native / Expo do app FamilyBase.

## Pré-requisitos

- Node.js 18+
- npm 9+
- [Expo Go](https://expo.dev/client) instalado no telemóvel para testar rapidamente

## Configuração

1. **Crie o ficheiro `.env`** na raiz de `/mobile`:

```env
EXPO_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key
```

> ⚠️ Nunca coloque a `service_role` key no app.

2. **Instale as dependências:**

```bash
npm install
```

## Como rodar

### Expo Go (mais rápido — ideal para desenvolvimento)

```bash
npm start
# ou
npx expo start
```

Scaneie o QR code com Expo Go no telemóvel.

### Android (emulador ou dispositivo)

```bash
npm run android
```

### iOS (apenas macOS)

```bash
npm run ios
```

## Estrutura de pastas

```
mobile/
├── app/                      # Expo Router — telas e layouts
│   ├── _layout.tsx           # Layout raiz (AuthProvider + Stack)
│   ├── index.tsx             # Splash/redirect inicial
│   ├── login.tsx             # Ecrã de login
│   ├── parent/               # Área do responsável (role: parent)
│   │   ├── _layout.tsx
│   │   └── index.tsx
│   ├── child/                # Área da criança (role: child)
│   │   ├── _layout.tsx
│   │   └── index.tsx
│   └── master/               # Área do administrador (role: master)
│       ├── _layout.tsx
│       └── index.tsx
├── src/
│   ├── contexts/
│   │   └── AuthContext.tsx   # Auth + perfil + navegação por role
│   ├── lib/
│   │   └── supabase.ts       # Cliente Supabase com AsyncStorage
│   └── shared/
│       └── lib/              # Lógica pura portada do /frontend
│           ├── taskHistoryStatus.ts
│           ├── taskOccurrenceClosure.ts
│           └── taskStatus.ts
├── app.json
├── babel.config.js
├── tsconfig.json
└── package.json
```

## Regras do projeto

- ❌ Não usar `localStorage`, `window`, `document`, `import.meta.env`
- ✅ Usar `process.env.EXPO_PUBLIC_*` para variáveis de ambiente
- ✅ AsyncStorage no Supabase Auth
- ✅ Navegação via Expo Router
- ❌ Não alterar `/frontend`
