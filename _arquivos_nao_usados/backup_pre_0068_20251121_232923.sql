
 ⛅️ wrangler 4.45.3 (update available 4.50.0)
─────────────────────────────────────────────
Resource location: local 

Use --remote if you want to access the remote instance.

🌀 Executing on local database DB (DB) from .wrangler/state/v3/d1:
🌀 To execute on your remote database, add a --remote flag to your wrangler command.
🚣 1 command executed successfully.
[
  {
    "results": [
      {
        "sql": "CREATE TABLE qualificacoes_tipos (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  nome TEXT NOT NULL UNIQUE,\n  descricao TEXT,\n  nivel TEXT,\n  criada_em TEXT DEFAULT (datetime('now')),\n  atualizada_em TEXT DEFAULT (datetime('now')),\n  deletada_em TEXT\n)"
      }
    ],
    "success": true,
    "meta": {
      "duration": 1
    }
  }
]
