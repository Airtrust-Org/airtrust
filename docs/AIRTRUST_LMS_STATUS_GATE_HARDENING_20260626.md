# AIRTRUST LMS — STATUS GATE HARDENING

**Data:** 2026-06-26
**Branch:** `codex/lms-status-gate-hardening-20260626`
**Base:** `origin/main` (HEAD `060c8cc`)

---

## 1. Resumo executivo

Risco crítico identificado pela auditoria independente Opus (`AIRTRUST_OPUS_LMS_MANUTENCAO_INDEPENDENT_AUDIT_20260626.md`, risco R1/R2): o endpoint `PATCH /api/lms/matriculas/:id/status` permitia marcar qualquer matrícula como `CONCLUIDO` e gerar qualificação aeronáutica sem nenhuma verificação de evidência SCORM. Este hotfix fecha o bypass adicionando o mesmo gate de evidência que já existia em `POST /:id/finalizar`, mais restrição de papel para operações que geram qualificação.

**Decisão final:** `PATCH_STATUS_BYPASS_CONFIRMED_AND_FIXED` · `LMS_STATUS_GATE_HARDENED_READY_FOR_DEPLOY`

---

## 2. Achado da auditoria independente

- **R1 (CRÍTICO):** `PATCH /:id/status` com `requireRole('admin', 'manager')` + corpo `{status:'CONCLUIDO'}` escrevia o banco e chamava `createLmsQualificationOnCompletion()` incondicionalmente quando o curso tinha `qualificacao_tipo_id` — sem consultar `lms_progresso_scorm`, sem rodar `buildMatriculaCompletionDiagnostic`, sem checar `lesson_status`.
- **R2 (CRÍTICO):** o script de recuperação de progresso (`scripts/restore-lms-progress-dry-run.mjs`) orientava usar exatamente esse endpoint para casos `MANUAL_COMPLETION_REQUIRES_APPROVAL`, tornando o bypass o caminho documentado.

---

## 3. Realidade encontrada no código

### `PATCH /:id/status` antes do hotfix

```
1. Busca matrícula (SELECT sem tipo_conteudo/scorm_mastery_score/progresso_pct)
2. UPDATE lms_matriculas SET status = 'CONCLUIDO'  ← sem gate
3. IF qualificacao_tipo_id → createLmsQualificationOnCompletion()  ← sem evidência
4. logAudit
5. retorna 200
```

### `POST /:id/finalizar` (referência — tinha o gate certo)

```
1. Busca matrícula + lms_progresso_scorm
2. buildMatriculaCompletionDiagnostic(...)
3. IF scorm && !explicit_completion && !can_finalize → 409 SCORM_COMPLETION_REJECTED
4. ELSE: UPDATE + createLmsQualification + logAudit
```

---

## 4. Diferença entre os dois caminhos

| Critério | `/finalizar` (antes) | `PATCH /status` (antes) |
|---|---|---|
| Consulta `lms_progresso_scorm` | Sim | Não |
| Roda `buildMatriculaCompletionDiagnostic` | Sim | Não |
| Gate de evidência SCORM | Sim → 409 | Não → escreve direto |
| Gate de papel para qualificação | Não (manager/admin/aluno) | Não (manager/admin) |
| Auditoria de rejeição | Sim | Não |

---

## 5. Risco de qualificação falsa

Um manager com acesso ao tenant poderia fazer:

```http
PATCH /api/lms/matriculas/200/status
Content-Type: application/json

{"status":"CONCLUIDO","observacoes":"relato verbal do aluno"}
```

E isso geraria uma qualificação aeronáutica real em produção — sem que o aluno tivesse completado nenhum módulo SCORM. Para cursos de Manutenção AW139 com `gerar_qualificacao_ao_concluir = true`, isso representava risco regulatório real.

---

## 6. Correção aplicada

**Arquivo:** `worker-airtrust/src/routes/lms-matriculas.ts`

**Mudanças:**

1. **SELECT expandido** — adiciona `c.tipo_conteudo`, `c.scorm_mastery_score` e `m.progresso_pct` à query inicial do endpoint, para alimentar o diagnóstico de conclusão.

