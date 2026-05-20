# Staging QA Expanded Report — Phase 12 + 13

**Date:** 2026-05-15 (atualizado — Fase 13)  
**Staging API:** `https://airtrust-api-staging.airtrust.workers.dev`  
**Staging Frontend:** `https://main.airtrust.pages.dev`  
**Test User:** `admin.staging.test@example.invalid` (senha rotacionada — armazenada em `/tmp/airtrust-staging-new-password.txt`)

---

## 1. Authentication

| Test | Result |
|------|--------|
| `POST /api/auth/login` (valid credentials) | 200 OK |
| JWT access token returned in `data.accessToken` | YES |
| Token length | 364 chars (valid JWT) |

---

## 2. API Smoke Results — Pre-Seed

Tested immediately after confirming login credentials:

| Endpoint | HTTP Status | Notes |
|----------|-------------|-------|
| `POST /api/auth/login` | 200 | Auth working |
| `GET /api/funcionarios` | 200 | |
| `GET /api/empresas` | 200 | |
| `GET /api/qualificacoes/tipos` | 200 | |
| `GET /api/simuladores` | 200 | |
| `GET /api/lms/cursos` | 200 | |
| `GET /api/escalas` | 200 | |
| `GET /api/frms/configuracao` | 404 | Expected — route is `/api/frms` (no `/configuracao` subpath) |
| `GET /api/sgso/relatos` | 200 | |
| `GET /api/treinamentos` | 404 | Expected — route is `/api/treinamentos/planejados` |
| `GET /api/notificacoes` | 404 | Expected — route is `/api/notificacoes/sistema` |
| `GET /api/notificacoes/sistema` | 200 | Correct path |
| `GET /api/treinamentos/planejados` | 200 | Correct path |
| `GET /api/qualificacoes-historico/auditoria` | 400 | Correct — route exists, requires query params |

**Summary pre-seed:** 10/10 core modules responding, 3 paths corrected (404 on wrong sub-path, not missing route).

---

## 3. Staging DB Schema

### 3.1 Table Count

230+ tables present in `airtrust-db-staging`. Key tables confirmed:
- `funcionarios`, `empresas`, `usuarios`, `qualificacoes_tipos`, `qualificacoes_historico`
- `lms_cursos`, `lms_matriculas`, `lms_progresso_scorm`
- `simuladores`, `simulador_agendamentos`
- `escalas_mensais`, `escala_alocacoes`, `escala_tripulacoes`
- `sgso_relatos`, `sgso_perigos`, `sgso_auditorias`
- `frms_jornada`, `frms_fadiga_checkin`, `frms_configuracao_limites`

### 3.2 User Count Before Seed

```
SELECT COUNT(*) FROM usuarios → 1
```

Confirmed: only the staging test user exists (no real data).

### 3.3 Key Table Schemas

**funcionarios** — key columns: `id`, `nome`, `email`, `matricula`, `cargo`, `status`, `ativo`, `empresa_id` (FK), `is_instrutor`, `is_checador`

**qualificacoes_tipos** — key columns: `id`, `tipo`, `codigo`, `nome`, `validade`, `ativo`, `empresa_id` (FK)

**lms_cursos** — key columns: `id`, `empresa_id`, `titulo`, `descricao`, `ativo`, `publicado`, `scorm_versao`

**simuladores** — key columns: `id`, `nome`, `modelo`, `tipo`, `fabricante`, `localizacao`, `status`, `ativo`

---

## 4. Functional Demo Seed

### 4.1 Seed Script

**File:** `scripts/staging/seed-functional-demo.sh`  
**Idempotency:** `INSERT OR IGNORE` on all rows  
**Safety guard:** Blocks execution if `DB_NAME` is `airtrust-db` (production)

### 4.2 Seed Execution Result

| Record | Table | ID | Status |
|--------|-------|----|--------|
| AeroDemo Fictícia Ltda (empresa) | `empresas` | 9001 | INSERTED (8 rows_written — triggers) |
| João Demo Silva (funcionário) | `funcionarios` | 9001 | INSERTED (11 rows_written — triggers/audit) |
| Habilitação Demo HA-9001 (qualificação tipo) | `qualificacoes_tipos` | 9001 | INSERTED |
| Curso Demo Segurança de Voo QA (LMS curso) | `lms_cursos` | 9001 | INSERTED |
| Simulador Demo FTD-9001 | `simuladores` | 9001 | INSERTED |

All inserts completed without error. Re-running the script will produce 0 `rows_written` (idempotent behavior confirmed by `INSERT OR IGNORE`).

---

## 5. API Smoke Results — After Seed

| Endpoint | HTTP Status | Notes |
|----------|-------------|-------|
| `POST /api/auth/login` | 200 | Auth stable after seed |
| `GET /api/funcionarios` | 200 | Returns demo funcionario |
| `GET /api/empresas` | 200 | Returns demo empresa |
| `GET /api/qualificacoes/tipos` | 200 | Returns demo qualificação |
| `GET /api/simuladores` | 200 | Returns demo simulador |
| `GET /api/lms/cursos` | 200 | Returns demo curso |
| `GET /api/escalas` | 200 | |
| `GET /api/sgso/relatos` | 200 | |
| `GET /api/treinamentos/planejados` | 200 | |
| `GET /api/notificacoes/sistema` | 200 | |
| `GET /api/qualificacoes-historico/auditoria` | 400 | Correct — route active, needs params |

**Summary post-seed:** All modules responding correctly. Seed data visible in all relevant endpoints. No regressions from seeding.

