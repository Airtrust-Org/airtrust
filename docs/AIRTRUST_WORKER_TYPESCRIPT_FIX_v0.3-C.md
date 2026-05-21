# AIRTRUST — Worker TypeScript Fix
## v0.3-C · Correção de Erros TypeScript do Worker
**Data:** 2026-05-21  
**Branch:** `fix/worker-typescript-audit-v0.3-c`  
**Base commit:** `058fddcd87b4ce366f53c39bd0503bdcf3d55773`

---

## 1. Estado Inicial

| Item | Valor |
|---|---|
| Branch de partida | `main` (HEAD == origin/main) |
| Tracked modifications | Zero — working tree limpo |
| Erros TS do worker (inicial) | **63** |
| Erros TS do frontend (inicial) | 0 |
| Build (inicial) | ✅ OK |

---

## 2. Erros TypeScript — Contagem Inicial

**Total: 63 erros** em 6 arquivos:

| Arquivo | Erros |
|---|---|
| `worker-airtrust/src/routes/frms.ts` | 43 |
| `worker-airtrust/src/routes/qualificacoes/historico-write.ts` | 6 |
| `worker-airtrust/src/routes/importacao.ts` | 5 |
| `worker-airtrust/src/routes/frms-fira.ts` | 5 |
| `worker-airtrust/src/routes/frms-relatorios-config.ts` | 3 |
| `worker-airtrust/src/routes/alertas.ts` | 1 |

**Por tipo de erro:**

| Código TS | Descrição | Quantidade |
|---|---|---|
| TS2345 | Argumento `string \| undefined` onde `string` é esperado | 50 |
| TS2345 | Argumento `string \| undefined` onde `string \| number` é esperado | 5 |
| TS2322 | Atribuição `string \| undefined` onde `string` é esperado | 7 |
| TS18048 | Variável possivelmente `undefined` usada sem narrowing | 1 |

---

## 3. Causa Raiz

`c.req.param('x')` em Hono retorna `string | undefined` no sistema de tipos, mesmo quando a rota garante a presença do parâmetro (ex: `/:id`, `/:tripulante_id`). Sem narrowing explícito, o TypeScript rejeita o uso dessas variáveis em contextos que exigem `string`.

Não havia alteração de comportamento em produção — o runtime Hono sempre fornece o valor quando o padrão de rota corresponde — mas o typecheck estava falhando com 63 erros.

---

## 4. Correção Aplicada

**Técnica:** Nullish coalescing `?? ''` no ponto de declaração de cada parâmetro de rota.

```typescript
// Antes:
const id = c.req.param('id');

// Depois:
const id = c.req.param('id') ?? '';
```

**Por que `?? ''` é seguro:**
- Para `parseInt(param, 10)`: `parseInt('', 10)` → `NaN` → todos os handlers já possuem `isNaN` guard com retorno 400.
- Para strings passadas a funções de DB: string vazia → nenhum match no banco → 404 ou vazio (já tratado).
- Para strings passadas a funções de validação regex: `''` falha no regex → retorno 400 (já tratado).
- Para strings passadas a `assertTripulanteEmpresa`/`assertJornadaEmpresa`: empty string → acesso negado ou not found (comportamento correto).

Nenhum default foi introduzido com comportamento diferente do fluxo existente.

---

## 5. Arquivos Alterados

**6 arquivos · 38 substituições · 0 linhas adicionadas, 0 removidas (substituições 1:1)**

| Arquivo | Alterações | Tipo |
|---|---|---|
| `worker-airtrust/src/routes/alertas.ts` | 1 | `?? ''` em param de rota |
| `worker-airtrust/src/routes/frms-fira.ts` | 4 | `?? ''` em params de rota (4 handlers) |
| `worker-airtrust/src/routes/frms-relatorios-config.ts` | 2 | `?? ''` em params de rota (2 handlers) |
| `worker-airtrust/src/routes/frms.ts` | 20 | `?? ''` em params de rota (20 handlers) |
| `worker-airtrust/src/routes/importacao.ts` | 5 | `?? ''` em params de rota (5 handlers) |
| `worker-airtrust/src/routes/qualificacoes/historico-write.ts` | 6 | `?? ''` em parseInt de params de rota |

