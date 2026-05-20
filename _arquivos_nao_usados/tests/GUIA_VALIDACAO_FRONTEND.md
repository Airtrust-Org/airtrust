# ✅ Guia de Validação Frontend - Módulo Simuladores

**Tempo estimado:** 15 minutos  
**Objetivo:** Confirmar 100% funcional antes de próximo módulo

---

## 🎯 Pré-requisitos

### 1. Servidores Rodando

```bash
# Terminal 1: Frontend
cd /Users/filipedaumas/Documents/airtrust\ v1
npm run dev:web

# Terminal 2: Backend (opcional - já está em produção)
cd /Users/filipedaumas/Documents/airtrust\ v1/worker-airtrust
npm run dev
```

### 2. Acessar

```
URL Frontend: http://localhost:3000/simuladores
URL API Prod: https://airtrust-api-production.airtrust.workers.dev/api/simuladores
Status atual: ✅ Frontend online (HTTP 200)
```

---

## 📋 Checklist de Validação (10 itens)

### Parte 1: Layout e Estrutura Visual

#### ✅ Item 1: Página Carrega Sem Erro 404

```
O que verificar:
- Acessar http://localhost:3000/simuladores
- NÃO deve aparecer página de erro
- NÃO deve aparecer "Cannot GET /simuladores"

✅ Passou se: Página carrega conteúdo
❌ Falhou se: Erro 404 ou tela branca
```

#### ✅ Item 2: Sidebar Visível (Fix AppLayout)

```
O que verificar:
- Sidebar à ESQUERDA da tela
- Com logo AirTrust
- Menu com ícones: Dashboard, Simuladores, Funcionários, etc.

✅ Passou se: Sidebar preta/cinza à esquerda, largura ~240px
❌ Falhou se: Sem sidebar OU sidebar fora da tela
```

#### ✅ Item 3: Header com Breadcrumb

```
O que verificar:
- Header no TOPO da página
- Breadcrumb: "Dashboard > Simuladores"
- Perfil do usuário no canto direito

✅ Passou se: Header presente com navegação visível
❌ Falhou se: Sem header OU breadcrumb errado
```

#### ✅ Item 4: Título e Descrição

```
O que verificar:
- Título H1: "Simuladores" (grande, bold)
- Descrição abaixo: "Gerencie os simuladores de voo..."

✅ Passou se: Ambos visíveis e legíveis
❌ Falhou se: Título faltando OU sobreposto
```

#### ✅ Item 5: Botão Novo Simulador

```
O que verificar:
- Botão "+ Novo Simulador" no canto superior direito
- Cor azul (primary)
- Ícone de "+" visível

✅ Passou se: Botão presente e estilizado
❌ Falhou se: Botão faltando OU sem estilo
```

---

### Parte 2: Dados e Funcionalidade

#### ✅ Item 6: Tabela Renderiza com Dados

```
O que verificar:
- Tabela com colunas: Simulador, Modelo, Tipo, Status, Ações
- 13+ linhas de simuladores
- Dados preenchidos (não vazios)

✅ Passou se: Tabela com >= 13 simuladores
❌ Falhou se: Tabela vazia OU erro de loading

Exemplo de dados esperados:
| Nome           | Modelo   | Tipo        | Status |
|----------------|----------|-------------|--------|
| FULL FLIGHT 01 | A320     | FULL FLIGHT | ATIVO  |
| FULL FLIGHT 02 | B737-800 | FULL FLIGHT | ATIVO  |
| ...            | ...      | ...         | ...    |
```

#### ✅ Item 7: Modal Abre ao Clicar "+ Novo Simulador"

```
O que verificar:
1. Clicar botão "+ Novo Simulador"
2. Modal/Dialog aparece no centro da tela
3. Overlay escuro atrás do modal
4. Botão X para fechar visível

✅ Passou se: Modal abre com animação suave
❌ Falhou se: Nada acontece OU erro no console
```

#### ✅ Item 8: Campos do Formulário

```
O que verificar no modal aberto:
- Campo "Nome do Simulador" (text input)
- Campo "Modelo" (text input ou select)
- Campo "Tipo" (select: FULL FLIGHT, FTD, FNPT II, HELICÓPTERO)
- Campo "Fabricante" (text input)
- Campo "Status" (select: ATIVO, MANUTENÇÃO, INATIVO)
- Botão "Salvar" azul
- Botão "Cancelar" cinza

✅ Passou se: Todos campos presentes e estilizados
❌ Falhou se: Campos faltando OU desalinhados
```

#### ✅ Item 9: Validação Funciona

```
O que testar:
1. No modal, deixar campo "Nome" VAZIO
2. Tentar clicar "Salvar"
3. Deve aparecer mensagem de erro em vermelho abaixo do campo

Mensagens esperadas:
- "Campo obrigatório"
- "Nome deve ter pelo menos 3 caracteres"

✅ Passou se: Erro de validação aparece e impede submit
❌ Falhou se: Permite salvar vazio OU erro 500
```

#### ✅ Item 10: Console Sem Erros

```
O que verificar:
1. Abrir DevTools (F12 ou Cmd+Option+I)
2. Aba "Console"
3. Não deve ter erros em vermelho

Erros permitidos (warnings):
⚠️  "React DevTools extension"
⚠️  "Deprecated prop..."

Erros NÃO permitidos:
❌ "TypeError: ..."
❌ "Failed to fetch"
❌ "Cannot read property"

✅ Passou se: Zero erros vermelhos críticos
❌ Falhou se: Erros de código/API
```

---

