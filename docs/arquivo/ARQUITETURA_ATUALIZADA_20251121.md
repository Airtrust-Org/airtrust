# 🏗️ ARQUITETURA ATUALIZADA - AIRTRUST SYSTEM v2.1

**Última Atualização:** 21 de Novembro de 2025  
**Status:** ✅ Fonte de Verdade Arquitetura (substitui documento 06/11/2025)  
**Escopo:** Incrementos pós-otimizações de histórico de qualificações (ETag, minimal mode, materialized stats, CORS explícito, banners de diagnóstico UI)

---

## 🔄 Visão Geral das Novas Alterações (Nov 06 → Nov 21)

| Área                    | Alteração                                               | Benefício                                          | Arquivos                                               | Migrations                                            |
| ----------------------- | ------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------- |
| Histórico Qualificações | `minimal=true`                                          | Reduz payload ~55–70%                              | `worker-airtrust/src/routes/qualificacoes.ts`          | -                                                     |
| Histórico Qualificações | `materialized=true` em `/historico/stats`               | Estatísticas persistentes diárias                  | `qualificacoes.ts`                                     | `0046_materialized_stats_qualificacoes_historico.sql` |
| Cache / ETag            | ETag condicional (page/limit/hash + minimal flag) + 304 | Economia de CPU e bytes em re-fetch                | `qualificacoes.ts`                                     | -                                                     |
| CORS                    | Cabeçalhos explícitos em respostas manuais              | Elimina intermitência de preflight / bloqueio      | `qualificacoes.ts`                                     | -                                                     |
| Performance Índices     | Migração 0045 (3 novos índices)                         | Filtros/status + ordenação vencimento mais rápidos | `0045_performance_indexes_qualificacoes_historico.sql` | 0045                                                  |
| Stats em Memória        | Cache volátil (30s) + materialização diária             | Redução de custo de re-cálculo repetitivo          | `qualificacoes.ts`                                     | 0046                                                  |
| Frontend UX             | Banners de erro (historico/tipos)                       | Diagnóstico direto sem abrir console               | `src/react-app/pages/QualificacoesNew.tsx`             | -                                                     |
| API Response Meta       | Campo `meta` em respostas paginadas                     | Sinalizar modos (minimal/materialized)             | `types/index.ts`                                       | -                                                     |

---

## ⚙️ Stack (Sem Mudança Estrutural)

Workers (Hono) + React 19 + D1 SQLite + R2 Storage + JWT Auth + RBAC + Zod DTOs.  
Arquitetura em camadas: Rotas → Middleware → Services → Repositórios → DB (D1).  
Respostas padronizadas: `{ success, data|error, code?, meta? }`.

---

## 📦 Migrations Recentes

### 0045 - Performance Indexes (qualificacoes_historico)

```
CREATE INDEX IF NOT EXISTS idx_qh_func_status_venc ON qualificacoes_historico(funcionario_id, status, data_vencimento);
CREATE INDEX IF NOT EXISTS idx_qh_qual_status_venc ON qualificacoes_historico(qualificacao_id, status, data_vencimento);
CREATE INDEX IF NOT EXISTS idx_qh_data_vencimento ON qualificacoes_historico(data_vencimento);
```

Foco: acelerar queries por funcionário, tipo e faixa de vencimento; melhora filtros combinados + ORDER BY.

### 0046 - Materialized Daily Stats

```
CREATE TABLE IF NOT EXISTS qualificacoes_historico_stats_daily (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day DATE NOT NULL,
  scope_hash TEXT NOT NULL,
  total INTEGER NOT NULL DEFAULT 0,
  validas INTEGER NOT NULL DEFAULT 0,
  vencendo INTEGER NOT NULL DEFAULT 0,
  vencidas INTEGER NOT NULL DEFAULT 0,
  renovadas INTEGER NOT NULL DEFAULT 0,
  generated_at DATETIME NOT NULL DEFAULT (datetime('now')),
  UNIQUE(day, scope_hash)
);
CREATE INDEX IF NOT EXISTS idx_qh_stats_daily_day_scope ON qualificacoes_historico_stats_daily(day, scope_hash);
```

Escopo hash: `funcionarioId|qualificacaoId|status` (string vazia para global). Persistência diária evita recomputar volume inteiro em acessos frequentes.

---

## 🧠 Fluxo Histórico de Qualificações (Atualizado)

