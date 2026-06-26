# AIRTRUST — AUDITORIA INDEPENDENTE OPUS — LMS MANUTENÇÃO / SCORM / RECUPERAÇÃO DE PROGRESSO

**Data:** 2026-06-26
**Auditor:** Opus 4.8 (esforço alto) — papel: auditor técnico independente, read-only
**Modo:** sem escrita em produção, sem migration, sem deploy, sem alteração de matrícula/qualificação, sem substituição de pacote SCORM
**Branch auditada:** `docs/lms-scorm-package-audit-20260626` (HEAD `6f89eb0`)

---

## 1. Resumo executivo

A auditoria cruzou as evidências reais do repositório (docs committados, rotas LMS, testes, scripts e handoffs SCORM) contra o "estado conhecido" descrito no briefing. **A conclusão central é que vários pressupostos do briefing não são sustentados por nenhum artefato no repositório**, e que o caminho de "conclusão manual" hoje recomendado roteia por um endpoint que gera qualificação aeronáutica **sem qualquer gate de evidência**.

Achados de maior peso:

1. **Não existe o endpoint `POST /api/lms/matriculas/:id/progresso-recuperacao`.** Grep em todo `worker-airtrust/src/` retorna zero. O único artefato de recuperação é um **script** estático e read-only ([scripts/restore-lms-progress-dry-run.mjs](scripts/restore-lms-progress-dry-run.mjs)) com IDs placeholder e posições estimadas. Não há `apply`, não há `rollback`, não há RBAC, não há monotonicidade *executada em código* — apenas templates de SQL em texto.
2. **As afirmações sobre o pacote AW139 publicado não têm lastro no repositório.** Os termos `FIXED.zip`, `AW139_Manutencao_SCORM12_AirTrust`, `imgOnly`, `54 slides`, `PUBLISHED_PACKAGE_MISMATCH`, `crosswalk` e `380 → 405` **não aparecem em nenhum arquivo** (`docs/`, `worker-airtrust/src/`, `scripts/`). O doc committado classifica AW139 como `AW139_BLOCKED_REAL_PACKAGE_EXPORT_REQUIRED` e diz que slides em branco "não confirmados nem descartados".
3. **O caminho de conclusão manual é perigoso.** O script recomenda usar `PATCH /api/lms/matriculas/:id/status` para os casos `MANUAL_COMPLETION_REQUIRES_APPROVAL`. Esse endpoint ([lms-matriculas.ts:1967](worker-airtrust/src/routes/lms-matriculas.ts:1967)) está aberto a **manager** e, ao marcar `CONCLUIDO`, **gera qualificação incondicionalmente** ([lms-matriculas.ts:2024](worker-airtrust/src/routes/lms-matriculas.ts:2024)), **sem o gate de evidência SCORM** que existe no `/finalizar`. É um bypass do controle de segurança.
4. O bug de backend (progresso derivado do commit de entrada) **já foi corrigido** em PR #153 + #156 — está fora do escopo de "ainda quebrado".

**Veredito de postura:** na dúvida, bloquear. O incidente permanece aberto e nenhuma escrita em aluno real deve ocorrer.

---

## 2. Veredito geral

| Eixo | Decisão |
|---|---|
| Causa raiz | `MIXED_ROOT_CAUSE_CONFIRMED` |
| Publicação AW139 | `AW139_NOT_SAFE_FOR_STUDENT_USE` + `REAL_PACKAGE_EXPORT_REQUIRED` (mismatch alegado **não comprovado**) |
| Endpoint de recuperação | `RECOVERY_ENDPOINT_BLOCKED` (não existe como endpoint; caminho atual `NOT_SAFE`) |
| Conclusão manual | `NO_MANUAL_COMPLETION_WITH_CURRENT_EVIDENCE` |
| Restauração de aluno | `STUDENT_RESTORE_ONLY_AFTER_DRY_RUN` |
| Estado do incidente | `INCIDENT_STILL_OPEN` |

---

## 3. Causa raiz mais provável

Classificação: **`MIXED_ROOT_CAUSE`**, com a seguinte decomposição por camada:

