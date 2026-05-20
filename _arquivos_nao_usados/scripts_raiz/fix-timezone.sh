#!/bin/bash

echo "🔧 Corrigindo timezone em todos os arquivos..."

# Lista de arquivos para corrigir
files=(
  "src/react-app/components/qualificacoes/ListaQualificacoes.tsx"
  "src/react-app/components/qualificacoes/ChecksTab.tsx"
  "src/react-app/components/qualificacoes/DashboardQualificacoes.tsx"
  "src/react-app/components/funcionarios/GerenciarAeronavesModal.tsx"
  "src/react-app/components/funcionarios/QualificacoesCard.tsx"
  "src/react-app/components/funcionarios/PastaVirtualCompleta.tsx"
  "src/react-app/components/funcionarios/AbaCertificados.tsx"
  "src/react-app/components/QualificacoesFuncionario.tsx"
  "src/react-app/components/simuladores/ProgressoTreinamentoAirtrust.tsx"
  "src/react-app/components/simuladores/VisualizarFichaSimulador.tsx"
  "src/react-app/components/simuladores/ProgressoTreinamento.tsx"
  "src/react-app/components/simuladores/AvaliacaoManobras.tsx"
  "src/react-app/components/shared/TreeView.tsx"
  "src/react-app/components/CertificadoLista.tsx"
  "src/react-app/components/treinamentos/DashboardTreinamentos.tsx"
  "src/react-app/components/treinamentos/CertificacoesList.tsx"
  "src/react-app/pages/qualificacoes/Alertas.tsx"
  "src/react-app/pages/Simuladores.tsx"
  "src/react-app/pages/funcionarios/ListaDocumentos.tsx"
  "src/react-app/pages/funcionarios/AbaHistorico.tsx"
  "src/react-app/pages/funcionarios/AbaDadosPessoais.tsx"
  "src/react-app/pages/simuladores/Dashboard.tsx"
  "src/react-app/pages/simuladores/ExecutarSessao.tsx"
  "src/react-app/pages/simuladores/DetalhesSessao.tsx"
  "src/react-app/pages/simuladores/HistoricoFuncionario.tsx"
)

count=0
for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    # Substituir new Date(VARIAVEL).toLocaleDateString por new Date(VARIAVEL + 'T00:00:00').toLocaleDateString
    # Mas apenas para variáveis que parecem datas (data_, _data, vencimento, conclusao, etc)
    sed -i.bak -E "s/new Date\(([a-zA-Z_\.]+\.(data_[a-zA-Z_]+|[a-zA-Z_]*data[a-zA-Z_]*|[a-zA-Z_]*vencimento|[a-zA-Z_]*conclusao|[a-zA-Z_]*nascimento|[a-zA-Z_]*admissao|[a-zA-Z_]*habilitacao|[a-zA-Z_]*upload|[a-zA-Z_]*documento|[a-zA-Z_]*inicio))\)\.toLocaleDateString/new Date(\1 + 'T00:00:00').toLocaleDateString/g" "$file"
    
    if [ $? -eq 0 ]; then
      rm "${file}.bak"
      ((count++))
      echo "✅ $file"
    else
      mv "${file}.bak" "$file"
      echo "❌ Erro em $file"
    fi
  else
    echo "⚠️  Arquivo não encontrado: $file"
  fi
done

echo ""
echo "✅ Corrigidos $count arquivos"
echo "🚀 Execute './deploy.sh' para fazer deploy"
