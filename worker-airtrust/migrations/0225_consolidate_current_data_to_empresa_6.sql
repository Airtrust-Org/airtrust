-- Migration: 0225_consolidate_current_data_to_empresa_6
-- Data: 2026-03-01
-- Objetivo:
--   1) Consolidar todos os dados atuais (empresa_id = 1 ou NULL) na empresa 6 (Costa do Sol)
--   2) Garantir vínculo de usuários com empresa 6
--   3) Marcar empresa 6 como primária e remover vínculos antigos
--
-- Observação:
--   Esta migração é intencional para fase atual do projeto (single-tenant operacional em dados),
--   mantendo a arquitetura multi-tenant pronta para expansão futura.

-- Cadastros
UPDATE funcionarios SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;
UPDATE setores SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;
UPDATE funcoes SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;
UPDATE aeronaves SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;
UPDATE modelos_aeronave SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;

-- Qualificações / documentos
UPDATE qualificacoes_historico SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;
UPDATE qualificacoes_tipos SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;
UPDATE documentos SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;

-- Simuladores
UPDATE fichas_sessao SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;
UPDATE modelos_sessao SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;
UPDATE tipos_sessao SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;
UPDATE simulador_agendamentos SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;

-- Pasta virtual / arquivos / importações
UPDATE pasta_virtual SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;
UPDATE arquivos SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;
UPDATE certificados_templates SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;
UPDATE importacoes_log SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;

-- Configurações relacionadas à empresa
UPDATE empresa_certificado_config SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;
UPDATE empresa_config SET empresa_id = 6 WHERE empresa_id = 1 OR empresa_id IS NULL;

-- Vínculos usuário x empresa
INSERT INTO usuarios_empresas (usuario_id, empresa_id, role, is_primary)
SELECT u.id, 6, 'admin', 1
FROM usuarios u
WHERE NOT EXISTS (
  SELECT 1
  FROM usuarios_empresas ue
  WHERE ue.usuario_id = u.id
    AND ue.empresa_id = 6
);

UPDATE usuarios_empresas
SET is_primary = CASE WHEN empresa_id = 6 THEN 1 ELSE 0 END;

DELETE FROM usuarios_empresas
WHERE empresa_id <> 6;
