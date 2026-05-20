# ✅ Adição de Coluna: Código ANAC

**Data:** 27 de Novembro de 2025  
**Deploy:** Version 952c300d-3336-4905-95b1-51d6fc3ba2c9  
**Status:** ✅ IMPLEMENTADO

---

## 📋 Alteração Implementada

Adicionada coluna **"Código ANAC"** na tabela de histórico de qualificações, exibindo o código ANAC do funcionário para cada registro.

---

## 🎯 Localização

**Página:** Qualificações e Certificações → Aba "Histórico Completo"

**Posição:** Entre as colunas "Funcionário" e "Tipo"

**Ordem das Colunas:**

1. Ações
2. Funcionário (com matrícula abaixo)
3. **Código ANAC** ← NOVO
4. Tipo (com código abaixo)
5. Status
6. Vencimento (com validade abaixo)
7. Realização

---

## 🔧 Implementação Técnica

### 1. Backend - Query SQL

Adicionado campo `f.codigo_anac as funcionario_codigo_anac` nas queries:

**Arquivo:** `worker-airtrust/src/routes/qualificacoes-historico.ts`

#### GET /api/qualificacoes/historico (lista)

```sql
SELECT
  qh.id,
  qh.funcionario_cpf,
  f.nome as funcionario_nome,
  f.matricula as funcionario_matricula,
  f.codigo_anac as funcionario_codigo_anac,  -- ← ADICIONADO
  qh.qualificacao_codigo,
  qt.nome as qualificacao_nome,
  qt.categoria,
  qt.validade as validade_meses,
  ...
FROM qualificacoes_historico qh
INNER JOIN funcionarios f ON qh.funcionario_cpf = f.cpf
INNER JOIN qualificacoes_tipos qt ON qh.qualificacao_codigo = qt.codigo
```

#### GET /api/qualificacoes/historico/:id (detalhes)

```sql
SELECT
  qh.*,
  f.nome as funcionario_nome,
  f.matricula as funcionario_matricula,
  f.codigo_anac as funcionario_codigo_anac,  -- ← ADICIONADO
  qt.nome as qualificacao_nome,
  ...
FROM qualificacoes_historico qh
```

### 2. Frontend - Type Interface

**Arquivo:** `src/react-app/hooks/useQualificacoesHistorico.ts`

```typescript
export interface QualificacaoHistoricoItem {
  id: number;
  funcionario_id: number;
  tipo_id: number;
  data_realizacao: string;
  data_vencimento: string;
  funcionario_nome?: string;
  funcionario_matricula?: string;
  funcionario_codigo_anac?: string;  // ← ADICIONADO
  tipo_nome?: string;
  tipo_codigo?: string;
  ...
}
```

### 3. Frontend - Tabela

**Arquivo:** `src/react-app/pages/QualificacoesHistorico.tsx`

#### Header

```tsx
<SortHeader coluna="funcionario_codigo_anac" label="Código ANAC" />
```

#### Body

```tsx
<td className="py-4 whitespace-nowrap">
  <div className="text-sm text-gray-900">{hab.funcionario_codigo_anac || '-'}</div>
</td>
```

**Funcionalidade de Ordenação:** ✅ Suporta ordenação (clique no header)

---

## 📊 Exemplo Visual

### Antes

| Funcionário          | Tipo                    | Status |
| -------------------- | ----------------------- | ------ |
| Flavio Alves Belmont | DGR (Artigos Perigosos) | VÁLIDO |
| <small>00001</small> | <small>D4</small>       |        |

### Depois

| Funcionário          | Código ANAC | Tipo                    | Status |
| -------------------- | ----------- | ----------------------- | ------ |
| Flavio Alves Belmont | 12345-X     | DGR (Artigos Perigosos) | VÁLIDO |
| <small>00001</small> |             | <small>D4</small>       |        |

**Nota:** Se o funcionário não tiver código ANAC cadastrado, exibe "-"

---

## 🧪 Validação

### Teste API

```bash
curl -s "https://airtrust-api-production.airtrust.workers.dev/api/qualificacoes/historico?limit=1" \
  -H "Authorization: Bearer $TOKEN" | jq ".data[0].funcionario_codigo_anac"
```

**Resultado:** ✅ Campo retornado corretamente (null ou string)

### Teste Manual

1. ✅ Acessar página Qualificações
2. ✅ Verificar aba "Histórico Completo"
3. ✅ Coluna "Código ANAC" visível
4. ✅ Valores corretos exibidos
5. ✅ Ordenação funciona (clique no header)
6. ✅ "-" exibido quando código ausente

---

## 📝 Arquivos Modificados

1. **worker-airtrust/src/routes/qualificacoes-historico.ts**

   - Linha ~46: Adicionado `f.codigo_anac as funcionario_codigo_anac` na query de lista
   - Linha ~134: Adicionado `f.codigo_anac as funcionario_codigo_anac` na query de detalhes

2. **src/react-app/hooks/useQualificacoesHistorico.ts**

   - Linha ~11: Adicionado `funcionario_codigo_anac?: string` na interface

3. **src/react-app/pages/QualificacoesHistorico.tsx**
   - Linha ~103: Adicionado header `<SortHeader coluna="funcionario_codigo_anac" label="Código ANAC"/>`
   - Linha ~103: Adicionado célula `<td>{hab.funcionario_codigo_anac || '-'}</td>`

---

## 🚀 Deploy

### Build

```bash
npm run build
# ✅ The task succeeded with no problems
```

### Deploy Production

```bash
npx wrangler deploy --env production
# ✅ Deployed airtrust-api-production
# Version ID: 952c300d-3336-4905-95b1-51d6fc3ba2c9
# URL: https://airtrust-api-production.airtrust.workers.dev
```

---

## 💡 Observações

### Funcionários sem Código ANAC

- Campo `codigo_anac` pode ser `NULL` na tabela `funcionarios`
- Frontend exibe "-" quando valor é null/undefined
- Não afeta funcionamento da tabela ou filtros

### Ordenação

- Ordenação alfabética funciona corretamente
- Valores null aparecem no início (ordenação ASC) ou fim (ordenação DESC)
- Segue padrão SQL/JavaScript de comparação de strings

### Performance

- JOIN já existia na query (não adiciona overhead)
- Campo adicional tem impacto mínimo (~5-10 bytes por registro)
- Indexação não necessária (campo não usado em WHERE)

---

## ✅ Checklist Final

- [x] Campo adicionado no backend (2 queries)
- [x] Interface TypeScript atualizada
- [x] Coluna adicionada na tabela
- [x] Header com ordenação funcional
- [x] Tratamento de valores null (exibe "-")
- [x] Build sem erros
- [x] Deploy para produção
- [x] Teste manual validado
- [x] Teste API validado
- [x] Documentação criada

---

**Status:** ✅ **COLUNA CÓDIGO ANAC IMPLEMENTADA E FUNCIONAL**

A tabela agora exibe o código ANAC do funcionário, facilitando a identificação e consulta rápida de informações regulatórias.
