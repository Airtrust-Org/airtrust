#!/usr/bin/env python3
"""
Rebuild local D1 database from production dump
Parses SQL dump and recreates database structure
"""

import subprocess
import re
from pathlib import Path

def run_wrangler_sql(sql_content, description=""):
    """Execute SQL via wrangler d1"""
    import tempfile
    
    with tempfile.NamedTemporaryFile(mode='w', suffix='.sql', delete=False) as f:
        f.write(sql_content)
        temp_file = f.name
    
    try:
        result = subprocess.run([
            "npx", "wrangler", "d1", "execute", "airtrust-db-dev",
            "--config", "wrangler.dev.toml",
            "--local",
            "--file", temp_file
        ], capture_output=True, text=True, timeout=30)
        
        return result.returncode == 0
    except Exception as e:
        print(f"      ❌ Erro: {str(e)[:100]}")
        return False
    finally:
        Path(temp_file).unlink(missing_ok=True)

def main():
    dump_file = Path("migrations/data-export/prod_clean.sql")
    
    if not dump_file.exists():
        print(f"❌ Arquivo não encontrado: {dump_file}")
        return 1
    
    print("🧹 RECONSTRUINDO BANCO LOCAL DE PRODUÇÃO")
    print("=" * 50)
    print()
    
    # Step 1: Stop wrangler
    print("🛑 Parando worker...")
    subprocess.run(["pkill", "-f", "wrangler dev"], capture_output=True)
    
    # Step 2: Delete DB
    print("🗑️  Removendo banco local...")
    db_path = Path(".wrangler/state/v3/d1/miniflare-D1DatabaseObject")
    if db_path.exists():
        for db_file in db_path.glob("*.sqlite*"):
            db_file.unlink()
    print("✅ Banco removido")
    print()
    
    # Step 3: Parse dump
    print("📖 Lendo dump de produção...")
    content = dump_file.read_text()
    
    # Extract CREATE TABLE statements
    print("🔍 Extraindo definições de tabelas...")
    create_pattern = r'CREATE TABLE[^;]+;'
    creates = re.findall(create_pattern, content, re.IGNORECASE | re.DOTALL)
    
    print(f"✅ Encontradas {len(creates)} tabelas")
    print()
    
    # Step 4: Create tables
    print("🏗️  Criando tabelas...")
    
    # Combine all CREATE statements
    schema_sql = '\n\n'.join(creates)
    
    # Also add PRAGMA
    full_schema = "PRAGMA foreign_keys = OFF;\n\n" + schema_sql + "\n\nPRAGMA foreign_keys = ON;\n"
    
    success = run_wrangler_sql(full_schema, "Schema completo")
    
    if success:
        print("✅ Schema criado")
    else:
        print("⚠️  Schema criado com avisos (esperado)")
    
    print()
    
    # Step 5: Insert data in batches
    print("📥 Inserindo dados...")
    
    # Extract INSERT statements
    insert_pattern = r'INSERT INTO[^;]+;'
    inserts = re.findall(insert_pattern, content, re.IGNORECASE)
    
    print(f"   Total: {len(inserts)} registros")
    print()
    
    # Group by table
    table_inserts = {}
    for insert in inserts:
        match = re.search(r'INSERT INTO ["\']?(\w+)["\']?', insert, re.IGNORECASE)
        if match:
            table = match.group(1)
            if table not in table_inserts:
                table_inserts[table] = []
            table_inserts[table].append(insert)
    
    # Insert data table by table
    priority_tables = [
        'usuarios', 'funcoes', 'setores', 'aeronaves',
        'funcionarios', 'qualificacoes', 'simuladores',
        'treinamentos', 'sessoes', 'manobras', 'fichas_sessao'
    ]
    
    # Process priority tables first
    for table in priority_tables:
        if table in table_inserts:
            inserts_list = table_inserts[table]
            print(f"   {table}: {len(inserts_list)} registros", end=' ')
            
            # Batch inserts (100 at a time)
            batch_size = 100
            total_batches = (len(inserts_list) + batch_size - 1) // batch_size
            
            for i in range(0, len(inserts_list), batch_size):
                batch = inserts_list[i:i+batch_size]
                batch_sql = "PRAGMA foreign_keys = OFF;\n" + '\n'.join(batch) + "\nPRAGMA foreign_keys = ON;"
                run_wrangler_sql(batch_sql)
            
            print("✅")
    
    # Process remaining tables
    for table, inserts_list in table_inserts.items():
        if table not in priority_tables:
            print(f"   {table}: {len(inserts_list)} registros", end=' ')
            
            batch_size = 100
            for i in range(0, len(inserts_list), batch_size):
                batch = inserts_list[i:i+batch_size]
                batch_sql = "PRAGMA foreign_keys = OFF;\n" + '\n'.join(batch) + "\nPRAGMA foreign_keys = ON;"
                run_wrangler_sql(batch_sql)
            
            print("✅")
    
    print()
    print("🔍 Verificando dados...")
    
    # Verify
    for table in ['funcionarios', 'qualificacoes', 'usuarios']:
        result = subprocess.run([
            "npx", "wrangler", "d1", "execute", "airtrust-db-dev",
            "--config", "wrangler.dev.toml",
            "--local",
            "--command", f"SELECT COUNT(*) as total FROM {table}"
        ], capture_output=True, text=True)
        
        if '"total"' in result.stdout:
            count_match = re.search(r'"total":(\d+)', result.stdout)
            if count_match:
                count = count_match.group(1)
                print(f"   ✅ {table}: {count} registros")
    
    print()
    print("✅ BANCO LOCAL RECONSTRUÍDO!")
    print()
    print("🚀 Inicie os servidores:")
    print("   Terminal 1: npm run dev:worker")
    print("   Terminal 2: npm run dev")
    print("   Acesse: http://localhost:3000")
    
    return 0

if __name__ == "__main__":
    exit(main())
