# 🔍 AUDITORIA COMPLETA AIRTRUST - ROTEIRO EXECUTIVO

**Data**: 18/11/2025  
**Responsável**: GitHub Copilot  
**Status**: EM EXECUÇÃO

---

## 📊 MAPEAMENTO CONCEITUAL

### ⚠️ IMPORTANTE: Nomenclatura do Sistema

O prompt de auditoria usa nomenclatura genérica, mas o AirTrust usa nomes específicos:

| Prompt (Genérico)       | AirTrust (Real)           | Observação                  |
| ----------------------- | ------------------------- | --------------------------- |
| `pessoas`               | `funcionarios`            | Tabela principal de pessoas |
| `tipos_qualificacao`    | `qualificacoes_tipos`     | Tipos de qualificações      |
| `qualificacoes`         | `qualificacoes_historico` | Histórico de qualificações  |
| `licencas`              | ❌ **NÃO EXISTE**         | Módulo não implementado     |
| `requisitos_compliance` | `compliance_status`       | Status de conformidade      |
| `auditoria_avancada_v2` | `auditoria`               | Tabela de auditoria         |

### ✅ Tabelas Verificadas em Produção (D1)

Total de tabelas: **71**

**Principais para auditoria**:

- ✅ `funcionarios` - Cadastro de funcionários
- ✅ `qualificacoes_tipos` - Tipos de qualificações
- ✅ `qualificacoes_historico` - Histórico de qualificações
- ✅ `qualificacoes_categorias` - Categorias de qualificações
- ✅ `fichas_sessao` - Fichas de sessão (Ficha 360°)
- ✅ `compliance_status` - Status de compliance
- ✅ `auditoria` - Auditoria de operações
- ✅ `certificados` - Certificados de qualificações
- ❌ `licencas` - **NÃO EXISTE** (módulo não implementado)
- ❌ `requisitos_compliance` - **NÃO EXISTE** (usa compliance_status)

---

## 1. ✅ AUDITORIA D1 – ESTRUTURA DO BANCO

### 1.1. Tabelas Obrigatórias

| Tabela (Esperada)     | Status | Tabela (Real)           | Observação                 |
| --------------------- | ------ | ----------------------- | -------------------------- |
| pessoas               | ❌     | funcionarios            | Nome diferente, mas existe |
| tipos_qualificacao    | ❌     | qualificacoes_tipos     | Nome diferente, mas existe |
| qualificacoes         | ❌     | qualificacoes_historico | Nome diferente, mas existe |
| licencas              | ❌     | -                       | **NÃO IMPLEMENTADO**       |
| requisitos_compliance | ❌     | compliance_status       | Nome diferente, mas existe |
| auditoria_avancada_v2 | ❌     | auditoria               | Nome diferente, mas existe |

**Resultado**: ⚠️ **PARCIALMENTE CONFORME** - Nomenclatura diferente, mas funcionalidades existem (exceto Licenças)

### 1.2. Colunas de Auditoria

**Verificar em cada tabela**:

```sql
-- Esperado: created_at, updated_at, deleted_at
PRAGMA table_info('funcionarios');
PRAGMA table_info('qualificacoes_tipos');
PRAGMA table_info('qualificacoes_historico');
PRAGMA table_info('compliance_status');
```

**Status**: 🔄 PENDENTE - Executar queries

### 1.3. Índices Principais

**Índices esperados**:

- `idx_pessoas_matricula` → `idx_funcionarios_matricula`
- `idx_pessoas_status` → `idx_funcionarios_status`
- `idx_qualificacoes_funcionario` → `idx_qualificacoes_historico_funcionario`
- `idx_qualificacoes_vencimento` → `idx_qualificacoes_historico_vencimento`

**Comando**:

```sql
SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name IN ('funcionarios', 'qualificacoes_tipos', 'qualificacoes_historico');
```

**Status**: 🔄 PENDENTE - Executar queries

### 1.4. Soft Delete

**Verificar**:

```sql
-- Funcionários "apagados"
SELECT COUNT(*) AS apagados FROM funcionarios WHERE deleted_at IS NOT NULL;

-- Qualificações "apagadas"
SELECT COUNT(*) AS apagados FROM qualificacoes_historico WHERE deleted_at IS NOT NULL;
```

**Status**: 🔄 PENDENTE - Executar queries

---

## 2. ✅ AUDITORIA APIs – FUNCIONÁRIOS

### Endpoints Implementados

