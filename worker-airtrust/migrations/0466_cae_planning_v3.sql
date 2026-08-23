-- Adiciona configurações operacionais para o Planejamento CAE AI Bridge V2

ALTER TABLE empresas_config 
ADD COLUMN planejamento_simulador_antecedencia_dias INTEGER DEFAULT 90;

-- Estrutura preparada para o futuro (preferências de agrupamento)
ALTER TABLE empresas_config 
ADD COLUMN planejamento_simulador_preferencia_sessoes_por_dia INTEGER DEFAULT 2;

ALTER TABLE empresas_config 
ADD COLUMN planejamento_simulador_preferencia_minutos_por_dia INTEGER DEFAULT 240;

ALTER TABLE empresas_config 
ADD COLUMN planejamento_simulador_permitir_quebra_preferencia INTEGER DEFAULT 1;


ALTER TABLE empresas_config
  ADD COLUMN planejamento_simulador_regra_quinzena TEXT
  DEFAULT 'AMBAS'
  CHECK (planejamento_simulador_regra_quinzena IN ('FOLGA','TRABALHO','AMBAS'));

ALTER TABLE empresas_config
  ADD COLUMN planejamento_simulador_permitir_sessao_compartilhada INTEGER
  NOT NULL DEFAULT 1
  CHECK (planejamento_simulador_permitir_sessao_compartilhada IN (0,1));

ALTER TABLE empresas_config
  ADD COLUMN planejamento_simulador_preferir_mesmo_treinamento INTEGER
  NOT NULL DEFAULT 1
  CHECK (planejamento_simulador_preferir_mesmo_treinamento IN (0,1));

ALTER TABLE empresas_config
  ADD COLUMN planejamento_simulador_preferir_mesma_sessao INTEGER
  NOT NULL DEFAULT 1
  CHECK (planejamento_simulador_preferir_mesma_sessao IN (0,1));

ALTER TABLE empresas_config
  ADD COLUMN planejamento_simulador_aprovacao_obrigatoria INTEGER
  NOT NULL DEFAULT 1
  CHECK (planejamento_simulador_aprovacao_obrigatoria IN (0,1));

-- Aprovação fica SEPARADA de planejamento_status para não reconstruir o CHECK da migration 0460.
ALTER TABLE treinamentos_planejados
  ADD COLUMN planejamento_aprovacao_status TEXT
  DEFAULT 'RASCUNHO'
  CHECK (
    planejamento_aprovacao_status IS NULL OR
    planejamento_aprovacao_status IN ('RASCUNHO','PENDENTE','APROVADO','DEVOLVIDO','NAO_EXIGIDO')
  );

ALTER TABLE treinamentos_planejados
  ADD COLUMN planejamento_aprovado_por INTEGER;

ALTER TABLE treinamentos_planejados
  ADD COLUMN planejamento_aprovado_em TEXT;

ALTER TABLE treinamentos_planejados
  ADD COLUMN planejamento_aprovacao_observacoes TEXT;

ALTER TABLE treinamentos_planejados
  ADD COLUMN planejamento_revalidado_em TEXT;

-- Não adicionar snapshot duplicado se planejamento_snapshot_json já existir.
-- Reutilizar simulador_planejamento_auditoria para before/after e decisão.
