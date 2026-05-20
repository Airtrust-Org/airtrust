#!/usr/bin/env python3
"""
Auditoria EdApp vs AirTrust
Compara dados exportados do EdApp com qualificações no AirTrust
"""

import json
from datetime import datetime

# Mapeamento de cursos EdApp → Códigos AirTrust
MAPEAMENTO_CURSOS = {
    "3.5 - Conhecimentos Gerais de Aeronaves": "B",
    "3.7 - Emergências Gerais": "C",
    "3.6.3 - Operações em Terrenos Desabitados ou Selva": "E6",
    "3.6.1 - Operações Offshore": "E1",
    "3.6.4 - Operação PBN - Navegação Baseada em Performance": "E2",
    "3.6.5 - Operação Aeromédica": "E4",
    "3.6.6 - Operação com EFB - Eletronic Flight Bag": "E5",
}

# Dados do EdApp (extraídos do CSV fornecido)
dados_edapp = {
    "adriana.brasil@voecostadosol.com.br": [
        ("3.6.3 - Operações em Terrenos Desabitados ou Selva", "25/09/2025 10:30"),
        ("3.6.5 - Operação Aeromédica", "22/10/2025 09:25"),
        ("3.7 - Emergências Gerais", "22/10/2025 11:13"),
        ("3.5 - Conhecimentos Gerais de Aeronaves", "22/10/2025 20:04"),
        ("3.6.1 - Operações Offshore", "24/10/2025 12:40"),
        ("3.6.4 - Operação PBN - Navegação Baseada em Performance", "17/11/2025 10:21"),
        ("3.6.6 - Operação com EFB - Eletronic Flight Bag", "17/11/2025 10:40"),
    ],
    "antonio.ramos@voecostadosol.com.br": [
        ("3.6.3 - Operações em Terrenos Desabitados ou Selva", "04/10/2025 23:17"),
        ("3.5 - Conhecimentos Gerais de Aeronaves", "28/10/2025 23:50"),
        ("3.7 - Emergências Gerais", "29/10/2025 02:17"),
        ("3.6.5 - Operação Aeromédica", "29/10/2025 22:31"),
        ("3.6.4 - Operação PBN - Navegação Baseada em Performance", "31/10/2025 00:18"),
        ("3.6.1 - Operações Offshore", "01/11/2025 01:46"),
        ("3.6.6 - Operação com EFB - Eletronic Flight Bag", "01/11/2025 20:08"),
    ],
    "antunes.bernardo@voecostadosol.com.br": [
        ("3.7 - Emergências Gerais", "19/11/2025 14:15"),
        ("3.5 - Conhecimentos Gerais de Aeronaves", "19/11/2025 18:12"),
    ],
    "caio.alcantara@voecostadosol.com.br": [
        ("3.6.3 - Operações em Terrenos Desabitados ou Selva", "31/10/2025 19:47"),
        ("3.5 - Conhecimentos Gerais de Aeronaves", "03/11/2025 12:16"),
        ("3.7 - Emergências Gerais", "03/11/2025 13:08"),
        ("3.6.5 - Operação Aeromédica", "03/11/2025 13:15"),
        ("3.6.1 - Operações Offshore", "05/11/2025 11:57"),
        ("3.6.6 - Operação com EFB - Eletronic Flight Bag", "05/11/2025 12:01"),
        ("3.6.4 - Operação PBN - Navegação Baseada em Performance", "05/11/2025 17:53"),
    ],
    "filipe.daumas@voecostadosol.com.br": [
        ("3.7 - Emergências Gerais", "21/07/2025 12:06"),
        ("3.5 - Conhecimentos Gerais de Aeronaves", "28/08/2025 13:33"),
    ],
    "dieter.kuhr@voecostadosol.com.br": [
        ("3.6.3 - Operações em Terrenos Desabitados ou Selva", "04/09/2025 21:28"),
        ("3.6.5 - Operação Aeromédica", "19/11/2025 17:58"),
        ("3.7 - Emergências Gerais", "19/11/2025 17:26"),
        ("3.5 - Conhecimentos Gerais de Aeronaves", "19/11/2025 16:13"),
        ("3.6.6 - Operação com EFB - Eletronic Flight Bag", "19/11/2025 21:49"),
        ("3.6.1 - Operações Offshore", "20/11/2025 14:34"),
        ("3.6.4 - Operação PBN - Navegação Baseada em Performance", "19/11/2025 22:44"),
    ],
}

