#!/usr/bin/env python3
"""
Script para corrigir datas de conclusão D1 no histórico de qualificações
Data: 28/11/2025
"""

import subprocess
import sys

# Dados corretos de D1 fornecidos pelo usuário
dados_d1 = """134.651.428-37;31/10/2025
419.906.257-20;28/02/2025
052.414.847-36;23/02/2025
387.181.008-80;31/01/2024
899.850.527-49;20/04/2025
017.058.448-80;20/04/2025
772.105.497-49;28/07/2024
722.443.567-87;31/10/2025
112.015.317-48;31/01/2024
401.238.047-87;20/04/2025
012.598.600-94;15/09/2024
734.990.727-34;14/04/2024
311.120.807-91;24/03/2025
058.412.708-18;23/02/2025
102.896.837-66;15/09/2024
563.716.080-53;22/06/2025
093.127.887-28;31/10/2025
663.794.586-20;22/06/2025
939.571.227-91;19/05/2023
155.257.297-84;23/02/2025
713.920.927-87;28/02/2025
145.880.747-92;10/02/2025
052.017.507-70;24/03/2025
768.506.843-53;11/05/2025
083.286.227-42;16/07/2025
108.943.047-71;22/06/2025"""

def converter_data(data_dd_mm_yyyy):
    """Converte DD/MM/YYYY para YYYY-MM-DD"""
    try:
        d, m, y = data_dd_mm_yyyy.split('/')
        return f"{y}-{m.zfill(2)}-{d.zfill(2)}"
    except:
        return None

def gerar_updates():
    """Gera comandos UPDATE para cada registro D1"""
    updates = []
    
    for linha in dados_d1.strip().split('\n'):
        cpf, data_br = linha.strip().split(';')
        cpf_limpo = cpf.replace('.', '').replace('-', '')
        data_iso = converter_data(data_br)
        
        if data_iso:
            # D1 tem validade de 24 meses
            update = f"""UPDATE qualificacoes_historico 
SET data_conclusao = '{data_iso}',
    data_vencimento = date('{data_iso}', '+24 months'),
    updated_at = datetime('now')
WHERE REPLACE(REPLACE(REPLACE(funcionario_cpf, '.', ''), '-', ''), '/', '') = '{cpf_limpo}' 
  AND UPPER(TRIM(qualificacao_codigo)) = 'D1'
  AND deleted_at IS NULL;"""
            updates.append(update)
    
    return updates

def executar_batch(updates):
    """Executa todos os UPDATEs em um único batch"""
    sql = '\n'.join(updates)
    
    try:
        with open('/tmp/fix_d1.sql', 'w') as f:
            f.write(sql)
        
        print(f"🚀 Corrigindo {len(updates)} registros D1...")
        
        result = subprocess.run(
            ['wrangler', 'd1', 'execute', 'airtrust-db', '--remote', '--file', '/tmp/fix_d1.sql'],
            capture_output=True,
            text=True,
            timeout=60
        )
        
        if result.returncode == 0:
            print(f"✅ {len(updates)} registros D1 atualizados com sucesso!")
            return True
        else:
            print(f"❌ Erro: {result.stderr}")
            return False
            
    except Exception as e:
        print(f"❌ Erro: {str(e)}")
        return False

if __name__ == '__main__':
    print("🔧 Gerando comandos UPDATE para D1...")
    updates = gerar_updates()
    print(f"✅ {len(updates)} UPDATEs gerados")
    
    if executar_batch(updates):
        print("\n🎉 Correção D1 concluída! Execute hard refresh no navegador.")
    else:
        print("\n❌ Falha na correção. Verifique os logs.")
        sys.exit(1)
