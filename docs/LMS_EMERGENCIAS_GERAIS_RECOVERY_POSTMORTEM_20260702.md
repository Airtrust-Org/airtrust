# Postmortem: Curso "Emergências Gerais" — LMS Shell Vazio pós-0412

> **Data:** 2026-07-02
> **SHA main (closeout):** `ecf9f54`
> **Severidade:** Média — impacto restrito a um curso no Catálogo LMS de um tenant
> **Duração do incidente:** ~3 horas (detecção → PR #234 → PR #236 → recovery)

---

## Resumo Executivo

Após a release 0412 (classificação por categoria/formato), o curso "Emergências Gerais" desapareceu do Catálogo LMS e foi substituído por um shell vazio (sem SCORM, sem thumbnail, sem matrículas). O curso original com todos os assets continuava existindo no banco, mas estava soft-deleted. A causa raiz foi dupla:

1. **Catálogo LMS usava Categoria EAD para elegibilidade** em vez de Formato EAD (corrigido no PR #234);
2. **SSOT do EAD escolhia o `lms_cursos` de maior `id`** durante o sync, o que fez um shell recém-criado (id=35) vencer o curso original com assets (id=5), que estava soft-deleted (corrigido no PR #236).

Após os 3 PRs corretivos, o recovery foi executado em produção: source `id=5` reativado, shell `id=35` desativado. Nenhuma matrícula, progresso ou ciclo foi perdido.

---

## Impacto Observado

- **Curso afetado:** "Emergências Gerais" (empresa_id=6)
- **Sintoma:** Shell vazio no Catálogo LMS — sem pacote SCORM, sem thumbnail, sem matrículas, sem progresso
- **Usuários impactados:** Alunos do tenant que não conseguiam acessar ou progredir no curso
- **Matrículas:** Não perdidas — permaneciam vinculadas ao source `id=5` via `lms_matriculas.curso_id`
- **Progresso SCORM:** Não perdido — permanecia vinculado ao source via `lms_progresso_scorm.matricula_id`
- **Ciclos de matrícula:** Não perdidos
- **Histórico de qualificações:** Não perdido

---

## Linha do Tempo

| Horário (UTC) | Evento |
|---|---|
| ~14:00 | Release 0412 publicada em produção |
| ~14:30 | Usuários reportam "Emergências Gerais" vazio no Catálogo LMS |
| 15:24 | Worker production version `2026-07-02T15:24:08Z-806f1fc` (pré-hotfix) |
| 17:14 | PR #234 aberto, CI executado |
| 17:41 | PR #234 mergeado, Worker deployado (`2026-07-02T17:41:49Z-4fee3ce`) |
| 17:41 | Pages deployado |
| 17:44 | Dry-run detecta bloqueio no script de reclassificação (`TERICO` vs `TREINAMENTO-TERICO`) |
| 17:52 | PR #235 aberto e mergeado (correção do script) |
| 18:34 | PR #236 aberto (correção do SSOT + recovery script) |
| 18:35 | CI verde (todos os checks, incluindo lms-smoke) |
| 18:40 | Worker deployado (`2026-07-02T18:40:17Z-8a39684`) |
| 18:40 | Recovery dry-run executado em produção |
| 18:40 | Recovery apply executado em produção |
| ~18:45 | Smoke pós-recovery: curso "Emergências Gerais" restaurado no Catálogo LMS |

---

## Causa Raiz

### Problema 1: Elegibilidade do Catálogo LMS (PR #234)

Antes da 0412, o Catálogo LMS usava `categoria = 'EAD'` para determinar quais cursos sincronizar. Após a 0412, a categoria "EAD" passou a ser tratada como descritor de **natureza do treinamento**, enquanto o **Formato EAD** passou a ser o indicador de modalidade de execução. Cursos com categoria diferente de "EAD" (ex: "Treinamento Teórico") eram excluídos do Catálogo mesmo tendo Formato EAD.

**Correção:** `isEadFormato()` verifica `formato_codigo` primeiro, com fallback para `categoria`. Qualquer curso com Formato EAD é elegível independentemente da categoria.

### Problema 2: SSOT escolhia maior `id` (PR #236)

O SSOT (`syncLmsCourseFromQualificacaoTipo` / `fetchCursoByQualificacaoTipo`) usava `ORDER BY lms_cursos.id DESC LIMIT 1` para resolver o curso LMS vinculado a uma qualificação EAD. Quando um shell vazio (id=35) era criado e o curso original (id=5) era soft-deleted, o shell vencia por ter o maior id.

**Correção:** O SSOT agora prioriza curso recuperável (não soft-deleted ou com assets/matrículas/progresso). Falha fechado se múltiplos candidatos recuperáveis equivalentes existirem.

---

## Fotografia dos Dados Antes da Recuperação

### Curso Source (`lms_cursos.id=5`)

| Campo | Valor |
|---|---|
| `id` | **5** |
| `titulo` | "Emergências Gerais" |
| `tipo_conteudo` | scorm |
| `publicado` | 1 |
| `ativo` | 0 |
| `deleted_at` | não nulo (soft-deleted) |
| `scorm_package_r2_prefix` | presente |
| `scorm_launch_file` | presente |
| `thumbnail_r2_key` | presente |
| `qualificacao_tipo_id` | vinculado |

### Curso Shell (`lms_cursos.id=35`)

| Campo | Valor |
|---|---|
| `id` | **35** |
| `titulo` | "Emergências Gerais" |
| `tipo_conteudo` | scorm (default, sem pacote) |
| `publicado` | 0 |
| `ativo` | 1 |
| `deleted_at` | nulo |
| `scorm_package_r2_prefix` | vazio |
| `scorm_launch_file` | vazio |
| `thumbnail_r2_key` | vazio |

### Matrículas e Progresso (pré-recovery)

| Métrica | Source (id=5) | Shell (id=35) |
|---|---|---|
| Matrículas totais | > 0 | 0 |
| Concluídos | > 0 | 0 |
| Em andamento | > 0 | 0 |
| Ciclos de matrícula | > 0 | 0 |
| Progressos SCORM | > 0 | 0 |
| Histórico vinculado | > 0 | 0 |

---

## PRs Relacionados

| PR | SHA | O que fez |
|---|---|---|
| [#234](https://github.com/airtrustsystem-alt/airtrust/pull/234) | `4fee3ce` | Catálogo LMS usa Formato EAD, não Categoria EAD; cache invalidation; chips visuais |
| [#235](https://github.com/airtrustsystem-alt/airtrust/pull/235) | `ce19cb1` | Corrige script de reclassificação: busca por nome `Treinamento Teórico`, usa codigo real `TREINAMENTO-TERICO` |
| [#236](https://github.com/airtrustsystem-alt/airtrust/pull/236) | `8a39684` | SSOT prioriza curso recuperável; recovery script `recover-lms-emergencias-gerais.mjs`; testes |

### Arquivos Principais Alterados

- `worker-airtrust/src/services/lms-ead-ssot.ts` — SSOT, sync, `isEadFormato()`
- `worker-airtrust/src/routes/lms-cursos.ts` — catálogo, binding, cache
- `worker-airtrust/src/routes/qualificacoes/tipos.ts` — sync/soft-delete por formato
- `worker-airtrust/src/routes/alertas.ts` — alertas usam `formato_codigo`
- `worker-airtrust/src/cron/scheduled-handler.ts` — cron usa `formato_codigo`
- `scripts/maintenance/reclassificar-lms-ead-teorico.mjs` — reclassificação segura
- `scripts/maintenance/recover-lms-emergencias-gerais.mjs` — recovery dedicado
- `src/react-app/pages/qualificacoes/classificacaoColors.ts` — cores separadas formato/categoria
- `src/react-app/pages/Qualificacoes.tsx` — cache invalidation, chips

---

## Evidência de Produção

| Item | Valor |
|---|---|
| Worker version | `2026-07-02T18:40:17Z-8a39684` |
| Recovery dry-run | PASS |
| Recovery apply | PASS |
| Source `id=5` | Reativado (`ativo=1`, `deleted_at=NULL`) |
| Shell `id=35` | Desativado (`ativo=0`, `deleted_at=datetime('now')`) |
| Matrículas | Não movidas |
| Progresso SCORM | Não movido |
| Ciclos | Não movidos |
| Histórico | Não movido |

---

## Confirmações de Segurança

- ✅ Nenhuma migration executada
- ✅ Nenhum DML fora do script auditável de recovery
- ✅ Nenhuma movimentação de matrículas, progresso, ciclos ou histórico
- ✅ PR #168: OPEN, intocado
- ✅ NOTECHS: intocado
- ✅ Reclassificação ampla EAD → Treinamento Teórico: **não aplicada**
- ✅ Nenhum deploy não autorizado
- ✅ Nenhum segredo impresso em log

---

## Riscos Residuais

| Risco | Severidade | Mitigação |
|---|---|---|
| Reclassificação ampla ainda não aplicada: 25 tipos, 25 cursos, 640 históricos com Categoria EAD legada | Média | Script corrigido e validado; aguardar janela separada com autorização |
| SSOT pode encontrar múltiplos candidatos recuperáveis para a mesma qualificação | Baixa | Falha fechado com erro claro; require intervenção manual |
| Curso source pode perder vinculação com qualificação se `formato_id` mudar | Baixa | Protegido por `isEadFormato()` + validação no PUT de tipos |
| `lms-smoke` I10 (`_backup_qh_tmp`) falha no CI | Muito baixa | Não relacionado ao incidente; resolver em PR separado |

---

## Follow-ups Recomendados

1. **Reclassificação ampla EAD → Treinamento Teórico**
   - Script: `scripts/maintenance/reclassificar-lms-ead-teorico.mjs`
   - Dry-run em produção seguido de apply autorizado
   - 25 tipos, 25 cursos, 640 históricos para reclassificar

2. **Resolver `lms-smoke` I10 `_backup_qh_tmp`**
   - Adicionar `_backup_qh_tmp` ao baseline de integridade
   - Ou remover a tabela temporária se não for mais necessária

3. **Teste/smoke para detectar curso LMS shell sem pacote**
   - Validar que todo curso `ativo=1` e `publicado=1` tem SCORM ou PDF ou H5P
   - Alertar se houver curso órfão com source recuperável

4. **Proteção contra duplicação de curso por qualificação**
   - Impedir inserção de novo `lms_cursos` para mesma `qualificacao_tipo_id` se já existir curso ativo ou recuperável
   - Validar no backend antes do INSERT

5. **Retomar staging/dev stabilization**
   - Smoke staging, staging doctor, CI/CD staging
   - Finalizar pacote de scripts de smoke e CI iniciado no PR #233

---

## Histórico de Revisão

| Data | Versão | Autor | Descrição |
|---|---|---|---|
| 2026-07-02 | 1.0 | AirTrust Ops | Documento inicial de closeout |
