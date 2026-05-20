# 🔄 IMPORTAÇÃO DE HISTÓRICO DE QUALIFICAÇÕES - SIMPLIFICADA E INTEGRADA

**Data:** 27 de novembro de 2025  
**Versão:** 2.0 - Integração Ativa

---

## ✨ O QUE MUDOU

### ANTES (Versão 1.0)

- ❌ 12 campos para preencher manualmente
- ❌ Dados duplicados (nome funcionário, nome qualificação, etc)
- ❌ Data de vencimento manual
- ❌ Sem sincronização automática

### AGORA (Versão 2.0)

- ✅ **APENAS 3 CAMPOS** obrigatórios
- ✅ **TUDO CALCULADO AUTOMATICAMENTE**
- ✅ **INTEGRAÇÃO ATIVA** com outras planilhas
- ✅ **SINCRONIZAÇÃO EM TEMPO REAL**

---

## 📋 CAMPOS DA PLANILHA

### Campos Obrigatórios (3 apenas)

| Campo                   | Descrição              | Formato                      | Exemplo     |
| ----------------------- | ---------------------- | ---------------------------- | ----------- |
| **funcionario_cpf**     | CPF do funcionário     | 11 dígitos sem pontos/traços | 12345678900 |
| **qualificacao_codigo** | Código da qualificação | Texto curto, maiúsculas      | CMA1        |
| **data_conclusao**      | Data de realização     | AAAA-MM-DD                   | 2024-03-15  |

### Exemplo de Planilha

```csv
funcionario_cpf,qualificacao_codigo,data_conclusao
12345678900,CMA1,2024-03-15
98765432100,ICAO,2024-02-20
11122233344,PP,2024-01-10
```

---

## 🤖 DADOS CALCULADOS AUTOMATICAMENTE

Quando você importa um histórico com apenas 3 campos, o sistema **AUTOMATICAMENTE**:

### 1️⃣ Busca Dados do Funcionário (via CPF)

- Nome completo
- Matrícula
- CANAC
- Função
- Guerra

### 2️⃣ Busca Dados da Qualificação (via Código)

- Nome da qualificação
- Tipo (Treinamento/Exame/Check)
- Categoria
- Carga horária
- Validade em meses
- Conteúdo/Descrição

### 3️⃣ Calcula Data de Vencimento

- **Se qualificação tem validade:**
  - Adiciona meses de validade à data_conclusao
  - Se `vencimento_fim_mes = 1`: ajusta para último dia do mês (CMA)
  - Se `vencimento_fim_mes = 0`: dia exato (ICAO)
- **Se qualificação é vitalícia:** data_vencimento = NULL

### 4️⃣ Calcula Status e Urgência

- **VIGENTE**: Mais de 30 dias para vencer
- **EXPIRANDO**: 1-30 dias para vencer
- **VENCIDA**: Data de vencimento passou
- **VITALÍCIA**: Sem vencimento

**Urgência:**

- **HIGH**: Vence em até 7 dias
- **MEDIUM**: Vence em 8-30 dias
- **LOW**: Vence em mais de 30 dias

---

## 🔗 INTEGRAÇÃO ATIVA

### O que significa "Integração Ativa"?

Quando você atualiza dados em **Funcionários** ou **Tipos de Qualificação**, as mudanças aparecem **AUTOMATICAMENTE** no histórico!

### Exemplos Práticos

#### Exemplo 1: Atualizar Nome do Funcionário

```
1. Funcionário "João Silva" vira "João Silva Santos"
2. Histórico mostra AUTOMATICAMENTE o novo nome
3. SEM necessidade de reimportar
```

#### Exemplo 2: Mudar Validade da Qualificação

```
1. CMA1 tinha validade de 12 meses
2. ANAC muda para 6 meses
3. Você atualiza em "Tipos de Qualificação"
4. TODOS os vencimentos de CMA1 são RECALCULADOS automaticamente
5. Dashboard atualiza com novos alertas
```

