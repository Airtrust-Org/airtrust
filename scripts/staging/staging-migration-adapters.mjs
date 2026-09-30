// source_reference: staging D1 0518 apply failure 2026-09-30 (QUALIFICATION_CATEGORY_INVALID) + production canonical EAD catalog read-only comparison
// operational_decision: preserve immutable production Schema V2 0518 and bootstrap only its non-PII EAD catalog prerequisites in staging atomically
// dry_run_required: true
// rollback_plan_required: verified staging D1 backup + D1 Time Travel recovery point captured by apply-approved-migration-with-recovery-point.sh
const CRM_0518_MIGRATION = '0518_crm_qualification_consolidation.sql';

export function adaptStagingMigrationSql({ migrationName, migrationSql }) {
  if (typeof migrationSql !== 'string' || !migrationSql.trim()) {
    throw new Error('migrationSql vazio ou ausente');
  }
  if (migrationName !== CRM_0518_MIGRATION) return migrationSql;

  // Staging intentionally uses a reduced non-PII reference catalog. Production
  // already has the canonical EAD category/format required by immutable Schema
  // V2 change 0518; staging does not. Bootstrap only those two catalog rows in
  // the same atomic D1 upload as 0518, after the staging-only preflight has
  // ruled out conflicting identities. No employee/history/enrollment row is
  // created by this adapter.
  const bootstrap = `-- staging-only prerequisite for immutable production change 0518
INSERT INTO qualificacoes_categorias (
  id,nome,codigo,descricao,cor,ativo,empresa_id,dominio_codigo,lms_integrada,created_at,updated_at
)
SELECT 13,'EAD','EAD','Categoria canônica de treinamentos EaD','#EABA0C',1,6,NULL,1,datetime('now'),datetime('now')
WHERE NOT EXISTS (
  SELECT 1 FROM qualificacoes_categorias
   WHERE empresa_id=6 AND deleted_at IS NULL
     AND (id=13 OR UPPER(TRIM(codigo))='EAD' OR UPPER(TRIM(nome))='EAD')
);

INSERT INTO qualificacoes_formatos (
  id,nome,codigo,descricao,cor,ativo,empresa_id,created_at,updated_at
)
SELECT 1,'EAD','EAD','Educação a distância','#EABA0C',1,6,datetime('now'),datetime('now')
WHERE NOT EXISTS (
  SELECT 1 FROM qualificacoes_formatos
   WHERE empresa_id=6 AND deleted_at IS NULL
     AND (id=1 OR UPPER(TRIM(codigo))='EAD' OR UPPER(TRIM(nome))='EAD')
);`;

  return `${bootstrap}\n\n${migrationSql}`;
}
