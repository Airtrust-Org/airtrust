# AIRTRUST — Auditoria de Integridade Multi-Tenant (READ-ONLY)

- **Modelo:** Claude Code — Opus 4.8 (esforço máximo)
- **Data:** 2026-06-07
- **Tipo:** READ-ONLY / Diagnóstico / Medição / Classificação
- **Branch:** `main` · **HEAD:** `f4ec19c` · **origin/main:** `f4ec19c` (ahead/behind 0/0, árvore limpa)
- **Produção auditada:** D1 `airtrust-db` (`7c8a788e-...`), 78 MB, via `wrangler d1 execute --remote` (apenas SELECT)
- **Tabelas no schema:** 237 · **Tabelas com `empresa_id`:** 126 · **Registros somados (126 tbls):** 11.751

> ⚠️ **Nenhuma escrita foi executada.** Sem UPDATE/DELETE/INSERT, sem migration, sem backfill, sem movimentação de tenant, sem deploy. Toda recomendação é plano posterior.

---

## 1. Sumário executivo

**Os dados da Costa do Sol NÃO desapareceram. Estão presentes, porém:**

1. **Mistagueados no tenant de teste (empresa 1).** Um subsistema inteiro de qualificações (tipos + histórico + documentos) foi gravado com `empresa_id = 1` em vez de `6`, por causa do default de schema `empresa_id INTEGER DEFAULT 1` combinado com INSERTs que **omitem** a coluna.
2. **Sem tenant (NULL).** 2.378 registros de `frms_jornada` (jornadas reais da Costa do Sol) têm `empresa_id IS NULL` — falha de tagueamento na importação (FIRA/MANUAL/SIGVOOS).
3. **Compensados na leitura.** As correções recentes (commits `f4ec19c`, `aea7238`, etc.) passaram a escopar leituras por `funcionarios.empresa_id` (JOIN) em vez de `qualificacoes_historico.empresa_id`. Isso **revela** os dados mistagueados na UI da empresa 6, mas **não corrige** o dado e **não impede** que novos registros continuem caindo na empresa 1.

**A causa raiz permanece ativa:** a gravação ainda depende do `DEFAULT 1`. Há registros mistagueados criados em **junho/2026** (mês corrente).

**Cross-tenant real (vazamento):** praticamente inexistente em escalas (4.936 eventos 100% empresa 6 ↔ empresa 6). O "cross-tenant" aqui é estrutural: linha com `empresa_id=1` cujo FK aponta para funcionário da empresa 6.

**Classificação final:** `AUDITORIA CONCLUÍDA — SANEAMENTO PODE SER PREPARADO` (com lotes de revisão manual para configs/SGSO e soft-deletes).

---

## 2. Mapa de tenants (empresas)

| id | nome | ativo | CNPJ | criado | deleted_at | natureza (evidência) |
|---:|------|:-----:|------|--------|-----------|----------------------|
| 1 | Airtrust **Airtrust Test** | 0 | `00.000.000/0001-00` | 2025-10-28 | — | **Tenant default/dev/teste.** Mais antigo do sistema; CNPJ placeholder; nome contém "Test". É o `DEFAULT 1` do schema. |
| 2 | Teste Empresa 001 | 1 | 33.333.333/0001-33 | 2025-11-03 | 2025-11-03 | Teste, soft-deleted |
| 3 | Empresa Teste 1762133845 | 0 | 12.345.678/0001-90 | 2025-11-03 | 2025-12-07 | Teste, soft-deleted |
| 4 | Teste Curl | 0 | — | 2025-12-07 | 2025-12-07 | Teste, soft-deleted |
| 5 | Bristow | 0 | — | 2025-12-07 | 2025-12-07 | Teste, soft-deleted |
| **6** | **Costa do Sol Táxi Aéreo** | **1** | `11.222.333/0001-44` | **2025-12-07** | — | **Tenant operacional real.** |
| 7 | Teste Táxi Aéreo | 0 | — | 2026-03-29 | — | Teste **isolado e consistente** (dados próprios, sem vazamento) |

