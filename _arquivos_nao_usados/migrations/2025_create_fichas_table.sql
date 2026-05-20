-- Migration: Criar tabela fichas (que não existe em produção)
-- Data: 2025-11-06
-- Problema: 39 referências no código mas tabela não existe

-- Criar tabela fichas
CREATE TABLE IF NOT EXISTS fichas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT UNIQUE NOT NULL,
  agendamento_id INTEGER,
  simulador_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  instrutor_id INTEGER,
  data_sessao DATE,
  hora_inicio TIME,
  hora_fim TIME,
  duracao_minutos INTEGER,
  status TEXT DEFAULT 'RASCUNHO' CHECK(status IN ('RASCUNHO', 'EM_AVALIACAO', 'APROVADO', 'REPROVADO', 'CANCELADO')),
  nota_final REAL,
  observacoes TEXT,
  
  -- Campos de assinatura do instrutor
  assinatura_instrutor BOOLEAN DEFAULT 0,
  assinatura_instrutor_data TIMESTAMP,
  assinatura_instrutor_hash TEXT,
  assinatura_instrutor_protocolo TEXT,
  assinatura_instrutor_ip TEXT,
  assinatura_instrutor_usuario_id INTEGER,
  
  -- Campos de assinatura do tripulante/aluno
  assinatura_tripulante BOOLEAN DEFAULT 0,
  assinatura_tripulante_data TIMESTAMP,
  assinatura_tripulante_hash TEXT,
  assinatura_tripulante_protocolo TEXT,
  assinatura_tripulante_ip TEXT,
  assinatura_tripulante_usuario_id INTEGER,
  
  -- Campos de assinatura do checador
  assinatura_checador BOOLEAN DEFAULT 0,
  assinatura_checador_data TIMESTAMP,
  assinatura_checador_hash TEXT,
  assinatura_checador_protocolo TEXT,
  assinatura_checador_ip TEXT,
  assinatura_checador_usuario_id INTEGER,
  
  -- Auditoria
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  
  -- Foreign Keys
  FOREIGN KEY (agendamento_id) REFERENCES agendamentos_simulador(id),
  FOREIGN KEY (simulador_id) REFERENCES simuladores(id),
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY (instrutor_id) REFERENCES funcionarios(id)
);

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_fichas_uuid ON fichas(uuid);
CREATE INDEX IF NOT EXISTS idx_fichas_agendamento_id ON fichas(agendamento_id);
CREATE INDEX IF NOT EXISTS idx_fichas_simulador_id ON fichas(simulador_id);
CREATE INDEX IF NOT EXISTS idx_fichas_funcionario_id ON fichas(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_fichas_instrutor_id ON fichas(instrutor_id);
CREATE INDEX IF NOT EXISTS idx_fichas_status ON fichas(status);
CREATE INDEX IF NOT EXISTS idx_fichas_deleted_at ON fichas(deleted_at);

-- Migrar dados existentes de agendamentos_simulador para fichas
INSERT OR IGNORE INTO fichas (
  uuid,
  agendamento_id,
  simulador_id,
  funcionario_id,
  instrutor_id,
  data_sessao,
  hora_inicio,
  hora_fim,
  status,
  observacoes,
  created_at,
  updated_at
)
SELECT 
  a.uuid,
  a.id as agendamento_id,
  a.simulador_id,
  a.funcionario_id,
  a.instrutor_id,
  a.data_agendamento,
  a.hora_inicio,
  a.hora_fim,
  a.status,
  a.observacoes,
  a.created_at,
  a.updated_at
FROM agendamentos_simulador a
WHERE a.deleted_at IS NULL;

-- Copiar assinaturas de fichas_sessao para fichas (se existirem)
UPDATE fichas
SET 
  assinatura_instrutor = (
    SELECT assinatura_instrutor 
    FROM fichas_sessao fs 
    WHERE fs.uuid = fichas.uuid
  ),
  assinatura_instrutor_data = (
    SELECT assinatura_instrutor_data 
    FROM fichas_sessao fs 
    WHERE fs.uuid = fichas.uuid
  ),
  assinatura_instrutor_usuario_id = (
    SELECT assinatura_instrutor_usuario_id 
    FROM fichas_sessao fs 
    WHERE fs.uuid = fichas.uuid
  ),
  assinatura_tripulante = (
    SELECT assinatura_tripulante 
    FROM fichas_sessao fs 
    WHERE fs.uuid = fichas.uuid
  ),
  assinatura_tripulante_data = (
    SELECT assinatura_tripulante_data 
    FROM fichas_sessao fs 
    WHERE fs.uuid = fichas.uuid
  ),
  assinatura_tripulante_usuario_id = (
    SELECT assinatura_tripulante_usuario_id 
    FROM fichas_sessao fs 
    WHERE fs.uuid = fichas.uuid
  )
WHERE EXISTS (
  SELECT 1 FROM fichas_sessao fs WHERE fs.uuid = fichas.uuid
);
