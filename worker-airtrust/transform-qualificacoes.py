#!/usr/bin/env python3
"""
Convert qualificacoes_historico from backup (34 cols) to production schema (21 cols).

Backup columns (34):
0:id, 1:funcionario_id, 2:qualificacao_id, 3:tipo_codigo, 4:codigo, 5:categoria,
6:data_obtencao, 7:data_validade, 8:?, 9:nota, 10:?, 11:status, 12:created_at,
13:updated_at, 14:deleted_at, ...

Production columns (21):
id, funcionario_id, qualificacao_id, tipo_codigo, codigo, categoria, validade,
numero_certificado, observacoes, arquivo_url, created_at, updated_at, deleted_at,
data_conclusao, validade_meses, instrutor, local, modalidade, nota, carga_horaria,
data_vencimento
"""
import re
import sys
import uuid

def extract_values(line):
    """Extract and parse VALUES from INSERT statement."""
    match = re.search(r"VALUES\((.*)\);", line)
    if not match:
        return None
    return match.group(1)

def parse_sql_values(values_str):
    """Parse SQL values, handling quoted strings and NULLs."""
    values = []
    current = ""
    in_quote = False
    i = 0
    
    while i < len(values_str):
        char = values_str[i]
        
        if char == "'" and (i == 0 or values_str[i-1] != "\\"):
            in_quote = not in_quote
            current += char
        elif char == "," and not in_quote:
            values.append(current.strip())
            current = ""
        else:
            current += char
        i += 1
    
    if current.strip():
        values.append(current.strip())
    
    return values

def format_sql_value(val):
    """Ensure value is properly formatted for SQL."""
    if val == "NULL":
        return "NULL"
    return val

# Read backup file
backup_file = "import-qualificacoes.sql"
output_file = "import-qualificacoes-transformed.sql"

try:
    with open(backup_file, 'r', encoding='utf-8') as f_in:
        with open(output_file, 'w', encoding='utf-8') as f_out:
            count = 0
            for line in f_in:
                line = line.strip()
                if not line.startswith('INSERT'):
                    continue
                
                values_str = extract_values(line)
                if not values_str:
                    continue
                
                values = parse_sql_values(values_str)
                
                # Map backup columns to production columns
                # Backup has 34 cols, production needs 21 cols
                try:
                    # Generate UUID for qualificacao_id if NULL (it's NOT NULL in production)
                    qual_id = values[2] if values[2] != "NULL" else f"'{str(uuid.uuid4())[:16]}'"
                    
                    new_values = [
                        values[0],   # id
                        values[1],   # funcionario_id
                        qual_id,     # qualificacao_id (generate UUID if NULL)
                        values[3],   # tipo_codigo
                        values[4],   # codigo
                        values[5],   # categoria
                        values[7],   # validade (from data_validade)
                        format_sql_value("NULL"),  # numero_certificado
                        format_sql_value("NULL"),  # observacoes
                        format_sql_value("NULL"),  # arquivo_url
                        values[12],  # created_at
                        values[13],  # updated_at
                        values[14],  # deleted_at
                        values[6],   # data_conclusao (from data_obtencao)
                        format_sql_value("12"),    # validade_meses (default)
                        format_sql_value("NULL"),  # instrutor
                        format_sql_value("NULL"),  # local
                        format_sql_value("NULL"),  # modalidade
                        values[9] if len(values) > 9 else format_sql_value("NULL"),  # nota
                        format_sql_value("NULL"),  # carga_horaria
                        values[7],   # data_vencimento (same as validade)
                    ]
                    
                    # Reconstruct INSERT with canonical columns
                    values_str = ",".join(new_values)
                    new_line = f'INSERT INTO "qualificacoes_historico" VALUES({values_str});\n'
                    f_out.write(new_line)
                    count += 1
                    
                except (IndexError, ValueError) as e:
                    print(f"Warning: Skipped row {count}: {e}", file=sys.stderr)
                    continue
    
    print(f"✅ Transformed {count} rows")
    print(f"📝 Output: {output_file}")
    
except Exception as e:
    print(f"❌ Error: {e}", file=sys.stderr)
    sys.exit(1)