| Endpoint                | Método | Arquivo         | Status                        |
| ----------------------- | ------ | --------------- | ----------------------------- |
| `/api/funcionarios`     | GET    | funcionarios.ts | ✅ Implementado               |
| `/api/funcionarios/:id` | GET    | funcionarios.ts | ✅ Implementado               |
| `/api/funcionarios`     | POST   | funcionarios.ts | ✅ Implementado               |
| `/api/funcionarios/:id` | PUT    | funcionarios.ts | ✅ Implementado               |
| `/api/funcionarios/:id` | DELETE | funcionarios.ts | ✅ Implementado (soft delete) |

### Casos de Teste

#### ✅ Teste 1: Criar Funcionário

```bash
curl -X POST https://airtrust.airtrust.workers.dev/api/funcionarios \
  -H "Content-Type: application/json" \
  -d '{
    "matricula": "TEST001",
    "nome": "Teste Auditoria",
    "cpf": "12345678901",
    "email": "teste@airtrust.com",
    "telefone": "11999999999",
    "funcao_id": "piloto",
    "base": "São Paulo",
    "status": "ativo"
  }'
```

**Validações**:

- Status 201
- Retorna ID, nome_completo, matricula
- Soft delete: deleted_at IS NULL

**Status**: 🔄 PENDENTE - Executar teste

#### ✅ Teste 2: Matrícula Duplicada

```bash
# 1. Criar funcionário TEST002
# 2. Tentar criar outro com mesma matrícula
# Esperado: Status 400 + "Matrícula já cadastrada"
```

**Status**: 🔄 PENDENTE - Executar teste

#### ✅ Teste 3: CPF Duplicado

```bash
# Similar ao teste 2, mas com CPF
```

**Status**: 🔄 PENDENTE - Executar teste

#### ✅ Teste 4: Atualizar Funcionário

```bash
# 1. Criar funcionário
# 2. PUT alterando nome, email, função
# 3. GET verificar alterações
# 4. GET lista verificar reflete mudança
```

**Status**: 🔄 PENDENTE - Executar teste

#### ✅ Teste 5: Soft Delete

```bash
# 1. Criar funcionário
# 2. DELETE /api/funcionarios/:id
# 3. GET deve retornar 404
# 4. SELECT mostra deleted_at preenchido
```

**Status**: 🔄 PENDENTE - Executar teste

#### ✅ Teste 6: Auditoria

```sql
-- Após INSERT/UPDATE/DELETE, verificar:
SELECT * FROM auditoria
WHERE tabela = 'funcionarios'
  AND registro_id = '...'
  AND acao IN ('INSERT', 'UPDATE', 'DELETE');
```

**Status**: 🔄 PENDENTE - Executar teste

---

## 3. ✅ AUDITORIA APIs – QUALIFICAÇÕES

### Endpoints Implementados

| Endpoint                         | Método | Arquivo          | Status          |
| -------------------------------- | ------ | ---------------- | --------------- |
| `/api/tipos-qualificacao`        | POST   | qualificacoes.ts | ✅ Implementado |
| `/api/tipos-qualificacao`        | GET    | qualificacoes.ts | ✅ Implementado |
| `/api/qualificacoes`             | POST   | qualificacoes.ts | ✅ Implementado |
| `/api/qualificacoes/:id`         | PUT    | qualificacoes.ts | ✅ Implementado |
| `/api/qualificacoes/:id`         | DELETE | qualificacoes.ts | ✅ Implementado |
| `/api/qualificacoes/:id/renovar` | POST   | qualificacoes.ts | ✅ Implementado |
| `/api/dashboard/qualificacoes`   | GET    | dashboard.ts     | ✅ Implementado |

### Casos de Teste

#### ✅ Teste 1: Criar Tipo de Qualificação

```bash
# POST /api/tipos-qualificacao
# - Sem duplicar código
# - Sem duplicar nome+categoria
```

**Status**: 🔄 PENDENTE - Executar teste

#### ✅ Teste 2: Criar Qualificação com Vencimento Correto

```bash
# 1. Criar tipo com validade 12 meses
# 2. Criar qualificação com data_realizacao '2025-01-01'
# 3. Verificar data_vencimento = '2026-01-01'
```

**Status**: 🔄 PENDENTE - Executar teste

#### ✅ Teste 3: Editar Qualificação - Recalcular Vencimento

```bash
# 1. Criar qualificação
# 2. PUT alterando data_realizacao
# 3. Verificar data_vencimento recalculada
```

**Status**: 🔄 PENDENTE - Executar teste

#### ✅ Teste 4: Renovar Qualificação

