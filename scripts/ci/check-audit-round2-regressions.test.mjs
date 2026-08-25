// source_reference: regression guard for AirTrust Operational Reliability Audit Round 2; assertions inspect versioned source text only.
// operational_decision: keep the confirmed fixes protected without executing SQL, HTTP mutations, deployments, or remote resource access.
// dry_run_required: not applicable; this Node test is read-only and deterministic against the checked-out repository.
// rollback_plan_required: no rollback needed; the guard creates no data or infrastructure state and can be reverted with its CI line.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = (path) => fs.readFileSync(path, 'utf8');

test('FRMS update persists identity fields and local schema exposes current columns', () => {
  const service = source('worker-airtrust/src/lib/frms/db-service-jornadas.ts');
  const schema = source('scripts/schema-local.sql');
  const setup = source('scripts/setup-local-db.sh');

  assert.match(service, /UPDATE frms_jornada SET\s+data = \?, tripulante_id = \?/);
  assert.match(service, /\.bind\(\s*merged\.data,\s*merged\.tripulante_id,/);
  assert.match(schema, /hora_dormiu\s+TEXT/);
  assert.match(schema, /empresa_id\s+INTEGER/);
  assert.match(setup, /require_sqlite_column "frms_jornada" "\$column_name"/);
});

test('certificate validation uses indexed hash lookup and reports R2 availability', () => {
  const value = source('worker-airtrust/src/routes/certificados/validacao.ts');
  assert.match(value, /qh\.validacao_hash = \?/);
  assert.match(value, /generateCertificateValidationHash/);
  assert.match(value, /LEFT JOIN qualificacoes_tipos/);
  assert.match(value, /BUCKET\.head\(r2Key\)/);
  assert.doesNotMatch(value, /CERTIFICATE_SCAN_BATCH_SIZE/);
  assert.doesNotMatch(value, /while \(true\)/);
});

test('notification routes resolve employee identity and UI waits for server success', () => {
  const route = source('worker-airtrust/src/routes/escalas-notificacoes.ts');
  const component = source('src/react-app/components/NotificacoesEscala.tsx');
  assert.match(route, /SELECT funcionario_id\s+FROM usuarios/);
  assert.doesNotMatch(route, /const funcionarioId = String\(c\.get\('userId'/);
  assert.match(component, /if \(!response\.ok \|\| !payload\.success\) return/);
  assert.match(component, /Array\.isArray\(json\.data\)/);
});

test('auth refresh is single-flight and AuthContext observes token clearing', () => {
  const api = source('src/react-app/config/api.ts');
  const context = source('src/react-app/context/AuthContext.tsx');
  const tests = source('src/react-app/config/__tests__/api.auth-session.test.ts');

  assert.match(api, /let refreshPromise: Promise<void> \| null = null/);
  assert.match(api, /if \(refreshPromise\) return refreshPromise/);
  assert.match(context, /AUTH_TOKEN_CHANGED_EVENT/);
  assert.match(context, /await refreshAccessToken\(\)/);
  assert.match(tests, /coalesces concurrent refreshes into a single request/);
});

test('company configuration persists every accepted UI field and surfaces failure', () => {
  const backend = source('worker-airtrust/src/routes/empresas.ts');
  const frontend = source('src/react-app/components/empresas/EmpresaForm.tsx');
  assert.match(backend, /dias_alerta_vencimento: data\.dias_alerta_vencimento/);
  assert.match(backend, /cores_tema: serializeEmpresaConfigJson/);
  assert.match(backend, /modulos_ativos: serializeEmpresaConfigJson/);
  assert.match(backend, /PRAGMA table_info\(empresas_config\)/);
  assert.match(frontend, /if \(!resConfig\.ok \|\| !jsonConfig\.success\)/);
});

test('replace imports are validated before one atomic D1 batch', () => {
  const value = source('worker-airtrust/src/routes/importacao-xlsx.ts');
  assert.match(value, /MAX_IMPORT_ROWS = 500/);
  assert.match(
    value,
    /db\.batch\(\[\s*deleteStatement as D1PreparedStatement,\s*\.\.\.entries\.map/s,
  );
  assert.match(value, /if \(errors\.length > 0\).*blocked: true/s);
  assert.match(value, /linha: entry\.linha/);
  assert.doesNotMatch(value, /errors\.push\(\{ linha: i \+ 2/);
});

test('qualification import rejects unknown employee CPF instead of creating placeholders', () => {
  const value = source(
    'worker-airtrust/src/services/importacao/QualificacaoHistoricoImportacao.ts',
  );
  assert.match(value, /const validCPFs = new Set<string>\(\)/);
  assert.match(value, /validateQualificacaoHistoricoRow\([\s\S]*validCPFs/);
  assert.match(value, /funcionários nunca são criados/);
  assert.doesNotMatch(value, /INSERT INTO funcionarios/);
});

test('daily alerts are idempotent and isolated by company', () => {
  const value = source('worker-airtrust/src/cron/alertasDiarios.ts');
  assert.match(value, /publishDomainEventOnce/);
  assert.match(value, /json_extract\(payload/);
  assert.match(value, /empresa=.*falhou/);
});

test('renewed predecessors are excluded and LMS report joins are tenant-scoped', () => {
  const stats = source('worker-airtrust/src/routes/qualificacoes/estatisticas.ts');
  const lms = source('worker-airtrust/src/repositories/lmsRelatoriosRepository.ts');
  assert.match(stats, /qh_next\.renovacao_de = qh\.id/);
  assert.match(lms, /f\.empresa_id = m\.empresa_id/);
  assert.match(lms, /c\.empresa_id = m\.empresa_id/);
});

test('orphan certificate recovery uses reference date instead of latest id alone', () => {
  const value = source('worker-airtrust/src/routes/qualificacoes-certificados-admin-ops.ts');
  assert.match(value, /dataReferencia/);
  assert.match(value, /ABS\(julianday\(qh\.data_conclusao\) - julianday\(\?\)\)/);
});

test('password reset changes password and consumes token in one D1 transaction', () => {
  const value = source('worker-airtrust/src/routes/auth.ts');
  assert.match(value, /const \[passwordResult, consumeResult\] = await db\.batch\(\[/);
  assert.match(value, /UPDATE usuarios[\s\S]*EXISTS \([\s\S]*consumed_at IS NULL/);
  assert.match(value, /UPDATE password_reset_tokens[\s\S]*SET consumed_at = datetime\('now'\)/);
  assert.match(value, /passwordResult\.meta\.changes/);
  assert.match(value, /consumeResult\.meta\.changes/);
});

test('uploads roll back R2 objects and legacy PDF route checks binary signature', () => {
  const main = source('worker-airtrust/src/routes/pasta-virtual.ts');
  const legacy = source('worker-airtrust/src/routes/pasta-virtual-extra.ts');
  assert.match(main, /await bucket\.delete\(r2Key\)/);
  assert.match(legacy, /validarAssinaturaPDF\(uint8\)/);
  assert.match(legacy, /await bucket\.delete\(r2Key\)/);
});

test('dynamic reports are no-store and exports fail cleanly above a row cap', () => {
  for (const path of [
    'worker-airtrust/src/routes/dashboard.ts',
    'worker-airtrust/src/routes/exportacao.ts',
    'worker-airtrust/src/routes/lms-relatorios.ts',
    'worker-airtrust/src/routes/simuladores-relatorios.ts',
  ]) {
    assert.match(source(path), /Cache-Control.*no-store/s);
  }

  const exports = source('worker-airtrust/src/routes/exportacao.ts');
  assert.match(exports, /MAX_EXPORT_ROWS = 10_000/);
  assert.match(exports, /Exportação excede/);
});

test('duplicate-email races are translated instead of leaking generic errors', () => {
  const companyUsers = source('worker-airtrust/src/routes/empresas-usuarios.ts');
  const adminUsers = source('worker-airtrust/src/routes/admin-usuarios-legacy.ts');
  assert.match(companyUsers, /UNIQUE constraint failed: usuarios\\\.email/);
  assert.match(companyUsers, /SELECT id FROM usuarios WHERE email = \?/);
  assert.match(adminUsers, /EMAIL_ALREADY_EXISTS/);
});