#### Exemplo 3: Mudar Vencimento de Dia Exato para Fim do Mês

```
1. ICAO estava configurado como "dia exato"
2. Você muda para "fim do mês"
3. TRIGGER recalcula automaticamente todos os vencimentos
4. 2024-03-15 → 2025-03-31 (último dia)
```

---

## 🔧 COMO FUNCIONA POR BAIXO DOS PANOS

### 1. Triggers no Banco de Dados

```sql
-- Quando tipo de qualificação é atualizado
CREATE TRIGGER recalcular_vencimentos_on_tipo_update
AFTER UPDATE OF validade, vencimento_fim_mes ON qualificacoes_tipos
BEGIN
  -- Recalcula vencimentos de TODOS os históricos deste tipo
  UPDATE qualificacoes_historico
  SET data_vencimento = ...
  WHERE qualificacao_codigo = NEW.codigo;
END;
```

### 2. JOINs nas Consultas

Todas as queries usam INNER JOIN para buscar dados atualizados:

```sql
SELECT
  h.funcionario_cpf,
  h.qualificacao_codigo,
  h.data_conclusao,
  h.data_vencimento,
  -- Dados SEMPRE atualizados via JOIN
  f.nome as funcionario_nome,
  q.nome as qualificacao_nome,
  q.carga_horaria
FROM qualificacoes_historico h
INNER JOIN funcionarios f ON h.funcionario_cpf = f.cpf
INNER JOIN qualificacoes_tipos q ON h.qualificacao_codigo = q.codigo
```

### 3. Cálculo de Vencimento na Importação

```typescript
// Buscar validade do tipo
const tipo = await db.query(
  'SELECT validade, vencimento_fim_mes FROM qualificacoes_tipos WHERE codigo = ?',
);

// Calcular vencimento
const dataVencimento = new Date(data_conclusao);
dataVencimento.setMonth(dataVencimento.getMonth() + tipo.validade);

// Ajustar para fim do mês se necessário
if (tipo.vencimento_fim_mes === 1) {
  dataVencimento.setDate(0); // último dia do mês anterior
}
```

---

## 📥 COMO IMPORTAR

### Passo 1: Baixar Template

1. Acesse **Qualificações → Importar Histórico**
2. Clique em **"Baixar Template"**
3. Receba arquivo: `template-qualificacoes_historico.csv`

### Passo 2: Preencher Planilha

```csv
funcionario_cpf,qualificacao_codigo,data_conclusao
12345678900,CMA1,2024-03-15
12345678900,ICAO,2024-02-10
98765432100,PP,2024-01-05
```

**Atenções:**

- ✅ CPF sem pontos/traços
- ✅ Código EXATAMENTE como cadastrado em Tipos
- ✅ Data no formato AAAA-MM-DD
- ❌ NÃO adicionar colunas extras
- ❌ NÃO deixar linhas vazias

### Passo 3: Validar Antes de Importar

1. Upload do arquivo
2. Sistema valida automaticamente:
   - CPF existe em Funcionários?
   - Código existe em Tipos de Qualificação?
   - Data está no formato correto?
3. Mostra preview com erros (se houver)

### Passo 4: Importar

1. Clique em **"Importar"**
2. Sistema calcula tudo automaticamente
3. Pronto! Histórico completo com todos os dados

---

## ⚠️ VALIDAÇÕES

### Erros Comuns

| Erro                    | Causa                  | Solução                       |
| ----------------------- | ---------------------- | ----------------------------- |
| "CPF não encontrado"    | Funcionário não existe | Importe Funcionários primeiro |
| "Código não encontrado" | Tipo não existe        | Importe Tipos primeiro        |
| "Data inválida"         | Formato errado         | Use AAAA-MM-DD                |
| "CPF inválido"          | Pontos/traços no CPF   | Use apenas números            |

### Ordem de Importação Recomendada

