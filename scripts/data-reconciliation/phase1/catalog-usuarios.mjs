// Static diagnostic catalog: preserve SQL literals byte-for-byte.
// prettier-ignore
export default Object.freeze([
  {
    "code": "USR-001",
    "category": "USUARIOS",
    "severity": "P0",
    "description": "usuario.funcionario_id pertence a outra empresa ativa do usuario.",
    "requires": {
      "usuarios": ["id", "funcionario_id", "ativo", "deleted_at"],
      "funcionarios": ["id", "empresa_id", "deleted_at"],
      "usuarios_empresas": ["usuario_id", "empresa_id", "ativo"]
    },
    "dependency": "Frente 5",
    "cause": "Vinculo criado sem validacao tenant.",
    "futureRepair": "Reassociar ou remover somente apos ownership humano.",
    "reversibility": "Media.",
    "risk": "Acesso cross-tenant.",
    "sql": "SELECT ue.empresa_id AS tenant_id, u.id AS entity_id, u.funcionario_id AS related_id, NULL AS event_date, f.empresa_id AS observed_tenant_id, 'USER_EMPLOYEE_TENANT_MISMATCH' AS issue_type\nFROM usuarios u JOIN funcionarios f ON f.id=u.funcionario_id AND f.deleted_at IS NULL JOIN usuarios_empresas ue ON ue.usuario_id=u.id AND COALESCE(ue.ativo,1)=1\nWHERE u.deleted_at IS NULL AND u.funcionario_id IS NOT NULL AND ue.empresa_id<>f.empresa_id"
  },
  {
    "code": "USR-002",
    "category": "USUARIOS",
    "severity": "P1",
    "description": "Usuario aponta para funcionario excluido.",
    "requires": {
      "usuarios": ["id", "funcionario_id", "deleted_at"],
      "funcionarios": ["id", "empresa_id", "deleted_at"]
    },
    "dependency": "Frente 5",
    "cause": "Soft delete sem reconciliar vinculo.",
    "futureRepair": "Analisar se deve reativar funcionario, desvincular ou inativar usuario.",
    "reversibility": "Media.",
    "risk": "Perda de acesso ou reativacao indevida.",
    "sql": "SELECT f.empresa_id AS tenant_id, u.id AS entity_id, u.funcionario_id AS related_id, f.deleted_at AS event_date, 'USER_LINKED_TO_DELETED_EMPLOYEE' AS issue_type\nFROM usuarios u JOIN funcionarios f ON f.id=u.funcionario_id WHERE u.deleted_at IS NULL AND f.deleted_at IS NOT NULL"
  },
  {
    "code": "USR-003",
    "category": "USUARIOS",
    "severity": "P0",
    "description": "Membership usuarios_empresas incompatível com funcionario.",
    "requires": {
      "usuarios": ["id", "funcionario_id", "deleted_at"],
      "funcionarios": ["id", "empresa_id", "deleted_at"],
      "usuarios_empresas": ["usuario_id", "empresa_id", "ativo"]
    },
    "dependency": "Frente 5",
    "cause": "Membership e vinculo operacional divergentes.",
    "futureRepair": "Nao automatizar; platform admin e multi-membership exigem classificacao.",
    "reversibility": "Baixa.",
    "risk": "Remover acesso legitimo multiempresa.",
    "sql": "SELECT ue.empresa_id AS tenant_id, ue.usuario_id AS entity_id, u.funcionario_id AS related_id, NULL AS event_date, f.empresa_id AS observed_tenant_id, 'MEMBERSHIP_EMPLOYEE_MISMATCH' AS issue_type\nFROM usuarios_empresas ue JOIN usuarios u ON u.id=ue.usuario_id AND u.deleted_at IS NULL JOIN funcionarios f ON f.id=u.funcionario_id AND f.deleted_at IS NULL\nWHERE COALESCE(ue.ativo,1)=1 AND ue.empresa_id<>f.empresa_id"
  },
  {
    "code": "USR-004",
    "category": "USUARIOS",
    "severity": "P0",
    "description": "Mais de um usuario ativo para o mesmo funcionario.",
    "requires": {
      "usuarios": ["id", "funcionario_id", "ativo", "deleted_at"],
      "funcionarios": ["id", "empresa_id"]
    },
    "dependency": "Frente 5",
    "cause": "Cadastro duplicado ou convite repetido.",
    "futureRepair": "Consolidar somente com decisao humana e preservacao de auditoria.",
    "reversibility": "Baixa.",
    "risk": "Perda de identidade, historico ou acesso.",
    "sql": "SELECT f.empresa_id AS tenant_id, MIN(u.id) AS entity_id, u.funcionario_id AS related_id, NULL AS event_date, COUNT(*) AS active_count, 'DUPLICATE_USERS_PER_EMPLOYEE' AS issue_type\nFROM usuarios u JOIN funcionarios f ON f.id=u.funcionario_id WHERE u.deleted_at IS NULL AND COALESCE(u.ativo,1)=1 AND u.funcionario_id IS NOT NULL GROUP BY f.empresa_id,u.funcionario_id HAVING COUNT(*)>1"
  },
  {
    "code": "USR-005",
    "category": "USUARIOS",
    "severity": "P1",
    "description": "Perfil operacional ativo sem funcionario.",
    "requires": {
      "usuarios": ["id", "funcionario_id", "perfil", "ativo", "deleted_at"],
      "usuarios_empresas": ["usuario_id", "empresa_id", "ativo"]
    },
    "dependency": "Frente 5",
    "cause": "Usuario operacional criado sem vinculo.",
    "futureRepair": "Vincular apenas a funcionario inequívoco; caso contrario analise humana.",
    "reversibility": "Alta.",
    "risk": "Acesso operacional sem ownership.",
    "sql": "SELECT ue.empresa_id AS tenant_id, u.id AS entity_id, NULL AS related_id, NULL AS event_date, u.perfil AS observed_role, 'OPERATIONAL_PROFILE_WITHOUT_EMPLOYEE' AS issue_type\nFROM usuarios u JOIN usuarios_empresas ue ON ue.usuario_id=u.id AND COALESCE(ue.ativo,1)=1\nWHERE u.deleted_at IS NULL AND COALESCE(u.ativo,1)=1 AND u.funcionario_id IS NULL AND LOWER(COALESCE(u.perfil,'')) IN ('manager','gestor','instructor','instrutor','student','aluno')"
  },
  {
    "code": "USR-006",
    "category": "USUARIOS",
    "severity": "P1",
    "description": "Funcionario ativo ligado a usuario inativo.",
    "requires": {
      "usuarios": ["id", "funcionario_id", "ativo", "deleted_at"],
      "funcionarios": ["id", "empresa_id", "ativo", "deleted_at"]
    },
    "dependency": "Frente 5",
    "cause": "Ciclos de ativacao divergentes.",
    "futureRepair": "Decisao humana entre reativar usuario ou inativar vinculo.",
    "reversibility": "Alta.",
    "risk": "Bloqueio ou acesso indevido.",
    "sql": "SELECT f.empresa_id AS tenant_id, u.id AS entity_id, f.id AS related_id, NULL AS event_date, 'ACTIVE_EMPLOYEE_INACTIVE_USER' AS issue_type\nFROM funcionarios f JOIN usuarios u ON u.funcionario_id=f.id AND u.deleted_at IS NULL WHERE f.deleted_at IS NULL AND COALESCE(f.ativo,1)=1 AND COALESCE(u.ativo,1)=0"
  }
]);
