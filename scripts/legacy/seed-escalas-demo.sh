#!/usr/bin/env bash
# ================================================================
# seed-escalas-demo.sh
# Insere dados de demonstração no módulo de Escalas
# Uso: bash seed-escalas-demo.sh [--remote]
# ================================================================
set -euo pipefail

export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
cd "$(dirname "$0")/worker-airtrust"

FLAG="${1:-}"
if [[ "$FLAG" == "--remote" ]]; then
  D1_FLAG="--remote"
  echo "⚠️  Modo REMOTO — alterações afetam banco de produção!"
else
  D1_FLAG="--local"
  echo "🧪 Modo LOCAL (dev)"
fi

WRANGLER="$(which wrangler 2>/dev/null || echo 'npx wrangler')"
DB="airtrust-db"

run_sql() {
  $WRANGLER d1 execute "$DB" $D1_FLAG --command "$1" 2>/dev/null | tail -5
}

echo ""
echo "1️⃣  Verificando escalas existentes..."
run_sql "SELECT id, mes, ano, titulo, status, empresa_id FROM escalas_mensais WHERE deleted_at IS NULL ORDER BY ano DESC, mes DESC LIMIT 5;"

echo ""
echo "2️⃣  Consultando funcionários disponíveis..."
run_sql "SELECT id, nome, matricula FROM funcionarios WHERE deleted_at IS NULL AND ativo=1 LIMIT 10;"

echo ""
echo "3️⃣  Inserindo padrão de escala 15x15 (se não existir)..."
run_sql "
INSERT OR IGNORE INTO padroes_escala (id, nome, dias_trabalho, dias_folga, descricao, ativo)
VALUES
  ('padrao-15x15', '15×15', 15, 15, 'Quinze dias de trabalho / quinze de folga', 1),
  ('padrao-7x7',   '7×7',   7,  7,  'Sete dias de trabalho / sete de folga',     1),
  ('padrao-5x2',   '5×2',   5,  2,  'Cinco dias / dois de folga (semana normal)', 1);
"

echo ""
echo "4️⃣  Obtendo IDs necessários para seed..."

# Pega a primeira escala de 2026 disponível
ESCALA_ID=$(run_sql "SELECT id FROM escalas_mensais WHERE deleted_at IS NULL AND ano=2026 ORDER BY mes LIMIT 1;" | grep -Eo '[0-9a-f-]{36}' | head -1 || true)

# Pega os primeiros 4 funcionários
FUNC_IDS=$(run_sql "SELECT id FROM funcionarios WHERE deleted_at IS NULL AND ativo=1 LIMIT 4;" | grep -Eo '[0-9a-f-]{36}' || true)

if [[ -z "$ESCALA_ID" ]]; then
  echo "⚠️  Nenhuma escala de 2026 encontrada. Crie uma escala pelo módulo primeiro e execute novamente."
  exit 0
fi

