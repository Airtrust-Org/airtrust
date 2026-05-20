#!/bin/bash
# create-migration-mapping.sh
# Cria tabela de mapeamento para migração de arquivos

set -euo pipefail

mkdir -p _migration

echo "📊 CRIANDO TABELA DE MAPEAMENTO..."

# Listar todos os arquivos .tsx na raiz de simuladores
BASE="src/react-app/pages/simuladores"
FILES=$(find "$BASE" -maxdepth 1 -name "*.tsx" -type f | sort)

cat > _migration/mapping.md << 'EOF'
# 📊 MAPEAMENTO DE MIGRAÇÃO - PÁGINAS SIMULADORES

**Data**: 01/12/2025  
**Objetivo**: Reorganizar estrutura de páginas para arquitetura feature-based

---

## 📋 INSTRUÇÕES

Para cada arquivo ANTIGO, definir:
1. **Novo Caminho**: Onde o arquivo vai
2. **Novo Nome**: Nome do arquivo (se mudar)
3. **Ações**: O que precisa ser feito

### Nomenclatura Target
- `index.tsx` → Lista ou dashboard
- `novo.tsx` → Criar
- `[id].tsx` → Detalhes (view)
- `[id]/editar.tsx` → Editar

---

## 🗺️ TABELA DE MAPEAMENTO

| # | Arquivo Antigo | Novo Caminho | Novo Nome | Ações | Status |
|---|----------------|--------------|-----------|-------|--------|
EOF

# Adicionar linhas para cada arquivo
COUNT=1
echo "$FILES" | while read file; do
  filename=$(basename "$file")
  echo "| $COUNT | \`$filename\` | ❓ | ❓ | ❓ | ⏳ TODO |" >> _migration/mapping.md
  COUNT=$((COUNT + 1))
done

cat >> _migration/mapping.md << 'EOF'

---

## 🎯 CATEGORIAS SUGERIDAS

### Dashboard
Arquivos que mostram visão geral:
- `Dashboard.tsx` → `dashboard/index.tsx`
- `SimuladoresWrapper.tsx` → `dashboard/index.tsx` (ou deletar se for só wrapper)

### Cadastros
Arquivos de CRUD:
- `Lista.tsx` → `cadastros/simuladores/index.tsx`
- `FormSimulador.tsx` → `cadastros/simuladores/novo.tsx`
- `CrudSimuladores.tsx` → ❌ DELETAR (quebrar em Lista + Form)
- `CrudManobras.tsx` → `cadastros/manobras/index.tsx` (verificar se tem lista+form)
- `CrudTemplates.tsx` → `cadastros/templates/index.tsx` (verificar se tem lista+form)

### Sessões
Arquivos relacionados a sessões de treino:
- `Sessoes.tsx` → `sessoes/index.tsx`
- `AgendarSessao.tsx` → `sessoes/nova.tsx`

### Fichas
Arquivos de fichas de avaliação:
- `Fichas.tsx` → `fichas/index.tsx`
- `PreencherFicha.tsx` → `fichas/[id]/preencher.tsx`
- `VisualizarFicha.tsx` → `fichas/[id]/index.tsx`

### Relatórios
- `Relatorios.tsx` → `relatorios/index.tsx`

---

## ⚠️ CASOS ESPECIAIS A DECIDIR

### 1. Dashboard vs SimuladoresWrapper
**Situação**: Dois arquivos que podem ser o dashboard

**Ação necessária**:
- [ ] Comparar código dos 2 arquivos (`git diff` ou vimdiff)
- [ ] Se Wrapper é só container: deletar, usar Dashboard
- [ ] Se ambos têm lógica: mesclar em `dashboard/index.tsx`
- [ ] Decisão: ________________________

### 2. CRUDs Completos (CrudSimuladores, CrudManobras, CrudTemplates)
**Situação**: Arquivos únicos que têm lista + form de criar + form de editar

**Ação necessária**:
- [ ] Abrir arquivo e identificar seções
- [ ] Extrair Lista → `index.tsx`
- [ ] Extrair Form Criar → `novo.tsx`
- [ ] Extrair Form Editar → `[id]/editar.tsx`
- [ ] Deletar arquivo original após extração

### 3. PDF Generators (3 versões)
**Situação**: 3 componentes que geram PDF

**Ação necessária**:
- [ ] Testar `PDFGeneratorDefinitivo.tsx`
- [ ] Testar `PDFGeneratorNativo.tsx` ⭐ (2 usos atuais)
- [ ] Testar `PDFGeneratorRobusto.tsx`
- [ ] Escolher melhor versão
- [ ] Renomear escolhido para `components/PDFGenerator.tsx`
- [ ] Deletar outros 2
- [ ] Decisão: ________________________

---

## ✅ EXEMPLO DE PREENCHIMENTO

| # | Arquivo Antigo | Novo Caminho | Novo Nome | Ações | Status |
|---|----------------|--------------|-----------|-------|--------|
| 1 | `Lista.tsx` | `cadastros/simuladores/` | `index.tsx` | Renomear, atualizar imports, rota | ⏳ TODO |
| 2 | `FormSimulador.tsx` | `cadastros/simuladores/` | `novo.tsx` | Renomear, atualizar imports, rota | ⏳ TODO |
| 3 | `CrudSimuladores.tsx` | ❌ DELETAR | - | Quebrar em Lista + Form, depois deletar | ⏳ TODO |

---

## 📝 PRÓXIMOS PASSOS

1. ✅ Estrutura target criada (`./scripts/reorganize-pages.sh`)
2. ⏳ **Preencher esta tabela** (decisões manuais necessárias)
3. ⏳ Usar `./scripts/migrate-file.sh` para cada arquivo
4. ⏳ Atualizar imports (buscar e substituir)
5. ⏳ Atualizar rotas em App.tsx
6. ⏳ Testar build (`npm run build`)
7. ⏳ Testes funcionais

---

**Status**: ⏳ AGUARDANDO PREENCHIMENTO  
**Responsável**: [Seu Nome]  
**Prazo**: [Data]
EOF

echo "✅ Tabela de mapeamento criada: _migration/mapping.md"
echo ""
echo "📝 PRÓXIMA AÇÃO:"
echo "   1. Abrir _migration/mapping.md"
echo "   2. Preencher destino de cada arquivo"
echo "   3. Decidir casos especiais (Dashboard vs Wrapper, etc)"
echo "   4. Executar migrações com ./scripts/migrate-file.sh"
