#!/usr/bin/env python3
"""
Script para corrigir SQL Injection e adicionar LIMIT em queries
Fase 1: Correções Críticas
"""

import re
import os
from pathlib import Path

# Diretório base
BASE_DIR = Path(__file__).parent.parent
API_DIR = BASE_DIR / "src" / "worker" / "api" / "v2"

def fix_sql_injection_in_file(filepath):
    """Corrige vulnerabilidades de SQL injection em um arquivo"""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original_content = content
    changes = []
    
    # Padrão 1: SELECT ... WHERE ${whereClause}
    pattern1 = r'`SELECT\s+(.*?)\s+FROM\s+(\w+)\s+WHERE\s+\$\{(\w+)\}`'
    matches = re.finditer(pattern1, content, re.DOTALL)
    
    for match in matches:
        old_code = match.group(0)
        select_part = match.group(1)
        table = match.group(2)
        var_name = match.group(3)
        
        # Criar versão segura
        new_code = f'`SELECT {select_part} FROM {table} WHERE ${{whereClause}}`'
        
        # Nota: A correção completa requer análise do contexto
        # Este é um placeholder - correção manual necessária
        changes.append(f"ENCONTRADO em linha: {old_code[:100]}...")
    
    if changes:
        print(f"\n{'='*60}")
        print(f"Arquivo: {filepath.name}")
        print(f"Vulnerabilidades SQL Injection encontradas: {len(changes)}")
        for change in changes[:3]:  # Mostrar apenas primeiras 3
            print(f"  - {change}")
        return len(changes)
    
    return 0

def add_limit_to_queries(filepath):
    """Adiciona LIMIT em queries sem paginação"""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Buscar queries SELECT sem LIMIT
    pattern = r'(SELECT\s+.*?\s+FROM\s+\w+.*?WHERE.*?)[\s`\)]'
    matches = re.finditer(pattern, content, re.IGNORECASE | re.DOTALL)
    
    queries_without_limit = []
    for match in matches:
        query = match.group(1)
        if 'LIMIT' not in query.upper() and 'COUNT' not in query.upper():
            queries_without_limit.append(query[:100] + "...")
    
    if queries_without_limit:
        print(f"\n{'='*60}")
        print(f"Arquivo: {filepath.name}")
        print(f"Queries sem LIMIT encontradas: {len(queries_without_limit)}")
        for query in queries_without_limit[:3]:
            print(f"  - {query}")
        return len(queries_without_limit)
    
    return 0

def main():
    print("="*60)
    print("AUDITORIA DE SEGURANÇA - SQL INJECTION E QUERIES SEM LIMIT")
    print("="*60)
    
    total_sql_injections = 0
    total_missing_limits = 0
    
    # Processar todos os arquivos .ts no diretório API
    for filepath in API_DIR.glob("**/*.ts"):
        # Ignorar backups
        if 'backup' in str(filepath).lower() or '.bak' in str(filepath):
            continue
        
        sql_count = fix_sql_injection_in_file(filepath)
        limit_count = add_limit_to_queries(filepath)
        
        total_sql_injections += sql_count
        total_missing_limits += limit_count
    
    print(f"\n{'='*60}")
    print("RESUMO FINAL")
    print(f"{'='*60}")
    print(f"Total SQL Injections encontradas: {total_sql_injections}")
    print(f"Total queries sem LIMIT: {total_missing_limits}")
    print(f"\n⚠️  CORREÇÃO MANUAL NECESSÁRIA")
    print(f"Este script apenas IDENTIFICA os problemas.")
    print(f"As correções devem ser feitas manualmente nos arquivos listados acima.")
    print(f"{'='*60}\n")

if __name__ == "__main__":
    main()
