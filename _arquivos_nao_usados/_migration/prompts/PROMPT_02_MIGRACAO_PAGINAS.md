# 🔄 FASE 2 - PROMPT 3/7: MIGRAÇÃO DE PÁGINAS

**Módulo**: Simuladores  
**Etapa**: Migrar arquivos para estrutura nova  
**Tempo**: 2 horas  
**Dependências**: PROMPT_01_ESTRUTURA.md

---

## 🎯 OBJETIVO

Migrar todos os arquivos de páginas para estrutura feature-based, atualizando imports automaticamente.

---

## 📋 CHECKLIST

- [ ] Migrar Dashboard
- [ ] Migrar Cadastros (Simuladores, Manobras, Templates)
- [ ] Migrar Sessões
- [ ] Migrar Fichas
- [ ] Migrar Relatórios
- [ ] Atualizar imports
- [ ] Validar build

---

## 🔨 SCRIPT DE MIGRAÇÃO

```bash
#!/bin/bash
# 03-migrate-file.sh
# USO: ./03-migrate-file.sh <origem> <destino>
set -e

ORIGIN="$1"
DEST="$2"
BASE="src/react-app/pages/simuladores"

echo "🔄 MIGRANDO: $ORIGIN → $DEST"

# 1. Verificar origem
if [ ! -f "$BASE/$ORIGIN" ]; then
  echo "❌ Arquivo não encontrado: $BASE/$ORIGIN"
  exit 1
fi

# 2. Criar diretório destino
mkdir -p "$(dirname "$BASE/$DEST")"

# 3. Mover arquivo
mv "$BASE/$ORIGIN" "$BASE/$DEST"
echo "✅ Arquivo movido"

# 4. Buscar imports que usam este arquivo
FILENAME=$(basename "$ORIGIN" .tsx)
echo "🔍 Buscando imports de '$FILENAME'..."

grep -r "from.*$FILENAME" src/react-app --include="*.tsx" --include="*.ts" 2>/dev/null || echo "  (nenhum import encontrado)"

# 5. Log
echo "$(date) | $ORIGIN → $DEST" >> _migration/logs/migracoes.log

echo "✅ Migração completa"
```

---

## 📝 SEQUÊNCIA DE MIGRAÇÃO

```bash
# Dashboard
./03-migrate-file.sh Dashboard.tsx dashboard/index.tsx

# Simuladores
./03-migrate-file.sh Lista.tsx cadastros/simuladores/index.tsx
./03-migrate-file.sh FormSimulador.tsx cadastros/simuladores/components/FormularioSimulador.tsx
./03-migrate-file.sh CrudSimuladores.tsx cadastros/simuladores/crud-completo.tsx

# Sessões
./03-migrate-file.sh NovaSessao.tsx sessoes/nova.tsx
./03-migrate-file.sh DetalhesSessao.tsx sessoes/[id]/index.tsx
./03-migrate-file.sh ExecutarSessao.tsx sessoes/[id]/executar.tsx
./03-migrate-file.sh AprovarSessao.tsx sessoes/[id]/aprovar.tsx
./03-migrate-file.sh EditarModeloSessao.tsx sessoes/[id]/editar-modelo.tsx
./03-migrate-file.sh FormSessao.tsx sessoes/components/FormularioSessao.tsx
./03-migrate-file.sh NovoAgendamento.tsx sessoes/components/NovoAgendamento.tsx

# Fichas
./03-migrate-file.sh FichasSessao.tsx fichas/index.tsx
./03-migrate-file.sh FichaDetalhe.tsx fichas/[id]/index.tsx

# Agenda
./03-migrate-file.sh AgendaCalendario.tsx agenda/index.tsx
./03-migrate-file.sh AgendaMensal.tsx agenda/mensal.tsx
./03-migrate-file.sh AgendaSemanal.tsx agenda/semanal.tsx

# Relatórios
./03-migrate-file.sh RelatoriosSimuladores.tsx relatorios/index.tsx

# Histórico
./03-migrate-file.sh HistoricoFuncionario.tsx historico/funcionario.tsx

# Cadastros (CRUDs)
./03-migrate-file.sh CrudManobras.tsx cadastros/manobras/index.tsx
./03-migrate-file.sh CrudTemplates.tsx cadastros/templates/index.tsx
./03-migrate-file.sh Templates.tsx cadastros/templates/lista-alternativa.tsx
./03-migrate-file.sh CrudModelos.tsx cadastros/modelos/index.tsx
./03-migrate-file.sh CrudCategorias.tsx cadastros/categorias/index.tsx
./03-migrate-file.sh CrudInstrutores.tsx cadastros/instrutores/index.tsx
./03-migrate-file.sh CrudTiposSessao.tsx cadastros/tipos-sessao/index.tsx
./03-migrate-file.sh Equipamentos.tsx cadastros/equipamentos/index.tsx
./03-migrate-file.sh ConfiguracoesCadastros.tsx cadastros/configuracoes/index.tsx

# Componentes
./03-migrate-file.sh ImportarRelacoesInteligente.tsx components/ImportarRelacoes.tsx

# Build e validar
npm run build
```

---

## 🔧 ATUALIZAR IMPORTS

```bash
#!/bin/bash
# 04-atualizar-imports.sh
echo "🔧 ATUALIZANDO IMPORTS..."

# Dashboard
find src/react-app -name "*.tsx" -exec sed -i.bak \
  "s|from './Dashboard'|from './dashboard'|g" {} \;

# Simuladores
find src/react-app -name "*.tsx" -exec sed -i.bak \
  "s|from './Lista'|from './cadastros/simuladores'|g" {} \;

find src/react-app -name "*.tsx" -exec sed -i.bak \
  "s|from './FormSimulador'|from './cadastros/simuladores/components/FormularioSimulador'|g" {} \;

# Sessões
find src/react-app -name "*.tsx" -exec sed -i.bak \
  "s|from './NovaSessao'|from './sessoes/nova'|g" {} \;

find src/react-app -name "*.tsx" -exec sed -i.bak \
  "s|from './DetalhesSessao'|from './sessoes/\[id\]'|g" {} \;

# Fichas
find src/react-app -name "*.tsx" -exec sed -i.bak \
  "s|from './FichasSessao'|from './fichas'|g" {} \;

find src/react-app -name "*.tsx" -exec sed -i.bak \
  "s|from './FichaDetalhe'|from './fichas/\[id\]'|g" {} \;

# Relatórios
find src/react-app -name "*.tsx" -exec sed -i.bak \
  "s|from './RelatoriosSimuladores'|from './relatorios'|g" {} \;

# Limpar backups
find src/react-app -name "*.bak" -delete

echo "✅ Imports atualizados"
npm run build
```

---

## ✅ VALIDAÇÃO

```bash
# Build deve passar
npm run build

# Verificar imports quebrados
grep -r "from './[A-Z]" src/react-app/pages/simuladores
# Não deve retornar nada
```

---

**Próximo**: `PROMPT_03_PDF_CONSOLIDACAO.md`
