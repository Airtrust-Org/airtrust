#!/usr/bin/env python3
"""
Restore production data to local D1 database
Processes SQL dump and applies it using wrangler
"""

import subprocess
import sys
import re
from pathlib import Path

def main():
    # Read the dump file
    dump_file = Path("migrations/data-export/prod_clean.sql")
    
    if not dump_file.exists():
        print(f"❌ File not found: {dump_file}")
        sys.exit(1)
    
    print("📖 Reading dump file...")
    content = dump_file.read_text()
    
    # Extract CREATE TABLE statements
    print("🔍 Extracting CREATE TABLE statements...")
    create_stmts = []
    insert_stmts = []
    
    # Split by statements
    statements = content.split(';')
    
    for stmt in statements:
        stmt = stmt.strip()
        if not stmt:
            continue
            
        if stmt.startswith('CREATE TABLE'):
            # Extract table creation
            create_stmts.append(stmt + ';')
        elif stmt.startswith('INSERT INTO'):
            insert_stmts.append(stmt + ';')
    
    print(f"✅ Found {len(create_stmts)} CREATE TABLE statements")
    print(f"✅ Found {len(insert_stmts)} INSERT statements")
    
    # Create temp file with all CREATE statements
    creates_file = Path("/tmp/creates.sql")
    creates_file.write_text('\n'.join(create_stmts))
    
    print(f"\n🏗️  Applying schema ({len(create_stmts)} tables)...")
    result = subprocess.run([
        "npx", "wrangler", "d1", "execute", "airtrust-db-dev",
        "--config", "wrangler.dev.toml",
        "--local",
        "--file", str(creates_file)
    ], capture_output=True, text=True)
    
    if result.returncode != 0:
        print(f"⚠️  Schema warnings (expected): {result.stderr[:500]}")
    
    # Apply INSERTs in batches
    batch_size = 500
    total_batches = (len(insert_stmts) + batch_size - 1) // batch_size
    
    print(f"\n📥 Applying data in {total_batches} batches...")
    
    for i in range(0, len(insert_stmts), batch_size):
        batch_num = i // batch_size + 1
        batch = insert_stmts[i:i+batch_size]
        
        # Create temp file for batch
        batch_file = Path(f"/tmp/batch_{batch_num}.sql")
        batch_file.write_text('\n'.join(batch))
        
        print(f"  [{batch_num}/{total_batches}] Applying batch ({len(batch)} inserts)...", end=' ')
        
        result = subprocess.run([
            "npx", "wrangler", "d1", "execute", "airtrust-db-dev",
            "--config", "wrangler.dev.toml",
            "--local",
            "--file", str(batch_file)
        ], capture_output=True, text=True)
        
        if result.returncode == 0:
            print("✅")
        else:
            print(f"⚠️  (some errors)")
            if "no such table" in result.stderr:
                print(f"     Missing table: {result.stderr[:200]}")
    
    print("\n✅ Data restore complete!")
    print("\n📊 Verifying data...")
    
    # Verify some tables
    tables_to_check = ['funcionarios', 'qualificacoes', 'empresas', 'usuarios']
    
    for table in tables_to_check:
        result = subprocess.run([
            "npx", "wrangler", "d1", "execute", "airtrust-db-dev",
            "--config", "wrangler.dev.toml",
            "--local",
            "--command", f"SELECT COUNT(*) as total FROM {table}"
        ], capture_output=True, text=True)
        
        if "total" in result.stdout:
            # Extract count from JSON output
            import json
            try:
                data = json.loads(result.stdout)
                if data and len(data) > 0 and 'results' in data[0]:
                    count = data[0]['results'][0]['total'] if data[0]['results'] else 0
                    print(f"  ✅ {table}: {count} registros")
            except:
                print(f"  ℹ️  {table}: verificação manual necessária")

if __name__ == "__main__":
    main()
