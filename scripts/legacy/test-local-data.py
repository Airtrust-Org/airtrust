#!/usr/bin/env python3
import sqlite3

db_path = "worker-airtrust/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/e7352547963de7050bd7d94658afc4fe78b61811b7815da12d90be8e863abf4d.sqlite"

conn = sqlite3.connect(db_path)
cur = conn.cursor()

# Teste cada tabela
tables = [
    "qualificacoes_categorias",
    "qualificacoes_tipos",
    "funcionarios",
    "qualificacoes_historico",
    "certificados",
]

for table in tables:
    cur.execute(f"SELECT COUNT(*) as c FROM {table}")
    count = cur.fetchone()[0]
    print(f"✅ {table}: {count} rows")

# Amostra de dados
print("\n📊 Primeiros 3 históricos:")
cur.execute("SELECT id, funcionario_id, qualificacao_id, created_at FROM qualificacoes_historico LIMIT 3")
for row in cur.fetchall():
    print(f"   ID: {row[0]}, FuncID: {row[1]}, QualID: {row[2]}, Created: {row[3]}")

conn.close()
print("\n✅ Dados confirmados no banco local!")
