
 ⛅️ wrangler 4.45.3 (update available 4.50.0)
─────────────────────────────────────────────
Resource location: remote 

🌀 Executing on preview database DB (7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae):
🌀 To execute on your local development database, remove the --remote flag from your wrangler command.
🚣 Executed 1 command in 0.2054ms
[
  {
    "results": [
      {
        "sql": "CREATE TABLE \"qualificacoes_tipos\" (\n  id TEXT PRIMARY KEY,\n  nome TEXT NOT NULL,\n  codigo TEXT NOT NULL,\n  categoria TEXT NOT NULL,\n  validade_meses INTEGER,\n  descricao TEXT,\n  ativo INTEGER DEFAULT 1,\n  created_at TEXT DEFAULT (datetime('now')),\n  updated_at TEXT DEFAULT (datetime('now')),\n  deleted_at TEXT\n)"
      },
      {
        "sql": "CREATE TABLE qualificacoes_historico (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  funcionario_id INTEGER NOT NULL,\n  qualificacao_id INTEGER,\n  tipo_codigo TEXT,\n  codigo TEXT,\n  categoria TEXT,\n  validade TEXT,\n  numero_certificado TEXT,\n  orgao_emissor TEXT,\n  observacoes TEXT,\n  arquivo_url TEXT,\n  created_at TEXT DEFAULT (datetime('now')),\n  updated_at TEXT DEFAULT (datetime('now')),\n  deleted_at TEXT,\n  FOREIGN KEY(funcionario_id) REFERENCES funcionarios(id) ON DELETE RESTRICT\n)"
      }
    ],
    "success": true,
    "meta": {
      "served_by": "v3-prod",
      "served_by_region": "ENAM",
      "served_by_primary": true,
      "timings": {
        "sql_duration_ms": 0.2054
      },
      "duration": 0.2054,
      "changes": 0,
      "last_row_id": 0,
      "changed_db": false,
      "size_after": 1900544,
      "rows_read": 326,
      "rows_written": 0,
      "total_attempts": 1
    }
  }
]
