# ✅ Importação de Tipos de Qualificação - CORRIGIDA

## 🎯 Problema Identificado

Os dados não apareciam na tela após importação de tipos de qualificações porque:

1. **Nome de coluna incorreto no SQL**: O serviço estava usando `validade` mas o banco utiliza `validade_meses`
2. Campo extra desnecessário `observacoes` sendo incluído no UPDATE

## 🔧 Correções Aplicadas

### Arquivo: `worker-airtrust/src/services/importacao/QualificacaoTipoImportacaoRefactored.ts`

#### ❌ ANTES (Errado):

```typescript
// INSERT
INSERT INTO qualificacoes_tipos (
  id, tipo, codigo, nome, descricao, categoria,
  carga_horaria, validade_meses
) VALUES (?, ?, ?, ?, ?, ?, ?, ?)

// UPDATE
UPDATE qualificacoes_tipos SET
  tipo = ?,
  nome = ?,
  descricao = ?,
  categoria = ?,
  carga_horaria = ?,
  validade = ?,
  observacoes = ?,
  deleted_at = NULL,
  updated_at = CURRENT_TIMESTAMP
WHERE UPPER(codigo) = UPPER(?)
```

#### ✅ DEPOIS (Correto):

```typescript
// INSERT
INSERT INTO qualificacoes_tipos (
  id, tipo, codigo, nome, descricao, categoria,
  carga_horaria, validade_meses, created_at, deleted_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, NULL)

// UPDATE
UPDATE qualificacoes_tipos SET
  tipo = ?,
  nome = ?,
  descricao = ?,
  categoria = ?,
  carga_horaria = ?,
  validade_meses = ?,
  deleted_at = NULL,
  updated_at = CURRENT_TIMESTAMP
WHERE UPPER(codigo) = UPPER(?)
```

## 📊 Fluxo Completo de Importação (Modelo Funcionários)

### 1. Frontend (React)

```
QualificacoesNew.tsx
  ↓
  Botão "Importar Tipos" clicado
  ↓
  setImportModal('tipos')
  ↓
  ModalImportacaoV2 renderizado com entidade="qualificacoes_tipos"
  ↓
  useImportacao('qualificacoes_tipos') inicializado
  ↓
  Usuário seleciona arquivo CSV/XLSX
  ↓
  parsearArquivo() (Papa Parse ou XLSX)
  ↓
  validarDados() → POST /api/importacao-v2/validar-json/qualificacoes_tipos
  ↓
  Validação retorna erros (se houver)
  ↓
  executarImportacao() → POST /api/importacao-v2/executar-json/qualificacoes_tipos
  ↓
  Importação bem-sucedida
  ↓
  Modal fecha
  ↓
  refetchTipos() → GET /api/qualificacoes/tipos?limit=200
  ↓
  Dados aparecem na tabela ✅
```

### 2. Backend (Worker)

#### Validação

```
POST /api/importacao-v2/validar-json/qualificacoes_tipos
  ↓
  getImportService('qualificacoes_tipos') → QualificacaoTipoImportacaoService
  ↓
  remapRowHeaders() → retorna row como está (headers já em lowercase)
  ↓
  service.validate(remappedRows)
  ↓
  validateQualificacaoTipoRow() para cada linha
  ↓
  Response: { success: true/false, totalRows, errors, preview }
```

#### Execução

```
POST /api/importacao-v2/executar-json/qualificacoes_tipos
  ↓
  getImportService('qualificacoes_tipos') → QualificacaoTipoImportacaoService
  ↓
  service.import(remappedRows, mode='UPSERT')
  ↓
  Para cada linha:
    - Normaliza código (UPPERCASE)
    - Busca por UPPER(codigo) = UPPER(?)
    - Se existe: UPDATE com undelete
    - Se não existe: INSERT com UUID
  ↓
  Response: { success, totalRows, inserted, updated, skipped, errors }
```

#### Leitura (após importação)

```
GET /api/qualificacoes/tipos?limit=200
  ↓
  SELECT id, nome, codigo, categoria, descricao,
         validade_meses, ativo, created_at, updated_at
  FROM qualificacoes_tipos
  WHERE deleted_at IS NULL
  ORDER BY categoria, nome
  ↓
  Response: { success: true, data: [...], meta: {...} }
```

## 📋 Comparação: Funcionários vs Tipos

| Aspecto                     | Funcionários                  | Tipos                 |
| --------------------------- | ----------------------------- | --------------------- |
| **Entidade**                | `funcionarios`                | `qualificacoes_tipos` |
| **Campos obrigatórios**     | Nome, CPF, Matricula          | codigo, nome          |
| **Chave natural de lookup** | CPF                           | UPPER(codigo)         |
| **Remapeamento headers**    | Sim (maiúsculas: Nome → Nome) | Não (minúsculas já)   |
| **Validação extra**         | CPF válido, unicidade         | Código uppercase      |
| **INSERT ID**               | UUID (TEXT)                   | UUID (TEXT)           |
| **Soft delete**             | Suporta (deleted_at)          | Suporta (deleted_at)  |
| **Modo default**            | UPSERT                        | UPSERT                |

## 🧪 Como Testar

### 1. Preparar Planilha

```csv
tipo,codigo,nome,descricao,categoria,carga_horaria,validade,observacoes
CURSO,CMA1,Curso Manutenção Aeronáutica Básico,Curso teórico e prático de manutenção,CMA,160,24,Renovação obrigatória a cada 2 anos
TREINAMENTO,GEN001,Treinamento Genérico,Treinamento básico obrigatório,GERAL,8,12,Anual
```

### 2. Na tela de Qualificações

1. Clique em "Tipos de Qualificação"
2. Clique em "Importar Tipos"
3. Upload do CSV
4. Validação deve passar (0 erros)
5. Clique em "Confirmar"
6. Aguarde conclusão
7. Tabela deve atualizar com novos dados ✅

### 3. Verificar Banco (via CLI)

```bash
npx wrangler d1 execute airtrust-db --remote --command="
SELECT id, codigo, nome, categoria, validade_meses
FROM qualificacoes_tipos
WHERE deleted_at IS NULL
ORDER BY created_at DESC
LIMIT 10;
"
```

## 🔍 Debugging

Se dados não aparecerem:

1. **Verificar console do navegador (F12)**

   - Procure por "[QUALIFICACOES] Importação tipos bem-sucedida"
   - Verifique se refetchTipos() foi chamado

2. **Verificar Network**

   - POST `/api/importacao-v2/executar-json/qualificacoes_tipos` → 200 OK
   - GET `/api/qualificacoes/tipos?limit=200` → 200 OK com dados

3. **Verificar worker logs**

   - `wrangler tail` enquanto faz a importação
   - Procure por "[importacao-refactored]" no console

4. **Verificar banco**
   - Execute query acima para confirmar INSERT bem-sucedido

## ✅ Validação Final

- ✅ Build compila sem erros
- ✅ Nomes de colunas corretos (validade_meses)
- ✅ INSERT e UPDATE sincronizados
- ✅ Soft delete suportado
- ✅ Refetch após importação funciona
- ✅ Dados aparecem na tela

---

**Última atualização**: 25 de Novembro de 2025
