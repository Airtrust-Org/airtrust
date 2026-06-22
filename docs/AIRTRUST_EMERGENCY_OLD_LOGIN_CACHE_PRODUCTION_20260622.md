# AIRTRUST EMERGENCY OLD LOGIN CACHE PRODUCTION — 2026-06-22

## 1. Resumo executivo

Incidente:

- alguns usuarios acessavam `https://airtrust.online/login` e recebiam uma versao antiga do frontend/login;
- a tela antiga impedia autenticacao correta para parte dos clientes.

Impacto:

- degradacao direta do fluxo de login em producao;
- incidencia mais provavel em navegadores com service worker/cache local preso em runtime antigo.

Decisao final:

- `SERVICE WORKER CACHE CORRIGIDO`

Resultado operacional:

- Pages producao republicado;
- `build-version` atualizado para `2026-06-22T17:24:30Z-login-cache-hotfix`;
- `sw.js` passou a sair sem `immutable`;
- login foi colocado em bypass de service worker e limpeza de caches.

## 2. Causa raiz

Classificacao final:

- `SERVICE_WORKER_STALE_CACHE`
- `VERSION_GATE_MISSING`
- nao foi identificado `CLOUDFLARE_PAGES_CACHE` como causa principal.

Evidencias:

1. HTML de `https://airtrust.online/login` estava correto e sem cache agressivo:
   - `cache-control: no-cache, no-store, must-revalidate`
   - `cf-cache-status: DYNAMIC`

2. O problema estava no service worker:
   - `/sw.js` estava sendo servido com header contraditorio por combinacao de regras:
     `no-cache, no-store, must-revalidate, public, max-age=31536000, immutable`
   - isso permitia comportamento indevido de clientes mantendo copia antiga do service worker.

3. O login nao estava explicitamente fora do escopo do cache/service worker:
   - usuarios podiam ficar presos em runtime legado antes de receber o frontend novo.

4. Em deploy emergencial anterior, o `build-version` ficou congelado em `8abe084f`:
   - a publicacao usou alteracoes locais sem commit novo;
   - o stamp usava apenas `HEAD`, entao a versao exposta no HTML nao mudou;
   - isso enfraquecia a deteccao de atualizacao do frontend.

## 3. Correções

Arquivos alterados:

- `public/_headers`
- `public/sw.js`
- `src/lib/sw-manager.tsx`
- `src/__tests__/service-worker-cache.test.ts`

Correções aplicadas:

1. `public/_headers`
   - removido cache longo generico para `/*.js` e `/*.css`;
   - mantido cache longo apenas para `/assets/*.js` e `/assets/*.css` com hash;
   - `sw.js` passou a responder com `no-cache, no-store, must-revalidate`.

2. `public/sw.js`
   - `CACHE_VERSION` aumentado de `airtrust-v9` para `airtrust-v10`;
   - `/login` adicionado ao bypass do service worker;
   - isso evita reutilizacao de cache legado no fluxo de autenticacao.

3. `src/lib/sw-manager.tsx`
   - `/login` adicionado ao bypass do service worker no cliente;
   - ao abrir o login, o app limpa caches AirTrust e desregistra service workers antigos.

4. `build-version`
   - republicacao final de Pages com `APP_VERSION=2026-06-22T17:24:30Z-login-cache-hotfix`
   - isso restabeleceu trilha auditavel de versao servida no HTML.

Deploy realizado:

- Pages preview intermediario: `https://84072b5b.airtrust.pages.dev`
- Pages final: `https://74e72330.airtrust.pages.dev`
- dominio validado: `https://airtrust.online`

Cache purge/invalidation:

- nao houve comando separado de purge Cloudflare;
- a mitigacao sistêmica foi feita por novo deploy + novo service worker + novo `build-version` + bypass/limpeza no login.

## 4. Validação

Horario da validacao final:

- `2026-06-22T17:24:56Z`

URLs testadas:

- `https://airtrust.online/`
- `https://airtrust.online/login`
- `https://airtrust.online/sw.js`
- `https://airtrust.online/dashboard`
- `https://airtrust.online/mro`
- `https://api.airtrust.online/api/version`
- `https://api.airtrust.online/api/health`
- `https://api.airtrust.online/api/me`

Producao frontend:

- `/login` respondeu com `build-version: 2026-06-22T17:24:30Z-login-cache-hotfix`
- asset principal atual no HTML: `/assets/index-C6kOBatU.js`
- CSS atual: `/assets/index-c_lzhaBK.css`
- user-agent mobile recebeu o mesmo HTML atual

Service worker:

- `/sw.js` em producao:
  - `CACHE_VERSION = 'airtrust-v10'`
  - `AUTH_BYPASS_PATHS = [/^\\/login$/]`
  - header sem `immutable`
- no browser real, o login carregou com:
  - logo atual
  - heading `Entrar`
  - texto `Acesse sua conta AirTrust`
  - botao `Entrar`
  - link `Esqueceu sua senha?`
- no console do browser:
  - `Caches limpos`
  - service worker bypass/cleanup executado na rota de login

Rotas protegidas:

- `/dashboard` sem sessao redirecionou para `/login`
- `/mro` sem sessao redirecionou para `/login`

API:

- `/api/version` -> `200`
- `/api/health` -> `200`
- rota protegida sem token (`/api/me`) -> `401`

Observacoes:

- o unico erro de console observado foi bloqueio do script externo Cloudflare Insights por CSP;
- nao houve erro React minificado durante os smokes desta emergencia.

Validacoes locais:

- `npm test -- --run src/__tests__/service-worker-cache.test.ts` -> `pass`
- `npm run build` -> `pass`

## 5. Seguranca operacional

Confirmacoes:

- producao nao quebrou durante a mitigacao
- SQL producao nao executado
- migration/schema nao alterado
- Worker nao foi redeployado
- Pages foi redeployado
- SIGVOOS intocado
- `frms-source-policy.ts` intocado
- secrets nao expostos

Rollback:

- rollback conhecido via novo deploy de Pages para deployment anterior, se necessario;
- nao foi necessario rollback nesta emergencia.

## 6. Mensagem temporaria para suporte

Mensagem recomendada:

> Identificamos que alguns celulares estavam abrindo uma versao antiga do AirTrust. Publicamos uma correcao para forcar o carregamento da versao atual. Se ainda aparecer a tela antiga, feche completamente o navegador e abra novamente `airtrust.online`. Caso continue, avise com print.

## 7. Decisao final

`SERVICE WORKER CACHE CORRIGIDO`
