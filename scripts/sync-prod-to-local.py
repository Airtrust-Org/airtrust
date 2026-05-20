#!/usr/bin/env python3
"""
Sync Production Data to Local D1 Database
Copia dados de produção para o banco SQLite local
"""

import sqlite3
import json
import sys
import os
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, Any
from urllib.request import urlopen
from urllib.error import URLError

# Colors
RED = '\033[0;31m'
GREEN = '\033[0;32m'
YELLOW = '\033[1;33m'
BLUE = '\033[0;34m'
NC = '\033[0m'  # No Color

def log_info(msg: str):
    print(f"{BLUE}ℹ{NC} {msg}")

def log_success(msg: str):
    print(f"{GREEN}✓{NC} {msg}")

def log_warn(msg: str):
    print(f"{YELLOW}⚠{NC} {msg}")

def log_error(msg: str):
    print(f"{RED}✗{NC} {msg}")

def find_local_db() -> Optional[str]:
    """Encontrar banco SQLite local"""
    wrangler_dir = Path.cwd() / '.wrangler' / 'state' / 'v3' / 'd1'
    if wrangler_dir.exists():
        for db_file in wrangler_dir.glob('**/miniflare-D1DatabaseObject/*.sqlite'):
            return str(db_file)
    return None

def fetch_production_data(endpoint: str, limit: int = 1000) -> list:
    """Fetch dados de produção"""
    try:
        prod_url = "https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev"
        url = f"{prod_url}{endpoint}?page=1&limit={limit}"
        
        with urlopen(url, timeout=30) as response:
            data = json.loads(response.read().decode())
        
        if isinstance(data, dict) and 'data' in data:
            return data['data']
        return []
    except Exception as e:
        log_warn(f"Erro ao extrair {endpoint}: {e}")
        return []

def import_habilitacoes(conn: sqlite3.Connection, data: list) -> int:
    """Importar habilitações"""
    cursor = conn.cursor()
    count = 0
    
    for item in data:
        try:
            cursor.execute("""
                INSERT OR IGNORE INTO habilitacoes 
                (id, nome, descricao, ativo, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """, (
                item.get('id'),
                item.get('nome', ''),
                item.get('descricao', ''),
                item.get('ativo', 1),
                item.get('created_at', datetime.now().isoformat())
            ))
            count += 1
        except Exception as e:
            log_warn(f"Erro importando habilitação {item.get('id')}: {e}")
    
    conn.commit()
    return count

def import_qualificacoes(conn: sqlite3.Connection, data: list) -> int:
    """Importar qualificações"""
    cursor = conn.cursor()
    count = 0
    
    for item in data:
        try:
            cursor.execute("""
                INSERT OR IGNORE INTO qualificacoes 
                (id, habilitacao_id, nome, descricao, validade_meses, ativo, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """, (
                item.get('id'),
                item.get('habilitacao_id'),
                item.get('nome', ''),
                item.get('descricao', ''),
                item.get('validade_meses', 12),
                item.get('ativo', 1),
                item.get('created_at', datetime.now().isoformat())
            ))
            count += 1
        except Exception as e:
            log_warn(f"Erro importando qualificação {item.get('id')}: {e}")
    
    conn.commit()
    return count

def import_funcionarios(conn: sqlite3.Connection, data: list) -> int:
    """Importar funcionários"""
    cursor = conn.cursor()
    count = 0
    
    for item in data:
        try:
            cursor.execute("""
                INSERT OR IGNORE INTO funcionarios 
                (id, nome, cpf, email, ativo, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """, (
                item.get('id'),
                item.get('nome', ''),
                item.get('cpf', ''),
                item.get('email', ''),
                item.get('ativo', 1),
                item.get('created_at', datetime.now().isoformat())
            ))
            count += 1
        except Exception as e:
            log_warn(f"Erro importando funcionário {item.get('id')}: {e}")
    
    conn.commit()
    return count

def get_local_counts(conn: sqlite3.Connection) -> Dict[str, int]:
    """Obter contagem local"""
    cursor = conn.cursor()
    
    counts = {}
    for table in ['habilitacoes', 'qualificacoes', 'funcionarios']:
        try:
            cursor.execute(f"SELECT COUNT(*) FROM {table} WHERE deleted_at IS NULL")
            counts[table] = cursor.fetchone()[0]
        except:
            counts[table] = 0
    
    return counts

def main():
    print("")
    print(f"{BLUE}=== AirTrust: Sync Production to Local ==={NC}")
    print("")
    
    # Find local database
    log_info("Procurando banco de dados local...")
    db_path = find_local_db()
    
    if not db_path:
        log_error("Banco D1 local não encontrado!")
        log_warn("Execute 'npm run dev:worker' primeiro para inicializar o banco")
        sys.exit(1)
    
    log_success(f"Banco encontrado: {db_path}")
    
    # Connect to database
    try:
        conn = sqlite3.connect(db_path)
    except Exception as e:
        log_error(f"Erro ao conectar no banco: {e}")
        sys.exit(1)
    
    print()
    log_info("Extraindo dados de produção...")
    print()
    
    # Fetch data
    hab_data = fetch_production_data("/api/v2/habilitacoes")
    log_success(f"Habilitações: {len(hab_data)} registros")
    
    qual_data = fetch_production_data("/api/v2/qualificacoes")
    log_success(f"Qualificações: {len(qual_data)} registros")
    
    func_data = fetch_production_data("/api/v2/funcionarios")
    log_success(f"Funcionários: {len(func_data)} registros")
    
    print()
    log_info("Importando dados no banco local...")
    print()
    
    # Import data
    hab_count = import_habilitacoes(conn, hab_data)
    log_success(f"Importadas {hab_count} habilitações")
    
    qual_count = import_qualificacoes(conn, qual_data)
    log_success(f"Importadas {qual_count} qualificações")
    
    func_count = import_funcionarios(conn, func_data)
    log_success(f"Importados {func_count} funcionários")
    
    # Verify
    print()
    log_info("Verificando importação...")
    print()
    
    counts = get_local_counts(conn)
    log_success(f"Habilitações locais: {counts['habilitacoes']}")
    log_success(f"Qualificações locais: {counts['qualificacoes']}")
    log_success(f"Funcionários locais: {counts['funcionarios']}")
    
    conn.close()
    
    print()
    print(f"{BLUE}=== Sincronização Completa! ==={NC}")
    print()
    print(f"Próximos passos:")
    print(f"  1. {YELLOW}npm run dev:worker{NC}   # Backend no localhost:8787")
    print(f"  2. {YELLOW}npm run dev{NC}           # Frontend no localhost:3000")
    print()

if __name__ == '__main__':
    main()
