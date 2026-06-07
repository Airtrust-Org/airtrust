# Dry-Run de Saneamento — Preparação dos Lotes 1–3

**Data de preparação:** 2026-06-07  
**Commit de referência:** `3ca7b7264fcd4124e8588743ee05a32e71a84337`  
**Status:** DRY-RUN PREPARADO — NENHUMA ESCRITA EXECUTADA

---

## Contagens atuais (snapshot da auditoria)

| Tabela | Resíduos ativos | Critério |
|---|---|---|
| `qualificacoes_historico` | 324 | empresa_id=1, funcionário empresa_id=6 |
| `documentos` | 45 | empresa_id=1, funcionário empresa_id=6 |
| `pasta_virtual` | 60 | empresa_id NULL ou 1, funcionário empresa_id=6 |
| `frms_jornada` | 667 | empresa_id IS NULL, funcionário empresa_id=6 |

---

## Lote 1 — qualificacoes_historico

### Script dry-run (somente SELECT)

```sql
-- LOTE 1 DRY-RUN: listar candidatos a reassignamento em qualificacoes_historico
-- Executar com: wrangler d1 execute airtrust-db --env production --remote --command "<query>"
-- NENHUMA ESCRITA. Somente leitura.

SELECT
  qh.id,
  qh.empresa_id                              AS empresa_id_atual,
  f.empresa_id                               AS empresa_id_proposta,
  qh.funcionario_id,
  f.nome                                     AS funcionario_nome,
  f.empresa_id                               AS funcionario_empresa_id,
  qh.qualificacao_id,
  qh.qualificacao_codigo,
  qt.empresa_id                              AS tipo_empresa_id,
  qh.status,
  qh.data_conclusao,
  qh.data_vencimento,
  qh.sessao_id,
  CASE
    WHEN sa.id IS NOT NULL THEN 'VINCULADA_SESSAO'
    WHEN qh.sessao_id IS NOT NULL THEN 'SESSAO_SEM_MATCH'
    ELSE 'SEM_SESSAO'
  END                                        AS sessao_classification,
  CASE
    WHEN qh.status = 'RENOVADA'    THEN 'RENOVADA'
    WHEN qh.status = 'PLANEJADA'   THEN 'PLANEJADA'
    WHEN qh.status = 'VENCIDA'     THEN 'VENCIDA'
    WHEN qh.status = 'VALIDA'      THEN 'VALIDA'
    WHEN qh.status = 'CANCELADA'   THEN 'CANCELADA'
    WHEN qh.deleted_at IS NOT NULL THEN 'SOFT_DELETED'
    ELSE 'OUTRO'
  END                                        AS classification,
  CASE
    WHEN f.empresa_id = 6 AND qh.empresa_id = 1 THEN 'HIGH'
    WHEN f.empresa_id = 6 AND qh.empresa_id IS NULL THEN 'HIGH'
    ELSE 'REVIEW'
  END                                        AS confidence,
  'UPDATE qualificacoes_historico SET empresa_id=' || f.empresa_id ||
    ' WHERE id=' || qh.id || ';'             AS rollback_action_candidate
FROM qualificacoes_historico qh
INNER JOIN funcionarios f
        ON f.id = qh.funcionario_id
       AND f.deleted_at IS NULL
LEFT  JOIN qualificacoes_tipos qt
        ON qt.id = qh.qualificacao_id
       AND qt.deleted_at IS NULL
LEFT  JOIN simulador_agendamentos sa
        ON sa.id = qh.sessao_id
       AND sa.deleted_at IS NULL
WHERE qh.empresa_id != f.empresa_id
  AND qh.deleted_at IS NULL
ORDER BY qh.id;
```

### Contagem por status

```sql
SELECT
  qh.status,
  COUNT(*) AS total
FROM qualificacoes_historico qh
INNER JOIN funcionarios f ON f.id = qh.funcionario_id AND f.deleted_at IS NULL
WHERE qh.empresa_id != f.empresa_id
  AND qh.deleted_at IS NULL
GROUP BY qh.status
ORDER BY total DESC;
```

