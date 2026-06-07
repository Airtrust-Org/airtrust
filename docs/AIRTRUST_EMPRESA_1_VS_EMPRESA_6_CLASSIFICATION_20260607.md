# AIRTRUST — Classificação Empresa 1 vs Empresa 6 (READ-ONLY)

- **Data:** 2026-06-07 · **Modelo:** Opus 4.8 · **Produção:** `airtrust-db` (somente SELECT)
- Complementa `AIRTRUST_MULTITENANT_DATA_INTEGRITY_AUDIT_20260607.md`.

## 1. Natureza dos tenants

### Empresa 1 — "Airtrust Airtrust Test"
- `ativo=0`, CNPJ placeholder `00.000.000/0001-00`, criada **2025-10-28** (a mais antiga), nome contém "Test".
- É o **tenant default do schema** (`empresa_id INTEGER DEFAULT 1`).
- **Não é descartável:** contém (a) acesso admin/dev legítimo e (b) dados reais da Costa do Sol mistagueados.
- Usuários vinculados (`usuarios_empresas`): `admin@airtrust.com` (admin) e `filipe.daumas@icloud.com` (admin/dev) → **MANTER**.

### Empresa 6 — "Costa do Sol Táxi Aéreo"
- `ativo=1`, CNPJ real, criada **2025-12-07**. **Tenant operacional oficial.**
- 63 funcionários, 20 aeronaves, 41 escalas mensais, 4.936 eventos de escala, 93 agendamentos de simulador, 590 qual_historico, etc.

### Empresa 7 — "Teste Táxi Aéreo"
- Teste **isolado e consistente**: 5 funcionários (`@testetaxi.com.br`), 3 aeronaves, 15 qual_historico, 6 agendamentos, 5 usuários. **Sem vazamento** para/da empresa 6. Não migrar.

## 2. Respostas — Empresa 1 (§19 do briefing)

1. **Natureza?** Tenant default/dev/teste, mais antigo, CNPJ falso.
2. **Usuários reais?** Apenas admin do sistema e o desenvolvedor (legítimos).
3. **Dados reais da Costa do Sol?** **Sim** — qualificações (tipos+histórico), documentos, pasta virtual.
4. **Apenas testes?** Não; mistura admin/dev + dados reais e6 + alguns tipos de teste.
5. **Registros compartilhados?** Configs por-tenant e seeds SGSO (a revisar).
6. **Vínculos com e6?** Sim — FKs apontando para funcionários da e6 (361 qual_historico, 70+70 docs).
7. **Origem histórica?** Inserções pré-2025-12-07 e operações em massa de abril/2026 herdando `DEFAULT 1`.
8. **Candidatos a migração (e1→e6)?** Tabela abaixo.
9. **Permanecem?** `usuarios_empresas` (admin/dev), `empresas_config` da própria e1.
10. **Inconclusivos?** Seeds SGSO (`sgso_spi_config`, `sgso_frat_*`, `sgso_sla_config`), `tipos_sessao`, integrações.

## 3. Respostas — Empresa 6 (§20 do briefing)

1. **Dados reais?** Sim, núcleo operacional completo.
2. **Teste misturado?** Tipos `ZZ-RESTORE-042` e similares (poucos), soft-deletes de testes anteriores.
3. **Duplicados?** Nenhum ativo (CPF/prefixo/email/nome = 0 grupos).
4. **Soft-deleted?** Muitos (frms_jornada 82%; documentos 236; qual_historico 90) — revisar.
5. **Dependem de dados na e1?** Sim — qual_historico/documentos/tipos da e1 pertencem a funcionários da e6.
6. **Contagem inconsistente?** Qualificações (renovadas/planejadas) por divergência tenant/status.
7. **Faltam dados?** Não perdidos; "faltam" na UI quando filtrados por `qh.empresa_id`.
8. **Relações quebradas?** `sessoes_participantes` (legado órfão); 1 qual_historico órfão.
9. **Reconstruíveis (derivados)?** `frms_acumulo_*`, caches (`frms_explicacao_dia_cache`), stats diárias.
10. **Fonte oficial?** Empresa 6 é a fonte; e1 e NULL são resíduos a consolidar nela.

## 4. Tabela de classificação por registro (candidatos)

| Tabela | Linhas (e1/NULL) | Tenant atual | Tenant provável | Evidência | Confiança | Classificação |
|---|---|---|---|---|---|---|
| qualificacoes_historico | 361 (e1) | 1 | 6 | FK funcionário→e6 (40 distintos) | **ALTA** | TENANT_INCORRETO |
| qualificacoes_historico | 1 (e1, sd) | 1 | — | funcionário inexistente | ALTA | ORFAO/SOFT_DELETED |
| documentos | 70 (e1) | 1 | 6 | FK funcionário→e6 | **ALTA** | TENANT_INCORRETO |
| pasta_virtual | 70 (e1) | 1 | 6 | FK funcionário→e6 | **ALTA** | TENANT_INCORRETO |
| qualificacoes_tipos | ~7 usados (e1) | 1 | 6 | usados por qual_historico de funcionários e6; códigos da frota SK76/AW139 | **ALTA** | TENANT_INCORRETO |
| qualificacoes_tipos | ~6 não usados/teste (e1) | 1 | revisar | `ZZ-RESTORE`, soft-deleted | MÉDIA | REQUER_REVISAO |
| frms_jornada | 2.378 (NULL) | NULL | 6 | FK tripulante→e6 (32 distintos) | **ALTA** | TENANT NULL → 6 |
| tipos_sessao | 6 (e1) | 1 | revisar | catálogo; pode ser global/seed | MÉDIA | REQUER_REVISAO |
| integracoes_sigvoos_config/eventos | 5/4 (e1) | 1 | revisar | config de integração | MÉDIA | REQUER_REVISAO |
| lms_cursos / integracoes_edapp_cursos | 2/2 | 1 | revisar | catálogo LMS | MÉDIA | REQUER_REVISAO |
| sgso_spi_config, sgso_frat_*, sgso_sla_config | 1–7 (e1) | 1 | revisar | seeds por-tenant (também em "outros") | BAIXA | DESCONHECIDO |
| usuarios_empresas | 2 (e1) | 1 | **1** | admin@airtrust + dev | ALTA | **MANTER** |
| empresas_config | 1 (e1) | 1 | **1** | config da própria e1 | ALTA | **MANTER** |
| bkp_*_20260325 | 42/3 (e1) | 1 | — | tabela de backup | ALTA | BACKUP (cleanup) |

**Somente confiança ALTA é candidata a movimentação automática.** Os demais exigem revisão manual registro-a-registro.

## 5. Regra de ouro aplicada
Não foi assumido "tudo da empresa 1 → empresa 6". Cada classe foi decidida por evidência de FK, uso, naming e cronologia. Admin/dev e config própria da e1 **permanecem** na e1.
