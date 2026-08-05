// Static diagnostic catalog: preserve SQL literals byte-for-byte.
// prettier-ignore
export default Object.freeze([
  {
    "code": "FRMS-001",
    "category": "FRMS_ESCALAS",
    "severity": "P0",
    "description": "Jornada com empresa NULL ou divergente do funcionario.",
    "requires": {
      "frms_jornada": ["id", "empresa_id", "tripulante_id", "data", "deleted_at"],
      "funcionarios": ["id", "empresa_id", "deleted_at"]
    },
    "dependency": "Frente 5 e Frente 7",
    "cause": "Origem sem tenant mapping seguro.",
    "futureRepair": "Reconciliar por origem/ownership; ambiguidades humanas.",
    "reversibility": "Baixa.",
    "risk": "Dados sensiveis cross-tenant.",
    "sql": "SELECT fj.empresa_id AS tenant_id,fj.id AS entity_id,fj.tripulante_id AS related_id,fj.data AS event_date,f.empresa_id AS observed_tenant_id,'FRMS_TENANT_NULL_OR_MISMATCH' AS issue_type FROM frms_jornada fj LEFT JOIN funcionarios f ON f.id=fj.tripulante_id AND f.deleted_at IS NULL WHERE fj.deleted_at IS NULL AND (fj.empresa_id IS NULL OR f.id IS NULL OR fj.empresa_id<>f.empresa_id)"
  },
  {
    "code": "FRMS-002",
    "category": "FRMS_ESCALAS",
    "severity": "P1",
    "description": "Jornada sem fatorizacao calculada.",
    "requires": {
      "frms_jornada": ["id", "empresa_id", "tripulante_id", "data", "fatorizacao", "deleted_at"]
    },
    "dependency": "Frente 7",
    "cause": "Job/fluxo interrompido.",
    "futureRepair": "Recalcular com versao de algoritmo registrada.",
    "reversibility": "Alta.",
    "risk": "Alterar indicador historico sem versao.",
    "sql": "SELECT empresa_id AS tenant_id,id AS entity_id,tripulante_id AS related_id,data AS event_date,'FRMS_WITHOUT_FACTORIZATION' AS issue_type FROM frms_jornada WHERE deleted_at IS NULL AND fatorizacao IS NULL"
  },
  {
    "code": "FRMS-003",
    "category": "FRMS_ESCALAS",
    "severity": "P1",
    "description": "Alocacao de escala orfa.",
    "requires": {
      "escala_alocacoes": ["id", "escala_id", "funcionario_id", "data_inicio", "deleted_at"],
      "escalas_mensais": ["id", "empresa_id", "deleted_at"]
    },
    "dependency": "Frente 4",
    "cause": "Exclusao/criacao parcial.",
    "futureRepair": "Revincular somente a escala unica; demais casos humanos.",
    "reversibility": "Media.",
    "risk": "Escala incorreta.",
    "sql": "SELECT e.empresa_id AS tenant_id,a.id AS entity_id,a.escala_id AS related_id,a.data_inicio AS event_date,'ORPHAN_ROSTER_ALLOCATION' AS issue_type FROM escala_alocacoes a LEFT JOIN escalas_mensais e ON e.id=a.escala_id AND e.deleted_at IS NULL WHERE a.deleted_at IS NULL AND e.id IS NULL"
  },
  {
    "code": "FRMS-004",
    "category": "FRMS_ESCALAS",
    "severity": "P1",
    "description": "Duplicidade de jornada por tripulante, data e origem.",
    "requires": {
      "frms_jornada": ["id", "empresa_id", "tripulante_id", "data", "origem", "deleted_at"]
    },
    "dependency": "Frente 7",
    "cause": "Retry sem idempotencia.",
    "futureRepair": "Consolidar somente se payloads equivalentes.",
    "reversibility": "Media.",
    "risk": "Perder jornada distinta.",
    "sql": "SELECT empresa_id AS tenant_id,MIN(id) AS entity_id,tripulante_id AS related_id,data AS event_date,origem AS observed_origin,COUNT(*) AS duplicate_count,'DUPLICATE_FRMS_JOURNEY' AS issue_type FROM frms_jornada WHERE deleted_at IS NULL GROUP BY empresa_id,tripulante_id,data,origem HAVING COUNT(*)>1"
  },
  {
    "code": "FRMS-005",
    "category": "FRMS_ESCALAS",
    "severity": "P0",
    "description": "Periodo de alocacao impossivel.",
    "requires": {
      "escala_alocacoes": ["id", "escala_id", "funcionario_id", "data_inicio", "data_fim", "deleted_at"],
      "escalas_mensais": ["id", "empresa_id"]
    },
    "dependency": "Frente 4",
    "cause": "Datas invertidas/importacao.",
    "futureRepair": "Corrigir somente com fonte de escala.",
    "reversibility": "Alta.",
    "risk": "Mudar jornada operacional.",
    "sql": "SELECT e.empresa_id AS tenant_id,a.id AS entity_id,a.funcionario_id AS related_id,a.data_inicio AS event_date,a.data_fim AS observed_date,'IMPOSSIBLE_ROSTER_PERIOD' AS issue_type FROM escala_alocacoes a JOIN escalas_mensais e ON e.id=a.escala_id WHERE a.deleted_at IS NULL AND julianday(a.data_fim)<julianday(a.data_inicio)"
  }
]);
