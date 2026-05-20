-- Migration: Criar tabela avaliacoes_manobras para armazenar avaliações por manobra
-- Data: 2025-11-06
-- Descrição: Tabela para registrar pontuações, status e observações de avaliação de cada manobra em uma ficha

CREATE TABLE IF NOT EXISTS avaliacoes_manobras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Referências
  ficha_id UUID NOT NULL,
  manobra_id INTEGER NOT NULL,
  sessao_participante_id INTEGER,
  
  -- Avaliação
  pontuacao REAL,
  status TEXT CHECK(status IN ('PENDENTE', 'AVALIAR', 'APROVADO', 'REPROVADO', 'COM_OBSERVACAO')),
  observacoes TEXT,
  feedback_instrutor TEXT,
  
  -- Rastreamento
  avaliador_id INTEGER,
  
  -- Auditoria
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME,
  
  -- Foreign Keys
  FOREIGN KEY (ficha_id) REFERENCES sessoes_simulador(uuid),
  FOREIGN KEY (manobra_id) REFERENCES manobras(id),
  FOREIGN KEY (sessao_participante_id) REFERENCES sessoes_participantes(id),
  FOREIGN KEY (avaliador_id) REFERENCES funcionarios(id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_avaliacoes_ficha ON avaliacoes_manobras(ficha_id);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_manobra ON avaliacoes_manobras(manobra_id);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_participante ON avaliacoes_manobras(sessao_participante_id);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_status ON avaliacoes_manobras(status);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_deleted ON avaliacoes_manobras(deleted_at);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_ficha_status ON avaliacoes_manobras(ficha_id, status);