### Tipos que também precisam saneamento

```sql
SELECT
  qt.id,
  qt.codigo,
  qt.nome,
  qt.empresa_id                              AS tipo_empresa_id_atual,
  f.empresa_id                               AS funcionario_empresa_id,
  COUNT(DISTINCT qh.id)                      AS registros_vinculados
FROM qualificacoes_historico qh
INNER JOIN funcionarios f  ON f.id = qh.funcionario_id AND f.deleted_at IS NULL
INNER JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id AND qt.deleted_at IS NULL
WHERE qh.empresa_id != f.empresa_id
  AND qt.empresa_id != f.empresa_id
  AND qh.deleted_at IS NULL
GROUP BY qt.id, qt.codigo, qt.nome, qt.empresa_id, f.empresa_id
ORDER BY registros_vinculados DESC;
```

---

## Lote 2 — documentos e pasta_virtual

### Documentos — dry-run

```sql
-- LOTE 2A DRY-RUN: documentos com empresa_id=1 ligados a funcionários empresa 6
SELECT
  d.id,
  d.empresa_id                               AS empresa_id_atual,
  f.empresa_id                               AS empresa_id_proposta,
  d.funcionario_id,
  f.nome                                     AS funcionario_nome,
  d.nome_arquivo,
  d.tipo,
  d.r2_key,
  d.uuid,
  CASE
    WHEN pv.id IS NOT NULL THEN 'TEM_PASTA_VIRTUAL'
    ELSE 'SEM_PASTA_VIRTUAL'
  END                                        AS pasta_virtual_status,
  qh.id                                      AS historico_certificado_id,
  CASE
    WHEN d.empresa_id = 1 AND f.empresa_id = 6 THEN 'HIGH'
    ELSE 'REVIEW'
  END                                        AS confidence,
  'UPDATE documentos SET empresa_id=' || f.empresa_id ||
    ' WHERE id=' || d.id || ';'             AS rollback_action_candidate
FROM documentos d
INNER JOIN funcionarios f
        ON f.id = d.funcionario_id
       AND f.deleted_at IS NULL
LEFT  JOIN pasta_virtual pv
        ON pv.documento_id = d.id
       AND pv.deleted_at IS NULL
LEFT  JOIN qualificacoes_historico qh
        ON qh.certificado_arquivo_id = d.id
       AND qh.deleted_at IS NULL
WHERE d.empresa_id != f.empresa_id
  AND d.deleted_at IS NULL
ORDER BY d.id;
```

### pasta_virtual — dry-run

```sql
-- LOTE 2B DRY-RUN: pasta_virtual com empresa_id NULL ou 1 ligados a funcionários empresa 6
SELECT
  pv.id,
  pv.empresa_id                              AS empresa_id_atual,
  f.empresa_id                               AS empresa_id_proposta,
  pv.funcionario_id,
  f.nome                                     AS funcionario_nome,
  pv.documento_id,
  d.nome_arquivo,
  CASE
    WHEN pv.empresa_id IS NULL THEN 'NULL'
    WHEN pv.empresa_id != f.empresa_id THEN 'MISMATCH'
    ELSE 'OK'
  END                                        AS situacao,
  CASE
    WHEN (pv.empresa_id IS NULL OR pv.empresa_id = 1) AND f.empresa_id = 6 THEN 'HIGH'
    ELSE 'REVIEW'
  END                                        AS confidence,
  'UPDATE pasta_virtual SET empresa_id=' || f.empresa_id ||
    ' WHERE id=' || pv.id || ';'            AS rollback_action_candidate
FROM pasta_virtual pv
INNER JOIN funcionarios f
        ON f.id = pv.funcionario_id
       AND f.deleted_at IS NULL
LEFT  JOIN documentos d
        ON d.id = pv.documento_id
       AND d.deleted_at IS NULL
WHERE (pv.empresa_id IS NULL OR pv.empresa_id != f.empresa_id)
  AND pv.deleted_at IS NULL
ORDER BY pv.id;
```

