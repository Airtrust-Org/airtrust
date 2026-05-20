# Login Logo Staging Fix Report

## Data
- Data/hora: 2026-05-15T17:45-18:00 UTC
- Branch: main
- Commit checkpoint: 7f78fd481
- Commit final: (este commit)
- Producao tocada? nao

## Problema
- Logo AirTrust antigo/cortado na tela de login staging.
- O SVG `/airtrust-logo.svg` tinha fundo cinza `#F5F6F8` que criava um retangulo visivel no fundo branco da pagina.
- A altura `h-24` (96px) para um SVG de 1024x320 tornava o subtitulo "AERONAUTICAL MANAGEMENT SYSTEM" (font-size 44 no viewBox) dificil de ler (~13px renderizado).

## Diagnostico
- Asset usado antes: `/airtrust-logo.svg` (via `useSystemSettings().logoSrc` fallback)
- Componente: `src/react-app/pages/LoginSimple.tsx`, linha 98
- CSS: `mx-auto h-24 w-auto object-contain`
- Causa:
  - asset com fundo cinza (#F5F6F8) conflitando com bg-white da pagina
  - altura insuficiente para texto do subtitulo

## Correcao
- Arquivos alterados:
  1. `public/airtrust-logo.svg` — removido fundo cinza (fill="#F5F6F8" → fill="none")
  2. `src/react-app/pages/LoginSimple.tsx` — altura do logo aumentada (h-24 → h-28), adicionado max-w-full
- Asset usado depois: `/airtrust-logo.svg` (mesmo arquivo, fundo transparente)
- CSS alterado: `className="mx-auto h-28 w-auto max-w-full object-contain"`
- Por que nao afeta auth/API: alteracao puramente visual (SVG fill + classe CSS), sem mudanca em fluxo de autenticacao, chamadas API, ou roteamento

## Validacao
| Item | Resultado |
|------|-----------|
| TypeScript | 0 erros |
| test:all | 38 files, 355 tests, 100% pass |
| frontend build | PASS (bundle index-B8li7vBt.js) |
| worker dry-run | PASS |
| deploy staging | BLOQUEADO — Cloudflare API token sem permissao Pages:Write |
| logo visual no browser | PENDENTE HUMANO — aguardando deploy |
| login staging | PENDENTE HUMANO |
| API staging confirmada | PENDENTE HUMANO |

## Seguranca
- Producao tocada? nao
- Senha commitada? nao
- Token commitado? nao
- Hash commitado? nao

## Deploy
- Build gerado em `dist/client/` (bundle `index-B8li7vBt.js`)
- Comando: `npx wrangler pages deploy dist/client --project-name=airtrust --branch=main`
- Bloqueio: `CLOUDFLARE_API_TOKEN` atual nao tem permissao `Pages:Write`
- Para destravar: atualizar token em https://dash.cloudflare.com/profile/api-tokens com permissoes Pages:Write + User->Memberships->Read

## Recomendacao
- staging login visual **build aprovado, deploy pendente de token**
- apos deploy, verificar visualmente: logo sem fundo cinza, texto legivel, badge staging presente