def parse_data_edapp(data_str):
    """Converte data do EdApp (DD/MM/YYYY HH:MM) para formato ISO (YYYY-MM-DD)"""
    dt = datetime.strptime(data_str, "%d/%m/%Y %H:%M")
    return dt.strftime("%Y-%m-%d")

def gerar_sql_auditoria():
    """Gera queries SQL para cada funcionário"""
    queries = []
    
    for email, cursos in dados_edapp.items():
        for curso_nome, data_completa in cursos:
            codigo_qualif = MAPEAMENTO_CURSOS.get(curso_nome)
            if not codigo_qualif:
                continue
            
            data_iso = parse_data_edapp(data_completa)
            
            query = f"""
-- {email} | {curso_nome} | EdApp: {data_completa}
SELECT 
  '{email}' as email,
  '{codigo_qualif}' as codigo_esperado,
  '{data_iso}' as data_edapp,
  qh.id as qualif_id,
  qh.qualificacao_codigo as codigo_airtrust,
  qh.data_conclusao as data_airtrust,
  CASE 
    WHEN qh.id IS NULL THEN '❌ NÃO EXISTE'
    WHEN qh.data_conclusao = '{data_iso}' THEN '✅ OK'
    ELSE '⚠️ DATA DIFERENTE: ' || qh.data_conclusao
  END as status
FROM funcionarios f
LEFT JOIN qualificacoes_historico qh 
  ON f.id = qh.funcionario_id 
  AND qh.qualificacao_codigo = '{codigo_qualif}'
  AND qh.deleted_at IS NULL
WHERE f.email = '{email}'
  AND f.deleted_at IS NULL
ORDER BY qh.data_conclusao DESC
LIMIT 1;
"""
            queries.append(query)
    
    return "\n".join(queries)

def gerar_relatorio_markdown():
    """Gera relatório detalhado em Markdown"""
    total_cursos = sum(len(cursos) for cursos in dados_edapp.values())
    total_funcionarios = len(dados_edapp)
    
    md = f"""# 📊 RELATÓRIO DETALHADO: EdApp vs AirTrust

## 📋 RESUMO GERAL

- **Total de funcionários no EdApp:** {total_funcionarios}
- **Total de cursos concluídos:** {total_cursos}
- **Data da auditoria:** {datetime.now().strftime("%d/%m/%Y %H:%M")}

---

## 👥 DADOS POR FUNCIONÁRIO

"""
    
    for email, cursos in sorted(dados_edapp.items()):
        nome = email.split('@')[0].replace('.', ' ').title()
        md += f"\n### {nome}\n**Email:** {email}\n\n"
        md += f"**Total de cursos:** {len(cursos)}\n\n"
        md += "| Curso | Código | Data Conclusão EdApp |\n"
        md += "|-------|--------|----------------------|\n"
        
        for curso_nome, data_completa in sorted(cursos, key=lambda x: x[1]):
            codigo = MAPEAMENTO_CURSOS.get(curso_nome, "???")
            data_iso = parse_data_edapp(data_completa)
            md += f"| {curso_nome} | **{codigo}** | {data_iso} |\n"
        
        md += "\n"
    
    return md

if __name__ == "__main__":
    print("=== GERANDO SQL DE AUDITORIA ===\n")
    sql = gerar_sql_auditoria()
    with open("audit-edapp-complete.sql", "w", encoding="utf-8") as f:
        f.write(sql)
    print("✅ SQL gerado: audit-edapp-complete.sql\n")
    
    print("=== GERANDO RELATÓRIO MARKDOWN ===\n")
    md = gerar_relatorio_markdown()
    with open("RELATORIO-EDAPP-DETALHADO.md", "w", encoding="utf-8") as f:
        f.write(md)
    print("✅ Relatório gerado: RELATORIO-EDAPP-DETALHADO.md\n")
    
    # Estatísticas
    print("=== ESTATÍSTICAS ===")
    print(f"Funcionários: {len(dados_edapp)}")
    print(f"Total de cursos: {sum(len(c) for c in dados_edapp.values())}")
    print(f"\nDistribuição por código:")
    dist = {}
    for cursos in dados_edapp.values():
        for curso_nome, _ in cursos:
            cod = MAPEAMENTO_CURSOS.get(curso_nome, "???")
            dist[cod] = dist.get(cod, 0) + 1
    for cod, count in sorted(dist.items()):
        print(f"  {cod}: {count} conclusões")
