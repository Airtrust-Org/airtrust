#!/bin/bash

# Script para remover hardcodes da URL da API e usar import centralizado

echo "🔧 Removendo hardcodes de URL da API..."

# Lista de arquivos para corrigir
files=(
  "src/react-app/pages/simuladores/AgendaCalendario.tsx"
  "src/react-app/pages/simuladores/FichasSessao.tsx"
  "src/react-app/pages/simuladores/ConfiguracoesCadastros.tsx"
  "src/react-app/pages/simuladores/FichaDetalhe.tsx"
  "src/react-app/pages/simuladores/CrudSimuladores.tsx"
  "src/react-app/pages/simuladores/CrudManobras.tsx"
  "src/react-app/pages/simuladores/NovaSessao.tsx"
  "src/react-app/pages/simuladores/CrudCategorias.tsx"
  "src/react-app/pages/simuladores/CrudTiposSessao.tsx"
  "src/react-app/pages/simuladores/CrudInstrutores.tsx"
  "src/react-app/pages/simuladores/CrudTemplates.tsx"
  "src/react-app/pages/simuladores/CrudModelos.tsx"
  "src/react-app/components/modals/SessaoModal.tsx"
  "src/react-app/pages/FichaFuncionarioPage.tsx"
  "src/react-app/pages/DashboardQualificacoes.tsx"
  "src/react-app/pages/QualificacoesNew.tsx"
  "src/react-app/components/licencas/ModalLicenca.tsx"
  "src/react-app/components/qualificacoes-historico/ModalEditarQualificacao.tsx"
  "src/react-app/components/qualificacoes/ModalCertificados.tsx"
  "src/react-app/components/qualificacoes/ModalRenovarQualificacao.tsx"
  "src/react-app/components/qualificacoes/ModalNovaQualificacao.tsx"
  "src/react-app/components/qualificacoes/ModalEditarQualificacao.tsx"
  "src/react-app/pages/LicencasPage.tsx"
  "src/react-app/pages/funcionarios/tabs/ListaTab.tsx"
  "src/react-app/pages/Certificacoes.tsx"
  "src/react-app/pages/qualificacoes-historico/ImportarQualificacoes.tsx"
  "src/react-app/pages/DebugPanel.tsx"
  "src/react-app/pages/BackupRestoreNovo.tsx"
  "src/react-app/pages/TesteApiPuro.tsx"
  "src/react-app/pages/TestFuncionarios.tsx"
  "src/react-app/pages/funcionarios/Cadastros.tsx"
  "src/react-app/pages/qualificacoes/FormularioQualificacao.tsx"
  "src/react-app/pages/qualificacoes/ImportarQualificacoes.tsx"
  "src/react-app/pages/qualificacoes/Alertas.tsx"
  "src/react-app/pages/qualificacoes/Dashboard.tsx"
  "src/react-app/components/qualificacoes-historico/ModalNovaQualificacao.tsx"
)

count=0

for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    # Adicionar import se não existir
    if ! grep -q "import.*API_BASE_URL.*from.*config/api" "$file"; then
      # Encontrar a última linha de import
      last_import=$(grep -n "^import" "$file" | tail -1 | cut -d: -f1)
      
      if [ -n "$last_import" ]; then
        # Adicionar após o último import
        sed -i.bak "${last_import}a\\
import { API_BASE_URL } from '@/react-app/config/api';
" "$file"
        rm -f "${file}.bak"
        echo "  ✅ Import adicionado em $file"
      fi
    fi
    
    # Remover const hardcodada
    if grep -q "const API_BASE_URL = 'https://airtrust.airtrust.workers.dev" "$file"; then
      sed -i.bak "/const API_BASE_URL = 'https:\/\/airtrust.airtrust.workers.dev/d" "$file"
      rm -f "${file}.bak"
      ((count++))
      echo "  ✅ Hardcode removido de $file"
    fi
    
    # Substituir uso inline
    if grep -q "'https://airtrust.airtrust.workers.dev" "$file"; then
      sed -i.bak "s/'https:\/\/airtrust.airtrust.workers.dev\/api'/API_BASE_URL/g" "$file"
      sed -i.bak "s/'https:\/\/airtrust.airtrust.workers.dev'/API_BASE_URL.replace('\/api', '')/g" "$file"
      rm -f "${file}.bak"
      echo "  ✅ Uso inline substituído em $file"
    fi
  else
    echo "  ⚠️  Arquivo não encontrado: $file"
  fi
done

echo ""
echo "✅ Concluído! $count hardcodes removidos."
echo "📝 Todos os arquivos agora usam import { API_BASE_URL } from '@/react-app/config/api';"
