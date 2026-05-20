#!/usr/bin/env python3
"""
Script para corrigir window.location.origin → API_BASE_URL
Substitui automaticamente em arquivos React/TypeScript
"""

import re
import os
from pathlib import Path

def fix_api_urls(file_path):
    """Corrige URLs de API em um arquivo"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        print(f"❌ Erro ao ler {file_path}: {e}")
        return False
    
    original_content = content
    
    # 1. Adicionar import de API_BASE_URL se não existir
    if 'API_BASE_URL' not in content and 'window.location.origin' in content:
        # Procurar o primeiro import
        import_match = re.search(r"^(import .* from .*\n)", content, re.MULTILINE)
        if import_match:
            insert_pos = import_match.end()
            if "from '@/react-app/config/api'" not in content:
                api_import = "import { API_BASE_URL } from '@/react-app/config/api';\n"
                content = content[:insert_pos] + api_import + content[insert_pos:]
    
    # 2. Substituir window.location.origin/api por `${API_BASE_URL}`
    # Pattern: `${window.location.origin}/api/v2/...` → `${API_BASE_URL}/...`
    content = re.sub(
        r"\$\{window\.location\.origin\}/api/v2/",
        "${API_BASE_URL}/",
        content
    )
    
    # Pattern: `${window.location.origin}/api/...` → `${API_BASE_URL}/...` (sem v2)
    content = re.sub(
        r"\$\{window\.location\.origin\}/api/",
        "${API_BASE_URL}/",
        content
    )
    
    # Pattern: `'${window.location.origin}/api/v2/'` → `'${API_BASE_URL}/'`
    content = re.sub(
        r"'\$\{window\.location\.origin\}/api/v2/",
        "'${API_BASE_URL}/",
        content
    )
    
    # Pattern: concatenação string simples
    # `window.location.origin + '/api/v2/` → `API_BASE_URL + '/`
    content = re.sub(
        r"window\.location\.origin\s*\+\s*['\"]\/api\/v2\/",
        "API_BASE_URL + '",
        content
    )
    
    # Pattern: `window.location.origin/api/v2` → `API_BASE_URL`
    content = re.sub(
        r"window\.location\.origin + ['\"]\/api\/v2['\"]",
        "API_BASE_URL",
        content
    )
    
    if content != original_content:
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"✅ Corrigido: {file_path}")
            return True
        except Exception as e:
            print(f"❌ Erro ao escrever {file_path}: {e}")
            return False
    
    return False

def main():
    """Principal - processa arquivos React/TypeScript"""
    src_dir = Path("src/react-app")
    
    if not src_dir.exists():
        print(f"❌ Diretório {src_dir} não encontrado")
        return
    
    # Procurar arquivos .tsx e .ts
    files = list(src_dir.glob("**/*.tsx")) + list(src_dir.glob("**/*.ts"))
    
    print(f"🔍 Processando {len(files)} arquivos...")
    fixed_count = 0
    
    for file_path in files:
        if fix_api_urls(file_path):
            fixed_count += 1
    
    print(f"\n✅ Corrigidos: {fixed_count} arquivos")
    print("🚀 Próximo passo: npm run build")

if __name__ == "__main__":
    main()
