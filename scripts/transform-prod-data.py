#!/usr/bin/env python3
"""
Extract and transform production data to match local schema.
Maps legacy columns to canonical schema.
"""
import re
import sys

# Define column mapping (legacy -> canonical) for funcionarios
FUNCIONARIOS_COLS_LEGACY = [
    'id', 'matricula', 'nome', 'cpf', 'email', 'cargo', 
    'col7', 'col8', 'col9', 'status', 'col11', 'col12', 
    'created_at', 'updated_at', 'col15', 'col16', 'col17'
]

FUNCIONARIOS_COLS_CANONICAL = [
    'id', 'matricula', 'nome', 'cpf', 'email', 'cargo',
    'status', 'created_at', 'updated_at'
]

# For qualificacoes_historico, we need all columns from backup
# The canonical table has many more columns
QUALIFICACOES_COLS_LEGACY = list(range(1, 31))  # 30 columns in backup
QUALIFICACOES_COLS_CANONICAL = list(range(1, 32))  # Need to check actual count

def extract_values(line):
    """Extract VALUES tuple from INSERT statement."""
    match = re.search(r"VALUES\((.*)\);", line)
    if not match:
        return None
    return match.group(1)

def parse_values(values_str):
    """Parse comma-separated values, handling quoted strings."""
    # Simple parser for VALUES
    values = []
    current = ""
    in_quotes = False
    i = 0
    while i < len(values_str):
        c = values_str[i]
        if c == "'" and (i == 0 or values_str[i-1] != "\\"):
            in_quotes = not in_quotes
            current += c
        elif c == "," and not in_quotes:
            values.append(current.strip())
            current = ""
        else:
            current += c
        i += 1
    if current.strip():
        values.append(current.strip())
    return values

def transform_funcionarios(values):
    """Keep only canonical columns for funcionarios."""
    # Map: legacy positions to new positions
    # id, matricula, nome, cpf, email, cargo, status, created_at, updated_at
    try:
        new_values = [
            values[0],   # id
            values[1],   # matricula
            values[2],   # nome
            values[3],   # cpf
            values[4],   # email
            values[5],   # cargo
            values[9],   # status (was col10 in legacy)
            values[12],  # created_at
            values[13],  # updated_at
        ]
        return new_values
    except IndexError:
        print(f"Warning: Invalid number of values for funcionarios: {len(values)}", file=sys.stderr)
        return None

def transform_qualificacoes(values):
    """Keep all columns for qualificacoes_historico (already canonical)."""
    # The backup data is already in the right format with all columns
    return values

# Main logic
backup_file = "migrations/data-export/prod_data_clean.sql"
output_file = "migrations/data-export/import-localhost-transformed.sql"

funcionarios_count = 0
qualificacoes_count = 0

with open(backup_file, 'r', encoding='utf-8') as f_in:
    with open(output_file, 'w', encoding='utf-8') as f_out:
        for line in f_in:
            line = line.strip()
            if not line.startswith('INSERT INTO'):
                continue
            
            if 'INSERT INTO "funcionarios"' in line:
                values_str = extract_values(line)
                if values_str:
                    values = parse_values(values_str)
                    transformed = transform_funcionarios(values)
                    if transformed:
                        # Rebuild INSERT with canonical columns
                        values_formatted = ",".join(transformed)
                        new_line = f'INSERT INTO "funcionarios" VALUES({values_formatted});\n'
                        f_out.write(new_line)
                        funcionarios_count += 1
            
            elif 'INSERT INTO "qualificacoes_historico"' in line:
                # These are already canonical
                f_out.write(line + '\n')
                qualificacoes_count += 1

print(f"✅ Transformation complete:")
print(f"   • funcionarios: {funcionarios_count} rows")
print(f"   • qualificacoes_historico: {qualificacoes_count} rows")
print(f"📝 Output: {output_file}")