## 🧪 Testes CRUD Avançados (Opcional - 5 min)

### Teste 1: Criar Novo Simulador

```
1. Clicar "+ Novo Simulador"
2. Preencher:
   - Nome: "TESTE VALIDACAO 001"
   - Modelo: "B777-300"
   - Tipo: "FULL FLIGHT"
   - Fabricante: "BOEING"
   - Status: "ATIVO"
3. Clicar "Salvar"
4. Modal fecha e novo simulador aparece na lista

✅ Sucesso: Simulador criado e visível na tabela
❌ Erro: Mensagem de erro OU modal não fecha
```

### Teste 2: Editar Simulador

```
1. Na tabela, clicar ícone de "editar" (lápis) em qualquer linha
2. Modal abre com dados PRÉ-PREENCHIDOS
3. Alterar campo "Status" para "MANUTENÇÃO"
4. Clicar "Salvar"
5. Status atualiza na tabela

✅ Sucesso: Alteração refletida imediatamente
❌ Erro: Status não muda OU erro 500
```

### Teste 3: Deletar Simulador (Soft Delete)

```
1. Na tabela, clicar ícone de "deletar" (lixeira)
2. Confirmar no dialog de confirmação
3. Simulador DESAPARECE da lista (soft delete, não remove do banco)

✅ Sucesso: Linha removida da UI
❌ Erro: Linha permanece OU erro
```

### Teste 4: Filtros

```
1. Encontrar filtro "Status" acima da tabela
2. Selecionar "ATIVO"
3. Tabela filtra mostrando apenas simuladores ativos (13 registros)
4. Clicar "Limpar filtros"
5. Tabela volta a mostrar todos

✅ Sucesso: Filtro funciona e limpa corretamente
❌ Erro: Filtro não muda lista OU erro
```

---

## 🐛 Troubleshooting

### Problema 1: Página Não Carrega (404)

```bash
# Verificar se frontend está rodando
lsof -ti:3000

# Se nada retornar, iniciar:
cd /Users/filipedaumas/Documents/airtrust\ v1
npm run dev:web
```

### Problema 2: Tabela Vazia (Sem Dados)

```bash
# Verificar se API está online
curl -s https://airtrust-api-production.airtrust.workers.dev/api/simuladores | jq '.data | length'

# Deve retornar: 13 (ou mais)
# Se retornar 0, rodar seed:
cd worker-airtrust
wrangler d1 execute airtrust-db --env production --file ../seeds/fix_simuladores_null_fields.sql
```

### Problema 3: Sidebar Fora da Tela

```
Causa: Componente não envolvido em AppLayout
Fix já aplicado: Simuladores.tsx usa AppLayout

Se ainda acontecer:
- Verificar src/pages/Simuladores.tsx
- Deve ter: import AppLayout from '@/layout/AppLayout'
- Deve ter: return <AppLayout>...</AppLayout>
```

### Problema 4: Erros no Console

```javascript
// Erro comum: "apiClient is not defined"
// Causa: Import faltando
// Fix: Verificar se tem:
import { apiClient } from '@/lib/api-client';

// Erro comum: "Cannot read property 'data'"
// Causa: API retornou erro mas código não trata
// Fix: Adicionar try/catch ou optional chaining
const data = response?.data ?? [];
```

---

## 📊 Resultado Esperado

### Checklist Completo

```
✅ 10/10 itens básicos passaram
✅ 4/4 testes CRUD passaram (opcional)
✅ 0 erros no console
✅ Performance < 2s para listar simuladores
```

### Se Passou 100%

```
🎉 MÓDULO SIMULADORES 100% VALIDADO!

Próximos passos:
1. Commit validação frontend (opcional)
2. Partir para próximo módulo (Funcionários/Fichas)
3. Ou adicionar features extras (filtros avançados, paginação)
```

### Se Falhou Algum Item

```
❌ Reportar qual item falhou

Informações úteis para debug:
- Screenshot da tela
- Mensagem de erro no console (F12)
- Status da API (curl simuladores)
- Log do terminal do frontend
```

---

## 🚀 Validação Rápida (1 Minuto)

Se estiver com pressa, validar APENAS estes 3:

```
1. ✅ Página carrega com sidebar visível
2. ✅ Tabela mostra 13+ simuladores
3. ✅ Console sem erros críticos

Se estes 3 passaram → 95% de chance de estar 100% OK
```

---

## 📝 Template de Relatório

Copiar e preencher após validação:

```markdown
## Validação Frontend - Simuladores

**Data:** 30/11/2025
**Validado por:** [Seu Nome]

### Checklist Básico

- [ ] 1. Página carrega (200)
- [ ] 2. Sidebar visível
- [ ] 3. Header + breadcrumb
- [ ] 4. Título/descrição
- [ ] 5. Botão novo simulador
- [ ] 6. Tabela com dados (13+)
- [ ] 7. Modal abre
- [ ] 8. Campos formulário
- [ ] 9. Validação funciona
- [ ] 10. Console limpo

### Testes CRUD (opcional)

- [ ] Criar simulador
- [ ] Editar simulador
- [ ] Deletar simulador
- [ ] Filtros funcionam

### Problemas Encontrados

Nenhum / [Descrever aqui]

### Decisão Final

✅ APROVADO para produção
⚠️ APROVADO com ressalvas (descrever)
❌ REPROVADO (necessita correções)
```

---

**Gerado em:** 30/11/2025 00:20  
**Tempo estimado:** 15 minutos  
**Dificuldade:** Fácil (apenas clicar e observar)  
**Status:** ⏳ Aguardando execução do usuário
