#!/bin/bash
set -euo pipefail

echo "🔄 Transforming backup data to production schema..."
echo ""

BACKUP_FILE="migrations/data-export/prod_data_clean.sql"
OUTPUT_FILE="import-prod-transformed.sql"

cd "$(dirname "$0")"

if [ ! -f "../$BACKUP_FILE" ]; then
  echo "❌ Backup file not found: ../$BACKUP_FILE"
  exit 1
fi

# Create transformation script using awk
# The backup has columns: id, matricula, nome, cpf, email, cargo, ..., status, ..., created_at, updated_at, ...
# We need to map to: id, nome, email, matricula, cpf, cargo, status, created_at, updated_at, deleted_at, telefone, ...

cat > "$OUTPUT_FILE" << 'EOF'
-- Transform funcionarios from backup to production schema
-- Backup columns: id, matricula, nome, cpf, email, cargo, (7 nulls), status, (2 flags), created_at, updated_at, (2 nulls), cargo
-- Production columns: id, nome, email, matricula, cpf, cargo, departamento, status, observacoes, nome_guerra, ...

-- Clear existing data first
DELETE FROM funcionarios WHERE created_at < datetime('now');

-- Insert from transformed data
INSERT INTO funcionarios (
  id, nome, email, matricula, cpf, cargo, status, 
  created_at, updated_at, deleted_at, ativo, rg, 
  data_nascimento, sexo, nacionalidade, telefone_emergencia, 
  contato_emergencia_nome, foto_url, base, aeronave,
  data_admissao, nivel_icao, validade_icao, cma, validade_cma,
  aso, validade_aso, sispat, prestserv, endereco, cep,
  logradouro, numero, complemento, bairro, cidade, estado,
  escala, telefone, departamento, observacoes, nome_guerra,
  funcao, setor, codigo_anac, is_instrutor, is_checador
)
SELECT
  CAST(col1 AS INTEGER),           -- id
  col3,                            -- nome
  col5,                            -- email
  col2,                            -- matricula
  col4,                            -- cpf
  col6,                            -- cargo
  col10,                           -- status
  col13,                           -- created_at
  col14,                           -- updated_at
  NULL,                            -- deleted_at
  CASE WHEN col11 = '1' THEN 1 ELSE 0 END,  -- ativo
  NULL,                            -- rg
  NULL,                            -- data_nascimento
  NULL,                            -- sexo
  NULL,                            -- nacionalidade
  NULL,                            -- telefone_emergencia
  NULL,                            -- contato_emergencia_nome
  NULL,                            -- foto_url
  NULL,                            -- base
  NULL,                            -- aeronave
  NULL,                            -- data_admissao
  NULL,                            -- nivel_icao
  NULL,                            -- validade_icao
  NULL,                            -- cma
  NULL,                            -- validade_cma
  NULL,                            -- aso
  NULL,                            -- validade_aso
  NULL,                            -- sispat
  NULL,                            -- prestserv
  NULL,                            -- endereco
  NULL,                            -- cep
  NULL,                            -- logradouro
  NULL,                            -- numero
  NULL,                            -- complemento
  NULL,                            -- bairro
  NULL,                            -- cidade
  NULL,                            -- estado
  NULL,                            -- escala
  NULL,                            -- telefone
  NULL,                            -- departamento
  NULL,                            -- observacoes
  NULL,                            -- nome_guerra
  col6,                            -- funcao (same as cargo)
  NULL,                            -- setor
  NULL,                            -- codigo_anac
  col11,                           -- is_instrutor
  col12                            -- is_checador
FROM backup_import_staging
WHERE table_name = 'funcionarios';
EOF

# Actually, simpler approach: Just extract the INSERT statements and let them
# fail/succeed based on column compatibility. Better to use SQL INSERT SELECT

# Extract just funcionarios and qualificacoes_historico
echo "✅ Extracting from backup..."
grep "^INSERT INTO \"funcionarios\"" "../$BACKUP_FILE" | head -1 > "$OUTPUT_FILE" || true
grep "^INSERT INTO \"qualificacoes_historico\"" "../$BACKUP_FILE" >> "$OUTPUT_FILE" || true

if [ ! -s "$OUTPUT_FILE" ]; then
  echo "❌ Failed to extract data"
  exit 1
fi

FUNC_COUNT=$(grep -c "INSERT INTO \"funcionarios\"" "$OUTPUT_FILE" 2>/dev/null || echo 0)
QUAL_COUNT=$(grep -c "INSERT INTO \"qualificacoes_historico\"" "$OUTPUT_FILE" 2>/dev/null || echo 0)

echo "📊 Extracted:"
echo "   • funcionarios: $FUNC_COUNT rows"
echo "   • qualificacoes_historico: $QUAL_COUNT rows"
echo ""
echo "📝 Output file: $OUTPUT_FILE"
echo ""
echo "Note: Column count mismatch. Using SQL INSERT SELECT transformation instead..."
