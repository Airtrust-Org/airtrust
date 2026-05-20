-- Criar tabelas faltantes para manobras

-- Tabela de categorias de manobras
CREATE TABLE IF NOT EXISTS manobras_categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  descricao TEXT,
  ordem INTEGER DEFAULT 0,
  cor TEXT DEFAULT '#6B7280',
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now')),
  deleted_at DATETIME NULL
);

CREATE INDEX IF NOT EXISTS idx_manobras_categorias_nome ON manobras_categorias(nome) WHERE deleted_at IS NULL;

-- Tabela de relação modelo-manobras (template_manobras)
CREATE TABLE IF NOT EXISTS template_manobras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL,
  manobra_id INTEGER NOT NULL,
  ordem INTEGER DEFAULT 0,
  obrigatoria BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now')),
  deleted_at DATETIME NULL,
  FOREIGN KEY (template_id) REFERENCES sessoes_template(id),
  FOREIGN KEY (manobra_id) REFERENCES cadastro_manobras(id),
  UNIQUE(template_id, manobra_id)
);

CREATE INDEX IF NOT EXISTS idx_template_manobras_template ON template_manobras(template_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_template_manobras_manobra ON template_manobras(manobra_id) WHERE deleted_at IS NULL;
