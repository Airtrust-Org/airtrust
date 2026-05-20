#!/usr/bin/env python3
import os
import re

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
    
    # Corrigir duplos parênteses
    content = re.sub(r'fetch\(`\$\{API_BASE_URL\}([^`]+)`\)\);', r'fetch(`${API_BASE_URL}\1`);', content)
    
    if content != original_content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        
        modified += 1
        rel_path = filepath.replace("src/react-app/", "")
        print(f"✅ {rel_path}")

print(f"\n✨ Total de arquivos corrigidos: {modified}")