**Observação cronológica decisiva:** empresa 1 foi criada **40 dias antes** da empresa 6. Dados reais da Costa do Sol começaram a ser inseridos no tenant default (1) antes de o tenant 6 existir, e o `DEFAULT 1` perpetuou o problema.

---

## 3. Matriz de inventário por tenant (tabelas com `empresa_id` > 0 na empresa 1)

| Tabela | Empresa 1 | Empresa 6 | Outros (7) | NULL | Soft-del | Total | Classificação predominante |
|--------|----------:|----------:|-----:|-----:|------:|------:|---------------------------|
| qualificacoes_historico | **362** | 590 | 15 | 0 | 90 | 967 | TENANT_INCORRETO (361→6) |
| documentos | **70** | 403 | 0 | 0 | 236 | 473 | TENANT_INCORRETO (70→6) |
| pasta_virtual | **70** | 175 | 0 | 0 | 67 | 245 | TENANT_INCORRETO (70→6) |
| qualificacoes_tipos | **13** | 80 | 0 | 0 | 28 | 93 | TENANT_INCORRETO (parcial) / REVISAR |
| tipos_sessao | **6** | 17 | 0 | 0 | 15 | 23 | REQUER_REVISAO |
| integracoes_sigvoos_config | 5 | 13 | 0 | 0 | 0 | 18 | REQUER_REVISAO |
| integracoes_sigvoos_eventos | 4 | 241 | 0 | 0 | 0 | 245 | REQUER_REVISAO |
| sgso_spi_config | 7 | 7 | 0 | 0 | 0 | 14 | DESCONHECIDO (seed?) |
| sgso_frat_fatores | 6 | 12 | 6 | 0 | 0 | 24 | DESCONHECIDO (seed?) |
| sgso_sla_config | 3 | 3 | 0 | 0 | 0 | 6 | DESCONHECIDO (seed?) |
| usuarios_empresas | 2 | 54 | 6 | 0 | 0 | 62 | **MANTER** (admin/dev) |
| lms_cursos | 2 | 12 | 0 | 0 | 5 | 14 | REQUER_REVISAO |
| integracoes_edapp_cursos | 2 | 14 | 0 | 2 | 2 | 18 | REQUER_REVISAO |
| empresas_config | 1 | 1 | 3 | 0 | 0 | 5 | MANTER (config por tenant) |
| sgso_frat_modelos | 1 | 2 | 1 | 0 | 0 | 4 | DESCONHECIDO |
| sgso_matriz_risco_perfis | 1 | 2 | 1 | 0 | 0 | 4 | DESCONHECIDO |
| bkp_qual_historico_20260325 | 42 | 537 | 0 | 0 | 124 | 579 | BACKUP (cleanup) |
| bkp_qual_tipos_20260325 | 3 | 47 | 0 | 0 | 2 | 50 | BACKUP (cleanup) |

**Total `empresa_id=1`:** 600 linhas (≈ 555 fora de tabelas de backup). **Total `empresa_id=6`:** 8.359. **Total NULL:** 2.729 (2.378 só em `frms_jornada`).

Operacionais com **0 na empresa 1** (saudáveis): `funcionarios` (63 em e6), `aeronaves` (20 em e6), `modelos_aeronave` (6), `simulador_agendamentos` (93 em e6), `escalas_mensais` (41), `modelos_sessao` (60), `notificacoes_inapp` (34), `lms_matriculas` (31). A recuperação de aeronaves (commit `dbe23c2`) está consolidada — nenhuma aeronave presa na empresa 1.

---

## 4. Achado CRÍTICO #1 — Subsistema de qualificações na empresa 1

**Evidência por JOIN (FK → tenant do funcionário):**