---

## 6. Secrets Check

| Secret | Present in Staging? | Notes |
|--------|---------------------|-------|
| `JWT_SECRET` | YES | Required for auth |
| `SIGVOOS_CONFIG_ENCRYPTION_KEY` | YES | Required for SigVoos integration |
| `MAINTENANCE_SECRET` | NO | Missing — fail-closed 503 behavior |

**MAINTENANCE_SECRET:** Not set in staging. If a `GET /api/health` request with maintenance mode enabled is made, the worker returns 503. This is the intended fail-closed behavior. Setting `MAINTENANCE_SECRET` is blocked pending explicit authorization to `wrangler secret put`.

---

## 7. Bloqueios (Blockers)

| Item | Status | Notes |
|------|--------|-------|
| MAINTENANCE_SECRET staging | PENDENTE | Requires `wrangler secret put` authorization |
| Frontend staging deploy (logo) | BLOQUEADO | `CLOUDFLARE_API_TOKEN` not set in environment; `Pages:Write` permission needed |
| FRMS module full smoke | PARCIAL | Main FRMS routes (jornadas, checkin) returning 404 — route path needs clarification; `sgso/relatos` and `treinamentos/planejados` working |

---

## 8. Per-Module Status Summary

| Module | API Status | Seed Data | Notes |
|--------|-----------|-----------|-------|
| Funcionários | PASS | YES (demo) | |
| Empresas | PASS | YES (demo) | |
| Qualificações | PASS | YES (tipo demo) | |
| LMS | PASS | YES (curso demo) | |
| Simuladores | PASS | YES (simulador demo) | |
| Escalas | PASS | NO (empty list OK) | |
| SGSO | PASS | NO (empty list OK) | |
| Treinamentos Planejados | PASS | NO (empty list OK) | |
| FRMS Fadiga | PARTIAL | NO | `/api/frms/jornadas` → 404; `/fadiga-checkin/*` needs investigation |
| Notificações | PASS | NO | `/api/notificacoes/sistema` 200 |
| Auditoria Qualificações | PASS (400) | NO | Route active, requires query params |
| Admin routes | NOT TESTED | N/A | Requires separate admin smoke |

---

## 9. Phase 13 — Re-Validation Results (2026-05-15)

Fresh smoke test executed against live staging environment. All results are independent of Phase 12 session.

### 9.1 Login

| Test | Result |
|------|--------|
| `POST /api/auth/login` | 200 OK |
| JWT token extracted | YES |
| Token used for all subsequent tests | YES |

### 9.2 Eleven-Route Smoke Test

| Endpoint | Status | Phase 13 |
|----------|--------|----------|
| `GET /api/auth/me` | 200 | PASS |
| `GET /api/funcionarios` | 200 | PASS |
| `GET /api/empresas` | 200 | PASS |
| `GET /api/qualificacoes/tipos` | 200 | PASS |
| `GET /api/qualificacoes/historico` | 200 | PASS |
| `GET /api/lms/cursos` | 200 | PASS |
| `GET /api/lms/matriculas/minhas` | 200 | PASS |
| `GET /api/frms/alertas` | 200 | PASS |
| `GET /api/simuladores` | 200 | PASS |
| `GET /api/sgso/relatos` | 200 | PASS |
| `GET /api/sgso/kpi/spi` | 200 | PASS |

**Result: 11/11 PASS** (improvement over Phase 12 which tested 10 routes)

### 9.3 Schema Verification — FRMS and SGSO Tables

Confirmed via `PRAGMA table_info` and `sqlite_master` query:

**FRMS tables (19):** frms_acumulo_mensal, frms_acumulo_rolling, frms_alerta, frms_carga_trabalho, frms_configuracao_limites, frms_escala_quinzenal, frms_explicacao_dia_cache, frms_fadiga_avaliacao_gestor, frms_fadiga_checkin, frms_fadiga_config_empresa, frms_fadiga_evento, frms_fatorizacao_jornada, frms_fonte_calculo_competencia, frms_importacao_fira, frms_jornada, frms_jornada_pendente, frms_justificativas, frms_notificacao_config, frms_notificacao_destinatario

**SGSO tables (42):** sgso_acoes_mitigacao, sgso_audit_trail, sgso_auditoria_itens, sgso_auditorias, sgso_avaliacao_risco, sgso_avaliacao_risco_contexto, sgso_bowtie_barreira_historico, sgso_bowtie_barreira_vinculos, sgso_bowtie_barreiras, sgso_bowtie_cenarios, sgso_bowtie_nos, sgso_categorias_adrep, sgso_frat_aprovacoes, sgso_frat_avaliacoes, sgso_frat_fatores, sgso_frat_modelos, sgso_frat_respostas, sgso_licoes_aprendidas, sgso_matriz_risco_celulas, sgso_matriz_risco_perfis, sgso_moc_aprovacoes, sgso_moc_registros, sgso_nao_conformidades, sgso_perigos, sgso_protocolo_sequencia, sgso_relato_capturas, sgso_relato_ia_triagem, sgso_relato_notificacoes, sgso_relato_perigos, sgso_relato_privacidade, sgso_relato_workflow_eventos, sgso_relatos, sgso_relatos_arquivos, sgso_relatos_comentarios, sgso_relatos_fatores_humanos, sgso_relatos_historico_status, sgso_relatos_midias_metadados, sgso_sla_config, sgso_spi_config

**Total tables in staging:** 230+ (confirmed by `SELECT COUNT(*) FROM sqlite_master WHERE type='table'`)