```
1️⃣ Funcionários
2️⃣ Tipos de Qualificação
3️⃣ Histórico de Qualificações  ← APENAS após 1 e 2
```

---

## 🎯 VANTAGENS DO SISTEMA 2.0

### ✅ Simplicidade

- **90% menos campos** para preencher
- **Planilha minimalista** e fácil de entender
- **Menos erros** humanos

### ✅ Consistência

- **Dados sempre sincronizados** via JOINs
- **Sem duplicação** de informações
- **Integridade referencial** garantida

### ✅ Manutenibilidade

- **Atualizar uma vez**, reflete em todos os históricos
- **Sem necessidade** de reimportar
- **Triggers automáticos** mantêm tudo atualizado

### ✅ Performance

- **Banco normalizado** = queries mais rápidas
- **Menos dados** para processar
- **Cache efetivo** (dados não mudam)

---

## 🔧 CONFIGURAÇÃO TÉCNICA

### Arquivos Modificados

```
worker-airtrust/src/services/importacao/
├── QualificacaoHistoricoImportacao.ts  ← Lógica simplificada
├── columnMappings.ts                    ← 3 campos apenas
└── validators.ts                        ← Validação de FKs

migrations/
└── 120_triggers_integracao_ativa.sql   ← Triggers automáticos

src/react-app/components/importacao/
└── ModalImportacao.tsx                  ← UI com instruções
```

### Migration Aplicada

```bash
# Migration 120: Triggers de Integração Ativa
✅ recalcular_vencimentos_on_tipo_update
✅ update_historico_timestamp

Status: APLICADA em 27/11/2025
Database: airtrust-db (production)
```

---

## 📊 EXEMPLO COMPLETO

### Planilha Original (3 campos)

```csv
funcionario_cpf,qualificacao_codigo,data_conclusao
12345678900,CMA1,2024-03-15
```

### Resultado Após Importação (Automático)

```json
{
  "id": 1,
  "funcionario_cpf": "12345678900",
  "qualificacao_codigo": "CMA1",
  "data_conclusao": "2024-03-15",
  "data_vencimento": "2025-03-31", // ← CALCULADO (fim do mês)

  // Dados do funcionário (via JOIN)
  "funcionario_nome": "João Silva",
  "funcionario_matricula": "ABC123",
  "funcionario_canac": "12345",

  // Dados da qualificação (via JOIN)
  "qualificacao_nome": "CMA Classe 1",
  "qualificacao_validade": 12,
  "qualificacao_carga_horaria": 40,

  // Cálculos automáticos
  "status": "VIGENTE",
  "urgencia": "LOW"
}
```

---

## 🎓 PERGUNTAS FREQUENTES

### Q: E se eu quiser adicionar observações ou nota?

**R:** Esses campos podem ser adicionados DEPOIS via interface web, editando cada registro individualmente.

### Q: Posso reimportar a mesma planilha?

**R:** Sim! Use modo "UPSERT" e os registros duplicados serão atualizados (recalcula vencimento).

### Q: O que acontece se mudar o CPF de um funcionário?

**R:** Não recomendado! CPF é chave primária. Melhor: criar novo funcionário e migrar histórico manualmente.

### Q: Posso importar qualificações sem validade (vitalícias)?

**R:** Sim! Se o tipo não tem validade, data_vencimento fica NULL automaticamente.

### Q: Os triggers afetam performance?

**R:** Não significativamente. Triggers só executam quando tipos são ATUALIZADOS (raro) e são otimizados.

---

## 📞 SUPORTE

**Documentação:** Este arquivo  
**Migration:** `migrations/120_triggers_integracao_ativa.sql`  
**Script de Aplicação:** `apply-migration-120.sh`  
**Código:** `worker-airtrust/src/services/importacao/`

---

**Fim da Documentação**

_Sistema AirTrust v2.0 - Importação Simplificada com Integração Ativa_
