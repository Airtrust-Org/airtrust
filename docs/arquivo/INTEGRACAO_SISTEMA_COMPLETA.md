# 🔍 VERIFICAÇÃO COMPLETA DE INTEGRAÇÕES - Sistema AirTrust

**Data:** 2025-11-01  
**Módulo:** Qualificações  
**Status:** EM ANÁLISE

---

## 📋 FLUXOS DE DADOS A VERIFICAR

### 1. TIPOS DE QUALIFICAÇÕES → QUALIFICAÇÕES

#### Campos que devem propagar:
- ✅ `nome` - Nome do tipo
- ✅ `validade_meses` - Meses de validade
- ✅ `vencimento_tipo` - Tipo de vencimento (DIA_EXATO/FIM_DO_MES)
- ❓ `categoria` - Categoria do tipo
- ❓ `descricao` - Descrição do tipo

#### Quando atualizar um tipo:
1. **Backend (API)** - `/api/v2/tipos-qualificacoes/:id` (PUT)
   - ✅ Recalcula `data_vencimento` de todas as qualificações
   - ✅ Atualiza `nome` se mudou
   - ❓ Atualiza `categoria`?
   - ❓ Atualiza `descricao`?

2. **Frontend** - Após salvar tipo
   - ✅ Recarrega lista de tipos
   - ✅ Recarrega lista de qualificações (se na aba Histórico)
   - ❓ Invalida cache?

---

### 2. QUALIFICAÇÕES → CERTIFICADOS (PDFs)

#### Quando fazer upload de PDF:
- ✅ Atualiza `arquivo_url` na qualificação
- ✅ Mostra ícone de download
- ✅ Recarrega lista de qualificações

#### Quando excluir PDF:
- ✅ Remove `arquivo_url` da qualificação
- ✅ Remove ícone de download
- ✅ Recarrega lista de qualificações

---

### 3. FUNCIONÁRIOS → QUALIFICAÇÕES

#### Quando criar qualificação:
- ✅ Valida se funcionário existe
- ✅ Valida se tipo existe
- ✅ Calcula data de vencimento automaticamente
- ✅ Recarrega lista após salvar

#### Quando editar qualificação:
- ❓ Recalcula vencimento se mudar data_conclusao?
- ❓ Atualiza nome se tipo mudou?
- ❓ Recarrega lista após salvar?

---

### 4. CATEGORIAS → TIPOS → QUALIFICAÇÕES

#### Aba Categorias:
- ❓ Existe API para gerenciar categorias?
- ❓ Categorias são fixas ou dinâmicas?
- ❓ Ao criar/editar categoria, atualiza tipos relacionados?

---

## 🔧 ENDPOINTS A VERIFICAR

### Tipos de Qualificações:
- ✅ `GET /api/v2/tipos-qualificacoes` - Listar
- ✅ `POST /api/v2/tipos-qualificacoes` - Criar
- ✅ `PUT /api/v2/tipos-qualificacoes/:id` - Atualizar
- ✅ `DELETE /api/v2/tipos-qualificacoes/:id` - Excluir

### Qualificações:
- ✅ `GET /api/v2/qualificacoes` - Listar
- ✅ `POST /api/v2/qualificacoes` - Criar
- ✅ `PUT /api/v2/qualificacoes/:id` - Atualizar
- ✅ `DELETE /api/v2/qualificacoes/:id` - Excluir
- ✅ `POST /api/v2/qualificacoes/upload-certificado` - Upload PDF

### Categorias:
- ❓ `GET /api/v2/categorias-qualificacoes` - Listar?
- ❓ `POST /api/v2/categorias-qualificacoes` - Criar?
- ❓ `PUT /api/v2/categorias-qualificacoes/:id` - Atualizar?
- ❓ `DELETE /api/v2/categorias-qualificacoes/:id` - Excluir?

---

## 🔄 ATUALIZAÇÕES AUTOMÁTICAS

### ✅ JÁ FUNCIONANDO:
1. Upload PDF → Recarrega qualificações
2. Excluir PDF → Recarrega qualificações
3. Criar qualificação → Recarrega lista
4. Editar tipo → Recalcula vencimentos

### ❌ FALTANDO VERIFICAR:
1. Editar qualificação → Recarrega lista?
2. Excluir qualificação → Recarrega lista?
3. Importar qualificações → Recarrega lista?
4. Importar tipos → Recarrega lista?
5. Criar categoria → Atualiza tipos?
6. Editar categoria → Atualiza tipos?

---

## 🗄️ ESTRUTURA DO BANCO DE DADOS

### Tabela: `tipos_qualificacoes`
```sql
- id
- tipo (TREINAMENTO/EXAME/CHECK)
- codigo (único)
- nome
- descricao
- validade_meses
- vencimento_tipo (DIA_EXATO/FIM_DO_MES)
- categoria (EXAME/CHECK/TREINAMENTO_TEORICO/TREINAMENTO_VOO/QUALIDADE)
- status (ATIVO/INATIVO)
- created_at
- updated_at
- deleted_at
```

### Tabela: `qualificacoes`
```sql
- id
- funcionario_id (FK)
- tipo (TREINAMENTO/EXAME/CHECK)
- codigo (referência a tipos_qualificacoes)
- nome
- data_conclusao
- data_vencimento
- observacoes
- arquivo_url
- is_renovada
- status
- created_at
- updated_at
- deleted_at
```

### Tabela: `categorias_qualificacoes` (?)
- ❓ Existe?
- ❓ Estrutura?

---

## 🎯 VERIFICAÇÕES NECESSÁRIAS

### Prioridade ALTA:
1. ❗ Verificar se edição de qualificação recarrega lista
2. ❗ Verificar se exclusão de qualificação recarrega lista
3. ❗ Verificar se categoria é salva ao criar/editar tipo
4. ❗ Verificar se importação recarrega listas
5. ❗ Verificar se aba Categorias está funcional

### Prioridade MÉDIA:
6. Verificar se descrição do tipo é propagada
7. Verificar se categoria do tipo é propagada
8. Verificar cache de qualificações
9. Verificar logs de auditoria

### Prioridade BAIXA:
10. Otimizar queries SQL
11. Adicionar índices faltantes
12. Melhorar feedback visual

---

## 📝 PRÓXIMOS PASSOS

1. Testar cada endpoint com curl
2. Verificar código de cada modal
3. Confirmar callbacks de atualização
4. Testar fluxo completo:
   - Criar tipo → Criar qualificação → Ver se nome aparece
   - Editar tipo → Ver se qualificações atualizam
   - Upload PDF → Ver se ícone aparece
   - Excluir PDF → Ver se ícone some

---

**Status:** INICIANDO VERIFICAÇÃO DETALHADA...
