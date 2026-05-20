#!/bin/bash

echo "🧪 Testando Modal Fix"
echo "===================="

# 1. Buscar agendamento
echo "1️⃣  Buscando agendamento com tipo_sessao PER..."
AGENDAMENTO=$(curl -s "http://localhost:8787/api/simuladores/agendamentos?data_inicio=2026-02-01&data_fim=2026-02-28" | \
  python3 -c "import sys, json; data = json.load(sys.stdin); print(json.dumps(data['data'][0] if data['data'] else {}, indent=2))")

echo "$AGENDAMENTO"

# 2. Extrair ID e tipo_sessao
ID=$(echo "$AGENDAMENTO" | python3 -c "import sys, json; print(json.load(sys.stdin).get('id', ''))" 2>/dev/null)
TIPO=$(echo "$AGENDAMENTO" | python3 -c "import sys, json; print(json.load(sys.stdin).get('tipo_sessao', ''))" 2>/dev/null)

echo ""
echo "2️⃣  Resultado:"
echo "   ID: $ID"
echo "   tipo_sessao: $TIPO"
echo ""

if [ -z "$ID" ] || [ -z "$TIPO" ]; then
  echo "❌ Erro: não consegui extrair dados"
  exit 1
fi

echo "✅ Dados extraídos com sucesso"
echo ""
echo "3️⃣  Para testar no browser:"
echo "   - Acesse: http://localhost:3002"
echo "   - Vá para: Simuladores -> Agenda -> Calendário"
echo "   - Clique na sessão do dia 10/02/2026"
echo "   - O modal deve abrir SEM ERROS"
echo "   - tema_sessao deve aparecer como: '02/03: IFR CICLO 1'"
echo "   - Abra console (F12) e procure por: '[ModalNovaSessao]'"
