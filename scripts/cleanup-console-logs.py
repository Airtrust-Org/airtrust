#!/usr/bin/env python3
"""
Script para remover console.log e console.debug de produção
Mantém apenas console.error e console.warn
"""
import os
import re

def remove_console_logs(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        original_content = content
        
        # Remove console.log e console.debug (mantém error e warn)
        patterns = [
            (r'\s*console\.log\([^)]*\);?\s*\n?', ''),
            (r'\s*console\.debug\([^)]*\);?\s*\n?', ''),
            (r'\s*console\.table\([^)]*\);?\s*\n?', ''),
            (r'\s*console\.info\([^)]*\);?\s*\n?', ''),
        ]
        
        for pattern, replacement in patterns:
            content = re.sub(pattern, replacement, content, flags=re.MULTILINE)
        
        if content != original_content:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            return True
        return False
    except Exception as e:
        print(f"❌ Erro ao processar {file_path}: {e}")
        return False

def main():
    print("🧹 Removendo console.logs desnecessários...")
    
    count = 0
    total = 0
    
    # Processar todos arquivos .tsx e .ts
    for root, dirs, files in os.walk('src'):
        # Ignorar node_modules e dist
        dirs[:] = [d for d in dirs if d not in ['node_modules', 'dist', '.vite']]
        
        for file in files:
            if file.endswith(('.tsx', '.ts')):
                total += 1
                file_path = os.path.join(root, file)
                if remove_console_logs(file_path):
                    count += 1
                    print(f"  ✏️  {file_path}")
    
    print(f"\n✅ Console.logs removidos!")
    print(f"📊 Arquivos processados: {total}")
    print(f"📝 Arquivos modificados: {count}")

if __name__ == "__main__":
    main()
