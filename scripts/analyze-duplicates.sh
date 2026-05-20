#!/bin/bash

echo "🔍 ANÁLISE DE DUPLICAÇÕES - AIRTRUST"
echo "Data: $(date '+%d/%m/%Y %H:%M:%S')"
echo ""

echo "📂 1. COMPONENTES FRONTEND"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Funcionários
echo ""
echo "👤 Funcionários:"
find src -iname "*funcionario*" -type f 2>/dev/null | grep -E "\.(tsx|ts)$" | sort

# Qualificações
echo ""
echo "🎓 Qualificações:"
find src -iname "*qualifica*" -type f 2>/dev/null | grep -E "\.(tsx|ts)$" | sort

# Simuladores
echo ""
echo "🛩️ Simuladores/Sessões:"
find src \( -iname "*simulador*" -o -iname "*sessao*" -o -iname "*session*" \) -type f 2>/dev/null | grep -E "\.(tsx|ts)$" | sort

# Certificados (verificar se limpeza foi completa)
echo ""
echo "📄 Certificados:"
find src -iname "*certificado*" -type f 2>/dev/null | grep -E "\.(tsx|ts)$" | sort

# Compliance
echo ""
echo "✅ Compliance:"
find src -iname "*compliance*" -type f 2>/dev/null | grep -E "\.(tsx|ts)$" | sort

# Pasta Virtual
echo ""
echo "📁 Pasta Virtual/Documentos:"
find src \( -iname "*pasta*" -o -iname "*documento*" -o -iname "*document*" \) -type f 2>/dev/null | grep -E "\.(tsx|ts)$" | sort

# Hospedagem
echo ""
echo "🏨 Hospedagem:"
find src -iname "*hospedagem*" -type f 2>/dev/null | grep -E "\.(tsx|ts)$" | sort

# FRMS
echo ""
echo "⚠️ FRMS:"
find src -iname "*frms*" -o -iname "*evento*" -type f 2>/dev/null | grep -E "\.(tsx|ts)$" | sort

# Auditoria
echo ""
echo "🔍 Auditoria:"
find src -iname "*auditoria*" -o -iname "*audit*" -type f 2>/dev/null | grep -E "\.(tsx|ts)$" | sort

