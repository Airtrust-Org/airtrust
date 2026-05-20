#!/usr/bin/env python3
import os
import re

api_import = "import { fetchWithBaseUrl } from '../utils/apiUtils';\n"

tsx_files = []
for root, dirs, files in os.walk("src/react-app"):
    for file in files:
        if file.endswith(".tsx"):
            tsx_files.append(os.path.join(root, file))

print(f"🔍 Encontrados {len(tsx_files)} arquivos TSX\n")

modified = 0
for filepath in tsx_files:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original_content = content
    
    # Verificar se já tem import de apiUtils
    has_api_import = "from '../utils/apiUtils'" in content or 'from "../utils/apiUtils"' in content
    
    # Substituir fetch('/api...) por fetchWithBaseUrl('/api...)
    # Padrão 1: fetch('/api...') sem opções
    content = re.sub(r"fetch\('(/api[^']+)'\)", r"fetchWithBaseUrl('\1')", content)
    # Padrão 2: fetch("/api...") sem opções
    content = re.sub(r'fetch\("(/api[^"]+)"\)', r"fetchWithBaseUrl('\1')", content)
    # Padrão 3: fetch('/api...', {
    content = re.sub(r"fetch\('(/api[^']+)'\s*,\s*\{", r"fetchWithBaseUrl('\1', {", content)
    # Padrão 4: fetch("/api...", {
    content = re.sub(r'fetch\("(/api[^"]+)"\s*,\s*\{', r"fetchWithBaseUrl('\1', {", content)
    
    # Se houve mudanças, adicionar import se não tiver
    if content != original_content and not has_api_import:
        # Encontrar a primeira linha de import para inserir após
        match = re.search(r"^(import [^;]+;[\n\r]+)", content, re.MULTILINE)
        if match:
            end_pos = match.end()
            content = content[:end_pos] + api_import + content[end_pos:]
        else:
            content = api_import + content
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        
        modified += 1
        rel_path = filepath.replace("src/react-app/", "")
        print(f"✅ {rel_path}")

print(f"\n✨ Total de arquivos corrigidos: {modified}")
