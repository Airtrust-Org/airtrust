# ❌ CONFLITOS DE NOMES - TABELAS INEXISTENTES

## Tabelas referenciadas no código mas NÃO EXISTEM no banco:

### 1. **qualificacoes** → DEVE SER **qualificacoes_tipos** ✅ (JÁ CORRIGIDO)

- ✅ Banco tem: `qualificacoes_tipos`
- ❌ Código ainda usa: `qualificacoes` em alguns lugares

### 2. **certificacoesv3** / **certificacoes_v3**

- ❌ NÃO EXISTE no banco
- ✅ Banco tem: `certificados`
- Código usa: `certificacoesv3` em compliance.ts

### 3. **checks** / **exames** / **treinamentos**

- ❌ NÃO EXISTEM como tabelas separadas
- ✅ Devem ser consultados via `qualificacoes_historico` com filtro `tipo`

### 4. **fichas_manobras_executadas**

- ❌ NÃO EXISTE
- ✅ Banco tem: `fichas_manobras_historico`

### 5. **sessoes_simulador** / **simulador_sessoes**

- ❌ Conflito de nomes
- ✅ Banco tem: `sessoes`

### 6. **manobras_catalogo**

- ❌ NÃO EXISTE
- ✅ Banco tem: `manobras`

### 7. **pasta_virtual_arquivos**

- ❌ NÃO EXISTE
- ✅ Banco tem: `pasta_virtual`

### 8. **categorias_qualificacoes**

- ❌ NÃO EXISTE
- ✅ Banco tem: `qualificacoes_categorias`

## ✅ Tabelas CORRETAS no banco:

```
funcionarios
qualificacoes_tipos (catálogo)
qualificacoes_historico (registros)
qualificacoes_categorias
certificados
sessoes
fichas_sessao
fichas_manobras_historico
catalogo_treinamentos
manobras
aeronaves
empresas
usuarios
```

## 🔧 AÇÕES NECESSÁRIAS:

1. Buscar `certificacoesv3` e substituir por `certificados`
2. Buscar `FROM qualificacoes WHERE` e substituir por `FROM qualificacoes_tipos WHERE`
3. Buscar `fichas_manobras_executadas` e substituir por `fichas_manobras_historico`
4. Verificar queries de checks/exames/treinamentos (devem usar qualificacoes_historico)