2. **Gate de papel (admin)** — se `status === 'CONCLUIDO'` e o curso tem `qualificacao_tipo_id`, exige `hasRole(c, 'admin')`. Manager retorna 403. Managers podem continuar alterando outros status (EM_ANDAMENTO, CANCELADO, etc.).

3. **Gate de evidência SCORM** — se `status === 'CONCLUIDO'` e `tipo_conteudo === 'scorm'` (ou null/padrão): busca `lms_progresso_scorm` e roda `buildMatriculaCompletionDiagnostic`. Se `!explicit_completion && !can_finalize`: loga `SCORM_COMPLETION_REJECTED` em `audit_logs` e retorna 409 — **sem escrever na matrícula, sem gerar qualificação**.

4. **Posição do gate** — o gate ocorre **antes** de qualquer `UPDATE lms_matriculas`, garantindo que uma rejeição não deixa a matrícula em estado inconsistente.

5. **Conteúdo não-SCORM** — cursos com `tipo_conteudo = 'pdf'`, `'video'`, etc. não passam pelo gate SCORM. O fluxo de qualificação (gate de papel admin) ainda se aplica.

---

## 7. Testes

**Arquivo:** `worker-airtrust/src/__tests__/routes/lms-matriculas-status-gate.test.ts`

| # | Cenário | Esperado | Status |
|---|---|---|---|
| 1 | Manager CONCLUIDO + `qualificacao_tipo_id` | 403, sem escrita, sem qualificação | ✅ |
| 2 | Admin CONCLUIDO + SCORM + sem evidência (null) | 409 `SCORM_COMPLETION_REJECTED`, sem escrita, sem qualificação, audit log | ✅ |
| 3 | Admin CONCLUIDO + SCORM + score alto mas `lesson_status=incomplete` | 409 (score alto ≠ conclusão) | ✅ |
| 4 | Admin CONCLUIDO + SCORM + `lesson_status=passed` (evidência robusta) | 200, escrita, qualificação gerada 1 vez | ✅ |
| 5 | Admin CONCLUIDO + PDF (não-SCORM) | 200, sem gate SCORM, qualificação gerada | ✅ |
| 6 | Manager `EM_ANDAMENTO` | 200, sem gate, sem qualificação | ✅ |
| 7 | Manager CONCLUIDO + curso sem `qualificacao_tipo_id` | 200 (gate admin não dispara, gate SCORM ainda ativo) | ✅ |
| 8 | Manager/Admin CANCELADO | 200, sem gate, sem qualificação | ✅ |

Regressão completa LMS: **56/56** passando (integrity + status-gate + progresso + assets-resume + cursos-beta + relatorios).

**Lint:** PASS | **Build:** verde (12 s)

---

## 8. Pendências (fora do escopo deste hotfix)

- Recuperação de progresso dos alunos afetados (Bruno Justino, Alan Cortes, Wagner Domas, Francisco Altemir): ainda exige auditoria do pacote AW139 real no R2.
- Exportação do pacote AW139 do R2 e auditoria de resume/conclusão.
- Correção do template SQL do script `restore-lms-progress-dry-run.mjs` (bug de sintaxe identificado na auditoria).
- Remoção/correção da orientação no script que recomendava `PATCH /status` para conclusão manual.

---

## 9. O que não foi feito

- Recuperação de progresso de alunos reais.
- Substituição de pacote SCORM.
- Migration/SQL aplicado em produção.
- Alteração de dados de matrícula.
- Geração de qualificação manual.

---

## 10. Decisão final

| Código | Status |
|---|---|
| `PATCH_STATUS_BYPASS_CONFIRMED_AND_FIXED` | ✅ |
| `LMS_STATUS_GATE_HARDENED_READY_FOR_DEPLOY` | ✅ |
| `MANUAL_COMPLETION_REQUIRES_SEPARATE_POLICY` | ✅ (gate ativo; conclusão manual requer evidência SCORM robusta) |