- **AirTrust (backend) — em grande parte RESOLVIDO.** A causa "progresso baixo com location alta" (worker calculava progresso do payload de entrada, não do estado reconciliado) foi corrigida em PR #153/#156. O merge defensivo, derivação de `progresso_pct` a partir do `lesson_location` reconciliado e anti-regressão estão cobertos por 13 testes em [lms-matriculas-progress-integrity.test.ts](worker-airtrust/src/__tests__/routes/lms-matriculas-progress-integrity.test.ts).
- **Pacote SCORM — NÃO AUDITADO, provável contribuinte.** Resume quebrado (regressão de Alan Cortes), `suspend_data`/`LMSFinish` ausentes e slides em branco (módulos 12–14) são **hipóteses não confirmadas** — exigem exportação do pacote real do R2, que esta fase não teve acesso.
- **Remediação de dados históricos — problema aberto e real.** Alunos perderam progresso/relatam conclusões. É aqui que mora o risco operacional atual.
- **Pipeline de publicação — ALEGADO, não comprovado.** O briefing afirma "banco mostra FIXED.zip mas R2 serve runtime divergente". Não há no repositório qualquer evidência (hash, listagem R2, diff) que sustente isso.

**Respostas diretas:**

- *O problema principal atual é pacote, AirTrust ou publicação parcial?* → Predominantemente **remediação histórica + pacote não verificado**. O AirTrust já não é a causa ativa principal. "Publicação parcial" é hipótese sem prova.
- *O endpoint de recuperação resolve qual parte?* → No máximo a parte de **reposição de progresso perdido** (restaurar `lesson_location`). Não resolve pacote nem publicação. E hoje ele **não existe**.
- *O endpoint pode piorar algo sem pacote correto?* → **Sim.** Restaurar progresso para um pacote que ainda regride/zera fará o aluno perder de novo (efeito nulo no melhor caso); pior, qualquer caminho que toque conclusão/qualificação cria registro falso permanente.
- *AW139 está quebrado por quê?* → **Indeterminado com a evidência atual.** Há sinais de problema de comunicação SCORM (resume) e suspeita de conteúdo, mas nada foi medido no pacote publicado real.

---

## 4. Pontos comprovados (com evidência)

