// source_reference: staging D1 0518 apply failures on 2026-09-30 plus production 0518 invariants
// operational_decision: preserve immutable production Schema V2 0518 and bootstrap only non-PII reference prerequisites missing from reduced staging
// dry_run_required: true
// rollback_plan_required: verified staging D1 backup + D1 Time Travel recovery point captured by apply-approved-migration-with-recovery-point.sh
const CRM_0518_MIGRATION = '0518_crm_qualification_consolidation.sql';

export function adaptStagingMigrationSql({ migrationName, migrationSql }) {
  if (typeof migrationSql !== 'string' || !migrationSql.trim()) {
    throw new Error('migrationSql vazio ou ausente');
  }
  if (migrationName !== CRM_0518_MIGRATION) return migrationSql;

  // Staging intentionally uses a reduced non-PII reference catalog. Production
  // already has these prerequisites. Bootstrap only the reference rows needed
  // to exercise immutable 0518 + 0521 without employee/history/enrollment data.
  const bootstrap = `-- staging-only prerequisites for immutable production change 0518
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
  codigo,nome,descricao,categoria,carga_horaria,carga_horaria_inicial,carga_horaria_recorrente,
  validade,vencimento_fim_mes,observacoes,ativo,is_check,empresa_id,categoria_id,
  classe_requisito,dominio_codigo,area_id,created_at,updated_at
)
SELECT
  'CRM_CORP','CRM — Corporativo','Referência staging para o CRM Corporate','Treinamentos Operacionais',
  8,16,8,24,0,'Referência não-PII criada apenas para validar 0518/0521 em staging.',
  1,0,6,
  (SELECT id FROM qualificacoes_categorias WHERE empresa_id=6 AND codigo='TREINAMENTO_OPERACIONAL' AND ativo=1 AND deleted_at IS NULL LIMIT 1),
  'TREINAMENTO','CORPORATIVO',
  (SELECT id FROM qualificacoes_areas WHERE empresa_id=6 AND codigo='SEGURANCA_OPERACIONAL' AND ativo=1 AND deleted_at IS NULL LIMIT 1),
  datetime('now'),datetime('now')
WHERE NOT EXISTS (
  SELECT 1 FROM qualificacoes_tipos
   WHERE empresa_id=6 AND codigo='CRM_CORP' AND deleted_at IS NULL
);

INSERT INTO treinamento_requisitos (
  empresa_id,qualificacao_tipo_id,escopo,obrigatoriedade,critico_operacional,
  origem,observacoes,auto_matricular_ead,ativo,created_at,updated_at
)
SELECT 6,qt.id,'EMPRESA','OBRIGATORIA',0,'EMPRESA',
       'Referência staging: regra corporativa necessária para validar as exclusões condicionais de 0521.',
       0,1,datetime('now'),datetime('now')
  FROM qualificacoes_tipos qt
 WHERE qt.empresa_id=6 AND qt.codigo='CRM_CORP' AND qt.ativo=1 AND qt.deleted_at IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM treinamento_requisitos tr
      WHERE tr.empresa_id=6 AND tr.qualificacao_tipo_id=qt.id
        AND tr.escopo='EMPRESA' AND tr.obrigatoriedade='OBRIGATORIA'
        AND tr.ativo=1 AND tr.deleted_at IS NULL
   );`;

  return `${bootstrap}\n\n${migrationSql}`;
}
