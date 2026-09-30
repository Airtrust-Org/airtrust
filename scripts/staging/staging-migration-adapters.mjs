// source_reference: staging D1 0518 apply failures 2026-09-30 (QUALIFICATION_CATEGORY_INVALID; missing CRM_CORP postcondition) + production canonical catalog read-only comparison
// operational_decision: preserve immutable production Schema V2 0518 and bootstrap only its non-PII catalog prerequisites in staging atomically
// dry_run_required: true
// rollback_plan_required: verified staging D1 backup + D1 Time Travel recovery point captured by apply-approved-migration-with-recovery-point.sh
const CRM_0518_MIGRATION = '0518_crm_qualification_consolidation.sql';

export function adaptStagingMigrationSql({ migrationName, migrationSql }) {
  if (typeof migrationSql !== 'string' || !migrationSql.trim()) {
    throw new Error('migrationSql vazio ou ausente');
  }
  if (migrationName !== CRM_0518_MIGRATION) return migrationSql;

  // Staging intentionally uses a reduced non-PII reference catalog. Production
  // already has the canonical Teórico/EAD catalog plus CRM_CORP model assumed by
  // immutable V2 change 0518; reduced staging does not. Bootstrap only those
  // non-PII prerequisites in the same atomic D1 upload as 0518, after the
  // staging-only preflight has ruled out conflicting identities. No employee,
  // history or enrollment row is created by this adapter.
  const bootstrap = `-- staging-only prerequisites for immutable production change 0518
INSERT INTO qualificacoes_categorias (
  id,nome,codigo,descricao,cor,ativo,empresa_id,dominio_codigo,lms_integrada,created_at,updated_at
)
SELECT 3,'Teórico','TERICO','Treinamentos em sala de aula e cursos teóricos','#3B82F6',1,6,'OPERACOES',0,datetime('now'),datetime('now')
WHERE NOT EXISTS (
  SELECT 1 FROM qualificacoes_categorias
   WHERE id=3 OR (empresa_id=6 AND deleted_at IS NULL AND (UPPER(TRIM(codigo))='TERICO' OR UPPER(TRIM(nome))='TEÓRICO'))
);

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
);

INSERT INTO qualificacoes_tipos (
  codigo,nome,ativo,is_check,empresa_id,formato_id,categoria_id,
  classe_requisito,dominio_codigo,area_id,created_at,updated_at
)
SELECT 'CRM_CORP','CRM — Corporate',1,0,6,NULL,3,
       'TREINAMENTO','CORPORATIVO',4,datetime('now'),datetime('now')
WHERE NOT EXISTS (
  SELECT 1 FROM qualificacoes_tipos
   WHERE empresa_id=6 AND codigo='CRM_CORP' AND deleted_at IS NULL
);`;

  return `${bootstrap}\n\n${migrationSql}`;
}