```bash
# POST /api/qualificacoes/:id/renovar
# - Nova data_realizacao
# - Verificar data_vencimento atualizada
```

**Status**: 🔄 PENDENTE - Executar teste

#### ✅ Teste 5: Dashboard de Qualificações

```bash
# GET /api/dashboard/qualificacoes
# Validar: total_ativas, vencidas, a_vencer_30_dias, validas
```

**Status**: 🔄 PENDENTE - Executar teste

#### ✅ Teste 6: Auditoria de Qualificações

```sql
SELECT * FROM auditoria
WHERE tabela = 'qualificacoes_historico'
  AND acao IN ('INSERT', 'UPDATE', 'DELETE');
```

**Status**: 🔄 PENDENTE - Executar teste

---

## 4. ❌ AUDITORIA APIs – LICENÇAS

**Status**: ❌ **MÓDULO NÃO IMPLEMENTADO**

O sistema AirTrust **não possui módulo de Licenças**. Este módulo não foi implementado.

**Ações**:

- [ ] Decidir se implementar ou remover do roteiro de auditoria
- [ ] Atualizar documentação

---

## 5. ✅ AUDITORIA APIs – FICHA 360°, COMPLIANCE E ALERTAS

### Endpoints Implementados

| Endpoint                           | Método | Arquivo       | Status          |
| ---------------------------------- | ------ | ------------- | --------------- |
| `/api/funcionarios/:id/ficha-360`  | GET    | ficha360.ts   | ✅ Implementado |
| `/api/funcionarios/:id/compliance` | GET    | compliance.ts | ✅ Implementado |
| `/api/compliance/funcionarios`     | GET    | compliance.ts | ✅ Implementado |
| `/api/alertas/vencimentos`         | GET    | alertas.ts    | ✅ Implementado |

### Casos de Teste

#### ✅ Teste 1: Ficha 360° - Todos os Blocos

```bash
# GET /api/funcionarios/:id/ficha-360
# Verificar retorno: funcionario, qualificacoes, licencas, requisitos
```

**Status**: 🔄 PENDENTE - Executar teste

#### ✅ Teste 2: Calcular Status de Compliance

```bash
# Cenário 1: Sem qualificações obrigatórias → 'nao_conforme'
# Cenário 2: Tudo em dia → 'conforme'
# Cenário 3: Algo vence em <=60 dias → 'em_risco'
```

**Status**: 🔄 PENDENTE - Executar teste

#### ✅ Teste 3: Listar Compliance de Todos

```bash
# GET /api/compliance/funcionarios
# Verificar status coerente com dados
```

**Status**: 🔄 PENDENTE - Executar teste

#### ✅ Teste 4: Alertas de Vencimento

```bash
# GET /api/alertas/vencimentos?dias=60
# Criar qualificações com vencimento em 10, 70 e -5 dias
# Só aparecer as de <=60 dias
```

**Status**: 🔄 PENDENTE - Executar teste

---

## 6. ✅ AUDITORIA DE UI – FUNCIONÁRIOS

### Layout da Tabela

**Verificações**:

- [ ] Sem avatar/ícone com iniciais ao lado do nome
- [ ] Coluna MATRÍCULA com mesma fonte/peso das outras
- [ ] Botão "Configurar colunas" na mesma linha do campo de busca
- [ ] Email é link `<a href="mailto:...">`
- [ ] Telefone é link `<a href="https://wa.me/...">`
- [ ] Coluna "AÇÕES" com header e ícones centralizados
- [ ] Ícone de Pasta Virtual existe em cada linha

**URL**: https://production.airtrust.pages.dev/funcionarios

**Status**: 🔄 PENDENTE - Teste manual/E2E

### Modal de Funcionário

**Verificações**:

- [ ] Abrir modal "Novo Funcionário"
- [ ] Preencher todos os campos obrigatórios
- [ ] Salvar e verificar linha aparece na tabela
- [ ] Editar, alterar dados, salvar
- [ ] Tabela reflete mudanças sem F5

**Status**: 🔄 PENDENTE - Teste manual/E2E

---

## 7. ✅ AUDITORIA DE UI – QUALIFICAÇÕES

### Modal "Nova Qualificação"

**Fluxo**:

1. Abrir modal
2. Selecionar funcionário
3. Selecionar categoria
4. Dropdown de "Qualificação" filtrado pela categoria
5. Preencher data de realização
6. Observar data de vencimento calculada
7. Salvar e validar no banco/lista

**Status**: 🔄 PENDENTE - Teste manual/E2E