1. **Não há endpoint de recuperação.** `grep -rn "progresso-recuperacao" worker-airtrust/src/` → 0 ocorrências. Recuperação = [scripts/restore-lms-progress-dry-run.mjs](scripts/restore-lms-progress-dry-run.mjs), read-only.
2. **O script é dry-run real:** imprime/serializa um plano; nenhuma escrita, nenhuma conexão a DB. IDs (`matriculaId`, `funcionarioId`, `cursoId`, `empresaId`) são `null`/placeholder ([linhas 59–62, 232–237](scripts/restore-lms-progress-dry-run.mjs:59)).
3. **O script de auditoria de pacote é read-only:** importa apenas `node:fs` read (`existsSync, readdirSync, readFileSync, statSync`), sem DB/fetch ([audit-scorm-maintenance-packages.mjs:1](scripts/audit-scorm-maintenance-packages.mjs:1)).
4. **`PATCH /:id/status` gera qualificação sem gate de evidência** e é acessível a `manager` ([lms-matriculas.ts:1967, 2024](worker-airtrust/src/routes/lms-matriculas.ts:1967)).
5. **`POST /:id/finalizar` TEM gate de evidência SCORM** — rejeita com `409 SCORM_COMPLETION_REJECTED` quando não há candidato auditável ([lms-matriculas.ts:1840-1869](worker-airtrust/src/routes/lms-matriculas.ts:1840)). Ou seja, **o controle existe, mas o `PATCH /status` o contorna**.
6. **`audit_logs` (migration 0332) já existe** e suporta a trilha proposta sem nova migration.
7. **AW139 fixture = `380/380`** ([test:119](worker-airtrust/src/__tests__/routes/lms-matriculas-progress-integrity.test.ts:119)); totais de slides por curso são fixtures de teste, podem divergir do real (declarado no próprio handoff).
8. **Bug de progresso já corrigido** (PR #153/#156), confirmado pelos commits `30da7fd`/`2203111` e pelos testes verdes de reconciliação.

---

## 5. Hipóteses NÃO comprovadas (tratar como não-fato)

1. ❌ "Endpoint `progresso-recuperacao` implementado com dry-run/apply/rollback" — **não existe**.
2. ❌ "Classificação `PROGRESS_RECOVERY_ENDPOINT_READY_FOR_PR`" — string ausente do repositório.
3. ❌ "Banco registra `AW139_Manutencao_SCORM12_AirTrust_FIXED.zip`" — string ausente.
4. ❌ "R2 serve `course_data.js`/`app.js`/`scorm_api.js` divergentes do ZIP" — nenhuma evidência; esta fase **não teve acesso ao R2**.
5. ❌ "54 slides `imgOnly` nos módulos 13–18" — ausente; o handoff fala em **suspeita** nos módulos 12–14, **não confirmada**.
6. ❌ "`AW139_PUBLISHED_PACKAGE_MISMATCH`" — string ausente.
7. ❌ "Compatibilidade `380 → 405` exige mapeamento / crosswalk" — `405` e `crosswalk` não aparecem em nenhum contexto SCORM; a única contagem é **380**.
8. ❌ "35/35 testes LMS correlatos" — o arquivo de integridade tem **13 testes**; o número 35 pode somar outros arquivos, mas **não há testes do endpoint de recuperação** porque o endpoint não existe.
9. ❓ Slides em branco, resume quebrado por pacote, posições exatas de módulo — todos **NEEDS REAL PACKAGE**.

> Observação de auditoria: o briefing descreve um estado mais avançado do que o repositório comprova. Toda decisão abaixo trata o repositório como fonte de verdade.

---

## 6. Riscos críticos

| # | Risco | Severidade | Evidência |
|---|---|---|---|
| R1 | `PATCH /:id/status` cria qualificação aeronáutica de Manutenção a partir de um relato verbal, sem evidência SCORM, no nível **manager** | **CRÍTICO** | [lms-matriculas.ts:1967, 2024](worker-airtrust/src/routes/lms-matriculas.ts:2024) |
| R2 | O script orienta operadores a usar exatamente esse endpoint para os casos "concluiu" | **CRÍTICO** | [script:263-270](scripts/restore-lms-progress-dry-run.mjs:263) |
| R3 | Restaurar progresso antes de corrigir o pacote → aluno perde de novo; falsa sensação de resolução | ALTO | handoff AW139 §2.1 |
| R4 | Template SQL de `apply` tem **erro de sintaxe** (vírgula faltando entre `cmi_json` e `datetime('now')`) — o SQL não parseia; o "apply path" nunca foi validado | ALTO | [script:326-327](scripts/restore-lms-progress-dry-run.mjs:326) |
| R5 | Posições-alvo (`40/380`, `60/380`, `18/108`) são **estimativas** ("se módulos uniformes"), não medidas | MÉDIO | [script:52, 158](scripts/restore-lms-progress-dry-run.mjs:52) |
| R6 | Sem acesso ao R2, é impossível confirmar ou refutar o mismatch de publicação — o incidente fica em estado indeterminado | ALTO | doc principal Block 2/3 |
| R7 | `empresa_id = 6` é assumido, não confirmado | MÉDIO | doc principal Block 1, nota |

---

## 7. Avaliação AW139

**Estado comprovável:** apenas a fixture `380/380` e relatos operacionais (regressão de Alan; suspeita de slides em branco 12–14). Nada do pacote publicado real foi medido. O ZIP "corrigido" alegado no briefing **não está no repositório** e não há hash/diff que prove correspondência ou divergência com o R2.

**Respostas críticas:**

- *ZIP corrigido local é bom?* → **Impossível afirmar** — não há ZIP no repo.
- *Pacote publicado não corresponde ao ZIP?* → **Não comprovado** — sem export R2.
- *Risco `380 → 405` identificado corretamente?* → **Não existe no material**; a evidência só aponta 380. Tratar como ruído até prova.
- *Crosswalk é suficiente/perigosa?* → Não há crosswalk no repo para avaliar; **propor crosswalk antes de medir o pacote real é prematuro e perigoso** (mapeia posições inventadas).
- *Aceitável manter o pacote publicado atual?* → **Não para uso de aluno** enquanto resume/conclusão não forem provados no player real.
- *Próximo passo?* → **Exportar + auditar o pacote real**, depois decidir republicar vs rollback. Não republicar às cegas.

**Decisões AW139:**
- `AW139_NOT_SAFE_FOR_STUDENT_USE` ✅ (precaução)
- `REAL_PACKAGE_EXPORT_REQUIRED` ✅ (gate para tudo)
- `AW139_REPUBLISH_FIXED_ZIP_REQUIRED` → **BLOQUEADO** (não há ZIP comprovado)
- `AW139_ROLLBACK_REQUIRED` → **INDETERMINADO** (rollback não confirmado; precisa saber o que havia antes)
- `AW139_COMPATIBILITY_MAPPING_REQUIRED` → **REJEITADO por ora** (sem base 405)
- `AW139_READY_FOR_FIXTURE` → **NÃO** (fixture segura não validada)

---

## 8. Avaliação do endpoint de recuperação

Como o endpoint **não existe**, avalio (a) o script atual e (b) os requisitos para um futuro endpoint.

**(a) Script atual:**
- `dry-run não escreve?` → **Sim**, comprovado (sem DB/fetch/fs-write).
- `apply é monotônico?` → O template usa `MAX(...)` e `CASE` anti-regressão — **intenção correta**, mas **não executada** e com **bug de sintaxe** (R4). Logo: não validado.
- `apply impede conclusão?` → Para `RESTORE_PROGRESS_ONLY`, sim (status forçado a `EM_ANDAMENTO`, `lesson_status` nunca `passed`). Mas o script **encaminha** os casos "concluiu" para o `PATCH /status` ungated → **na prática, o conjunto não impede conclusão**.
- `apply impede qualificação?` → No template de restauração, sim. No caminho recomendado para `MANUAL_COMPLETION`, **não** (R1/R2).
- `rollback é seguro?` → **Não existe rollback executável**; só a frase "reverter `old_values`". Sem código, sem garantia.
- `audit_logs suficiente?` → Estrutura sim; mas o template depende de preencher snapshot manualmente (`{PREENCHER: snapshot do step 1}`) — frágil.
- `precisa migration?` → **Não** para a trilha de auditoria.
- `permissões admin/manager suficientes?` → **Não.** Restauração de progresso e, sobretudo, conclusão **não devem** estar ao alcance de `manager`. Há risco real de manager alterar aluno indevidamente (R1).

**(b) Requisitos para promover a endpoint (se um dia for implementado):**
1. Escopo **estritamente** `RESTORE_PROGRESS_ONLY`: nunca `CONCLUIDO`, nunca `score`, nunca qualificação.
2. **admin-only** (`requireRole('admin')`), não manager.
3. Monotonicidade e anti-regressão em código testado (não em string).
4. `rollback` real, idempotente, lendo `audit_logs.old_values`.
5. **Fechar o bypass `PATCH /status`**: adicionar o mesmo gate de evidência do `/finalizar`, ou remover a geração de qualificação desse endpoint.
6. Testes dedicados de apply/rollback/monotonicidade/negação-de-conclusão antes do PR.

**Decisão:** `RECOVERY_ENDPOINT_BLOCKED` — combina `RECOVERY_ENDPOINT_NEEDS_MORE_TESTS` + `RECOVERY_ENDPOINT_REQUIRES_RBAC_HARDENING` + `RECOVERY_ENDPOINT_NOT_SAFE` (no caminho de conclusão). **Não pode ir para PR como "pronto".**

---

## 9. Avaliação da matriz de alunos afetados

| Aluno | Curso | Relato | Classificação validada | Pode dry-run? | Pode apply hoje? | Nunca concluir com evidência atual? |
|---|---|---|---|---|---|---|
| Alan Cortes | AW139 | passou módulo 6, voltou (regressão) | `RESTORE_PROGRESS_ONLY` (posição estimada) | **Sim** | Não (posição não medida) | — |
| Bruno Justino | AW139 | até módulo 4 | `RESTORE_PROGRESS_ONLY` (estimada) | **Sim** | Não | — |
| Bruno Justino | PT6C-67C | até módulo 2 | `RESTORE_PROGRESS_ONLY` (estimada) | **Sim** | Não | — |
| Bruno Justino | HUMS-VXP / MGM / SGSO / Integração | "concluí" | `MANUAL_COMPLETION_REQUIRES_APPROVAL` | Não-conclusivo | **Não** | **Sim** |
| Francisco Altemir | Inspeção IIO & APRS | "concluí" | `MANUAL_COMPLETION_REQUIRES_APPROVAL` | Não-conclusivo | **Não** | **Sim** |
| Wagner Domas | AW139 | "avançado/prova" (vago) | `NEEDS_MORE_EVIDENCE` | Não | **Não** | **Sim** (sem evidência) |

**Respostas diretas:**
- *Quem pode receber só dry-run?* → Alan e Bruno (AW139/PT6) — para **visualizar** o plano de reposição de posição.
- *Quem pode futuramente receber apply?* → Os mesmos, **somente após** (1) pacote corrigido, (2) posição de módulo medida no pacote real, (3) IDs reais preenchidos, (4) endpoint/rotina endurecido.
- *Quem nunca deve ser concluído com a evidência atual?* → Todos os casos "concluí" (Bruno x4, Francisco) e Wagner. Relato verbal ≠ conclusão.
- *Que evidência adicional pedir?* → Para conclusões: print do slide final com `lesson_status=passed`, data/horário, e aprovação formal do gestor; idealmente o `cmi_json`/`audit_logs` da época. Para Wagner: posição exata, nº de tentativas de quiz e score documentado. Para posições de Alan/Bruno: confirmar o slide de fim de módulo no pacote real.

---

## 10. Ordem segura recomendada

Revisada criticamente a partir do exemplo do briefing (que assume um ZIP corrigido inexistente):

1. **Confirmar `empresa_id` e rodar o SQL de descoberta (Block 1)** para obter IDs reais (read-only).
2. **Obter acesso de leitura ao R2 e exportar** os pacotes de Manutenção para pasta git-ignored.
3. **Auditar o pacote AW139 real** com `scripts/audit-scorm-maintenance-packages.mjs` (manifest, launch, resume, slides 12–14, 404s). Registrar **hashes**.
4. **Decidir AW139:** republicar (se houver ZIP corrigido validado) **ou** rollback (se houver versão anterior boa). Só então confirmar o estado do R2.
5. **Endurecer antes de qualquer escrita:** fechar o bypass `PATCH /status` (gate de evidência) e, se for criar endpoint de recuperação, torná-lo admin-only e `RESTORE_PROGRESS_ONLY`.
6. **Corrigir o template/rotina de apply** (bug R4) e adicionar testes de apply/rollback/monotonicidade.
7. **Rodar dry-run com IDs reais** para Alan e Bruno; revisar com o gestor.
8. **Aplicar apenas `RESTORE_PROGRESS_ONLY` autorizado**, com snapshot em `audit_logs`, em posição **medida** (não estimada).
9. **Validar com o aluno** no player real (resume + avanço).
10. **Só então** discutir conclusão/qualificação histórica — exclusivamente via aprovação formal documentada e evidência, nunca por relato.

> Diferença-chave vs. o exemplo do briefing: os passos 1–4 (descoberta + export + auditoria + decisão de pacote) **precedem** qualquer publicação de ferramenta de recuperação, e o endurecimento do `PATCH /status` é **pré-requisito**, não opcional.

---

## 11. Bloqueios

- `B1` **REAL_PACKAGE_EXPORT_REQUIRED** — sem acesso ao R2, AW139 e todos os cursos de Manutenção ficam indeterminados.
- `B2` **RECOVERY_ENDPOINT_BLOCKED** — endpoint inexistente; script com bug de apply (R4 — corrigido em 2026-06-26) e caminho de conclusão atualizado (R2 — guidance corrigida em 2026-06-26).
- `B3` ~~**RBAC_HARDENING_REQUIRED**~~ → **FECHADO** — corrigido em PR #159 (2026-06-26): `PATCH /status` agora exige `admin` para conclusão com qualificação e gate SCORM antes de qualquer escrita.
- `B4` **POSITIONS_NOT_MEASURED** — posições de módulo são estimativas; apply proibido até medição.
- `B5` **APPROVAL_REQUIRED** — todos os casos de conclusão pendem de aprovação formal + evidência.
- `B6` **IDS_NOT_CONFIRMED** — `empresa_id`/`matricula_id` reais não preenchidos.

---

## 12. O que NÃO fazer

- ❌ Não usar `PATCH /:id/status` para "registrar conclusão" dos casos relatados — gera qualificação falsa.
- ❌ Não publicar/promover o script como "endpoint pronto para PR".
- ❌ Não republicar pacote AW139 sem export + auditoria + hash do pacote real.
- ❌ Não aplicar restauração com posições estimadas.
- ❌ Não rodar o template SQL de `apply` atual (sintaxe inválida) contra produção.
- ❌ Não concluir nenhum aluno nem gerar nenhuma qualificação com a evidência atual.
- ❌ Não declarar o incidente resolvido com base em testes locais verdes ou smoke básico.
- ❌ Não tratar relato verbal de aluno como evidência de conclusão.

---

## 13. Decisão final

| Código | Status |
|---|---|
| `MIXED_ROOT_CAUSE_CONFIRMED` | ✅ |
| `AW139_PUBLICATION_MISMATCH_BLOCKS_RECOVERY` | ⚠️ **mismatch NÃO comprovado** — bloqueio real é `REAL_PACKAGE_EXPORT_REQUIRED`/`AW139_NOT_SAFE_FOR_STUDENT_USE` |
| `RECOVERY_ENDPOINT_CAN_PROCEED_TO_PR` | ❌ |
| `RECOVERY_ENDPOINT_BLOCKED` | ✅ (B2: script com bug R4 **corrigido** + guidance R2 **atualizada** em 2026-06-26) |
| `STUDENT_RESTORE_ONLY_AFTER_DRY_RUN` | ✅ |
| `NO_MANUAL_COMPLETION_WITH_CURRENT_EVIDENCE` | ✅ |
| `INCIDENT_STILL_OPEN` | ✅ |

### Correções aplicadas após auditoria (2026-06-26)

| Item | Correção | PR/Commit |
|---|---|---|
| R1 — bypass `PATCH /status` (manager gera qualificação sem evidência) | Gate SCORM + restrição admin | PR #159 |
| R2 — script orienta caminho inseguro para conclusão manual | Guidance atualizada: endpoint agora bloqueia sem evidência, processo correto documentado | PR #159 (mesmo commit) |
| R3 — restaurar antes de corrigir pacote | Bloqueio operacional — aguarda B1 (R2 export) | BLOQUEADO |
| R4 — vírgula faltando no SQL do upsert SCORM | Correção da vírgula em `restore-lms-progress-dry-run.mjs` | PR #159 (mesmo commit) |
| R5 — posições estimadas | Bloqueio de dados — aguarda B1 (R2 export + auditoria do pacote) | BLOQUEADO |
| R6 — sem acesso ao R2 | Bloqueio de infra — requer credenciais | BLOQUEADO |
| R7 — empresa_id=6 assumido | Bloqueio de dados — confirmar via SQL de descoberta | BLOQUEADO |

**Síntese:** `MIXED_ROOT_CAUSE_CONFIRMED` · `RECOVERY_ENDPOINT_BLOCKED` · `AW139_NOT_SAFE_FOR_STUDENT_USE` (REAL_PACKAGE_EXPORT_REQUIRED) · `STUDENT_RESTORE_ONLY_AFTER_DRY_RUN` · `NO_MANUAL_COMPLETION_WITH_CURRENT_EVIDENCE` · `INCIDENT_STILL_OPEN`.

O backend já não é a causa ativa principal; o risco vivo é **remediação histórica feita por um caminho inseguro** somada a um **pacote não auditado**. Antes de tocar qualquer aluno: exportar/auditar pacote, medir posições, endurecer `PATCH /status`, e só então dry-run → apply restrito. Nenhuma conclusão/qualificação com a evidência atual.

---

### Anexo A — Comandos de verificação (read-only) usados

```
grep -rn "progresso-recuperacao" worker-airtrust/src/        # → 0
grep -rl "FIXED.zip|imgOnly|PUBLISHED_PACKAGE_MISMATCH|crosswalk" docs worker-airtrust/src scripts  # → 0
```

### Anexo B — Discrepâncias briefing × repositório

| Briefing ("estado conhecido") | Repositório (fonte de verdade) |
|---|---|
| Endpoint recuperação implementado (dry/apply/rollback) | Apenas script dry-run; sem apply/rollback em código |
| `PROGRESS_RECOVERY_ENDPOINT_READY_FOR_PR` | String ausente |
| DB registra `...FIXED.zip` | String ausente |
| R2 serve runtime divergente | Sem acesso/sem evidência |
| 54 slides `imgOnly` módulos 13–18 | Suspeita não confirmada, módulos 12–14 |
| Compat `380 → 405` | Sem base; só 380 |
| 35/35 testes LMS | Arquivo de integridade tem 13; sem testes de endpoint de recuperação |
