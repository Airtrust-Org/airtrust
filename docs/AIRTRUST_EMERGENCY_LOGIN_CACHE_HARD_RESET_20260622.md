# AirTrust Emergency Login Cache Hard Reset - 2026-06-22

## Resumo Executivo

O PR #133 corrigiu headers e parte da estratégia de invalidação, mas não recuperou todos os clientes legados. O usuário continuou vendo a tela antiga em `https://airtrust.online/login`.

Esta emergência aplicou um hard reset controlado do caminho de login para forçar clientes presos em service worker e caches antigos a buscar o `/sw.js` novo, limpar caches `airtrust-*`, executar um reload único de recuperação e abandonar o service worker legado.

## Causa Raiz

- O cliente legado podia ficar preso antes de receber o bundle novo.
- A rota `/login` ainda podia deixar de buscar ou registrar o `/sw.js` novo.
- O bootstrap anterior só ajudava clientes que já recebiam o HTML novo.
- Na prática, isso permitia que o shell antigo de login continuasse controlando a sessão do navegador afetado.

## Correcao Aplicada

- `index.html`
  - bootstrap inline expandido para `/` e `/login`;
  - limpeza de `airtrust_login_recovered` e `airtrust_sw_reset`;
  - busca explícita de registros existentes;
  - registro de `/sw.js` com `updateViaCache: 'none'`;
  - limpeza de caches `airtrust-*`;
  - reload único de recuperação.

- `public/sw.js`
  - convertido em kill-switch temporário;
  - limpeza de caches AirTrust legados;
  - `clients.claim()` na ativação;
  - refresh forçado de clientes críticos;
  - navegação HTML e `/sw.js` sempre por rede com `cache: 'no-store'`;
  - desregistro do próprio service worker ao final.

- `src/lib/sw-manager.tsx`
  - `/login` deixou de bypassar o service worker;
  - atualização explícita dos registros existentes;
  - registro defensivo do kill-switch também em `/login`;
  - limpeza de caches durante a recuperação.

- `src/__tests__/service-worker-cache.test.ts`
  - adaptado para validar o modo kill-switch e a recuperação nas rotas de entrada.

## Testes Locais

Comandos executados:

```bash
npm test -- --run src/__tests__/service-worker-cache.test.ts
npm run lint
npm run build
```

Resultados:

- `npm test -- --run src/__tests__/service-worker-cache.test.ts`: aprovado
- `npm run lint`: aprovado
- `npm run build`: aprovado

Reprodução controlada:

- foi confirmada a requisição do `/sw.js` novo após a troca para a fase nova mesmo com o shell legado ainda aberto;
- isso confirma a correção da lacuna principal de atualização do service worker no caminho de login.

## Deploy

PR:

- status: pendente
- numero: pendente
- URL: pendente

Merge:

- merge commit: pendente
- commit SHA publicado: pendente

Cloudflare Pages:

- deployment URL: pendente
- horario UTC: pendente
- build-version: pendente
- assets principais: pendente

## Validacao

Fresh browser:

- pendente

Cliente legado simulado:

- evidência local parcial concluída;
- validacao final em producao pendente.

Navegador afetado real:

- pendente

Rotas e artefatos:

- `/login`: pendente
- `/sw.js`: pendente
- API smoke: pendente

## Seguranca

- Worker nao publicado
- SQL de producao nao executado
- migration/schema nao alterado
- SIGVOOS intocado
- `frms-source-policy.ts` intocado
- secrets nao expostos

## Decisao Final

Status atual: EM EXECUCAO

Decisao final sera atualizada com um dos estados abaixo:

- `LOGIN CACHE HARD RESET CORRIGIDO EM PRODUCAO`
- `LOGIN ANTIGO AINDA REPRODUZ`
- `HOTFIX BLOQUEADO POR CI`
- `HOTFIX BLOQUEADO POR CLOUDFLARE PAGES`
- `RECUPERACAO AUTOMATICA IMPOSSIVEL PARA CLIENTES LEGADOS`
- `ROLLBACK EXECUTADO`
