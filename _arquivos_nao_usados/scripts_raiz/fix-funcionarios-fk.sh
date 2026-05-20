#!/bin/bash
# Fix funcionarios_old FK references via API

set -e

echo "🔧 Corrigindo FKs de funcionarios_old..."

# Migration SQL
read -r -d '' MIGRATION_SQL << 'EOF' || true
PRAGMA foreign_keys=OFF;

-- Verificar tabelas que precisam ser corrigidas
SELECT 'Iniciando correção de FKs...' as status;

-- 1. pasta_virtual
DROP TABLE IF EXISTS pasta_virtual_new;
CREATE TABLE pasta_virtual_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  tipo_documento TEXT NOT NULL,
  categoria TEXT,
  caminho_arquivo TEXT,
  arquivourl TEXT,
  nome_arquivo TEXT,
  nomeoriginal TEXT,
  arquivo_tamanho INTEGER,
  tamanho INTEGER,
  dataupload TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  uploadedby INTEGER,
  certificacao_id INTEGER,
  descricao TEXT,
  deleted_at TEXT,
  FOREIGN KEY(funcionario_id) REFERENCES funcionarios(id)
);

INSERT INTO pasta_virtual_new SELECT * FROM pasta_virtual;
DROP TABLE pasta_virtual;
ALTER TABLE pasta_virtual_new RENAME TO pasta_virtual;

-- 2. avaliacoes_manobras
DROP TABLE IF EXISTS avaliacoes_manobras_new;
CREATE TABLE avaliacoes_manobras_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT UNIQUE NOT NULL,
  ficha_uuid TEXT NOT NULL,
  participante_id INTEGER NOT NULL,
  manobra_id INTEGER NOT NULL,
  manobra_codigo TEXT NOT NULL,
  manobra_nome TEXT NOT NULL,
  nota_atual REAL NOT NULL CHECK(nota_atual >= 0 AND nota_atual <= 10),
  observacoes TEXT,
  avaliador_id INTEGER NOT NULL,
  data_avaliacao TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  FOREIGN KEY (ficha_uuid) REFERENCES fichas_sessao(uuid) ON DELETE CASCADE,
  FOREIGN KEY (participante_id) REFERENCES funcionarios(id) ON DELETE CASCADE,
  FOREIGN KEY (manobra_id) REFERENCES manobras(id) ON DELETE CASCADE,
  FOREIGN KEY (avaliador_id) REFERENCES funcionarios(id) ON DELETE CASCADE
);

INSERT INTO avaliacoes_manobras_new SELECT * FROM avaliacoes_manobras;
DROP TABLE avaliacoes_manobras;
ALTER TABLE avaliacoes_manobras_new RENAME TO avaliacoes_manobras;

PRAGMA foreign_keys=ON;

SELECT 'FKs corrigidas com sucesso!' as status;
EOF

# Executar via wrangler
echo "Executando migration..."
wrangler d1 execute airtrust-db --remote --command "$MIGRATION_SQL"

echo "✅ FKs corrigidas com sucesso!"
