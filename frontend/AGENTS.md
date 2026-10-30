# Web — Tudo de Família

Esta pasta é exclusiva do site e painéis web. As alterações visuais não devem modificar `../mobile/`.

- Landing em `src/pages/public/`, login/cadastro em `src/pages/auth/`, painéis familiares em `src/pages/parent/` e `child/`, Master em `src/pages/master/`.
- Layouts profissionais em `src/components/layout/WebFamilyLayout.jsx` e `WebMasterLayout.jsx`; componentes de apresentação em `src/components/web/`.
- Ajuste estilos conforme `src/styles/README.md`. CSS do Capacitor legado só pode ser importado pelo bootstrap daquele modo.
- Reutilize serviços, sessão e permissões existentes. Não substituir autorização do servidor por cache, localStorage, user_metadata ou flags visuais.
- O build padrão publica `dist/`; o modo legado publica `dist-capacitor/`. Não executar scripts do mobile ao validar uma alteração web.
