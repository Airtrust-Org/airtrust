#!/usr/bin/env python3
"""
Script para refatorar rotas para usar Services + DTOs
"""

import os
import re

routes = {
    'qualificacoes': 'QualificacoesService',
    'funcionarios': 'FuncionariosService',
    'empresas': 'EmpresasService',
    'certificados': 'CertificadosService',
    'simuladores': 'SimuladoresService',
    'categorias': 'CategoriasService',
    'funcoes': 'FuncoesService',
}

base_dir = '/Users/filipedaumas/Documents/airtrust/src/worker'

for route_name, service_class in routes.items():
    file_path = f'{base_dir}/routes/{route_name}.ts'
    
    if not os.path.exists(file_path):
        print(f"❌ Arquivo não encontrado: {file_path}")
        continue
    
    with open(file_path, 'r') as f:
        content = f.read()
    
    # Remover importação de z e schema antigo
    content = re.sub(r"import { z } from 'zod';\n", '', content)
    content = re.sub(r"const \w+Schema = z\.object\(\{[\s\S]*?\}\);?\n\n", '', content)
    
    # Adicionar importação do Service
    import_section = f"import {{ Hono }} from 'hono';\nimport type {{ Env }} from '../types/index';\nimport {{ {service_class} }} from '../services/{route_name}Service';\nimport {{\n  Create{route_name.capitalize()}DTO,\n  Update{route_name.capitalize()}DTO,\n  {route_name.capitalize()}ResponseDTO\n}} from '../dtos/{route_name}';\nimport {{ PaginationSchema }} from '../schemas/pagination';"
    
    # Substituir imports
    content = re.sub(
        r"import { Hono } from 'hono';.*?from '../types/index';",
        import_section,
        content,
        flags=re.DOTALL
    )
    
    # Simplificar GET / handlers
    content = re.sub(
        r"router\.get\('/'\, async \(c\) => \{\s*try \{",
        f"router.get('/', async (c) => {{\n    const service = new {service_class}(c.env.DB);",
        content
    )
    
    # Simplificar POST handlers
    content = re.sub(
        r"router\.post\('/'\, async \(c\) => \{\s*try \{",
        f"router.post('/', async (c) => {{\n    const service = new {service_class}(c.env.DB);",
        content
    )
    
    print(f"✅ Processado: {route_name}")

print("\n✅ Refatoração completa!")