### Handlers corrigidos em frms.ts:
- `GET /score-atual/:funcionarioid`
- `PUT /jornadas/:id`
- `PATCH /jornada/:jornadaId/sono`
- `DELETE /jornadas/mes/:tripulanteId`
- `DELETE /jornadas/:id`
- `GET /jornadas/:tripulante_id`
- `GET /acumulo/:tripulante_id`
- `GET /tripulante/:id/jornadas`
- `GET /tripulante/:id/explicacao-dia`
- `GET /comparar-dias/:tripulanteId`
- `POST /simular-cenario/:tripulanteId/:data`
- `POST /justificativas/:tripulanteId/:data`
- `GET /justificativas/:tripulanteId`
- `PUT /alertas/:id/visualizar`
- `PUT /alertas/:id/resolver`
- `GET /escalas/:tripulante_id`
- `PUT /escalas/:id`
- `DELETE /escalas/:id`

---

## 6. Confirmação de Escopo — Não Alterado

| Item | Alterado? |
|---|---|
| Migrations | ❌ Não |
| `.env` / secrets / wrangler.toml | ❌ Não |
| Deploy | ❌ Não |
| Push | ❌ Não |
| Banco de dados / SQL | ❌ Não |
| Dumps SQL | ❌ Não |
| Binários rastreados | ❌ Não |
| `_arquivos_nao_usados/` | ❌ Não |
| BFG / filter-repo / histórico Git | ❌ Não |
| Deleção de arquivos | ❌ Não |
| Movimentação de arquivos | ❌ Não |
| Renomeação de arquivos | ❌ Não |
| Limpeza estrutural | ❌ Não |
| Contratos de API (rotas, payloads) | ❌ Não alterados intencionalmente |
| Regras de negócio FRMS | ❌ Não |
| `HomePerfil.tsx` | ❌ Não |
| `FrmsCheckinFadiga.tsx` | ❌ Não |
| `git add .` | ❌ Não usado |

---

## 7. Validações Executadas

| Validação | Resultado |
|---|---|
| `npx tsc -p worker-airtrust/tsconfig.json --noEmit` (pré-fix) | ✅ 63 erros detectados e catalogados |
| `npx tsc -p worker-airtrust/tsconfig.json --noEmit` (pós-fix) | ✅ **0 erros** |
| Erros fora de frms.ts após lote 1-4 | ✅ 0 (validado intermediariamente) |
| `npx tsc --noEmit` (frontend + worker) | ✅ 0 erros |
| `npm run build` | ✅ `✓ built in 14.87s` — 0 erros, 0 warnings |

---

## 8. Riscos Remanescentes

| Risco | Severidade | Observação |
|---|---|---|
| Worker TypeScript errors | ✅ Resolvido | 63 → 0 |
| Conflito de migration `0367_` | Médio | Não tratado nesta fase — ver plano v0.3-B Fase 4 |
| Credenciais em Git histórico | Alto | Não tratado — requer Phase 3 clone-isolado |
| `_arquivos_nao_usados/` (631 arquivos) | Baixo | Não tratado — ver plano v0.3-B Fase 5 |
| Dumps SQL com dados pessoais rastreados | Alto | Não tratado — ver plano v0.3-B Fase 3 |

---

## 9. Próxima Fase Recomendada

1. **Commit e push desta branch** (comandos abaixo).
2. **Abrir PR** `fix/worker-typescript-audit-v0.3-c` → `main` para revisão.
3. **Retomar Fase 3** do plano v0.3-B: remoção de credenciais/dumps do histórico Git (requer clone isolado + BFG).
4. **Fase 4**: resolver conflito de migrations `0367_`.

---

*Gerado em 2026-05-21 · Airtrust Worker TypeScript Fix v0.3-C*
