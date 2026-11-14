-- 0585, tenant 6 ONLY. DGR model name follows ANAC RBAC 175 / IS 175-002.
-- The two inactive maintenance histories keep ORIGINAL training snapshots and certificates.
-- Their legacy profile is intentionally NOT equivalent to a current competence:
-- it cannot satisfy the active supply-supervisor rule by changing expiration dates.
UPDATE qualificacoes_tipos
   SET nome='Treinamento de Artigos Perigosos para o Transporte Aéreo',
       updated_at=datetime('now')
 WHERE id=25 AND empresa_id=6 AND codigo='D4'
   AND nome='DGR — Transporte de Artigos Perigosos'
   AND ativo=1 AND deleted_at IS NULL;

UPDATE qualificacoes_historico
   SET qualificacao_id=25,
       perfil_competencia='PTAP_MNT_LEGACY_NAO_HOMOLOGADO',
       observacoes='Histórico legado PTM 20.12; código original MNT_ARTIGOS_PERIGOSOS preservado. Não comprova competência DGR específica para a função.',
       updated_at=datetime('now')
 WHERE empresa_id=6 AND id IN (4781,4782)
   AND qualificacao_id=137
   AND qualificacao_codigo='MNT_ARTIGOS_PERIGOSOS'
   AND tipo='Artigos Perigosos'
   AND perfil_competencia IS NULL
   AND observacoes IS NULL
   AND status='VENCIDA'
   AND data_conclusao='2022-06-12'
   AND data_vencimento='2024-06-12'
   AND deleted_at IS NULL
   AND EXISTS (
      SELECT 1 FROM funcionarios f
       WHERE f.id=qualificacoes_historico.funcionario_id
         AND f.empresa_id=6 AND f.status='INATIVO' AND f.ativo=0 AND f.deleted_at IS NULL
   );

-- Retain the mandatory functional requirement; prevent legacy certificates
-- or DGR training of another role from satisfying it without the correct profile.
UPDATE treinamento_requisitos
   SET qualificacao_tipo_id=25,
       perfil_competencia='PTAP_MNT_SUPRIMENTOS',
       updated_at=datetime('now')
 WHERE id=220 AND empresa_id=6 AND qualificacao_tipo_id=137
   AND escopo='FUNCAO' AND funcao_id=36
   AND perfil_competencia IS NULL
   AND obrigatoriedade='OBRIGATORIA'
   AND ativo=1 AND deleted_at IS NULL;

-- Soft-retire duplicate model. The third, previously deleted history #4649
-- and the audit trail continue to reference this retained model identity.
UPDATE qualificacoes_tipos
   SET ativo=0, deleted_at=datetime('now'), updated_at=datetime('now')
 WHERE id=137 AND empresa_id=6 AND codigo='MNT_ARTIGOS_PERIGOSOS'
   AND nome='Artigos Perigosos' AND ativo=1 AND deleted_at IS NULL;
