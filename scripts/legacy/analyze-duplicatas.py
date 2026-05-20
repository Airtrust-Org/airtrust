#!/usr/bin/env python3
import json
import subprocess
import re

def run_sql(sql):
    """Execute SQL via wrangler and return results"""
    result = subprocess.run(
        ["npx", "wrangler", "d1", "execute", "airtrust-db", "--remote", "--command", sql],
        cwd="/Users/filipedaumas/Documents/airtrust v1/worker-airtrust",
        capture_output=True,
        text=True,
        timeout=30
    )
    
    # Parse JSON output
    match = re.search(r'\[\s*\{.*?\}\s*\]', result.stdout, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except Exception as e:
            print(f"Erro ao parsear JSON: {e}")
            return None
    return None

# Primeira query: contar duplicatas
print("🔍 VERIFICANDO DUPLICATAS...\n")

sql_dup = """
SELECT 
  COUNT(DISTINCT funcionario_id) as funcionarios_com_duplicata,
  SUM(cnt) as total_registros_duplicados
FROM (
  SELECT 
    funcionario_id,
    qualificacao_codigo,
    tipo_codigo,
    categoria,
    COUNT(*) as cnt
  FROM qualificacoes_historico
  WHERE deleted_at IS NULL
  GROUP BY funcionario_id, qualificacao_codigo, tipo_codigo, categoria
  HAVING COUNT(*) > 1
)
"""

result = run_sql(sql_dup)
if result and result[0].get('results'):
    res = result[0]['results'][0]
    print(f"Funcionários com duplicatas: {res.get('funcionarios_com_duplicata', 0)}")
    print(f"Total de registros duplicados: {res.get('total_registros_duplicados', 0)}\n")

# Segunda query: listar exemplos
print("EXEMPLOS DE DUPLICATAS:\n")

sql_examples = """
SELECT 
  funcionario_id,
  qualificacao_codigo,
  tipo_codigo,
  categoria,
  COUNT(*) as duplicatas
FROM qualificacoes_historico
WHERE deleted_at IS NULL
GROUP BY funcionario_id, qualificacao_codigo, tipo_codigo, categoria
HAVING COUNT(*) > 1
ORDER BY duplicatas DESC
LIMIT 20
"""

result = run_sql(sql_examples)
if result and result[0].get('results'):
    for i, row in enumerate(result[0]['results'], 1):
        print(f"{i}. Func: {row.get('funcionario_id')} | Qualif: {row.get('qualificacao_codigo')} | Tipo: {row.get('tipo_codigo')} | Cat: {row.get('categoria')} | Dup: {row.get('duplicatas')}")

print("\n" + "="*80)
print("✅ Análise completa!")