```
qualificacoes_historico WHERE empresa_id=1 (362 linhas):
  → funcionário pertence à empresa 6 : 361 linhas (40 funcionários distintos), 37 soft-deleted
  → funcionário inexistente (órfão)  :   1 linha (soft-deleted)
```

- **324 ativas** mistagueadas (status: 129 NULL, 117 `RENOVADA`, 67 `CONCLUIDA`, 7 `CONCLUIDA`+renovada, 4 `CANCELADA`).
- **0 duplicatas exatas** (funcionário+código+vencimento) já existentes na empresa 6 → **não é cópia stale**.
- **139** compartilham funcionário+código com algum registro da empresa 6 (cadeias de renovação esperadas).
- **185** são únicas (funcionário+código ausente na empresa 6) → **dado que só existe na empresa 1**.

**Tipos correspondentes (`qualificacoes_tipos` empresa 1):** códigos reais da frota Costa do Sol (`G1-SEM` AW139 21 usos, `CHT-TIPO-S76` 19, `FAP14-76` 17, `OPC-SK76` 12, `CHT-IFR-A139` 10, `IFR-SK76` 9, `CFIT` 2). SK76 = Sikorsky S-76, AW139 = AgustaWestland 139 (frota real). Confirma que **tipos + histórico** foram criados juntos sob a empresa 1. Alguns tipos são teste/soft-deleted (`ZZ-RESTORE-042`).

**Os 117 `RENOVADA` na empresa 1 explicam diretamente o sintoma "renovadas aparecem como zero"** quando qualquer consulta filtra por `qualificacoes_historico.empresa_id = 6`.

**Recência (prova de causa-raiz ativa):** criadas em 2026-04 (289), 2026-05 (32), **2026-06 (2)**, 2026-03 (1). O pico de abril sugere uma operação em massa que herdou `DEFAULT 1`.

---

## 5. Achado CRÍTICO #2 — `frms_jornada` sem tenant (NULL)

```
frms_jornada WHERE empresa_id IS NULL (2.378 linhas):
  → todas pertencem a tripulantes da empresa 6 (32 distintos), datas 2026-01-01 a 2026-05-31
  → 1.711 soft-deleted
  por origem: FIRA 2.223 | MANUAL 141 | SIGVOOS 14
```

Falha de tagueamento na importação (os pipelines FIRA/MANUAL/SIGVOOS não gravaram `empresa_id`). 100% recuperável para empresa 6 via `tripulante_id → funcionarios.empresa_id`. Confiança ALTA.

---

## 6. Achado CRÍTICO #3 — Causa raiz ativa (`DEFAULT 1` + INSERT sem coluna)

- Schema: `funcionarios.empresa_id INTEGER DEFAULT 1`, `qualificacoes_historico.empresa_id INTEGER DEFAULT 1`.
- `worker-airtrust/src/routes/qualificacoes/historico-write.ts:366` — `INSERT INTO qualificacoes_historico (...)` **não inclui `empresa_id`** → cai no `DEFAULT 1`.
- Leituras (`qualificacoes/historico.ts:129,544`, `estatisticas.ts`, `atribuicao.ts`, `qualificacoes-certificados.ts`) escopam por `f.empresa_id = ?` (JOIN funcionário) → mascaram o problema na UI.
- **Divergência de contrato:** leitura por funcionário-JOIN vs. gravação/agregações por `qh.empresa_id`. O fallback `GET /api/qualificacoes` (`index.ts:530`) lista `qualificacoes_tipos` **sem filtro de tenant** → vazamento de tipos entre empresas 1/6/7.

Enquanto a gravação não fixar `empresa_id = empresaId`, **qualquer saneamento será revertido pelo uso normal**. A correção de código (write path) é pré-condição do saneamento de dados.

---

## 7. Reconciliação BANCO → QUERY → API → TELA (zeros/listas vazias)

