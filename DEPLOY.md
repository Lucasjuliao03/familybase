# Deploy — Base Familiar

## Estrutura do repositório

| Pasta | O quê | Onde corre |
|-------|--------|------------|
| `mobile/` | App **Expo / React Native** (celular) | `npx expo start` — **não** vai para a Vercel |
| `frontend/` | App **web + PWA + Capacitor Android** | Vercel, browser, APK |

O `/mobile` funciona localmente porque é um projecto separado. A **Vercel** deve publicar só o **`frontend/`**.

---

## Vercel (site web)

### Opção A — Root Directory = `frontend` (recomendado)

1. Vercel → Project → Settings → **Root Directory** = `frontend`
2. **Environment Variables** (Production + Preview):

```
VITE_SUPABASE_URL=https://dkymtsbevkolkiuiwtju.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRreW10c2JldmtvbGtpdWl3dGp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0MTg3ODIsImV4cCI6MjA5OTk5NDc4Mn0.8rP-5sKRMaayNLEdUj5NUdQf813axNVvlmi5Anuwx60
```

3. **Redeploy** após alterar variáveis.

### Opção B — Root na raiz do repo

Usa o `vercel.json` na raiz (build em `frontend/` automaticamente).

---

## Tela branca (corrigido)

Causa: `base: './'` no Vite quebrava JS/CSS em rotas como `/login` na Vercel.

- **Web/Vercel:** `base: '/'` → assets em `/assets/...`
- **Capacitor Android:** `npm run build:capacitor` → `base: './'`

---

## Desktop vs telemóvel (web)

- **Telemóvel (browser):** login e painel responsivos (`ParentLayout` com menu mobile).
- **Computador:** mesmo painel com sidebar completa — layout adaptativo em CSS existente.

---

## Mobile (Expo)

```bash
cd mobile
npm install
# .env com EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY
npx expo start
```

---

## Android (Capacitor, a partir do frontend)

```bash
cd frontend
npm run cap:sync   # build:capacitor + sync
npm run cap:open
```
