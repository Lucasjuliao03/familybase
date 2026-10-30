# Tudo de Família — Web

Projeto exclusivo do site profissional, com landing pública, área familiar e painel Master. O aplicativo Expo está em `../mobile/` e possui dependências, tema, navegação e build próprios.

```sh
npm ci
npm run dev -- --port 5187 --strictPort
npm test
npm run build
```

O build de produção gera apenas `dist/`. Não compila APK, executa Expo, sincroniza regras ou altera arquivos do mobile.

## Onde ajustar

| Área | Páginas e componentes | Estilos |
| --- | --- | --- |
| Landing | `src/pages/public/`, `src/components/web/` | `src/styles/marketing/` |
| Login e cadastro | `src/pages/auth/`, `src/components/web/WebAuthIntro.jsx` | Tema profissional em `src/styles/workspace/` |
| Área familiar | `src/pages/parent/`, `src/pages/child/`, `src/components/layout/WebFamilyLayout.jsx` e dashboards em `src/components/web/` | `src/styles/workspace/` |
| Master | `src/pages/master/WebMasterPage.jsx`, `src/components/layout/WebMasterLayout.jsx` | `src/styles/workspace/` |
| Componentes comuns | `src/components/ui/`, `profile/` e `web/` | `src/styles/foundation/`, `src/styles/components/` |
| Serviços e sessão | `src/services/`, `src/contexts/`, `src/lib/` | Sem dependência do visual mobile |

O navegador e a PWA mantêm a interface profissional em telas pequenas. O visual legado do Capacitor fica em `src/platform/legacy-capacitor/` e `src/styles/legacy-capacitor/`, carregado somente pelo modo `capacitor`. As dependências Capacitor ainda pertencem a este pacote para sustentar essa compatibilidade; o build web elimina os layouts, plugins e estilos exclusivos desse modo.

Consulte [a estrutura do projeto](../docs/project-structure.md), [o guia de estilos](src/styles/README.md) e [o legado Capacitor](../legacy/capacitor/README.md). Configuração de produção em [DEPLOY.md](../DEPLOY.md).
