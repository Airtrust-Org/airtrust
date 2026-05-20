#!/usr/bin/env python3
"""
FASE 33 - Correção automática de endpoints sem auth()
Data: 2025-11-15
"""

import re
from pathlib import Path

# Arquivos e linhas com endpoints sem auth() (baseado na auditoria)
CORRECTIONS = {
    'qualificacoes.ts': [
        (33, "app.get('/', async (c) => {", "app.get('/', auth(), async (c) => {"),
        (67, "app.get('/tipos', async (c) => {", "app.get('/tipos', auth(), async (c) => {"),
        (104, "app.get('/historico', async (c) => {", "app.get('/historico', auth(), async (c) => {"),
        (218, "app.post('/historico', async (c) => {", "app.post('/historico', auth(), requireRole('admin', 'manager'), async (c) => {"),
        (287, "app.put('/historico/:id', async (c) => {", "app.put('/historico/:id', auth(), requireRole('admin', 'manager'), async (c) => {"),
        (383, "app.delete('/historico/:id', async (c) => {", "app.delete('/historico/:id', auth(), requireRole('admin'), async (c) => {"),
    ],
    'simuladores.ts': [
        (24, "app.get('/', async (c) => {", "app.get('/', auth(), async (c) => {"),
        (63, "app.get('/sessoes', async (c) => {", "app.get('/sessoes', auth(), async (c) => {"),
        (162, "app.post('/sessoes', async (c) => {", "app.post('/sessoes', auth(), requireRole('admin', 'manager'), async (c) => {"),
        (223, "app.put('/sessoes/:id', async (c) => {", "app.put('/sessoes/:id', auth(), requireRole('admin', 'manager'), async (c) => {"),
        (296, "app.delete('/sessoes/:id', async (c) => {", "app.delete('/sessoes/:id', auth(), requireRole('admin'), async (c) => {"),
    ],
}

ROUTES_DIR = Path('/Users/filipedaumas/Documents/airtrust v1/worker-airtrust/src/routes')

def apply_corrections():
    total_fixed = 0
    
    for filename, corrections in CORRECTIONS.items():
        filepath = ROUTES_DIR / filename
        
        if not filepath.exists():
            print(f"⚠️  Arquivo não encontrado: {filepath}")
            continue
            
        with open(filepath, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        
        # Aplicar correções de trás para frente para não bagunçar numeração de linhas
        for line_num, old_text, new_text in reversed(corrections):
            idx = line_num - 1  # Convert 1-indexed to 0-indexed
            
            if idx < len(lines) and old_text in lines[idx]:
                lines[idx] = lines[idx].replace(old_text, new_text)
                total_fixed += 1
                print(f"✅ {filename}:{line_num} - Corrigido")
            else:
                print(f"⚠️  {filename}:{line_num} - Não encontrado ou já corrigido")
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.writelines(lines)
    
    print(f"\n🎉 Total de endpoints corrigidos: {total_fixed}")

if __name__ == '__main__':
    apply_corrections()