---

## Lote 3 — frms_jornada

### Dry-run por origem

```sql
-- LOTE 3 DRY-RUN: frms_jornada com empresa_id NULL ligados a funcionários empresa 6
SELECT
  fj.id,
  fj.empresa_id                              AS empresa_id_atual,
  f.empresa_id                               AS empresa_id_proposta,
  fj.tripulante_id,
  f.nome                                     AS tripulante_nome,
  fj.data,
  fj.status,
  fj.origem,
  CASE
    WHEN fj.origem = 'FIRA'    THEN 'FIRA'
    WHEN fj.origem = 'MANUAL'  THEN 'MANUAL'
    WHEN fj.origem = 'SIGVOOS' THEN 'SIGVOOS'
    ELSE 'OUTROS'
  END                                        AS origem_grupo,
  CASE
    WHEN fj.empresa_id IS NULL AND f.empresa_id = 6 THEN 'HIGH'
    WHEN fj.empresa_id != f.empresa_id       THEN 'HIGH'
    ELSE 'REVIEW'
  END                                        AS confidence,
  'UPDATE frms_jornada SET empresa_id=' || f.empresa_id ||
    ' WHERE id=''' || fj.id || ''';'        AS rollback_action_candidate
FROM frms_jornada fj
INNER JOIN funcionarios f
        ON f.id = fj.tripulante_id
       AND f.deleted_at IS NULL
WHERE (fj.empresa_id IS NULL OR fj.empresa_id != f.empresa_id)
  AND fj.deleted_at IS NULL
ORDER BY fj.data DESC, fj.id;
```

### Contagem por origem

```sql
SELECT
  COALESCE(fj.origem, 'NULL') AS origem,
  COUNT(*)                    AS total
FROM frms_jornada fj
INNER JOIN funcionarios f ON f.id = fj.tripulante_id AND f.deleted_at IS NULL
WHERE (fj.empresa_id IS NULL OR fj.empresa_id != f.empresa_id)
  AND fj.deleted_at IS NULL
GROUP BY fj.origem
ORDER BY total DESC;
```

### Excluídos desta fase (sem decisão explícita)

```sql
-- NÃO incluir soft-deleted sem decisão explícita
-- Este SELECT é apenas diagnóstico
SELECT COUNT(*) AS soft_deleted_pendentes
FROM frms_jornada fj
INNER JOIN funcionarios f ON f.id = fj.tripulante_id AND f.deleted_at IS NULL
WHERE (fj.empresa_id IS NULL OR fj.empresa_id != f.empresa_id)
  AND fj.deleted_at IS NOT NULL;
```

---

## Como executar o dry-run (local)

```bash
# Exemplo para Lote 1 (trocar pela query desejada)
wrangler d1 execute airtrust-db \
  --config worker-airtrust/wrangler.dev.toml \
  --local \
  --command "SELECT COUNT(*) FROM qualificacoes_historico WHERE empresa_id != (SELECT empresa_id FROM funcionarios WHERE id = funcionario_id LIMIT 1) AND deleted_at IS NULL"
```

```bash
# Exemplo para produção (somente leitura — nenhum UPDATE/DELETE)
npx wrangler d1 execute airtrust-db \
  --env production \
  --remote \
  --command "SELECT COUNT(*) FROM frms_jornada WHERE empresa_id IS NULL AND deleted_at IS NULL"
```

---

## Critérios de confiança

| Confidence | Critério |
|---|---|
| HIGH | empresa_id do registro = 1 ou NULL, empresa_id do funcionário = 6, sem ambiguidade |
| REVIEW | Outros casos de mismatch que requerem análise manual antes de reassignment |

Registros REVIEW **não devem ser incluídos** nos lotes de saneamento sem aprovação explícita.

---

## Confirmações

- **Nenhum UPDATE executado**
- **Nenhum DELETE executado**
- **Nenhuma migration aplicada**
- **Nenhum dado de produção alterado nesta sessão**
- Os scripts acima são **somente SELECT** e podem ser executados sem risco