1. Frontend chama `GET /api/qualificacoes/historico?limit=50&page=1&minimal=true&stats=false` para lista leve inicial.
2. Em paralelo (ou quando necessário) chama `GET /api/qualificacoes/historico/stats?materialized=true` para estatísticas globais rápidas.
3. Se conteúdo em cache de memória (<30s) existe, evita acesso DB completo.
4. Se materializado não existe para o dia/escopo, gera e persiste linha em `qualificacoes_historico_stats_daily`.
5. ETag gerado com partes: `["historico", page, limit, total, firstId, statsTotals..., minimalFlag]`.
6. Próximo fetch envia `If-None-Match`; se igual, retorna 304 sem body.
7. Em caso de erro (network, 401, CORS), UI exibe banner com ações (retry / reload).

### Diagrama Simplificado

```
[React Hook] --(fetch /historico?minimal=true)--> [Worker Route]
   |                                              |-- Query paginada (SELECT ... LIMIT/OFFSET)
   |                                              |-- (minimal) map reduzido campos essenciais
   |                                              |-- Gera ETag; compara If-None-Match
   |<-- 200 JSON + ETag / 304 --------------------|
   |
   +--(fetch /historico/stats?materialized=true)--> [Worker Route]
                                                  |-- Checa cache memória 30s
                                                  |-- Se ausente: tenta tabela diária
                                                  |-- Se não existente: agrega e insere
                                                  |-- Retorna stats + meta.materialized
```

---

## 📉 Minimal Mode (`minimal=true`)

Objetivo: Lista densa em dashboards sem overfetch de colunas raramente exibidas.  
Campos retornados: `id, funcionario_id, funcionario_nome, funcionario_codigo_anac, qualificacao_id, qualificacao_nome, qualificacao_codigo, qualificacao_categoria, validade_meses, status, data_conclusao, data_vencimento`.

Sem `minimal=true`: retorna conjunto completo da query original (inclui observações, certificado, instrutor, local, etc).

ETag inclui sinalizador para evitar colidir cache entre versões.

---

## 📊 Materialized Stats (`materialized=true`)

- Endpoint: `/api/qualificacoes/historico/stats?materialized=true`
- Primeira chamada do dia para escopo gera e insere linha.
- Próximas chamadas reutilizam campo persistido (latência mínima).
- Usa também cache em memória 30s como camada adicional (evita hit D1 repetido).

Fallback: `materialized=false` (default) recalcula com SELECT agregador.

---

## 🌐 CORS & Headers

Problema anterior: Respostas criadas com `new Response()` ignoravam middleware cors() global.  
Correção: Headers explícitos adicionados em rotas `historico` e `historico/stats`:

```
'Access-Control-Allow-Origin': '*'
'Access-Control-Allow-Headers': 'Authorization, Content-Type, If-None-Match'
'Access-Control-Expose-Headers': 'ETag'
```

Garante leitura segura de ETag pelo frontend e evita bloqueio intermitente.

---

## 🛡️ Segurança & RBAC (Inalterado, reafirmação)

- Middleware `auth()` em rotas sensíveis.
- `requireRole('admin', 'manager')` para mutações (POST / PUT / DELETE / renovar).
- JWT inválido → 401 + logout automático via hook `useApi`.
- Banners de diagnóstico informam falha de carregamento sem revelar dados sensíveis.

---

## 🧩 Metadata em Responses

`PaginatedResponse` agora suporta `meta` (ex: `{ minimal: true }`).  
`stats` recebe `{ meta: { materialized: true|false } }` para clareza operacional.

---

## 🖥️ Frontend Ajustes

Arquivo: `src/react-app/pages/QualificacoesNew.tsx`

- Inclusão de banners condicionais aos erros `historicoError` e `tiposError`.
- Ações rápidas: "Tentar novamente" (refetch) e "Recarregar página".
- Melhora tempo de resolução de falha sem precisar console.

---

## ⚡ Performance Consolidada

| Aspecto                  | Técnica                        | Resultado                          |
| ------------------------ | ------------------------------ | ---------------------------------- |
| Re-fetch lista           | ETag + 304                     | Redução tráfego repetido           |
| Estatísticas globais     | Materialização + cache volátil | Menos CPU em cenários de painéis   |
| Query filtros vencimento | Índices 0045                   | Melhor escaneamento status/data    |
| Payload lista inicial    | `minimal=true`                 | Render mais rápido / menor memória |
| UX erro                  | Banners                        | Menos suporte necessário           |

---

## 🧪 Testes Recomendados Pós-Deploy

