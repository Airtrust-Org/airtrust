# AIRTRUST — Auditoria de Cache e Contratos (READ-ONLY)

- **Data:** 2026-06-07 · **Modelo:** Opus 4.8 · **Frontend:** React Query v5 + Service Worker `airtrust-v8`

## 1. React Query — chaves de cache

- **305** usos de `queryKey` no frontend.
- **Risco:** a maioria das chaves é **tenant-agnóstica** (ex.: `['funcoes']`, `['version']`, `KEYS.config`). Apenas hooks de `empresas` referenciam empresa na chave.
- **Implicação:** o tenant vem do JWT (server-side), então em uso normal (1 login = 1 tenant) o risco é baixo. **Porém** com `support_access_grants`/impersonação (tabelas `support_access_*` existem) ou troca de empresa sem reload completo, o cache do cliente pode servir dados do tenant anterior.
- **Recomendação:** incluir `empresaId` no prefixo das `queryKey` de dados operacionais, ou invalidar todo o cache na troca de tenant/impersonação.

### staleTime (distribuição)
| staleTime | nº chaves |
|---|---:|
| 10 min | 23 |
| 5 min | 8 (+4 variantes) |
| 2 min | 9 |
| 30–60 s | ~23 |
| 0 | 7 |

- **23 chaves com 10 min** sobre dados que podem mudar (operacionais) → explica "tela atualiza só após logout". Reduzir para dados sensíveis a mudança recente, ou invalidar em mutações relevantes (já há padrão de `invalidateQueries`, ex. commit `c626498` invalida escalas após mutações de treinamento).

## 2. Service Worker (`public/sw.js`, `airtrust-v8`)

- Caches: `*-assets`, `*-runtime`, **`*-api`**, **`*-minha-escala`**.
- **Risco:** o SW **cacheia respostas de `/api`** e dados de escala. Respostas antigas (contrato antigo, tenant antigo) podem persistir após deploy até a troca de `CACHE_VERSION`.
- SW registrado só em produção (`import.meta.env.PROD`) — bom para dev.
- **Recomendação:** confirmar estratégia (network-first para `/api` mutável; cache só para estáticos). Bump de `CACHE_VERSION` em todo deploy que muda contrato. Garantir `Cache-Control: no-store` nas rotas voláteis (já há `noCacheMiddleware` em `/api/qualificacoes/historico*`).

## 3. Contratos backend ↔ frontend

- **Envelope consistente:** `{ success: boolean, data }` — 733 `success: true`, 972 `success: false` nas rotas. Padrão sólido.
- **Divergência de escopo de tenant (principal achado de contrato):**
  - Leitura de qualificações: `f.empresa_id` (JOIN funcionário).
  - Gravação: `qualificacoes_historico.empresa_id` via `DEFAULT 1` (INSERT sem coluna em `historico-write.ts:366`).
  - `GET /api/qualificacoes` (`index.ts:530`) lista `qualificacoes_tipos` **sem filtro de tenant**.
  - → Mesma entidade exposta com regras de tenant diferentes em rotas diferentes.
- **Fallbacks silenciosos:** **377** ocorrências de `|| []` / `?? []` em `worker-airtrust/src/routes`. Nem todas são bugs, mas são o padrão "falha vira lista vazia" do briefing. **Auditar** as que envolvem leituras de tenant/agregações (converter falha de query em `[]`/`0` mascara erro como "zero real").
- `catch` que silencia: poucos (ex.: `auth.ts:1077` best-effort no logout — aceitável).

## 4. Versões frontend × worker
- `wrangler.toml`: `APP_VERSION`/`APP_BUILD_TIME` injetados por `scripts/deploy-worker-only.sh`.
- SW `CACHE_VERSION='airtrust-v8'`.
- **Recomendação:** alinhar bump de SW a cada deploy de contrato; expor versão do worker no health para detectar frontend novo × worker antigo.

## 5. Testes de contrato (a criar — próxima fase)
Capturar respostas reais sanitizadas dos endpoints núcleo (qualificações histórico/estatísticas, escala mensal, simulador sessões, FRMS) e fixar como contract tests, validando:
- presença de `success/data`,
- escopo de tenant idêntico entre rotas de leitura/gravação,
- ausência de fallback `[]` quando há erro (deve propagar `success:false`).

## 6. Classificação dos achados de cache/contrato
| Achado | Severidade |
|---|---|
| queryKeys sem tenant + impersonação | MÉDIO |
| 23 staleTime de 10 min em dados operacionais | MÉDIO |
| SW cacheia `/api` e escala | MÉDIO |
| Divergência de escopo tenant leitura/gravação | ALTO |
| `qualificacoes_tipos` sem filtro de tenant | ALTO |
| 377 fallbacks `[]/0` a auditar | MÉDIO |
