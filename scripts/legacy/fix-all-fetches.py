#!/usr/bin/env python3
import os
import re
import sys

# Padrões para encontrar e corrigir URLs relativas
patterns = [
    (r"fetch\(['\"](/api[^'\"]*)['\"]", r"fetch(`${API_BASE_URL}\1`)"),
    (r"fetch\(['\"](/api[^'\"]*)['\"],", r"fetch(`${API_BASE_URL}\1`,"),
]

# Arquivo para exportar API_BASE_URL se não existir
api_import = "const API_BASE_URL = import.meta.env.VITE_API_URL || window.location.origin;\n"

tsx_files = []

# Encontrar todos os arquivos TSX
for root, dirs, files in os.walk("/Users/filipedaumas/Documents/airtrust/src/react-app"):
    for file in files:
        if file.endswith(".tsx"):
            tsx_files.append(os.path.join(root, file))

print(f"🔍 Encontrados {len(tsx_files)} arquivos TSX\n")

modified = 0
for filepath in tsx_files:
    with open(filepath, 'r') as f:
        content = f.read()
    
    original_content = content
    
    # Verificar se já tem a definição de API_BASE_URL
    has_api_base_url = "API_BASE_URL" in content
    
    # Substituir todos os padrões
    for pattern, replacement in patterns:
        content = re.sub(pattern, replacement, content)
    
    # Se houve mudanças e não tem API_BASE_URL, adicionar no início do arquivo
    if content != original_content:
        if not has_api_base_url:
            # Encontrar onde adicionar (após imports)
            import_match = re.search(r"(import [^;]+;[\n\r]+)+", content)
            if import_match:
                end_imports = import_match.end()
                content = content[:end_imports] + "\n" + api_import + content[end_imports:]
            else:
                content = api_import + content
        
        with open(filepath, 'w') as f:
            f.write(content)
        
        modified += 1
        rel_path = filepath.replace("/Users/filipedaumas/Documents/airtrust/", "")
        print(f"✅ {rel_path}")

print(f"\n✨ Total de arquivos corrigidos: {modified}")