echo ""
echo "📂 2. ROTAS BACKEND"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ -d "worker-airtrust/src/routes" ]; then
  ls -lh worker-airtrust/src/routes/*.ts 2>/dev/null | awk '{print $9, "("$5")"}'
else
  echo "⚠️ Pasta worker-airtrust/src/routes não encontrada"
fi

echo ""
echo "📂 3. HOOKS CUSTOMIZADOS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ -d "src/hooks" ]; then
  ls -lh src/hooks/*.ts 2>/dev/null | awk '{print $9, "("$5")"}'
else
  echo "⚠️ Pasta src/hooks não encontrada"
fi

echo ""
echo "📊 4. ESTATÍSTICAS GERAIS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Total componentes: $(find src/components -name "*.tsx" 2>/dev/null | wc -l | tr -d ' ')"
echo "Total páginas: $(find src/pages -name "*.tsx" 2>/dev/null | wc -l | tr -d ' ')"
echo "Total modais: $(find src/components/modals -name "*.tsx" 2>/dev/null | wc -l | tr -d ' ')"
echo "Total hooks: $(find src/hooks -name "*.ts" 2>/dev/null | wc -l | tr -d ' ')"
echo "Total rotas backend: $(ls worker-airtrust/src/routes/*.ts 2>/dev/null | wc -l | tr -d ' ')"

echo ""
echo "🔍 5. BUSCAR PADRÕES DE DUPLICAÇÃO"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Buscar componentes Modal* com possíveis duplicados Add* ou Edit*
echo ""
echo "Analisando Modais com possíveis duplicações:"
if [ -d "src/components/modals" ]; then
  find src/components/modals -name "Modal*.tsx" 2>/dev/null | while read file; do
    basename=$(basename "$file" .tsx)
    entity=${basename#Modal}
    
    # Buscar variações (Add*, Edit*, *Form relacionados)
    add_variant=$(find src -iname "Add${entity}*.tsx" 2>/dev/null | wc -l | tr -d ' ')
    edit_variant=$(find src -iname "Edit*${entity}*.tsx" -o -iname "*Editar${entity}*.tsx" 2>/dev/null | wc -l | tr -d ' ')
    form_variant=$(find src -iname "${entity}Form*.tsx" 2>/dev/null | wc -l | tr -d ' ')
    
    total=$((add_variant + edit_variant + form_variant))
    
    if [ $total -gt 0 ]; then
      echo "  ⚠️ $basename:"
      [ $add_variant -gt 0 ] && echo "     - Add* variants: $add_variant"
      [ $edit_variant -gt 0 ] && echo "     - Edit* variants: $edit_variant"
      [ $form_variant -gt 0 ] && echo "     - Form variants: $form_variant"
    fi
  done
fi

echo ""
echo "Analisando Hooks com possíveis duplicações:"
if [ -d "src/hooks" ]; then
  # Agrupar hooks por entidade
  for entity in Funcionario Qualificacao Simulador Certificado Sessao Documento Hospedagem; do
    hooks=$(find src/hooks -iname "use*${entity}*.ts" 2>/dev/null | wc -l | tr -d ' ')
    if [ $hooks -gt 1 ]; then
      echo "  ⚠️ ${entity}: $hooks hooks encontrados"
      find src/hooks -iname "use*${entity}*.ts" 2>/dev/null | sed 's/^/     - /'
    fi
  done
fi

echo ""
echo "Analisando Rotas Backend com sufixos suspeitos:"
if [ -d "worker-airtrust/src/routes" ]; then
  # Buscar rotas com sufixos -v2, -ext, -old, -new
  echo "  Rotas com versionamento/extensões:"
  ls worker-airtrust/src/routes/*.ts 2>/dev/null | grep -E "(-v[0-9]|-ext|-old|-new|-legacy)" | sed 's/^/     ⚠️ /'
  
  # Buscar entidades com múltiplas rotas
  echo ""
  echo "  Entidades com múltiplos arquivos de rota:"
  for entity in funcionarios qualificacoes simuladores certificados sessoes documentos auditoria; do
    routes=$(ls worker-airtrust/src/routes/${entity}*.ts 2>/dev/null | wc -l | tr -d ' ')
    if [ $routes -gt 1 ]; then
      echo "     ⚠️ ${entity}: $routes arquivos"
      ls worker-airtrust/src/routes/${entity}*.ts 2>/dev/null | sed 's/^/        - /'
    fi
  done
fi

echo ""
echo "📈 6. ANÁLISE DE USO (TOP 10 IMPORTS MAIS USADOS)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Modais mais importados:"
grep -rh "from.*Modal" src --include="*.tsx" --include="*.ts" 2>/dev/null | \
  sed "s/.*from ['\"]//;s/['\"].*//" | \
  sort | uniq -c | sort -rn | head -10 | \
  awk '{printf "  %2d usos: %s\n", $1, $2}'

echo ""
echo "Hooks mais importados:"
grep -rh "from.*use[A-Z]" src --include="*.tsx" --include="*.ts" 2>/dev/null | \
  sed "s/.*from ['\"]//;s/['\"].*//" | \
  sort | uniq -c | sort -rn | head -10 | \
  awk '{printf "  %2d usos: %s\n", $1, $2}'

echo ""
echo "🎯 7. RESUMO DE AÇÕES SUGERIDAS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Contar potenciais duplicados
total_modals=$(find src/components/modals -name "*.tsx" 2>/dev/null | wc -l | tr -d ' ')
add_components=$(find src -iname "Add*.tsx" 2>/dev/null | wc -l | tr -d ' ')
edit_components=$(find src -iname "Edit*.tsx" -o -iname "*Editar*.tsx" 2>/dev/null | wc -l | tr -d ' ')
versioned_routes=$(ls worker-airtrust/src/routes/*.ts 2>/dev/null | grep -E "(-v[0-9]|-ext|-old)" | wc -l | tr -d ' ')

echo ""
echo "Componentes potencialmente duplicados:"
echo "  - Modais: $total_modals arquivos"
echo "  - Add* components: $add_components arquivos"
echo "  - Edit* components: $edit_components arquivos"
echo ""
echo "Rotas potencialmente duplicadas:"
echo "  - Rotas versionadas/extensões: $versioned_routes arquivos"

echo ""
echo "✅ ANÁLISE COMPLETA!"
echo ""
echo "📝 Próximos Passos:"
echo "  1. Revisar componentes Add*/Edit* e consolidar em Modais"
echo "  2. Consolidar hooks duplicados por entidade"
echo "  3. Remover rotas -v2, -ext, -old"
echo "  4. Padronizar nomenclatura"
echo "  5. Executar testes após cada consolidação"
