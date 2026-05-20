CREATE TABLE IF NOT EXISTS importacoes_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entidade TEXT,
  usuario_id INTEGER,
  total_rows INTEGER,
  to_create INTEGER,
  to_update INTEGER,
  to_skip INTEGER,
  created INTEGER,
  updated INTEGER,
  skipped INTEGER,
  failed INTEGER,
  merge_mode TEXT,
  file_name TEXT,
  raw_data TEXT,
  created_at TEXT,
  reverted_at TEXT
);
