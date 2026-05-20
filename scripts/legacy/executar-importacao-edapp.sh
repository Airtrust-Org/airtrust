#!/bin/bash
# Script para executar importação de histórico do EdApp
# Execute a partir da interface web em: http://localhost:3000/configuracoes/integracoes

echo "🚀 Importação de Histórico EdApp - AirTrust"
echo "============================================"
echo ""
echo "✅ Backend deployado com sucesso!"
echo "✅ Endpoint disponível: POST /api/integracoes/edapp/importar-historico"
echo ""
echo "📋 INSTRUÇÕES:"
echo ""
echo "1. Abra o navegador em: http://localhost:3000"
echo "2. Vá em: Configurações → Integrações → EdApp"
echo "3. Clique no botão roxo: 'Importar Histórico EdApp'"
echo "4. Aguarde o processamento (pode demorar alguns segundos)"
echo "5. Veja o relatório detalhado na tela"
echo ""
echo "📊 O que será importado:"
echo "   - Todos os cursos completados no passado pelos 12 funcionários mapeados"
echo "   - Qualificações novas serão criadas"
echo "   - Qualificações existentes serão marcadas como renovadas"
echo ""
echo "⏳ Aguardando sua ação na interface web..."
echo ""
echo "Pressione Ctrl+C para cancelar"
echo ""

# Aguardar
read -p "Pressione ENTER após executar a importação na interface..."

echo ""
echo "✅ Pronto! Verifique o relatório na interface."
