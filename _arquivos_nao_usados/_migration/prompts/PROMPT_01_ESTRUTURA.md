# 🏗️ FASE 2 - PROMPT 2/7: CRIAR ESTRUTURA TARGET

**Módulo**: Simuladores  
**Etapa**: Criar pastas feature-based  
**Tempo**: 30 minutos  
**Dependências**: PROMPT_00_PREPARACAO.md

---

## 🎯 OBJETIVO

Criar estrutura completa de pastas seguindo arquitetura feature-based definida em ARQUITETURA_SIMULADORES.md.

---

## 📋 CHECKLIST

- [ ] Criar estrutura de pastas
- [ ] Criar mapeamento de arquivos
- [ ] Validar estrutura criada

---

## 🔨 SCRIPT DE EXECUÇÃO

```bash
#!/bin/bash
# 01-criar-estrutura.sh
echo "🏗️ CRIANDO ESTRUTURA TARGET..."

BASE="src/react-app/pages/simuladores"

# Dashboard
mkdir -p "$BASE/dashboard/components"

# Cadastros
mkdir -p "$BASE/cadastros/simuladores/components"
mkdir -p "$BASE/cadastros/simuladores/[id]"
mkdir -p "$BASE/cadastros/manobras/components"
mkdir -p "$BASE/cadastros/templates/components"
mkdir -p "$BASE/cadastros/modelos"
mkdir -p "$BASE/cadastros/categorias"
mkdir -p "$BASE/cadastros/instrutores"
mkdir -p "$BASE/cadastros/tipos-sessao"
mkdir -p "$BASE/cadastros/equipamentos"
mkdir -p "$BASE/cadastros/configuracoes"

# Sessões
mkdir -p "$BASE/sessoes/components"
mkdir -p "$BASE/sessoes/[id]"

# Fichas
mkdir -p "$BASE/fichas/components"
mkdir -p "$BASE/fichas/[id]"

# Agenda
mkdir -p "$BASE/agenda"

# Relatórios
mkdir -p "$BASE/relatorios/components"

# Histórico
mkdir -p "$BASE/historico"

# Componentes shared
mkdir -p "$BASE/components"

echo "✅ Estrutura de pastas criada!"

# Criar .gitkeep para garantir pastas vazias no Git
find "$BASE" -type d -empty -exec touch {}/.gitkeep \;

# Visualizar estrutura
echo ""
echo "📁 ESTRUTURA CRIADA:"
tree "$BASE" -L 3 -I "*.tsx" 2>/dev/null || ls -R "$BASE"

# Log
echo "$(date): Estrutura criada" >> _migration/logs/timeline.log
```

---

## 📊 CRIAR MAPEAMENTO

```bash
#!/bin/bash
# 02-criar-mapeamento.sh
cat > _migration/mapping.md << 'EOF'
# 📋 MAPEAMENTO DE MIGRAÇÃO

| Origem | Destino | Status |
|--------|---------|--------|
| Dashboard.tsx | dashboard/index.tsx | ⏳ |
| Lista.tsx | cadastros/simuladores/index.tsx | ⏳ |
| FormSimulador.tsx | cadastros/simuladores/components/FormularioSimulador.tsx | ⏳ |
| CrudSimuladores.tsx | cadastros/simuladores/crud-completo.tsx | ⏳ |
| NovaSessao.tsx | sessoes/nova.tsx | ⏳ |
| DetalhesSessao.tsx | sessoes/[id]/index.tsx | ⏳ |
| ExecutarSessao.tsx | sessoes/[id]/executar.tsx | ⏳ |
| AprovarSessao.tsx | sessoes/[id]/aprovar.tsx | ⏳ |
| EditarModeloSessao.tsx | sessoes/[id]/editar-modelo.tsx | ⏳ |
| FormSessao.tsx | sessoes/components/FormularioSessao.tsx | ⏳ |
| NovoAgendamento.tsx | sessoes/components/NovoAgendamento.tsx | ⏳ |
| FichasSessao.tsx | fichas/index.tsx | ⏳ |
| FichaDetalhe.tsx | fichas/[id]/index.tsx | ⏳ |
| AgendaCalendario.tsx | agenda/index.tsx | ⏳ |
| AgendaMensal.tsx | agenda/mensal.tsx | ⏳ |
| AgendaSemanal.tsx | agenda/semanal.tsx | ⏳ |
| RelatoriosSimuladores.tsx | relatorios/index.tsx | ⏳ |
| HistoricoFuncionario.tsx | historico/funcionario.tsx | ⏳ |
| CrudManobras.tsx | cadastros/manobras/index.tsx | ⏳ |
| CrudTemplates.tsx | cadastros/templates/index.tsx | ⏳ |
| Templates.tsx | cadastros/templates/lista-alternativa.tsx | ⏳ |
| CrudModelos.tsx | cadastros/modelos/index.tsx | ⏳ |
| CrudCategorias.tsx | cadastros/categorias/index.tsx | ⏳ |
| CrudInstrutores.tsx | cadastros/instrutores/index.tsx | ⏳ |
| CrudTiposSessao.tsx | cadastros/tipos-sessao/index.tsx | ⏳ |
| Equipamentos.tsx | cadastros/equipamentos/index.tsx | ⏳ |
| ConfiguracoesCadastros.tsx | cadastros/configuracoes/index.tsx | ⏳ |
| ImportarRelacoesInteligente.tsx | components/ImportarRelacoes.tsx | ⏳ |
| PDFGeneratorNativo.tsx | components/PDFGenerator.tsx | ⏳ |

**INSTRUÇÕES:**
1. Preencher esta tabela com TODOS os arquivos
2. Executar migração um por um
3. Marcar ✅ quando completo
EOF

echo "✅ Mapeamento criado: _migration/mapping.md"
```

---

## ✅ VALIDAÇÃO

Verificar que estrutura foi criada:

```bash
# Contar pastas criadas
find src/react-app/pages/simuladores -type d | wc -l
# Deve mostrar ~20-25 pastas

# Visualizar estrutura
tree src/react-app/pages/simuladores -L 2
```

---

**Próximo**: `PROMPT_02_MIGRACAO_PAGINAS.md`
