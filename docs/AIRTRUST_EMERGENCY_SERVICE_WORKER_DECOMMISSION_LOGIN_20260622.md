# AirTrust Emergency Service Worker Decommission Login - 2026-06-22

## Resumo Executivo

O PR #134 melhorou o comportamento do servidor e recuperou clientes legados simulados, mas nao eliminou o caso extremo do navegador real do usuario ainda preso na tela antiga de login.

A decisao operacional desta emergencia foi descomissionar o uso de service worker no frontend do AirTrust por enquanto. O app nao registra mais `/sw.js`. O arquivo `/sw.js` permanece publicado apenas como kill-switch para limpar caches AirTrust legados, tentar um refresh unico de clientes criticos e se desregistrar.

## Por Que o PR #134 Nao Recuperou Todos

- Alguns clientes podem permanecer presos antes de receber o HTML novo.
- Nesses casos, nem o bootstrap novo nem o kill-switch novo chegam ao navegador afetado.
- Isso torna a recuperacao automatica limitada para uma classe residual de clientes legados extremos.
- Para esses clientes especificos, a limpeza manual unica dos dados do site continua sendo a ultima medida operacional.

## Decisao Tecnica

- parar de registrar service worker no app;
- manter `public/sw.js` somente como kill-switch temporario;
- limpar `airtrust-*` caches e desregistrar registrations existentes ao entrar no app;
- manter `/login`, `/`, `/dashboard` e `/mro` servidos com `no-store`;
- documentar que clientes presos antes de receber HTML novo podem exigir limpeza manual unica.

## Arquivos Alterados

- `index.html`
- `public/sw.js`
- `src/lib/sw-manager.tsx`
- `src/react-app/main.tsx`
- `src/__tests__/service-worker-cache.test.ts`

## Testes Locais

Comandos:

```bash
npm test -- --run src/__tests__/service-worker-cache.test.ts
npm run lint
npm run build
```

Resultados:

- `npm test -- --run src/__tests__/service-worker-cache.test.ts`: aprovado
- `npm run lint`: aprovado
- `npm run build`: aprovado

## Deploy Pages

- PR: pendente
- merge commit: pendente
- deployment URL: pendente
- build-version: pendente

## Validacao

Fresh browser:

- pendente

Cliente legado simulado:

- pendente

Navegador real afetado:

- orientar limpeza manual unica dos dados do site se o cliente continuar preso antes de receber o HTML novo.

## Orientacao Operacional Temporaria

Se o navegador afetado continuar exibindo a tela antiga:

1. abrir os dados do site de `https://airtrust.online`;
2. remover service worker, storage e cache do dominio;
3. recarregar `https://airtrust.online/login`;
4. validar que a UI atual aparece com build-version novo.

Essa limpeza manual deve ser necessaria apenas para clientes extremos que nao conseguem mais receber HTML/bootstrap/SW atualizados automaticamente.

## Guardrails Confirmados

- Worker nao publicado
- SQL nao executado
- migration/schema nao alterado
- SIGVOOS intocado
- `frms-source-policy.ts` intocado
- secrets nao expostos

## Decisao Final

Status atual: EM EXECUCAO

Estados finais possiveis:

- `SERVICE WORKER DESCOMISSIONADO E LOGIN ATUAL RESTAURADO`
- `CLIENTE LEGADO EXIGE LIMPEZA MANUAL UNICA`
- `HOTFIX BLOQUEADO POR CI`
- `HOTFIX BLOQUEADO POR CLOUDFLARE PAGES`
- `ROLLBACK EXECUTADO`