```bash
# 1. Lista minimal
curl -s "$API/qualificacoes/historico?limit=10&minimal=true&stats=false" -H "Authorization: Bearer $TOKEN" | jq '.meta.minimal, (.data[0])'

# 2. Stats materializados
curl -s "$API/qualificacoes/historico/stats?materialized=true" -H "Authorization: Bearer $TOKEN" | jq '.meta.materialized, .data'

# 3. ETag 304
ETAG=$(curl -i -s "$API/qualificacoes/historico?limit=5" -H "Authorization: Bearer $TOKEN" | grep ETag | sed 's/ETag: //');
curl -i -H "If-None-Match: $ETAG" -H "Authorization: Bearer $TOKEN" "$API/qualificacoes/historico?limit=5" | head -n 1
```

---

## 🔮 Próximas Evoluções (Opcional)

- `minimal=ultra` (apenas IDs + status + vencimentos) para cenários streaming.
- Pré-job noturno que materializa todos escopos frequentemente acessados (ex: top 50 funcionários).
- KV cache para stats multi-dia (evitar recompute após reinício do worker).
- Progressive hydration: carregar stats antes dos dados quando `minimal=true` (percepção velocidade).
- Compressão Brotli custom (se Cloudflare não aplicar automaticamente) para payload full.

---

## ✅ Checklist Operacional Atualizado

- [x] Índices performance aplicados (0045)
- [x] Materialized stats tabela criada (0046)
- [x] Rotas ajustadas: `/historico`, `/historico/stats`
- [x] ETag inclui flag minimal
- [x] CORS garantido em respostas manuais
- [x] Frontend banners de erro
- [x] Deploy produção validado
- [ ] Documentação interna atualizada em todos índices (este arquivo cobre)

---

## 📌 Resumo Final

O subsistema de histórico de qualificações agora opera em modo adaptativo: payload leve (`minimal=true`), estatísticas persistentes (`materialized=true`), caching inteligente (ETag + memória + materialização), e UX de erro direta. Estrutura mantém princípios originais (padronização response, segurança, soft delete) e prepara base para extensões futuras de alto volume.

---

**Manutenção Responsável:** Equipe AirTrust Development  
**Próxima Auditoria Recomendada:** Dentro de 30 dias ou após inserção de `minimal=ultra`.

## 📊 Observabilidade e Monitoramento (Nov 21 Incremento)

### Métricas Essenciais

- Cache re-fetch 304 rate (>70% alvo)
- Latência média: full <200ms; materialized <50ms; memória <10ms
- Percentual uso `minimal=true` (>80% em dashboards)
- Erros de autenticação vs total requisições (<1%)

### Headers de Diagnóstico

- `X-Cache-Status`: HIT | MISS
- `X-Minimal-Mode`: true | false
- `X-Materialized`: true | false
- `X-Query-Time-Ms`: tempo bruto da query principal

### Alertas (SLA)

- P95 > 500ms 15min → investigar índices / n+1
- Error rate >1% → revisar últimas deploys / secrets
- Falta de materialização (todas MISS) >10min pico → checar tabela diária

## 🧪 Testes Expandidos

1. Invalidação stats após POST renovação
2. Preflight OPTIONS CORS sem erro
3. Concurrency 10x /historico ETag metade 304
4. Fallback stats sem linha diária (gera e persiste)

## 📐 Diagrama Sintético

```
qualificacoes_tipos ─┐
funcionarios      ───┼── qualificacoes_historico ──┬─(agregação)─► stats_daily (materialized)
                     │                             │
                     └─(joins enriquecimento)──────┘
```

## 🔧 Troubleshooting Rápido

- 304 nunca ocorre: confirmar envio If-None-Match + integrity ETag
- Stats não atualizam: remover linha diária ou invalidar cache memória
- CORS bloqueado: garantir headers em respostas `new Response()`
- Latência alta: revisar LIMIT/OFFSET + EXPLAIN + índices

## ⏮️ Rollback Seguro

- Dropar tabela `qualificacoes_historico_stats_daily` (remove materialização)
- Reverter migração 0045 se conflitos de índice (DROP INDEX ...)

## 📖 Glossário

- ETag: hash representativo do payload para validar reuso
- Materialização: persistir resultado agregado para reuso rápido
- Scope Hash: chave escopo stats (funcionario|qualificacao|status triple)
- Minimal Mode: subset de colunas para listas densas
- Soft Delete: marcação lógico (não abordado aqui, mas parte da arquitetura)
- Rate Limiting: limitação requisições por chave (planejado)