### Modal "Editar Qualificação"

**Verificações**:

- [ ] Idêntico ao de Nova
- [ ] Sem campos Código e Número de Certificado
- [ ] Layout e campos idênticos

**Status**: 🔄 PENDENTE - Teste manual/E2E

### Modal "Renovar Qualificação"

**Verificações**:

- [ ] Não aparece "Invalid Date"
- [ ] Botões Cancelar e Renovar na mesma linha
- [ ] Renovar recalcula vencimento corretamente

**Status**: 🔄 PENDENTE - Teste manual/E2E

### Modal de Certificados

**Verificações**:

- [ ] Botão "Pasta Virtual" presente e funcional
- [ ] Geração de certificado com nome padrão: `CERT-{MATRICULA}-{CODIGO}-{DATA}.pdf`

**Status**: 🔄 PENDENTE - Teste manual/E2E

### Dashboard de Qualificações

**Verificações**:

- [ ] Cards: Total, Vencidas, A vencer, Válidas
- [ ] Números consistentes com dados reais

**Status**: 🔄 PENDENTE - Teste manual/E2E

---

## 8. ❌ AUDITORIA DE UI – LICENÇAS

**Status**: ❌ **MÓDULO NÃO IMPLEMENTADO**

### Verificações (se implementado)

- [ ] Seção "Licenças Ativas" no modal de funcionário
- [ ] Tabela de licenças
- [ ] "+ Adicionar licença"
- [ ] Aba/tela "Licenças" com filtros

**Ação**: Decidir se implementar ou remover do roteiro

---

## 9. ✅ AUDITORIA DE UI – FICHA 360°

### Visão 360°

**URL**: https://production.airtrust.pages.dev/funcionarios/:id/ficha

**Verificações**:

- [ ] Cabeçalho: nome, matrícula, função, base
- [ ] Badge: Conforme/Em risco/Não conforme
- [ ] Abas: Resumo, Qualificações, Licenças, Pasta Virtual, Auditoria

**Status**: 🔄 PENDENTE - Teste manual/E2E

### Aba Resumo

**Verificações**:

- [ ] Todos requisitos de compliance
- [ ] Status correto: OK / Em risco / Faltando
- [ ] Compatível com dados de qualificações/licenças

**Status**: 🔄 PENDENTE - Teste manual/E2E

### Abas Qualificações e Licenças

**Verificações**:

- [ ] Dados refletem exatamente a ficha 360°
- [ ] Contagens e datas conferem com SQL/APIs

**Status**: 🔄 PENDENTE - Teste manual/E2E

### Aba Pasta Virtual

**Verificações**:

- [ ] Atalho funcional para pasta do funcionário

**Status**: 🔄 PENDENTE - Teste manual/E2E

---

## 10. 📋 RESUMO DE SAÍDA ESPERADA

### Checklist de Execução

- [x] Mapear nomenclatura: prompt vs sistema real
- [x] Identificar tabelas existentes em D1
- [ ] Verificar colunas de auditoria em todas as tabelas
- [ ] Verificar índices de performance
- [ ] Testar endpoints de Funcionários (6 testes)
- [ ] Testar endpoints de Qualificações (6 testes)
- [ ] Testar endpoints de Ficha 360° e Compliance (4 testes)
- [ ] Testar UI de Funcionários (layout + modal)
- [ ] Testar UI de Qualificações (4 modais + dashboard)
- [ ] Testar UI de Ficha 360° (5 abas)
- [ ] Documentar falhas com prints
- [ ] Criar mini-prompts de correção

### Formato de Saída

Para cada item testado:

```markdown
### ✅/❌/⚠️ [NOME DO TESTE]

**Status**: OK / Falhou / Parcialmente OK

**Detalhes**:

- Esperado: ...
- Obtido: ...
- Evidência: [print/log]

**Ação Corretiva** (se falhou):

- Arquivo: ...
- Prompt de correção: "..."
```

---

## 📊 PROGRESSO ATUAL

**Total de Testes**: ~45  
**Executados**: 2  
**Pendentes**: 43  
**Progresso**: 4%

---

## 🚀 PRÓXIMOS PASSOS

1. ✅ Criar scripts SQL para verificar D1
2. ✅ Criar scripts bash para testar APIs
3. ⏳ Executar todos os testes de API
4. ⏳ Executar todos os testes de UI (manual ou E2E)
5. ⏳ Consolidar resultados
6. ⏳ Gerar relatório final com correções

---

**Última Atualização**: 18/11/2025 21:50
