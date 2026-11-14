-- 0584 AVSEC — decisao final da Gerencia de Treinamento, 14/11/2026.
-- Somente D1 Tripulantes permanece controlado. Exclusao historica corporativa AUTORIZADA.
-- Preflight governado exige contagens, referencias e recovery point exatos.
UPDATE qualificacoes_tipos
SET nome='AVSEC — Tripulantes',updated_at=datetime('now')
WHERE empresa_id=6 AND id=22 AND codigo='D1' AND nome='AVSEC'
  AND ativo=1 AND deleted_at IS NULL AND validade=24;

-- Remover todos os requisitos descontinuados, mantendo apenas PIC/SIC D1 IDs 486/487.
UPDATE treinamento_requisitos
SET ativo=0,deleted_at=datetime('now'),updated_at=datetime('now')
WHERE empresa_id=6 AND id IN (488,489,490,538,671)
 AND ativo=1 AND deleted_at IS NULL
 AND ((id IN (488,489,490) AND qualificacao_tipo_id=22)
   OR (id IN (538,671) AND qualificacao_tipo_id=194));

-- Desvincular o evento de notificacao do historico a ser removido.
-- Nao excluir logs de notificacao.
UPDATE notificacoes_log
SET qualificacao_historico_id=NULL,updated_at=datetime('now')
WHERE empresa_id=6 AND qualificacao_historico_id=5276;

-- Remocao fisica solicitada do unico historico corporativo.
DELETE FROM qualificacoes_historico
WHERE id=5276 AND empresa_id=6 AND funcionario_id=111
 AND qualificacao_id=194 AND qualificacao_codigo='AVSEC_CONSC'
 AND perfil_competencia IS NULL AND status='CONCLUIDO'
 AND data_conclusao='2024-02-19' AND data_vencimento='2026-02-19'
 AND deleted_at IS NULL;

-- Modelo deixa de existir no catalogo ativo; soft-delete evita refs legadas
-- e preserva trilha de governanca da estrutura anteriormente controlada.
UPDATE qualificacoes_tipos
SET ativo=0,deleted_at=datetime('now'),updated_at=datetime('now')
WHERE id=194 AND empresa_id=6 AND codigo='AVSEC_CONSC'
 AND ativo=1 AND deleted_at IS NULL;
