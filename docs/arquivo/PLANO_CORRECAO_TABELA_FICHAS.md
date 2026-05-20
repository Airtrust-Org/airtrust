# 🚨 PLANO DE CORREÇÃO - TABELA FICHAS

**Data:** 6 de Novembro de 2025  
**Problema:** 39 referências à tabela `fichas` que NÃO EXISTE em produção

---

## 📊 SITUAÇÃO ATUAL

### Tabelas que EXISTEM:

- ✅ `agendamentos_simulador` - 13 registros (dados principais)
- ✅ `fichas_sessao` - 9 registros (assinaturas/avaliações)
- ✅ `fichas_assinaturas` - 1 registro (auditoria)
- ✅ `fichas_manobras_historico` - histórico

### Tabelas que NÃO EXISTEM:

- ❌ `fichas` - **NÃO EXISTE MAS TEM 39 REFERÊNCIAS NO CÓDIGO!**

---

## 🔍 ANÁLISE DE REFERÊNCIAS

```bash
❯ grep -r "FROM fichas\|INTO fichas\|UPDATE fichas" src/worker --include="*.ts" | wc -l
39
```

### Arquivos Afetados:

1. **simulador-fichas-crud.ts** (15+ referências)

   - INSERT INTO fichas
   - UPDATE fichas
   - SELECT FROM fichas
   - **Status:** ❌ CRÍTICO - CRUD completo quebrado

2. **cron-certificacao-automatica.ts** (2 referências)

   - UPDATE fichas
   - **Status:** ⚠️ Jobs noturnos podem quebrar

3. **cron-auditoria-semanal.ts** (3 referências)

   - UPDATE fichas
   - **Status:** ⚠️ Relatórios podem quebrar

4. **audit-reports.ts** (1 referência)
   - COUNT FROM fichas
   - **Status:** ⚠️ Dashboards podem quebrar

---

## 🎯 ESTRATÉGIAS DE CORREÇÃO

### Opção 1: Criar Tabela `fichas` (RECOMENDADO)

**Vantagens:**

- ✅ Menos mudanças no código (39 arquivos)
- ✅ Mantém arquitetura planejada
- ✅ Mais rápido de implementar

**Desvantagens:**

- ⚠️ Precisa migrar dados de agendamentos_simulador
- ⚠️ Duplicação de dados?

**Implementação:**

```sql
CREATE TABLE fichas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT UNIQUE NOT NULL,
  agendamento_id INTEGER,
  simulador_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  instrutor_id INTEGER,
  data_sessao DATE,
  hora_inicio TIME,
  hora_fim TIME,
  duracao_minutos INTEGER,
  status TEXT DEFAULT 'RASCUNHO',
  nota_final REAL,
  observacoes TEXT,
  assinatura_instrutor BOOLEAN DEFAULT 0,
  assinatura_instrutor_data TIMESTAMP,
  assinatura_instrutor_hash TEXT,
  assinatura_instrutor_protocolo TEXT,
  assinatura_instrutor_ip TEXT,
  assinatura_tripulante_data TIMESTAMP,
  assinatura_tripulante_hash TEXT,
  assinatura_tripulante_protocolo TEXT,
  assinatura_tripulante_ip TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  FOREIGN KEY (agendamento_id) REFERENCES agendamentos_simulador(id),
  FOREIGN KEY (simulador_id) REFERENCES simuladores(id),
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  FOREIGN KEY (instrutor_id) REFERENCES funcionarios(id)
);

-- Migrar dados existentes
INSERT INTO fichas (
  uuid, agendamento_id, simulador_id, funcionario_id,
  instrutor_id, data_sessao, status, created_at
)
SELECT
  uuid, id as agendamento_id, simulador_id, funcionario_id,
  instrutor_id, data_agendamento, status, created_at
FROM agendamentos_simulador
WHERE deleted_at IS NULL;
```

### Opção 2: Refatorar Código para Usar agendamentos_simulador

**Vantagens:**

- ✅ Usa tabela que já existe
- ✅ Sem duplicação de dados
- ✅ Mais simples arquiteturalmente

**Desvantagens:**

- ❌ 39 referências para mudar
- ❌ Risco de quebrar outros endpoints
- ❌ Mais demorado

### Opção 3: Criar VIEW `fichas`

**Vantagens:**

- ✅ Código continua funcionando
- ✅ Sem duplicação física
- ✅ Rápido de implementar

**Desvantagens:**

- ⚠️ VIEWs não suportam INSERT/UPDATE direto
- ⚠️ Teria que usar INSTEAD OF triggers (SQLite suporta?)

**Implementação:**

```sql
CREATE VIEW fichas AS
SELECT
  a.id,
  a.uuid,
  a.id as agendamento_id,
  a.simulador_id,
  a.funcionario_id,
  a.instrutor_id,
  a.data_agendamento as data_sessao,
  a.hora_inicio,
  a.hora_fim,
  a.duracao_minutos,
  a.status,
  a.observacoes,
  a.created_at,
  a.updated_at,
  a.deleted_at,
  fs.assinatura_instrutor,
  fs.assinatura_instrutor_data,
  fs.assinatura_tripulante_data
FROM agendamentos_simulador a
LEFT JOIN fichas_sessao fs ON a.uuid = fs.uuid
WHERE a.deleted_at IS NULL;
```

---

## 🚀 RECOMENDAÇÃO

**Implementar Opção 1: Criar Tabela `fichas`**

### Passos:

1. ✅ Criar migration com schema completo
2. ✅ Migrar dados de agendamentos_simulador
3. ✅ Testar INSERT/UPDATE/DELETE
4. ✅ Deploy para produção
5. ✅ Validar 39 referências funcionando

### Tempo Estimado: 30-45 minutos

### Riscos:

- ⚠️ BAIXO - tabela não existe, só criar
- ⚠️ Dados migrados podem ter inconsistências
- ⚠️ Precisa ajustar relacionamentos

---

## ❓ PRÓXIMA AÇÃO

**Aguardando decisão:**

- [ ] Opção 1: Criar tabela fichas (RECOMENDADO)
- [ ] Opção 2: Refatorar código (39 arquivos)
- [ ] Opção 3: Criar VIEW fichas

**Após decisão, executar:**

1. Implementar solução escolhida
2. Testar TODOS os 39 pontos
3. Criar relatório HONESTO de validação
4. Deploy para produção