| Tela / métrica | Banco | Causa do zero/sumiço | Classificação |
|---|---|---|---|
| Qualificações · Renovadas | 117 RENOVADA em e1 + 73 em e6 (renovada=1) | filtro `qh.empresa_id=6` escondia as de e1; status `RENOVADA` vs flag `renovada` divergem | ZERO_FALSO_TENANT + ZERO_FALSO_STATUS |
| Qualificações · Planejadas | apenas 1 `PLANEJADA` em e6; 129+331 status NULL | status NULL não casa com filtro `=PLANEJADA` | ZERO_FALSO_STATUS |
| Qualificações · histórico/total | 590 e6 + 361 e1 (via funcionário) | resolvido após mudança p/ funcionário-JOIN | corrigido (verificar agregações restantes) |
| Gestão de Simuladores / Sessões | `simulador_agendamentos`=99 (93 e6); `sessoes`=0 | tabela legada `sessoes` vazia; 323 `sessoes_participantes` órfãos | ZERO_REAL (legado) — UI usa `simulador_agendamentos` |
| FRMS jornadas | 5.210 total, 2.378 NULL tenant, 4.284 soft-deleted | NULL tenant + soft-delete agressivo | ZERO_FALSO_TENANT + revisar soft-delete |
| Escalas / EVD / eventos | 4.936 eventos 100% e6 | sem problema de tenant | ZERO_REAL se vazio em período |

---

## 8. Cross-tenant, órfãos, duplicidades (resumo; detalhes em doc dedicado)

- **Cross-tenant (vazamento real):** escalas 0 (4.936 eventos e6/e6). O cross-tenant é estrutural (linha e1 com FK→funcionário e6) nas tabelas do §4/§5.
- **Órfãos:** `sessoes_participantes` 323 (todos órfãos — `sessoes` vazia; 97 ativos) = debris legado; `qualificacoes_historico` 1 órfão soft-deleted. `escala_eventos`/`treinamentos_participantes`/`sessoes_participantes→funcionário` = 0 órfãos.
- **Duplicidades (ativas e6):** CPF 0, prefixo aeronave 0, e-mail usuário 0, nome funcionário 0. **Nenhuma duplicidade operacional.**

---

## 9. Soft-delete (panorama)

Soft-delete intenso a revisar (real vs teste):

| Tabela | soft-deleted / total |
|---|---|
| frms_jornada | 4.284 / 5.210 (82%) |
| documentos | 236 / 473 |
| bkp_qual_historico_20260325 | 124 / 579 |
| qualificacoes_historico | 90 / 967 |
| pasta_virtual | 67 / 245 |
| simulador_agendamentos | 41 / 99 |
| escalas_mensais | 33 / 44 |
| qualificacoes_tipos | 28 / 93 |
| funcionarios | 17 / 68 |
| aeronaves | 15 / 23 |

O volume de `frms_jornada` soft-deleted (82%) sugere reconstruções/reimportações sucessivas (vide artifacts `frms-sigvoos-global-rebuild-20260605`). Requer revisão antes de qualquer purge.

---

## 10. Tabelas de backup/legado/temporárias em produção (cleanup)

| Tabela | linhas | ação sugerida |
|---|---:|---|
| migracao_mapeamento_ids | 841 | ARQUIVAR/exportar e DROP futuro |
| bkp_qual_historico_20260325 | 579 | exportar e DROP |
| _backup_qh_tmp | 525 | exportar e DROP |
| qualificacoes_tipos_backup_20251128 | 61 | DROP |
| qualificacoes_tipos_id_map | 61 | revisar (mapa de migração) |
| bkp_qual_tipos_20260325 | 50 | DROP |
| qualificacoes_tipos_old, legacy_funcionarios, legacy_qualificacoes_historico/tipos, funcionarios_tmp, _backup_qh_tmp(vazias) | 0 | DROP |

---

## 11. Performance & índices (resumo; detalhes em docs dedicados)

