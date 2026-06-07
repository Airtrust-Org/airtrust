# AIRTRUST — Inventário de Saneamento de Dados (READ-ONLY)

- **Data:** 2026-06-07 · **Modelo:** Opus 4.8 · **Produção:** `airtrust-db` (somente SELECT)

## 1. Inventário completo (126 tabelas com `empresa_id`) — destaques

Fonte: `output/audit-20260607/raw/inventory_all.json` (gerado via SELECTs agregados por tenant).

Totais agregados (126 tabelas): **empresa_id=1 = 600**, **empresa_id=6 = 8.359**, **outros = ~40**, **NULL = 2.729**, **soma = 11.751**.

## 2. Candidatos a movimentação e1→e6 (confiança ALTA)

| Tabela | Linhas a mover | Critério canônico | Soft-deleted incluídos |
|---|---:|---|---:|
| qualificacoes_historico | 361 | `funcionario_id ∈ funcionarios(empresa_id=6)` | 37 |
| documentos | 70 | idem | 25 |
| pasta_virtual | 70 | idem | 10 |
| qualificacoes_tipos | ~7 (usados) | `codigo` usado por qual_historico de funcionários e6 | — |

## 3. Candidatos a tagueamento NULL→e6 (confiança ALTA)

| Tabela | Linhas | Critério |
|---|---:|---|
| frms_jornada | 2.378 | `tripulante_id ∈ funcionarios(empresa_id=6)` (FIRA 2.223 / MANUAL 141 / SIGVOOS 14) |
| integracoes_edapp_cursos | 2 | revisar dono |

## 4. REQUER_REVISAO manual (confiança MÉDIA/BAIXA)

| Tabela | Linhas e1 | Observação |
|---|---:|---|
| tipos_sessao | 6 | catálogo (pode ser global) |
| integracoes_sigvoos_config | 5 | config integração |
| integracoes_sigvoos_eventos | 4 | eventos integração |
| lms_cursos | 2 | catálogo LMS |
| integracoes_edapp_cursos | 2 | catálogo EdApp |
| sgso_spi_config | 7 | seed por-tenant (também em e6 e outros) |
| sgso_frat_fatores | 6 | seed (6 em outros também) |
| sgso_sla_config | 3 | seed |
| sgso_frat_modelos | 1 | seed |
| sgso_matriz_risco_perfis | 1 | seed |
| empresas_config | 1 | **MANTER** (config da e1) |

## 5. MANTER na empresa 1

| Tabela | Linhas | Motivo |
|---|---:|---|
| usuarios_empresas | 2 | `admin@airtrust.com` + `filipe.daumas@icloud.com` (admin/dev) |
| empresas_config | 1 | configuração própria do tenant 1 |

## 6. Registros de teste identificados (NÃO apagar)

| Local | Evidência | Risco remoção |
|---|---|---|
| empresa 7 (todo o tenant) | e-mails `@testetaxi.com.br`, nome "Teste Táxi Aéreo" | baixo, mas requer backup |
| empresas 2,3,4,5 | nomes "Teste*"/"Curl"/"Bristow", soft-deleted | baixo |
| qualificacoes_tipos `ZZ-RESTORE-042` | nome "Teste Restore", soft-deleted | baixo |
| funcionarios "outros" (5 em e7) | tenant 7 | baixo |

## 7. Tabelas de backup/legado/tmp em produção (cleanup técnico)

| Tabela | Linhas | Ação |
|---|---:|---|
| migracao_mapeamento_ids | 841 | exportar → DROP |
| bkp_qual_historico_20260325 | 579 | exportar → DROP |
| _backup_qh_tmp | 525 | exportar → DROP |
| qualificacoes_tipos_backup_20251128 | 61 | DROP |
| qualificacoes_tipos_id_map | 61 | revisar (mapa migração) → arquivar |
| bkp_qual_tipos_20260325 | 50 | DROP |
| qualificacoes_tipos_backup_0063, qualificacoes_tipos_old, legacy_funcionarios, legacy_qualificacoes_historico, legacy_qualificacoes_tipos, funcionarios_tmp | 0 | DROP (vazias) |
| sessoes / sessoes_participantes | 0 / 323 | `sessoes` vazia; participantes órfãos legados → arquivar |

## 8. Inventário de teste (formato §18)

```
empresa=7  todas as tabelas próprias  evidência=naming+email  refs=isoladas  risco=baixo
qualificacoes_tipos ZZ-RESTORE-042  e1  evidência=nome "Teste"  soft-deleted  risco=baixo
empresas 2,3,4,5  soft-deleted  evidência=naming  risco=baixo
```

Nenhuma remoção executada nesta fase.
