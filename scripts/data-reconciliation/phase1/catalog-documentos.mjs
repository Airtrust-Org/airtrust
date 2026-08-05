// Static diagnostic catalog: preserve SQL literals byte-for-byte.
// prettier-ignore
export default Object.freeze([
  {
    "code": "DOC-001",
    "category": "CERTIFICADOS_DOCUMENTOS",
    "severity": "P0",
    "description": "Documento de certificado sem historico correspondente.",
    "requires": {
      "documentos": [
        "id",
        "uuid",
        "empresa_id",
        "tipo",
        "r2_key",
        "created_at",
        "deleted_at"
      ],
      "qualificacoes_historico": [
        "id",
        "empresa_id",
        "certificado_arquivo_id",
        "deleted_at"
      ]
    },
    "dependency": "Frente 1 / PR #805 e regras de documentos",
    "cause": "Upload/geracao parcial ou referencia perdida.",
    "futureRepair": "Revincular somente por hash/metadados inequivocos.",
    "reversibility": "Media.",
    "risk": "Associar certificado a pessoa errada.",
    "sql": "SELECT d.empresa_id AS tenant_id,d.id AS entity_id,NULL AS related_id,d.created_at AS event_date,d.r2_key AS observed_storage_ref,'CERTIFICATE_DOCUMENT_WITHOUT_HISTORY' AS issue_type FROM documentos d LEFT JOIN qualificacoes_historico qh ON (qh.certificado_arquivo_id=CAST(d.id AS TEXT) OR qh.certificado_arquivo_id=d.uuid) AND qh.deleted_at IS NULL WHERE d.deleted_at IS NULL AND UPPER(COALESCE(d.tipo,'')) LIKE '%CERTIFIC%' AND qh.id IS NULL"
  },
  {
    "code": "DOC-002",
    "category": "CERTIFICADOS_DOCUMENTOS",
    "severity": "P0",
    "description": "Historico com referencia de certificado sem documento ativo.",
    "requires": {
      "qualificacoes_historico": [
        "id",
        "empresa_id",
        "certificado_arquivo_id",
        "data_conclusao",
        "deleted_at"
      ],
      "documentos": [
        "id",
        "uuid",
        "deleted_at"
      ]
    },
    "dependency": "Frente 1 / PR #805 e regras de documentos",
    "cause": "Cleanup R2/D1 parcial.",
    "futureRepair": "Restaurar referencia somente apos confirmar objeto e hash.",
    "reversibility": "Media.",
    "risk": "Documento ausente ou errado.",
    "sql": "SELECT qh.empresa_id AS tenant_id,qh.id AS entity_id,NULL AS related_id,qh.data_conclusao AS event_date,'HISTORY_WITH_MISSING_CERTIFICATE_DOCUMENT' AS issue_type FROM qualificacoes_historico qh LEFT JOIN documentos d ON (qh.certificado_arquivo_id=CAST(d.id AS TEXT) OR qh.certificado_arquivo_id=d.uuid) AND d.deleted_at IS NULL WHERE qh.deleted_at IS NULL AND qh.certificado_arquivo_id IS NOT NULL AND d.id IS NULL"
  },
  {
    "code": "DOC-003",
    "category": "CERTIFICADOS_DOCUMENTOS",
    "severity": "P0",
    "description": "Documento e historico de certificado em empresas divergentes.",
    "requires": {
      "qualificacoes_historico": [
        "id",
        "empresa_id",
        "certificado_arquivo_id",
        "data_conclusao",
        "deleted_at"
      ],
      "documentos": [
        "id",
        "uuid",
        "empresa_id",
        "deleted_at"
      ]
    },
    "dependency": "Frente 5 e regras de documentos",
    "cause": "Vinculo cross-tenant.",
    "futureRepair": "Nunca automatizar; investigacao humana obrigatoria.",
    "reversibility": "Baixa.",
    "risk": "Vazamento de documento cross-tenant.",
    "sql": "SELECT qh.empresa_id AS tenant_id,qh.id AS entity_id,d.id AS related_id,qh.data_conclusao AS event_date,d.empresa_id AS observed_tenant_id,'CERTIFICATE_TENANT_MISMATCH' AS issue_type FROM qualificacoes_historico qh JOIN documentos d ON (qh.certificado_arquivo_id=CAST(d.id AS TEXT) OR qh.certificado_arquivo_id=d.uuid) WHERE qh.deleted_at IS NULL AND d.deleted_at IS NULL AND qh.empresa_id<>d.empresa_id"
  },
  {
    "code": "DOC-004",
    "category": "CERTIFICADOS_DOCUMENTOS",
    "severity": "P1",
    "description": "Documento marcado publico indevidamente.",
    "requires": {
      "documentos": [
        "id",
        "empresa_id",
        "tipo",
        "publico",
        "created_at",
        "deleted_at"
      ]
    },
    "dependency": "Regras de seguranca/documentos",
    "cause": "Default ou configuracao legado.",
    "futureRepair": "Restringir somente apos confirmar superficie publica legitima.",
    "reversibility": "Alta.",
    "risk": "Exposicao de PII/documento interno.",
    "sql": "SELECT empresa_id AS tenant_id,id AS entity_id,NULL AS related_id,created_at AS event_date,tipo AS observed_document_type,'INTERNAL_DOCUMENT_MARKED_PUBLIC' AS issue_type FROM documentos WHERE deleted_at IS NULL AND COALESCE(publico,0)=1 AND UPPER(COALESCE(tipo,'')) NOT IN ('CERTIFICADO_PUBLICO')"
  },
  {
    "code": "DOC-005",
    "category": "CERTIFICADOS_DOCUMENTOS",
    "severity": "P1",
    "description": "Hash ausente em documento que deveria ser verificavel.",
    "requires": {
      "documentos": [
        "id",
        "empresa_id",
        "tipo",
        "hash_sha256",
        "created_at",
        "deleted_at"
      ]
    },
    "dependency": "Migration/backfill de hash e regras de documentos",
    "cause": "Documento legado sem hash persistido.",
    "futureRepair": "Calcular em ambiente controlado e comparar bytes; nunca inferir.",
    "reversibility": "Alta.",
    "risk": "Validacao publica lenta/inconclusiva.",
    "sql": "SELECT empresa_id AS tenant_id,id AS entity_id,NULL AS related_id,created_at AS event_date,tipo AS observed_document_type,'DOCUMENT_HASH_MISSING' AS issue_type FROM documentos WHERE deleted_at IS NULL AND UPPER(COALESCE(tipo,'')) LIKE '%CERTIFIC%' AND COALESCE(TRIM(hash_sha256),'')=''"
  }
]);
