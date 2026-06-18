# AirTrust — Auditoria Crítica Sistêmica + Plano de Data Integrity Guardrails

> **Data:** 2026-06-16 | **HEAD:** `d8ec6914` (pós PR #60) | **Tipo:** Onda 0 — auditoria read-only
> **Autor:** Opus 4.8 (skill `airtrust-production-safe`)
> **Status:** PLANO TÉCNICO AUDITÁVEL — nenhuma alteração de código, banco, migration ou deploy
>
> **Restrições honradas:** sem DML, sem migration, sem escrita em banco, sem deploy, SIGVOOS intocado,
> FRMS intocado, `frms-source-policy.ts` intocado, sem `git add .`/`-A`, sem commit.

---

## 0. Como ler este documento

Este é o **primeiro entregável** (Onda 0): plano + queries read-only + matriz de risco. Nada aqui executa.
As queries são **propostas** e devem ser validadas contra o schema vivo (`.schema <tabela>`) **localmente** antes
de qualquer execução remota read-only autorizada, porque a auditoria já encontrou **drift de nomes de tabela**
entre tooling e schema (ver Risco R0).

---

## 1. Resumo Executivo

O incidente de `modelos_sessao_manobras` (tabela relacional estrutural que chegou a **0 relações** em produção,
gerando modelos sem manobras e fichas populadas vazias) não foi um caso isolado de bug — foi a **materialização de
uma classe de risco** que o AirTrust possui em vários módulos: **tabelas de ligação estruturais sem invariante
de cardinalidade verificada, sem guard de runtime na escrita e sem barreira de CI**.

A auditoria read-only dos 10 módulos + documentação técnica revela três conclusões centrais:

1. **O ferramental de integridade existente está parcialmente quebrado por drift de schema.** O script
   `scripts/validation/data-quality-checks-readonly.sql` consulta `frms_jornadas`, `simulador_sessoes` e
   `simulador_sessao_participantes` — nomes que **não existem** (o real é `frms_jornada`, e a FK de `fichas_sessao`
   aponta para `sessoes_simulador`). Ou seja: a rede de segurança de dados hoje pode estar **passando em verde
   sem checar nada** — o mesmo padrão de "fallback silencioso" do incidente, agora no próprio detector.

2. **As invariantes de cardinalidade "pai ativo exige N filhos" não são enforced em lugar nenhum** (nem schema,
   nem runtime, nem CI). O incidente só foi notado pelo efeito visível (fichas vazias). Existem ≥6 relações
   estruturais análogas (modelo↔manobra, ficha↔manobra, sessão↔participante, curso↔matrícula↔ciclo,
   escala↔alocação↔evento, jornada↔fatorização↔acúmulo).

3. **Resíduos estruturais de DDL ad-hoc** (`*_new`, `*_backup_`, `*_temp`, `*_v`) convivem com as tabelas canônicas
   (`fichas_sessao_new`, `modelos_sessao_backup_`, `frms_jornada_new`, `escala_alocacoes_v`, `avaliacoes_manobras_temp`),
   criando ambiguidade sobre qual é a fonte de verdade e elevando o risco de que uma rotina escreva/leia da tabela errada.

**Recomendação macro:** instituir os **AirTrust Data Integrity Guardrails** em 5 ondas, começando por corrigir o
detector (Onda 0) e por **CI guards read-only** (Onda 1) antes de qualquer runtime block (Onda 2) ou constraint de
banco (Onda 3). Nenhuma constraint de banco deve entrar sem plano de rollback (Onda 3).

---

## 2. Principais Riscos Encontrados (consolidado)

| ID | Risco | Padrão do incidente | Severidade | Bloqueia deploy | Bloqueia runtime |
|---|---|---|---|---|---|
| **R0** | Detector de integridade (`data-quality-checks-readonly.sql`) com nomes de tabela inexistentes → checa nada em silêncio | ferramenta com fallback silencioso | 🔴 CRÍTICO | Sim (gate do próprio guard) | n/a |
| **R1** | `modelos_sessao_manobras` / `fichas_sessao_manobras` podem voltar a 0 sem alarme | tabela relacional estrutural vazia | 🔴 CRÍTICO | Sim | Sim (escrita de ficha) |
| **R2** | Ficha em status final (`ASSINADA`/`CONCLUIDO`) sem manobras filhas | status final sem dados obrigatórios | 🔴 CRÍTICO | Sim | Sim |
| **R3** | Resíduos `*_new`/`*_backup_`/`*_temp`/`*_v` como fonte ambígua | fonte de verdade dupla / fallback | 🟠 ALTO | Não | Não |
| **R4** | `modelos_sessao_manobras` e fichas sem `empresa_id` próprio → isolamento só via JOIN; risco de relação cross-tenant | tenant cruzado / filho sem pai do mesmo tenant | 🟠 ALTO | Parcial | Não |
| **R5** | Migrations com número duplicado (30) — ordem alfabética decide; seed que "corrige" dado operacional sem fonte (ex.: `normalize_edapp_historical_renewals`, `classificar_dificuldade_sk76`) | migration/seed corrige dado sem fonte | 🟠 ALTO | Sim (gate) | n/a |
| **R6** | Auto-migration no cold start (`runApiBootstrap` cria tabelas) pode mascarar migration faltante e divergência de schema entre ambientes | DDL implícito em runtime | 🟠 ALTO | Não | Sim (silencioso) |
| **R7** | Rotas de manutenção (`/maintenance/*`) só protegidas por `MAINTENANCE_SECRET`, sem guard de integridade pós-operação | rota de escrita sem guard de integridade | 🟡 MÉDIO | Não | Parcial |
| **R8** | `instrutor → manager` (nível 80) — over-provisioning permite ação que backend deveria restringir | frontend/role permite ação indevida | 🟡 MÉDIO | Não | Não |
| **R9** | Reconciliação EAD / `fix-renovadas` / `deduplicate` reescrevem dados operacionais em lote sem dry-run obrigatório versionado | escrita em lote sem fonte auditável | 🟠 ALTO | Não | Parcial |
| **R10** | `qualificacoes-historico-ficha.ts:416` — 5 args p/ função de 6 (dívida 🔴) ainda aberto | bug latente em caminho de escrita | 🟡 MÉDIO | Sim | Não |
| **R11** | Backups: digest corrigido (da5177af) mas restore real em staging descartável ainda não é evidência regulatória | restore não verificado fim-a-fim | 🟠 ALTO | Não | Não |
| **R12** | `lms_matriculas` `dataExpiracao` (camelCase) `undefined` em runtime → e-mail/ciclo de matrícula sem data | bug latente silencioso | 🟡 MÉDIO | Sim | Não |

---

## 3. Top 10 Invariantes Críticas

Ordenadas por risco operacional. Cada uma tem query proposta na §6 e linha na matriz (§7).

| # | Invariante | Módulo | Se violada |
|---|---|---|---|
| I1 | Todo `modelos_sessao` **ativo e em uso** tem ≥1 linha em `modelos_sessao_manobras` (deleted_at IS NULL) | Simuladores | modelos sem manobras; fichas nascem vazias (**o incidente**) |
| I2 | Toda `fichas_sessao` em status final (`ASSINADA`/`CONCLUIDO`/`AVALIADO`) tem manobras filhas com `resultado` preenchido | Simuladores | registro regulatório vazio assinado |
| I3 | Nenhuma `modelos_sessao_manobras.manobra_id` órfã (sem `cadastro_manobras` correspondente) nem `modelo_id` órfão | Simuladores | relação órfã → render quebrado / contagem errada |
| I4 | Toda ficha/relação herda `empresa_id` consistente com o pai (sem manobra de modelo de outro tenant) | Simuladores/Multi-tenant | vazamento/contaminação cross-tenant |
| I5 | Todo `qualificacoes_historico` ativo aponta para `funcionario` e `qualificacao_tipo` do **mesmo** `empresa_id`; nenhum status final sem `data_conclusao` | Qualificações | compliance falso; renovação fantasma |
| I6 | Toda `lms_matriculas` ativa tem `curso_id` válido e ciclo (`lms_matricula_ciclos`) coerente; concluída gera `qualificacoes_historico` | LMS | conformidade EAD falsa |
| I7 | Toda `frms_jornada` ativa tem `funcionario_id`+`data`; jornada com origem SIGVOOS tem registro em `frms_jornada_origem_sigvoos`; sem duplicidade (tripulante,data,fonte) | FRMS | fadiga calculada sobre dados fantasma (read-only; **não alterar FRMS**) |
| I8 | Toda `escala_alocacao`/`escala_evento` aponta para `escala`/`escalas_mensais` válida do mesmo tenant; sem duplicidade (escala,func,data) | Escalas/EVD | escala diária com bloqueio/alocação falso |
| I9 | Toda `empresa` ativa tem ≥1 usuário admin/manager ativo; todo `usuario` ativo tem ≥1 `usuarios_empresas` | Funcionários/RBAC | empresa órfã / usuário sem tenant |
| I10 | Nenhuma tabela canônica coexiste com resíduo `*_new`/`*_backup_`/`*_temp` populado e referenciado por código | Todos | leitura/escrita na tabela errada |

---

## 4. Módulos Mais Frágeis (ranking)

| Pos | Módulo | Por quê | Sinais |
|---|---|---|---|
| 1 | **Simuladores/Fichas** | Origem do incidente; 3 tabelas de manobra paralelas (`fichas_sessao_manobras`, `fichas_simulador_manobras`, `avaliacoes_manobras`); dados denormalizados por cópia; restore manual recente | `*_new`, `*_backup_`, `*_temp` presentes; cópia modelo→ficha sem FK |
| 2 | **Qualificações** | Múltiplas rotinas de reescrita em lote (`fix-renovadas`, `deduplicate`, reclass, reconciliação tenant); histórico de lotes -1/1/2/3 | duplicidade, status divergente, planejadas órfãs |
| 3 | **FRMS** | Pipeline em cascata (9 fatores→acúmulo→alertas); múltiplas fontes (SIGVOOS/MANUAL/FIRA); `frms_jornada_new`/`frms_jornada_pendente` | **read-only obrigatório** |
| 4 | **Escalas/EVD** | Muitas tabelas (`escala_*` + `escalas_*`), sincronização training→evento, snapshots de publicação | `escala_alocacoes_v`, duplicidade de alocação |
| 5 | **Integrações/Manutenção** | Rotas sem auth JWT (secret-only), reconciliações cross-tenant, SIGVOOS importer | escrita em massa sem guard pós-op |
| 6 | **Backup/Restore** | Restore fim-a-fim não validado como evidência regulatória | drill local só |
| 7 | LMS | SSOT bidirecional qual↔curso; `dataExpiracao` bug | conformidade |
| 8 | Funcionários/RBAC | over-provisioning instrutor; default empresa 1 histórico | hardening waves 1-4 já feitas |
| 9 | SGSO | menos acoplado, mas relatos→NC→ações→risco encadeados | órfãos de cadeia |
| 10 | Deploy/CI | gates existem mas detector de dados quebrado (R0) | guard verde-falso |

---

## 5. Scan de Padrões de Risco (resultado da varredura)

| Padrão pedido | Encontrado? | Onde / evidência |
|---|---|---|
| Tabela relacional estrutural vazia | **Sim (confirmado pelo incidente)** | `modelos_sessao_manobras`; risco igual em `fichas_sessao_manobras`, `modelos_sessao_manobras` por modelo |
| Relação órfã | Provável | `manobra_id`→`cadastro_manobras`; `fichas_sessao_manobras.ficha_id`; `escala_alocacoes.escala_id` |
| Tenant cruzado | Risco estrutural | tabelas de ligação sem `empresa_id` próprio (I4, R4) |
| Registro ativo sem filhos obrigatórios | **Sim** | modelo ativo sem manobra (I1); ficha final sem manobra (I2) |
| Filho sem pai | Provável | resíduos + soft-delete de pai sem cascade lógico |
| Status final sem dados obrigatórios | **Sim** | ficha `ASSINADA`/`CONCLUIDO` sem manobra/resultado (I2) |
| Duplicidade de ordem/código | Risco | `modelos_sessao_manobras.ordem`; UNIQUE só em (modelo,manobra), **não** em (modelo,ordem) → duplicidade de ordem é possível |
| Fallback silencioso | **Sim (crítico)** | detector R0 com tabela inexistente; auto-migration cold start R6 |
| Migration/seed que "corrige" dado sem fonte | **Sim** | `0332_normalize_edapp_historical_renewals`, `0367_classificar_dificuldade_sk76`; rotinas `fix-renovadas`/`deduplicate` |
| Rota de escrita sem guard de integridade | **Sim** | `/maintenance/*` (secret-only); reconciliações |
| Frontend permitindo ação que backend deveria bloquear | Parcial (mitigado p/ fichas no PR #60) | over-provisioning instrutor (R8); demais superfícies não cobertas |

**Achado estrutural extra:** `modelos_sessao_manobras` tem `UNIQUE(modelo_id, manobra_id)` mas **não** tem unicidade
em `(modelo_id, ordem)` — duplicidade de *ordem* (a primária rejeitada no incidente A139-P-C1/IFR) **não é barrada
pelo schema**, só pela inferência manual. Invariante I3b candidata.

---

## 6. Queries Read-Only Propostas

> ⚠️ **Validar nomes/colunas contra `.schema` vivo antes de executar.** Drift confirmado (R0).
> Todas são `SELECT`-only. Não executar contra produção sem autorização explícita; preferir local/staging.
> Padrão de saída: `check_name` + chave + contagem, para alimentar relatório e thresholds.

### I1 — Modelo ativo sem manobras (o incidente)
```sql
SELECT 'modelo_sessao_sem_manobras' AS check_name, ms.id AS modelo_id, ms.empresa_id, ms.nome
FROM modelos_sessao ms
LEFT JOIN modelos_sessao_manobras msm
  ON msm.modelo_id = ms.id AND msm.deleted_at IS NULL
WHERE ms.deleted_at IS NULL
GROUP BY ms.id
HAVING COUNT(msm.id) = 0;
```

### I1b — Contagem global da tabela de ligação (canário "tabela zerou")
```sql
SELECT 'modelos_sessao_manobras_total' AS check_name, COUNT(*) AS rows_ativos
FROM modelos_sessao_manobras
WHERE deleted_at IS NULL;   -- alerta se = 0 ou cair > X% vs baseline
```

### I2 — Ficha em status final sem manobras
```sql
SELECT 'ficha_final_sem_manobras' AS check_name, fs.id AS ficha_id, fs.status, fs.sessao_id
FROM fichas_sessao fs
LEFT JOIN fichas_sessao_manobras fsm
  ON fsm.ficha_id = fs.id AND fsm.deleted_at IS NULL
WHERE fs.deleted_at IS NULL
  AND UPPER(COALESCE(fs.status,'')) IN ('ASSINADA','ASSINADO','CONCLUIDO','CONCLUIDA','AVALIADO')
GROUP BY fs.id
HAVING COUNT(fsm.id) = 0;
```

### I2b — Ficha final com manobra sem resultado
```sql
SELECT 'ficha_final_manobra_sem_resultado' AS check_name, fs.id AS ficha_id, COUNT(*) AS manobras_vazias
FROM fichas_sessao fs
JOIN fichas_sessao_manobras fsm ON fsm.ficha_id = fs.id AND fsm.deleted_at IS NULL
WHERE fs.deleted_at IS NULL
  AND UPPER(COALESCE(fs.status,'')) IN ('ASSINADA','ASSINADO','CONCLUIDO','CONCLUIDA','AVALIADO')
  AND (fsm.resultado IS NULL OR UPPER(fsm.resultado) IN ('NAO_REALIZADA',''))
GROUP BY fs.id;
```

### I3 — Relação órfã (manobra ou modelo inexistente)
```sql
SELECT 'msm_manobra_orfa' AS check_name, msm.id, msm.modelo_id, msm.manobra_id
FROM modelos_sessao_manobras msm
LEFT JOIN cadastro_manobras cm ON cm.id = msm.manobra_id
LEFT JOIN modelos_sessao ms ON ms.id = msm.modelo_id AND ms.deleted_at IS NULL
WHERE msm.deleted_at IS NULL AND (cm.id IS NULL OR ms.id IS NULL);
```

### I3b — Duplicidade de ORDEM no mesmo modelo (não barrada por schema)
```sql
SELECT 'msm_ordem_duplicada' AS check_name, modelo_id, ordem, COUNT(*) AS total
FROM modelos_sessao_manobras
WHERE deleted_at IS NULL
GROUP BY modelo_id, ordem
HAVING COUNT(*) > 1;
```

### I4 — Manobra de modelo de outro tenant (cross-tenant)
```sql
SELECT 'msm_cross_tenant' AS check_name, msm.id, ms.empresa_id AS modelo_emp, cm.empresa_id AS manobra_emp
FROM modelos_sessao_manobras msm
JOIN modelos_sessao ms ON ms.id = msm.modelo_id
JOIN cadastro_manobras cm ON cm.id = msm.manobra_id
WHERE msm.deleted_at IS NULL
  AND cm.empresa_id IS NOT NULL AND ms.empresa_id IS NOT NULL
  AND cm.empresa_id <> ms.empresa_id;
```

### I5 — Qualificação: tenant cruzado + status final sem data
```sql
-- 5a: tenant cruzado funcionario x historico
SELECT 'qual_hist_cross_tenant' AS check_name, qh.id
FROM qualificacoes_historico qh
JOIN funcionarios f ON f.id = qh.funcionario_id
WHERE qh.deleted_at IS NULL AND f.empresa_id <> qh.empresa_id;
-- 5b: status final sem data_conclusao
SELECT 'qual_hist_final_sem_data' AS check_name, qh.id, qh.status
FROM qualificacoes_historico qh
WHERE qh.deleted_at IS NULL
  AND UPPER(COALESCE(qh.status,'')) IN ('VALIDA','RENOVADA','VENCIDA')
  AND qh.data_conclusao IS NULL;
```

### I6 — LMS: matrícula com curso inválido / concluída sem qualificação gerada
```sql
SELECT 'lms_matricula_curso_orfao' AS check_name, m.id
FROM lms_matriculas m
LEFT JOIN lms_cursos c ON c.id = m.curso_id AND c.deleted_at IS NULL
WHERE m.deleted_at IS NULL AND c.id IS NULL;
```

### I7 — FRMS (READ-ONLY; não alterar FRMS): jornada sem dados / duplicada
```sql
-- 7a: dados mínimos
SELECT 'frms_jornada_sem_minimos' AS check_name, id
FROM frms_jornada
WHERE deleted_at IS NULL AND (funcionario_id IS NULL OR data IS NULL);
-- 7b: duplicidade tripulante+data (ajustar coluna tripulante_id/funcionario_id ao schema vivo)
SELECT 'frms_jornada_duplicada' AS check_name, funcionario_id, data, COUNT(*) AS total
FROM frms_jornada
WHERE deleted_at IS NULL
GROUP BY funcionario_id, data
HAVING COUNT(*) > 1;
```

### I8 — Escalas: alocação órfã + duplicada
```sql
SELECT 'alocacao_sem_escala' AS check_name, ea.id
FROM escala_alocacoes ea
LEFT JOIN escalas_mensais em ON em.id = ea.escala_id AND em.deleted_at IS NULL
WHERE ea.deleted_at IS NULL AND em.id IS NULL;
```

### I9 — Empresa sem admin / usuário sem empresa (reaproveitar lógica existente, corrigida)
```sql
SELECT 'empresa_sem_admin' AS check_name, e.id
FROM empresas e
LEFT JOIN usuarios_empresas ue ON ue.empresa_id = e.id AND COALESCE(ue.ativo,1)=1
LEFT JOIN usuarios u ON u.id = ue.usuario_id AND COALESCE(u.ativo,1)=1
WHERE e.deleted_at IS NULL
GROUP BY e.id
HAVING SUM(CASE WHEN LOWER(COALESCE(u.role,ue.role,'')) IN ('admin','manager') THEN 1 ELSE 0 END)=0;
```

### I10 / R0 — Inventário canônico de tabelas + detecção de resíduos populados
```sql
-- Liste tabelas reais e cruze com nomes usados pelo tooling
SELECT name FROM sqlite_master
WHERE type='table'
  AND (name LIKE '%\_new' ESCAPE '\'
    OR name LIKE '%\_backup\_%' ESCAPE '\'
    OR name LIKE '%\_temp' ESCAPE '\'
    OR name LIKE '%\_v');
-- Para cada resíduo: SELECT COUNT(*) ... (alerta se populado)
```

---

## 7. Matriz de Risco / Guardrail (módulo × invariante × guard × prioridade)

| Módulo | Invariante | Query | Severidade | Impacto operacional | Ação se falhar | Bloqueia deploy | Bloqueia runtime | Alerta op. | Prioridade |
|---|---|---|---|---|---|---|---|---|---|
| Simuladores | I1 modelo sem manobra | I1/I1b | 🔴 | fichas vazias, avaliação inválida | abortar deploy; preflight | **Sim** | Sim (criar/popular ficha) | Sim | **P0** |
| Simuladores | I2 ficha final sem manobra | I2/I2b | 🔴 | registro regulatório vazio assinado | abortar; investigar | **Sim** | Sim (assinar) | Sim | **P0** |
| Simuladores | I3 relação órfã | I3 | 🟠 | render/contagem errada | corrigir fonte | Não | Não | Sim | P1 |
| Simuladores | I3b ordem duplicada | I3b | 🟠 | ordem ambígua na ficha | dedupe c/ fonte | Não | Sim (insert) | Sim | P1 |
| Multi-tenant | I4 cross-tenant link | I4 | 🟠 | vazamento entre empresas | bloquear escrita | Parcial | Sim | Sim | **P0** |
| Qualificações | I5 tenant/status | I5a/5b | 🔴 | compliance falso | abortar deploy | **Sim** | Não | Sim | P1 |
| LMS | I6 matrícula órfã | I6 | 🟡 | conformidade EAD falsa | corrigir | Não | Não | Sim | P2 |
| FRMS (RO) | I7 jornada | I7a/7b | 🟠 | fadiga sobre dado fantasma | **só relatar** (não tocar FRMS) | Não | Não | Sim | P1 |
| Escalas/EVD | I8 alocação órfã/dup | I8 | 🟠 | bloqueio/alocação falso | corrigir | Não | Não | Sim | P1 |
| Func/RBAC | I9 empresa/usuário | I9 | 🟠 | empresa órfã | corrigir | Parcial | Não | Sim | P1 |
| Todos | I10 resíduos | I10/R0 | 🟠 | fonte de verdade dupla | inventariar/depreciar | Não | Não | Sim | P1 |
| CI/Deploy | R0 detector | I10/R0 | 🔴 | guard verde-falso | corrigir SQL primeiro | **Sim** | n/a | n/a | **P0** |

---

## 8. Riscos que DEVEM bloquear deploy (gate de CI/preflight)

1. **R0** — detector com tabela inexistente (corrigir antes de confiar em qualquer gate).
2. **I1/I1b** — qualquer modelo ativo sem manobra **ou** `modelos_sessao_manobras` abaixo do baseline (canário).
3. **I2** — qualquer ficha em status final sem manobra.
4. **I5** — qualquer qualificação ativa com tenant cruzado.
5. **R5** — PR que adiciona migration com número já existente **ou** seed que reescreve dado operacional sem fonte declarada.
6. **R10/R12** — erros TS 🔴 em caminhos de escrita (`qualificacoes-historico-ficha.ts:416`, `lms-matriculas` `dataExpiracao`).

> Bloqueio de deploy = falha do job de CI (read-only contra staging/local), **nunca** ação corretiva automática.

## 9. Riscos que DEVEM bloquear runtime (guard na rota de escrita)

1. **I1** — `POST popular-manobras` / criação de ficha quando o modelo origem tem 0 manobras → erro explícito
   (estende a defesa já criada no PR #60 com `FICHA_NOT_AVAILABLE_YET`).
2. **I2** — assinar/concluir ficha sem manobras com resultado → recusar com código de erro.
3. **I4** — inserir relação modelo↔manobra de tenants diferentes → recusar.
4. **I3b** — inserir/atualizar manobra de modelo em `ordem` já ocupada → recusar.

> Runtime guards devem ser **fail-closed**, retornar erro de domínio (não 500), e ser cobertos por teste unitário,
> seguindo o padrão de `worker-airtrust/src/utils/ficha-availability.ts` já existente.

---

## 10. Arquitetura — AirTrust Data Integrity Guardrails

```
                        ┌─────────────────────────────────────────┐
                        │  scripts/integrity/ (read-only canônico) │
                        │  - invariants.sql  (todas as queries I*) │
                        │  - run-integrity.mjs (local/staging)     │
                        │  - baseline.json (contagens canário)     │
                        └──────────────┬──────────────────────────┘
        ┌───────────────────┬──────────┼────────────┬───────────────────┐
        ▼                   ▼          ▼            ▼                   ▼
  [1 CI guard]      [2 deploy preflight]  [3 runtime guard]   [4 smoke pós-deploy]  [5 relatório periódico]
  PR/ci.yml         pré-deploy worker     rotas de escrita     pós-deploy           cron diário read-only
  staging/local     gate fail-closed      fail-closed+teste    smoke:integrity      → notificacoes/alerta
  bloqueia merge    bloqueia deploy       erro de domínio      valida P0            → dashboard futuro
```

**Componentes:**
- **Scripts read-only** (`scripts/integrity/invariants.sql` + runner `.mjs`): fonte única das queries I1–I10,
  com `baseline.json` de contagens (canário "tabela zerou / caiu X%"). Substitui e corrige o
  `data-quality-checks-readonly.sql` atual (R0).
- **CI guard** (`ci.yml`): roda invariantes P0 contra DB local/staging efêmero; falha o job se violado.
- **Deploy preflight**: integra ao `deploy-worker-only.sh`/`preflight-clean-deploy.sh` como gate fail-closed.
- **Smoke pós-deploy**: `smoke:integrity:prod` read-only valida apenas P0 (modelo/ficha não-vazios) após deploy.
- **Runtime guard**: utilitários `assertModeloTemManobras()`, `assertFichaCompleta()`, `assertSameTenant()`
  nas rotas de escrita de Simuladores (padrão do PR #60).
- **Relatório periódico**: cron diário read-only (reusa janela `0 8 * * *`) gera snapshot de invariantes →
  `notificacoes_sistema` / e-mail para admin.
- **Dashboard futuro**: página `/sistema/integridade` consumindo o snapshot (somente leitura).

---

## 11. Plano por Ondas

### Onda 0 — Auditoria read-only sem risco (ESTE DOCUMENTO + execução local)
- [x] Mapear invariantes, queries, matriz (este doc).
- [ ] Inventário canônico de tabelas (`sqlite_master`) local + cruzamento com nomes usados no tooling (R0/I10).
- [ ] Rodar I1–I10 **localmente** (cópia/staging) e registrar baseline. Sem produção sem autorização.

### Onda 1 — Guards de CI + scripts read-only (sem tocar banco/runtime)
- [ ] Criar `scripts/integrity/invariants.sql` corrigido + runner; depreciar o SQL drifted.
- [ ] `baseline.json` (canário de contagens).
- [ ] Job de CI fail-closed para P0 (I1/I1b/I2/I5) + guard de migration-número-duplicado + guard seed-sem-fonte (R5).
- [ ] Corrigir TS 🔴 R10/R12 (caminhos de escrita) — fora do banco.

### Onda 2 — Bloqueios runtime sem migration
- [ ] `assertModeloTemManobras` / `assertFichaCompleta` / `assertSameTenant` / `assertOrdemUnica` nas rotas de escrita Simuladores.
- [ ] Testes unitários por guard (padrão `simuladores-fichas-tenant-write.test.ts`).
- [ ] Smoke `smoke:integrity:prod` read-only no pós-deploy.

### Onda 3 — Constraints / migrations (SOMENTE com plano de rollback)
- [ ] `UNIQUE(modelo_id, ordem)` em `modelos_sessao_manobras` (I3b) — após dedupe verificado.
- [ ] Avaliar `empresa_id` denormalizado nas tabelas de ligação (I4) com backfill auditável.
- [ ] Depreciar/arquivar resíduos `*_new`/`*_backup_`/`*_temp` (I10) com migração nomeada e rollback.
- [ ] Remover/condicionar auto-migration cold start (R6).
- Cada item: dry-run + snapshot + plano de rollback documentado (padrão do incidente).

### Onda 4 — Monitoramento / alertas
- [ ] Cron read-only diário → snapshot de invariantes.
- [ ] Alerta operacional (notificacoes_sistema/e-mail) em violação P0.
- [ ] Dashboard `/sistema/integridade` (read-only).

---

## 12. Roteamento de Tarefas por Agente

> Critério: complexidade de raciocínio cross-módulo e risco de produção. Onda 0/1 read-only ≠ risco;
> Onda 2 mexe em runtime; Onda 3 mexe em banco (máxima cautela).

### Podem ir para **Sonnet 4.6** (escopo estreito, padrão claro, baixo risco)
- Onda 0: inventário `sqlite_master` e cruzamento de nomes (mecânico).
- Onda 1: reescrever `invariants.sql` com nomes corrigidos a partir desta matriz; gerar `baseline.json`.
- Onda 1: guard de número-de-migration-duplicado (extensão de `guard-no-new-empresa-default1.sh`).
- Onda 1: corrigir TS R12 (`dataExpiracao`→`data_expiracao`, renome local).
- Onda 2: testes unitários dos guards a partir de specs já escritas.

### Exigem **Codex 5.4** (multi-arquivo, integração CI/rotas, médio risco)
- Onda 1: job de CI fail-closed + integração com `ci.yml`/preflight.
- Onda 2: implementar runtime guards de Simuladores + fiação nas rotas de escrita + smoke pós-deploy.
- Onda 1: corrigir TS R10 (`qualificacoes-historico-ficha.ts:416`) com auditoria de assinatura.
- Onda 4: cron read-only + despacho de alerta.

### Exigem **Codex 5.5** (raciocínio sistêmico, risco de produção/banco, rollback)
- Onda 3: qualquer constraint/migration (`UNIQUE(modelo_id,ordem)`, `empresa_id` em ligação, depreciar resíduos,
  remover auto-migration cold start) — requer dry-run, snapshot, plano de rollback e autorização explícita.
- Onda 0→1: decisão de fonte canônica entre `fichas_sessao_manobras` × `fichas_simulador_manobras` × `avaliacoes_manobras`
  (resolver ambiguidade arquitetural antes de enforce).
- Onda 4: design do dashboard de integridade e política de severidade/alerta.

---

## 13. Restrições Confirmadas Nesta Fase
- Banco alterado: **não** · DML/migration: **não** · deploy: **não**
- SIGVOOS: **intocado** · FRMS: **intocado** · `frms-source-policy.ts`: **intocado**
- `git add .`/`-A`: **não usado** · commit: **não**
- Único artefato criado: este documento (untracked).
