#!/bin/bash
# migrate-file.sh
# Migra arquivo de forma segura com backup e análise de dependências

set -euo pipefail

# Uso: ./migrate-file.sh <arquivo-origem> <arquivo-destino>
# Exemplo: ./migrate-file.sh Lista.tsx cadastros/simuladores/index.tsx

if [ $# -ne 2 ]; then
  echo "❌ Uso: ./migrate-file.sh <origem> <destino>"
  echo ""
  echo "Exemplo:"
  echo "  ./migrate-file.sh Lista.tsx cadastros/simuladores/index.tsx"
  echo "  ./migrate-file.sh FormSimulador.tsx cadastros/simuladores/novo.tsx"
  exit 1
fi

BASE="src/react-app/pages/simuladores"
SRC="$BASE/$1"
DEST="$BASE/$2"

echo "🔄 MIGRANDO ARQUIVO..."
echo "   Origem: $SRC"
echo "   Destino: $DEST"
echo ""

# 1. Verificar se origem existe
if [ ! -f "$SRC" ]; then
  echo "❌ Arquivo origem não encontrado: $SRC"
  exit 1
fi

# 2. Verificar se destino já existe
if [ -f "$DEST" ]; then
  echo "⚠️  Arquivo destino já existe: $DEST"
  read -p "   Sobrescrever? (y/N): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Operação cancelada"
    exit 1
  fi
fi

# 3. Criar diretório destino se não existir
mkdir -p "$(dirname "$DEST")"
echo "✅ Diretório destino verificado"

# 4. Buscar arquivos que importam este componente
COMPONENT_NAME=$(basename "$SRC" .tsx)
echo ""
echo "🔍 Buscando arquivos que importam '$COMPONENT_NAME'..."
IMPORTS=$(grep -r "from.*['\"].*$COMPONENT_NAME['\"]" src/react-app \
  --include="*.tsx" --include="*.ts" 2>/dev/null | cut -d: -f1 | sort -u || true)

if [ -n "$IMPORTS" ]; then
  echo "📦 Encontrados $(echo "$IMPORTS" | wc -l | tr -d ' ') arquivos com imports:"
  echo "$IMPORTS" | head -10
  if [ $(echo "$IMPORTS" | wc -l) -gt 10 ]; then
    echo "   ... e mais"
  fi
else
  echo "✅ Nenhum import encontrado (arquivo pode estar órfão)"
fi

# 5. Buscar rotas em App.tsx
echo ""
echo "🔍 Buscando rotas em App.tsx..."
ROUTES=$(grep -n "$COMPONENT_NAME" src/react-app/App.tsx 2>/dev/null || true)
if [ -n "$ROUTES" ]; then
  echo "🛣️  Rotas encontradas:"
  echo "$ROUTES"
else
  echo "✅ Nenhuma rota encontrada em App.tsx"
fi

# 6. Copiar arquivo (não deletar ainda)
echo ""
read -p "❓ Continuar com a cópia? (Y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
  cp "$SRC" "$DEST"
  echo "✅ Arquivo copiado para: $DEST"
  
  # Calcular novo caminho de import relativo
  OLD_PATH=$(echo "$1" | sed 's/.tsx$//')
  NEW_PATH=$(echo "$2" | sed 's/.tsx$//')
  
  echo ""
  echo "📝 PRÓXIMOS PASSOS MANUAIS:"
  echo ""
  echo "1️⃣  ATUALIZAR IMPORTS nos arquivos listados acima"
  echo "    Buscar e substituir:"
  echo "    - De: from './pages/simuladores/$OLD_PATH'"
  echo "    - Para: from './pages/simuladores/$NEW_PATH'"
  echo ""
  echo "2️⃣  ATUALIZAR ROTA em App.tsx"
  if [ -n "$ROUTES" ]; then
    echo "    Verificar linhas mostradas acima"
  fi
  echo ""
  echo "3️⃣  TESTAR BUILD"
  echo "    npm run build"
  echo ""
  echo "4️⃣  SE TUDO OK, DELETAR ORIGEM"
  echo "    rm $SRC"
  echo ""
  echo "5️⃣  COMMIT"
  echo "    git add -- $SRC $NEW_PATH"
  echo "    git commit -m \"refactor(simuladores): move $(basename $SRC) to $NEW_PATH\""
else
  echo "❌ Operação cancelada"
  exit 1
fi
