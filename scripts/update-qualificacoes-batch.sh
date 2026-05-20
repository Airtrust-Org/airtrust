#!/bin/bash
# Script para atualizar qualificações em lote via API
# Data: 2025-12-04

API_BASE="https://airtrust-api-production.airtrust.workers.dev/api"

# Mapeamento de código para tipo_id
declare -A TIPO_IDS=(
  ["B"]=19
  ["C"]=20
  ["CMA"]=1
  ["D1"]=22
  ["D2"]=23
  ["D3"]=24
  ["D4"]=25
  ["E1"]=26
  ["E2"]=27
  ["E3"]=28
  ["E4"]=37
  ["E5"]=29
  ["E6"]=43
  ["F1"]=30
  ["F2"]=38
  ["FAP05.2"]=31
  ["FAP06"]=32
  ["FAP06SEM"]=54
  ["FAP14"]=39
  ["G1"]=33
  ["G2"]=40
  ["H"]=42
  ["CHTIFR"]=58
  ["IFR"]=5
  ["LOFT"]=34
  ["NOT"]=44
  ["OFEXCRED"]=59
  ["OPC"]=36
  ["ASO.P"]=57
  ["SAEFAP06"]=55
  ["SAEFAP14"]=56
  ["TIPO"]=21
)

# Função para converter data DD/MM/YYYY para YYYY-MM-DD
convert_date() {
  local input="$1"
  local day=$(echo "$input" | cut -d'/' -f1)
  local month=$(echo "$input" | cut -d'/' -f2)
  local year=$(echo "$input" | cut -d'/' -f3)
  echo "${year}-${month}-${day}"
}

# Função para calcular data de vencimento
calc_vencimento() {
  local data_conclusao="$1"
  local validade_meses="$2"
  
  # Usando date do macOS
  if [[ "$OSTYPE" == "darwin"* ]]; then
    date -j -v+"${validade_meses}m" -f "%Y-%m-%d" "$data_conclusao" "+%Y-%m-%d" 2>/dev/null
  else
    date -d "$data_conclusao + $validade_meses months" "+%Y-%m-%d" 2>/dev/null
  fi
}

# Função para buscar funcionario_id pelo CPF
get_funcionario_id() {
  local cpf="$1"
  local result=$(curl -s "${API_BASE}/funcionarios?search=${cpf}&limit=1" | jq -r '.funcionarios[0].id // .data[0].id // empty' 2>/dev/null)
  echo "$result"
}

# Função para atualizar ou criar qualificação
update_qualificacao() {
  local funcionario_id="$1"
  local tipo_id="$2"
  local data_conclusao="$3"
  local validade="$4"
  
  # Calcular data de vencimento
  local data_vencimento=$(calc_vencimento "$data_conclusao" "$validade")
  
  if [ -z "$data_vencimento" ]; then
    echo "  ⚠️ Erro ao calcular vencimento"
    return 1
  fi
  
  # Verificar se já existe uma qualificação para este funcionário e tipo
  local existing=$(curl -s "${API_BASE}/qualificacoes/historico?funcionario_id=${funcionario_id}&tipo_id=${tipo_id}&limit=100" | jq -r '.data[0].id // empty' 2>/dev/null)
  
  if [ -n "$existing" ]; then
    # Atualizar existente
    echo "  📝 Atualizando qualificação ID ${existing}"
    curl -s -X PUT "${API_BASE}/qualificacoes/historico/${existing}" \
      -H "Content-Type: application/json" \
      -d "{\"data_conclusao\": \"${data_conclusao}\", \"data_vencimento\": \"${data_vencimento}\"}" > /dev/null
  else
    # Criar nova
    echo "  ➕ Criando nova qualificação"
    curl -s -X POST "${API_BASE}/qualificacoes/historico" \
      -H "Content-Type: application/json" \
      -d "{\"funcionario_id\": ${funcionario_id}, \"qualificacao_id\": ${tipo_id}, \"data_conclusao\": \"${data_conclusao}\", \"data_vencimento\": \"${data_vencimento}\"}" > /dev/null
  fi
}

echo "🚀 Iniciando atualização de qualificações..."
echo ""

# Processar os dados
count=0
errors=0

while IFS=';' read -r cpf canac codigo validade data_conclusao; do
  # Pular header
  if [ "$cpf" == "funcionario_cpf" ]; then
    continue
  fi
  
  # Remover espaços
  cpf=$(echo "$cpf" | tr -d ' ')
  codigo=$(echo "$codigo" | tr -d ' ')
  validade=$(echo "$validade" | tr -d ' ')
  data_conclusao=$(echo "$data_conclusao" | tr -d ' ')
  
  # Converter data
  data_iso=$(convert_date "$data_conclusao")
  
  # Obter tipo_id
  tipo_id=${TIPO_IDS[$codigo]}
  
  if [ -z "$tipo_id" ]; then
    echo "⚠️ Código não encontrado: $codigo"
    ((errors++))
    continue
  fi
  
  # Obter funcionario_id
  funcionario_id=$(get_funcionario_id "$cpf")
  
  if [ -z "$funcionario_id" ]; then
    echo "⚠️ Funcionário não encontrado: CPF $cpf"
    ((errors++))
    continue
  fi
  
  echo "[$((count+1))] CPF: $cpf | Código: $codigo | Data: $data_conclusao"
  update_qualificacao "$funcionario_id" "$tipo_id" "$data_iso" "$validade"
  
  ((count++))
  
  # Pequena pausa para não sobrecarregar a API
  sleep 0.1
  
done << 'EOF'
funcionario_cpf;CANAC;qualificacao_codigo;Validade;data_conclusao
134.651.428-37;951681;B;12;22/10/2025
419.906.257-20;383455;B;12;28/10/2025
052.414.847-36;102172;B;12;19/11/2025
387.181.008-80;144338;B;12;03/11/2025
899.850.527-49;688929;B;12;13/01/2025
017.058.448-80;108495;B;12;19/11/2025
772.105.497-49;664078;B;12;30/10/2025
722.443.567-87;687129;B;12;11/10/2025
112.015.317-48;140833;B;12;04/11/2025
401.238.047-87;444059;B;12;09/04/2025
734.990.727-34;657767;B;12;15/12/2024
311.120.807-91;281949;B;12;10/11/2025
058.412.708-18;930024;B;12;23/10/2025
563.716.080-53;949040;B;12;26/11/2024
093.127.887-28;172005;B;12;02/11/2025
663.794.586-20;876615;B;12;22/10/2025
939.571.227-91;761320;B;12;13/06/2023
155.257.297-84;144648;B;12;09/12/2024
713.920.927-87;613364;B;12;27/10/2025
145.880.747-92;237739;B;12;08/12/2024
052.017.507-70;165518;B;12;03/02/2025
768.506.843-53;100659;B;12;24/04/2025
083.286.227-42;126947;B;12;28/08/2025
108.943.047-71;227500;B;12;06/06/2025
EOF

echo ""
echo "✅ Processamento concluído!"
echo "   Total processados: $count"
echo "   Erros: $errors"