- **773 índices** no banco — muito alto. `simulador_agendamentos` tem **24** índices (forte suspeita de redundância), `qualificacoes_historico` 13, `frms_jornada` 12.
- Risco: custo de escrita e bloat. Auditar redundância antes de adicionar novos.
- Índices a confirmar: cobertura de `qualificacoes_historico(funcionario_id)` e `funcionarios(empresa_id)` (caminho de leitura crítico atual).

---

## 12. FIRA 0391 (resumo; doc dedicado)

- **0391 NÃO está aplicada em produção** (`d1_migrations` tem 0389, 0390; **não** tem 0391). É migração **pendente**, não um fato consumado.
- Conteúdo: rotula `observacao` (reversível) e corrige `duracao_jornada_minutos` para **8** registros (origem='FIRA', isolados de SIGVOOS/rolling/alertas). Backup existe em `artifacts/frms-sigvoos-global-rebuild-20260605`.
- Classificação: **SEGURO** para aplicar quando autorizado, retendo o backup das 8 correções de valor.

---

## 13. Respostas às decisões obrigatórias (§28 do briefing)

1. Desapareceram ou escondidos? → **Escondidos/mistagueados**, não perdidos.
2. Registros reais da Costa do Sol na empresa 1? → ~**361** qual_historico + **70** documentos + **70** pasta_virtual + ~**7–13** tipos + casos a revisar (configs/SGSO). ~**555** linhas operacionais (fora backups).
3. Registros de teste na empresa 6? → Nenhum de outro tenant; há ruído próprio (soft-deletes, tipos `ZZ-RESTORE`). Empresa 7 é o teste isolado.
4. Cross-tenant? → Sem vazamento em escalas; cross-tenant **estrutural** (FK e6 com tag e1) nas tabelas do §4/§5.
5. Dados realmente perdidos? → **Não detectado**; tudo recuperável por FK/tenant do funcionário.
6. Duplicidades? → Nenhuma operacional ativa; 139 sobreposições funcionário+código (renovações).
7. Órfãos? → 323 `sessoes_participantes` (legado), 1 qual_historico.
8. Soft-delete incorreto? → A revisar (frms_jornada 82%).
9. Módulos lentos? → Ver doc de performance (índices em excesso; leitura por funcionário-JOIN).
10–13. Queries/índices/caches/contratos → ver docs dedicados.
14. Mover? → e1→e6: qual_historico (361), documentos (70), pasta_virtual (70), tipos usados; NULL→e6: frms_jornada (2.378).
15. Não mover? → `usuarios_empresas` e1 (admin/dev); empresa 7 (teste); empresas_config e1.
16. Revisão manual? → SGSO/configs em e1, soft-deletes, tipos parcialmente usados.
17. Ordem segura? → Ver §22 (Plano). **Corrigir write path ANTES de mover dados.**
18–19. Risco/rollback por lote → doc de execução.
20. Pronto p/ nova funcionalidade? → **Não até** fixar a causa raiz (DEFAULT 1 + write path). Caso contrário a dívida cresce a cada uso.

---

## 14. Classificação final

```
AUDITORIA CONCLUÍDA — SANEAMENTO PODE SER PREPARADO
(com lotes de REVISÃO MANUAL para configs/SGSO e soft-deletes)
```

**Pré-condição inegociável do saneamento:** corrigir o caminho de gravação (`empresa_id = empresaId` explícito) e/ou remover o `DEFAULT 1`, senão o backfill será revertido pelo uso normal.

---

## 15. Confirmações de conformidade desta fase

- ✅ Nenhuma escrita no banco · ✅ Nenhuma migration · ✅ Nenhum backfill · ✅ Nenhum dado movido
- ✅ Nenhum dado apagado · ✅ Nenhum deploy · ✅ Nenhuma alteração de tenant · ✅ Nenhuma conclusão sem evidência
- ✅ Apenas SELECTs em produção; documentos locais sem commit
