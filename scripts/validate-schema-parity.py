#!/usr/bin/env python3
"""
validate-schema-parity.py
Valida se schema local está igual ao de produção
"""

import subprocess
import json
import sys
from typing import Dict, List

TABLES = [
    "modelos_sessao",
    "cadastro_manobras", 
    "template_manobras",
    "manobras_categorias",
    "sessoes_template"
]

def get_schema(table: str, remote: bool = False) -> List[Dict]:
    """Retorna schema de uma tabela"""
    flag = "--remote" if remote else "--local"
    cmd = f'cd worker-airtrust && npx wrangler d1 execute DB {flag} --command="PRAGMA table_info({table})" --json'
    
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=30)
        
        if result.returncode != 0:
            print(f"❌ Erro ao obter schema de {table} ({'remoto' if remote else 'local'})")
            return []
        
        # Parse JSON output do wrangler
        output = result.stdout
        if "results" in output:
            data = json.loads(output)
            return data.get("results", [])
        
        return []
    except Exception as e:
        print(f"❌ Erro: {e}")
        return []

def compare_schemas(local: List[Dict], remote: List[Dict], table: str) -> List[str]:
    """Compara dois schemas e retorna diferenças"""
    issues = []
    
    # Converter para dict por nome de coluna
    local_cols = {col["name"]: col for col in local}
    remote_cols = {col["name"]: col for col in remote}
    
    # Colunas faltando no local
    missing = set(remote_cols.keys()) - set(local_cols.keys())
    if missing:
        issues.append(f"  ❌ Faltam colunas no local: {', '.join(missing)}")
    
    # Colunas extras no local
    extra = set(local_cols.keys()) - set(remote_cols.keys())
    if extra:
        issues.append(f"  ⚠️  Colunas extras no local: {', '.join(extra)}")
    
    # Tipos diferentes
    for col_name in set(local_cols.keys()) & set(remote_cols.keys()):
        if local_cols[col_name]["type"] != remote_cols[col_name]["type"]:
            issues.append(
                f"  ❌ Tipo diferente em '{col_name}': "
                f"local={local_cols[col_name]['type']} vs "
                f"remoto={remote_cols[col_name]['type']}"
            )
    
    return issues

def main():
    print("🔍 Comparando schemas local vs produção...")
    print("=" * 50)
    print()
    
    all_issues = []
    
    for table in TABLES:
        print(f"📊 Tabela: {table}")
        
        local = get_schema(table, remote=False)
        remote = get_schema(table, remote=True)
        
        if not local and not remote:
            print(f"  ⚠️  Tabela não existe em nenhum ambiente")
            continue
        
        if not local:
            print(f"  ❌ Tabela não existe no local!")
            all_issues.append(table)
            continue
        
        if not remote:
            print(f"  ⚠️  Tabela não existe em produção (OK se tabela nova)")
            continue
        
        issues = compare_schemas(local, remote, table)
        
        if not issues:
            print(f"  ✅ Schemas idênticos ({len(local)} colunas)")
        else:
            print(f"  ❌ {len(issues)} diferença(s) encontrada(s):")
            for issue in issues:
                print(issue)
            all_issues.append(table)
        
        print()
    
    print("=" * 50)
    
    if not all_issues:
        print("✅ Todos os schemas estão idênticos!")
        return 0
    else:
        print(f"❌ {len(all_issues)} tabela(s) com problemas:")
        for table in all_issues:
            print(f"  - {table}")
        print()
        print("💡 Execute: npm run db:schema:sync")
        return 1

if __name__ == "__main__":
    sys.exit(main())
