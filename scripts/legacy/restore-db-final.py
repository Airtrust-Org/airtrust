#!/usr/bin/env python3
"""
Final DB restore: Use schema oficial + data from dump
"""

import sqlite3
import re
from pathlib import Path
import sys

def main():
    # Paths
    db_dir = Path(".wrangler/state/v3/d1/miniflare-D1DatabaseObject")
    db_file = db_dir / "cd45cc5264daa1c125545b5b4c0756df95d8b6ac5900ecf52323d90f61a47f2d.sqlite"
    
    # Use official schema
    schema_file = Path("migrations-prod/0001_schema_completo.sql")
    
    # Use clean data (only INSERTs)
    data_file = Path("migrations/data-export/prod_data_clean.sql")
    
    if not schema_file.exists():
        print(f"❌ Schema não encontrado: {schema_file}")
        return 1
    
    if not data_file.exists():
        print(f"❌ Dados não encontrados: {data_file}")
        return 1
    
    print("🧹 RESTAURANDO BANCO LOCAL DE PRODUÇÃO")
    print("=" * 50)
    print()
    
    # Ensure directory exists
    db_dir.mkdir(parents=True, exist_ok=True)
    
    # Remove existing database
    print("🗑️  Removendo banco existente...")
    if db_file.exists():
        db_file.unlink()
    for related in db_dir.glob("*.sqlite*"):
        related.unlink()
    print("✅ Banco removido")
    print()
    
    # Read files
    print("📖 Lendo schema oficial...")
    schema_sql = schema_file.read_text()
    
    print("📖 Lendo dados de produção...")
    data_sql = data_file.read_text()
    
    # Connect to database
    print("🔧 Criando banco SQLite...")
    conn = sqlite3.connect(str(db_file))
    cursor = conn.cursor()
    
    try:
        # Disable foreign keys
        cursor.execute("PRAGMA foreign_keys = OFF")
        
        # Apply schema
        print("🏗️  Aplicando schema...")
        cursor.executescript(schema_sql)
        conn.commit()
        print("✅ Schema aplicado")
        print()
        
        # Apply data
        print("📥 Importando dados...")
        try:
            cursor.executescript(data_sql)
            conn.commit()
            print("✅ Dados importados")
        except sqlite3.Error as e:
            print(f"⚠️  Alguns dados podem não ter sido importados: {str(e)[:100]}")
            print("   Continuando mesmo assim...")
        
        print()
        
        # Re-enable foreign keys
        cursor.execute("PRAGMA foreign_keys = ON")
        conn.commit()
        
        # Verify data
        print("🔍 Verificando dados importados...")
        print()
        
        tables = [
            'funcionarios', 'qualificacoes', 'usuarios',
            'funcoes', 'setores', 'aeronaves',
            'simuladores', 'sessoes', 'manobras'
        ]
        
        total_records = 0
        for table in tables:
            try:
                cursor.execute(f"SELECT COUNT(*) FROM {table}")
                count = cursor.fetchone()[0]
                total_records += count
                print(f"  ✅ {table:20} {count:>5} registros")
            except sqlite3.Error as e:
                print(f"  ⚠️  {table:20} Erro: {str(e)[:40]}")
        
        print()
        print(f"📊 Total: {total_records} registros importados")
        print()
        
        if total_records > 0:
            print("✅ BANCO LOCAL RESTAURADO COM SUCESSO!")
            print()
            print("🚀 Próximos passos:")
            print("   1. Terminal 1: npm run dev:worker")
            print("   2. Terminal 2: npm run dev")
            print("   3. Acesse: http://localhost:3000")
            print()
            return 0
        else:
            print("⚠️  Nenhum dado foi importado. Verifique os arquivos.")
            return 1
            
    except sqlite3.Error as e:
        print(f"❌ Erro fatal: {e}")
        return 1
    
    finally:
        conn.close()

if __name__ == "__main__":
    sys.exit(main())