readarray -t FUNCS <<< "$FUNC_IDS"
N=${#FUNCS[@]}

if [[ $N -lt 2 ]]; then
  echo "⚠️  Precisa de pelo menos 2 funcionários para criar tripulações. Encontrado: $N"
  exit 0
fi

PIC1="${FUNCS[0]}"
SIC1="${FUNCS[1]:-}"
PIC2="${FUNCS[2]:-$PIC1}"
SIC2="${FUNCS[3]:-${FUNCS[1]:-}}"

echo "   Escala ID : $ESCALA_ID"
echo "   PIC1      : $PIC1"
echo "   SIC1      : $SIC1"
echo "   PIC2      : $PIC2"

echo ""
echo "5️⃣  Criando tripulações demo..."

TRIP1="trip-demo-$(date +%s)-1"
TRIP2="trip-demo-$(date +%s)-2"

run_sql "
INSERT OR IGNORE INTO escala_tripulacoes
  (id, escala_id, pic_id, sic_id, data_inicio, data_fim, padrao_escala_id, aeronave, base, created_at, updated_at)
VALUES
  ('$TRIP1', '$ESCALA_ID', '$PIC1', '${SIC1:-NULL}', '2026-04-01', '2026-04-30', 'padrao-15x15', 'PP-HMR', 'Macaé',    datetime('now'), datetime('now')),
  ('$TRIP2', '$ESCALA_ID', '$PIC2', '${SIC2:-NULL}', '2026-04-01', '2026-04-30', 'padrao-7x7',   'PP-HXY', 'Vitória',  datetime('now'), datetime('now'));
" || echo "⚠️  Erro ao inserir tripulações (podem já existir)"

echo ""
echo "6️⃣  Inserindo eventos variados para PIC1 ($PIC1)..."

run_sql "
INSERT OR IGNORE INTO escala_eventos
  (id, escala_id, funcionario_id, tipo_evento, data_inicio, data_fim, turno, local, aeronave, status, created_at, updated_at)
VALUES
  ('ev-demo-01', '$ESCALA_ID', '$PIC1', 'voo',                  '2026-04-01', '2026-04-03', 'dia_todo', 'Macaé/Vitória', 'PP-HMR', 'confirmado', datetime('now'), datetime('now')),
  ('ev-demo-02', '$ESCALA_ID', '$PIC1', 'folga',                '2026-04-04', '2026-04-05', 'dia_todo', NULL, NULL,                'confirmado', datetime('now'), datetime('now')),
  ('ev-demo-03', '$ESCALA_ID', '$PIC1', 'voo',                  '2026-04-07', '2026-04-09', 'dia_todo', 'Macaé/RJ',     'PP-HMR', 'confirmado', datetime('now'), datetime('now')),
  ('ev-demo-04', '$ESCALA_ID', '$PIC1', 'medico',               '2026-04-14', '2026-04-14', 'manha',    'Rio de Janeiro', NULL,   'pendente',   datetime('now'), datetime('now')),
  ('ev-demo-05', '$ESCALA_ID', '$PIC1', 'treinamento_simulador','2026-04-17', '2026-04-18', 'dia_todo', 'GRU - CAE',    NULL,     'confirmado', datetime('now'), datetime('now')),
  ('ev-demo-06', '$ESCALA_ID', '$PIC1', 'folga',                '2026-04-19', '2026-04-21', 'dia_todo', NULL, NULL,                'confirmado', datetime('now'), datetime('now')),
  ('ev-demo-07', '$ESCALA_ID', '$PIC1', 'trabalho',             '2026-04-22', '2026-04-25', 'dia_todo', 'Macaé',        'PP-HMR', 'confirmado', datetime('now'), datetime('now')),
  ('ev-demo-08', '$ESCALA_ID', '$PIC1', 'standby',              '2026-04-28', '2026-04-28', 'noite',    'Macaé',        NULL,     'confirmado', datetime('now'), datetime('now'));
" || echo "⚠️  Alguns eventos já existem"

if [[ -n "$SIC1" ]]; then
  echo ""
  echo "7️⃣  Inserindo eventos para SIC1 ($SIC1)..."
  run_sql "
  INSERT OR IGNORE INTO escala_eventos
    (id, escala_id, funcionario_id, tipo_evento, data_inicio, data_fim, turno, local, status, created_at, updated_at)
  VALUES
    ('ev-demo-09', '$ESCALA_ID', '$SIC1', 'ferias',               '2026-04-01', '2026-04-15', 'dia_todo', NULL, 'confirmado', datetime('now'), datetime('now')),
    ('ev-demo-10', '$ESCALA_ID', '$SIC1', 'voo',                  '2026-04-16', '2026-04-18', 'dia_todo', 'Macaé', 'confirmado', datetime('now'), datetime('now')),
    ('ev-demo-11', '$ESCALA_ID', '$SIC1', 'treinamento_solo',     '2026-04-22', '2026-04-22', 'manha',    'Base Macaé', 'confirmado', datetime('now'), datetime('now')),
    ('ev-demo-12', '$ESCALA_ID', '$SIC1', 'cheque',               '2026-04-25', '2026-04-25', 'tarde',    'Base Macaé', 'pendente',   datetime('now'), datetime('now'));
  " || echo "⚠️  Alguns eventos já existem"
fi

if [[ -n "$PIC2" && "$PIC2" != "$PIC1" ]]; then
  echo ""
  echo "8️⃣  Inserindo eventos para PIC2 ($PIC2)..."
  run_sql "
  INSERT OR IGNORE INTO escala_eventos
    (id, escala_id, funcionario_id, tipo_evento, data_inicio, data_fim, turno, local, aeronave, status, created_at, updated_at)
  VALUES
    ('ev-demo-13', '$ESCALA_ID', '$PIC2', 'voo',           '2026-04-02', '2026-04-05', 'dia_todo', 'Vitória/RJ', 'PP-HXY', 'confirmado', datetime('now'), datetime('now')),
    ('ev-demo-14', '$ESCALA_ID', '$PIC2', 'licenca',       '2026-04-10', '2026-04-12', 'dia_todo', NULL, NULL,              'confirmado', datetime('now'), datetime('now')),
    ('ev-demo-15', '$ESCALA_ID', '$PIC2', 'viagem',        '2026-04-15', '2026-04-17', 'dia_todo', 'Brasília',   NULL,     'confirmado', datetime('now'), datetime('now')),
    ('ev-demo-16', '$ESCALA_ID', '$PIC2', 'voo',           '2026-04-22', '2026-04-26', 'dia_todo', 'Vitória',   'PP-HXY',  'confirmado', datetime('now'), datetime('now'));
  " || echo "⚠️  Alguns eventos já existem"
fi

echo ""
echo "9️⃣  Atualizando contadores da escala..."
run_sql "
UPDATE escalas_mensais
SET
  updated_at = datetime('now')
WHERE id = '$ESCALA_ID';
"

echo ""
echo "✅ Seed de demonstração concluído!"
echo "   → Abra a escala no módulo Escalas para visualizar a grade"
echo "   → Clique em 'Editar' na escala de Abril 2026"
