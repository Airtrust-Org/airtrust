#!/usr/bin/env python3
"""
Import production SQL dump directly into local D1 SQLite file
Uses sqlite3 module to bypass wrangler limitations
"""

import sqlite3
import re
from pathlib import Path
import sys

def main():
    # Paths
    db_dir = Path(".wrangler/state/v3/d1/miniflare-D1DatabaseObject")
    db_file = db_dir / "cd45cc5264daa1c125545b5b4c0756df95d8b6ac5900ecf52323d90f61a47f2d.sqlite"
    schema_file = Path("migrations/data-export/prod_clean.sql")  # Has schema
    data_file = Path("migrations/data-export/prod_data_clean.sql")  # Only data
    
    if not schema_file.exists():
        print(f"❌ Schema não encontrado: {schema_file}")
        return 1
    
    if not data_file.exists():
        print(f"❌ Dados não encontrados: {data_file}")
        return 1
    
    # Ensure directory exists
    db_dir.mkdir(parents=True, exist_ok=True)
    
    # Remove existing database
    if db_file.exists():
        print(f"🗑️  Removendo banco existente...")
        db_file.unlink()
        for related in db_dir.glob("*.sqlite*"):
            related.unlink()
    
    print(f"📖 Lendo schema de produção...")
    schema_sql = schema_file.read_text()
    
    # Extract only CREATE TABLE statements
    create_pattern = r'CREATE TABLE[^;]+;'
    creates = re.findall(create_pattern, schema_sql, re.IGNORECASE | re.DOTALL)
    
    print(f"   Encontradas {len(creates)} tabelas")
    
    print(f"📖 Lendo dados de produção...")
    data_sql = data_file.read_text()
    
    print(f"🔧 Criando novo banco SQLite...")
    
    # Connect to database
    conn = sqlite3.connect(str(db_file))
    cursor = conn.cursor()
    
    try:
        # Disable foreign keys during import
        cursor.execute("PRAGMA foreign_keys = OFF")
        
        print(f"🏗️  Criando estrutura do banco...")
        
        # Create tables one by one
        for i, create_sql in enumerate(creates, 1):
            try:
                cursor.execute(create_sql)
                if i % 10 == 0 or i == len(creates):
                    print(f"   {i}/{len(creates)} tabelas criadas...")
            except sqlite3.Error as e:
                print(f"   ⚠️  Erro na tabela {i}: {str(e)[:100]}")
        
        conn.commit()
        print(f"✅ Estrutura criada!")
        
        print(f"📥 Importando dados...")
        
        # Execute data inserts
        cursor.executescript(data_sql)
        
        conn.commit()
        
        # Re-enable foreign keys
        cursor.execute("PRAGMA foreign_keys = ON")
        conn.commit()
        
        print(f"✅ Dados importados com sucesso!")
        print()
        
        # Verify data
        print("🔍 Verificando dados importados...")
        print()
        
        tables_to_check = [
            'funcionarios', 'qualificacoes', 'usuarios',
            'empresas', 'simuladores', 'sessoes'
        ]
        
        for table in tables_to_check:
            try:
                cursor.execute(f"SELECT COUNT(*) FROM {table}")
                count = cursor.fetchone()[0]
                print(f"  ✅ {table}: {count} registros")
            except sqlite3.Error as e:
                print(f"  ⚠️  {table}: {str(e)[:50]}")
        
        print()
        print("✅ BANCO LOCAL RESTAURADO COM SUCESSO!")
        print()
        print("🚀 Próximos passos:")
        print("   1. Terminal 1: npm run dev:worker")
        print("   2. Terminal 2: npm run dev")
        print("   3. Acesse: http://localhost:3000")
        print()
        
        return 0
        
    except sqlite3.Error as e:
        print(f"❌ Erro ao importar: {e}")
        return 1
    
    finally:
        conn.close()

if __name__ == "__main__":
    sys.exit(main())
