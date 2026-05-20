# 🚀 APLICAR MIGRAÇÃO 0030 EM PRODUÇÃO

## ⚠️ IMPORTANTE

Esta migração cria VIEWS de compatibilidade. Não altera dados, apenas adiciona camadas de mapeamento.

---

## 📋 PASSOS

### 1. Acessar Dashboard Cloudflare

1. Abra: https://dash.cloudflare.com
2. Login com sua conta
3. Navegue: **Workers & Pages** → **D1 Databases**
4. Selecione: **airtrust-db**
5. Clique na aba: **Console**

### 2. Verificar Estado Atual

Cole e execute este SQL:

```sql
SELECT COUNT(*) as views_count
FROM sqlite_master
WHERE type='view' AND name IN ('sessoes_simulador', 'fichas_simulador');
```

**Resultado esperado**:

- Se retornar `0`: Continue para o passo 3
- Se retornar `2`: Migração já foi aplicada, PARE aqui

### 3. Criar VIEWS

Cole e execute (um por vez):

#### VIEW 1: sessoes_simulador

```sql
CREATE VIEW sessoes_simulador AS
SELECT
  id,
  simulador_id,
  funcionario_id AS aluno_id,
  instrutor_id,
  checador_id,
  data AS data_sessao,
  hora_inicio,
  hora_fim,
  duracao_minutos,
  status,
  tipo_sessao,
  observacoes,
  created_at,
  updated_at,
  deleted_at
FROM simulador_agendamentos;
```

#### VIEW 2: fichas_simulador

```sql
CREATE VIEW fichas_simulador AS
SELECT
  f.id,
  f.agendamento_slot_id AS sessao_id,
  f.colaborador_id_aluno AS funcionario_id,
  f.instrutor_id,
  a.data AS data_sessao,
  f.status,
  f.observacoes,
  f.created_at,
  f.updated_at,
  f.deleted_at
FROM fichas_sessao f
LEFT JOIN simulador_agendamentos a ON f.agendamento_slot_id = a.id;
```

### 4. Verificar Criação

Cole e execute:

```sql
SELECT name, type
FROM sqlite_master
WHERE type='view' AND name IN ('sessoes_simulador', 'fichas_simulador')
ORDER BY name;
```

**Resultado esperado**: 2 linhas

```
fichas_simulador | view
sessoes_simulador | view
```

### 5. Testar VIEWS

Cole e execute:

```sql
SELECT COUNT(*) as total_sessoes FROM sessoes_simulador;
SELECT COUNT(*) as total_fichas FROM fichas_simulador;
```

**Resultado esperado**: Números > 0 (igual às tabelas originais)

---

## ✅ CONFIRMAÇÃO

Se todos os passos acima funcionaram:

1. ✅ VIEWS criadas com sucesso
2. ✅ Dados acessíveis via VIEWS
3. ✅ Migração 0030 aplicada em PRODUÇÃO

---

## 🚀 PRÓXIMO PASSO

Depois de aplicar a migração em produção:

```bash
npm run deploy
```

Ou usar a task do VS Code:
**"Build, Commit & Deploy"**

---

## ⚠️ SE DER ERRO

**Erro comum**: "table sessoes_simulador already exists"

**Solução**: Views já existem, migração já foi aplicada anteriormente.

**Verificar**:

```sql
SELECT name FROM sqlite_master WHERE type='view';
```

---

## 📞 SUPORTE

Se tiver dúvidas ou erros:

1. Tire screenshot do erro no Dashboard
2. Verifique logs do Worker em produção
3. Compare com ambiente local (que está funcionando 100%)

---

**Tempo estimado**: 2-3 minutos  
**Risco**: Baixíssimo (apenas criação de VIEWS, sem alteração de dados)  
**Rollback**: Simples (DROP VIEW se necessário)
