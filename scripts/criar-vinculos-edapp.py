#!/usr/bin/env python3
"""
Script para criar vínculos EdApp e reprocessar eventos históricos
Baseado nos dados do CSV exportado do EdApp
"""

import subprocess
import json

# Funcionários do CSV com seus EdApp User IDs (extraídos manualmente do EdApp)
# Formato: email -> (nome, edapp_user_id)
FUNCIONARIOS_EDAPP = {
    # Já vinculados (não precisa processar):
    # "caio.alcantara@voecostadosol.com.br": vinculado
    # "dieter.kuhr@voecostadosol.com.br": vinculado  
    # "filipe.daumas@voecostadosol.com.br": vinculado
    # "karl.kuhr@voecostadosol.com.br": vinculado
    # "max.magioli@voecostadosol.com.br": vinculado
    # "paloma.magioli@voecostadosol.com.br": vinculado
    # "rafael.paradeda@voecostadosol.com.br": vinculado
    # "ramon.bastos@voecostadosol.com.br": vinculado
    # "rubens.silva@voecostadosol.com.br": vinculado
    # "wilson.nery@voecostadosol.com.br": vinculado
    
    # Funcionários que existem no AirTrust mas NÃO tem vínculo EdApp:
    # Precisamos buscar os edapp_user_id deles via API do EdApp
}

def buscar_funcionario_airtrust(email):
    """Busca ID do funcionário no AirTrust pelo email"""
    cmd = f'''wrangler d1 execute airtrust-db --remote --command="SELECT id, nome FROM funcionarios WHERE email = '{email}' AND deleted_at IS NULL"'''
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd="/Users/filipedaumas/Documents/airtrust v1")
    return result.stdout

def criar_vinculo_edapp(funcionario_id, edapp_user_id, edapp_email):
    """Cria vínculo entre funcionário AirTrust e usuário EdApp"""
    sql = f"""
INSERT INTO integracoes_edapp_usuarios (
  funcionario_id,
  edapp_user_id,
  edapp_email,
  edapp_username,
  ativo,
  created_at,
  updated_at
) VALUES (
  {funcionario_id},
  '{edapp_user_id}',
  '{edapp_email}',
  '{edapp_email.split('@')[0]}',
  1,
  datetime('now'),
  datetime('now')
);
"""
    cmd = f'''wrangler d1 execute airtrust-db --remote --command="{sql}"'''
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd="/Users/filipedaumas/Documents/airtrust v1")
    return result.returncode == 0

def reprocessar_eventos_nao_processados():
    """Marca eventos como não processados para reprocessamento via API"""
    # A API /integracoes/edapp/historico já processa eventos com processado=0
    # Então vamos apenas chamar o endpoint
    print("\\n🔄 Para reprocessar eventos, execute:")
    print("curl -X POST https://api.airtrust.online/api/integracoes/edapp/historico")
    print("\\nOu acesse a interface web em: Configurações > Integrações > EdApp > Importar Histórico")

if __name__ == "__main__":
    print("=" * 60)
    print("CRIAR VÍNCULOS EDAPP - AirTrust")
    print("=" * 60)
    
    print("\\n⚠️  ATENÇÃO:")
    print("Este script precisa dos EdApp User IDs dos funcionários.")
    print("Os IDs devem ser obtidos via API do EdApp ou exportação CSV.")
    print("\\nFormato necessário:")
    print("  email@domain.com -> edapp_user_id (exemplo: 64bdc06b4a16e4ac98a5a32a)")
    
    print("\\n📋 Próximos passos manuais:")
    print("\\n1. Buscar EdApp User IDs via API:")
    print("   curl -H 'Authorization: Bearer <TOKEN>' https://rest.edapp.com/v2/users")
    
    print("\\n2. Para cada funcionário, executar SQL:")
    print("""
    INSERT INTO integracoes_edapp_usuarios (
      funcionario_id,
      edapp_user_id,
      edapp_email,
      edapp_username,
      ativo
    )
    SELECT 
      f.id,
      '<EDAPP_USER_ID>',
      f.email,
      SUBSTR(f.email, 1, INSTR(f.email, '@') - 1),
      1
    FROM funcionarios f
    WHERE f.email = '<EMAIL>'
      AND f.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM integracoes_edapp_usuarios u
        WHERE u.funcionario_id = f.id AND u.deleted_at IS NULL
      );
    """)
    
    print("\\n3. Reprocessar eventos históricos:")
    print("   POST /api/integracoes/edapp/historico")
    
    print("\\n" + "=" * 60)
    print("Para automatizar, preencha FUNCIONARIOS_EDAPP no código")
    print("=" * 60)
