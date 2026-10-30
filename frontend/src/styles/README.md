# Guia de ajustes visuais web

| Diretório | Uso |
| --- | --- |
| `foundation/base.css` | Primitivos existentes: reset, formulários, botões, tabelas e utilitários |
| `marketing/landing.css` e `professional.css` | Landing, conversão, apresentação de módulos e planos |
| `workspace/layout.css` e `professional.css` | Área logada, tema profissional, sidebar, dashboards, autenticação e Master |
| `components/store-banner.css` | Preços promocionais e apresentação de acesso à Google Play |
| `legacy-capacitor/` | Estilos históricos, carregados somente no modo Capacitor |

`index.css` carrega a base comum. A landing importa sua apresentação em `LandingPage.jsx`; a área logada importa seu tema em `App.jsx`. Respeite essa ordem: base, layout e acabamento profissional. Os tokens do tema profissional ficam no seletor `.desktop-shell`, que também é aplicado à web responsiva.

Para ajustes futuros, use classes do componente ou ambiente correspondente. Evite alterações globais de elementos HTML quando o pedido for específico de uma página. Nenhum estilo aqui é importado pelo aplicativo Expo em `mobile/`.
