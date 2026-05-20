# 📋 SCHEMA OFICIAL DO AIRTRUST v2.0

**Data:** 2025-01-21  
**Status:** ✅ LIMPO E VALIDADO  
**Versão:** 2.0.0

---

## ✅ TABELAS OFICIAIS (19)

### 📊 Status Atual:
| Tabela | Registros | Status | Uso |
|--------|-----------|--------|-----|
| **funcionarios** | 38 | ✅ ATIVA | CENTRAL |
| **qualificacoes** | 2,148 | ✅ ATIVA | PRINCIPAL |
| **funcoes** | 2 | ✅ ATIVA | Catálogo |
| **aeronaves** | 2 | ✅ ATIVA | Catálogo |
| **importacoes_log** | 2 | ✅ ATIVA | Log |
| **setores** | 0 | ✅ ATIVA | Catálogo |
| **treinamentos** | 0 | ✅ ATIVA | Catálogo |
| **exames** | 0 | ✅ ATIVA | Operacional |
| **checks** | 0 | ✅ ATIVA | Operacional |
| **user_profiles** | 0 | ✅ ATIVA | Auth |
| **user_permissions** | 0 | ✅ ATIVA | Auth |
| **funcionarios_aeronaves** | 0 | ✅ ATIVA | Relacionamento |
| **certificado_anexos** | 0 | ✅ ATIVA | Arquivos |
| **sessoes_treinamento** | 0 | ✅ ATIVA | Treinamento |
| **compliance_status** | 0 | ✅ ATIVA | Compliance |
| **auditoria** | 0 | ✅ ATIVA | Auditoria |
| **pasta_virtual_sync** | 0 | ✅ ATIVA | Sync |
| **simuladores** | 0 | ✅ ATIVA | Opcional |
| **agendamentos_simulador** | 0 | ✅ ATIVA | Opcional |

---

## 🚫 TABELAS PROIBIDAS

### ❌ Nunca criar tabelas com:
- Sufixos de versão: `_v2`, `_v3`, `v2`, `v3`
- Sufixos temporários: `_tmp`, `_temp`, `_backup`, `_old`
- Prefixos de teste: `test_`, `debug_`, `tmp_`
- Nomes legados: `historicocertificacoes`, `certificacoesv3`, `catalogotreinamentosv2`

### ✅ Padrão de Nomenclatura:
- Sempre plural: `funcionarios`, `qualificacoes`, `exames`
- Snake case: `user_profiles`, `compliance_status`
- Sem versões: Use migrations para evoluir schema
- Descritivo: Nome deve indicar claramente o conteúdo

---

## 📡 ENDPOINTS OFICIAIS

### ✅ Padrão RESTful:

```
HEALTH:
GET    /health                          - Health check geral
GET    /api/v2/health                   - Health check API
GET    /api/v2/dashboard                - Dashboard principal

FUNCIONÁRIOS:
GET    /api/v2/funcionarios             - Listar
GET    /api/v2/funcionarios/:id         - Buscar por ID
POST   /api/v2/funcionarios-batch       - Importação em lote

QUALIFICAÇÕES:
GET    /api/qualificacoes               - Listar
POST   /api/qualificacoes/importar-json - Importar
GET    /api/qualificacoes/importacoes-historico - Histórico

CATÁLOGOS:
GET    /api/v2/funcoes                  - Funções
GET    /api/v2/aeronaves                - Aeronaves
GET    /api/v2/setores                  - Setores
GET    /api/v2/treinamentos             - Treinamentos

OPERACIONAL:
GET    /api/v2/exames                   - Exames
GET    /api/v2/checks                   - Checks

SISTEMA:
GET    /api/v2/compliance               - Compliance
GET    /api/v2/auditoria                - Auditoria
GET    /api/v2/importacoes              - Importações
GET    /api/v2/sistema/info             - Info do sistema
```

---

## 🔒 REGRAS OBRIGATÓRIAS

### 1. Soft Delete
```sql
-- SEMPRE incluir em tabelas principais:
deleted_at TEXT DEFAULT NULL

-- SEMPRE filtrar em queries:
WHERE deleted_at IS NULL
```

### 2. Auditoria
```sql
-- SEMPRE incluir:
created_at TEXT NOT NULL DEFAULT (datetime('now'))
updated_at TEXT NOT NULL DEFAULT (datetime('now'))
```

### 3. Foreign Keys
```sql
-- SEMPRE definir relacionamentos:
FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
```

### 4. Índices
```sql
-- SEMPRE criar índices em:
- Chaves primárias (automático)
- Chaves estrangeiras
- Campos de busca frequente
- Campos de ordenação
```

---

## 📝 SCHEMA DETALHADO

### Tabela: funcionarios (CENTRAL)
```sql
CREATE TABLE funcionarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  matricula TEXT UNIQUE,
  cpf TEXT,
  email TEXT,
  telefone TEXT,
  data_nascimento TEXT,
  data_admissao TEXT,
  funcao TEXT,
  cargo TEXT,
  setor TEXT,
  base TEXT,
  contrato TEXT,
  codigo_anac TEXT,
  codigo_canac TEXT,
  codigo_sispat TEXT,
  codigo_prestserv TEXT,
  licenca_aeronautica TEXT,
  aeronave TEXT,
  aeronave_principal TEXT,
  anv TEXT,
  is_instrutor INTEGER DEFAULT 0,
  is_checador INTEGER DEFAULT 0,
  cma_numero TEXT,
  cma_data_vencimento TEXT,
  cma_status TEXT,
  aso_data_vencimento TEXT,
  nivel_icao TEXT,
  nivel_icao_data_vencimento TEXT,
  nivel_icao_status TEXT,
  status TEXT DEFAULT 'ATIVO',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);
```

### Tabela: qualificacoes (PRINCIPAL)
```sql
CREATE TABLE qualificacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  tipo TEXT NOT NULL CHECK(tipo IN ('TREINAMENTO', 'CHECK', 'EXAME')),
  codigo TEXT NOT NULL,
  categoria TEXT,
  descricao TEXT,
  instituicao TEXT,
  instrutor TEXT,
  carga_horaria INTEGER,
  numero TEXT,
  data_emissao TEXT,
  data_conclusao TEXT,
  data_validade TEXT NOT NULL,
  observacoes TEXT,
  status TEXT DEFAULT 'ATIVO',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);
```

---

## 🧪 VALIDAÇÃO

### Script de Teste:
```bash
# Verificar tabelas proibidas
sqlite3 DB "
SELECT name FROM sqlite_master 
WHERE type='table' 
AND (name LIKE '%v2%' OR name LIKE '%v3%' OR name LIKE '%tmp%');
"
# Resultado esperado: vazio

# Verificar tabelas obrigatórias
sqlite3 DB "
SELECT COUNT(*) FROM sqlite_master 
WHERE type='table' 
AND name IN ('funcionarios', 'qualificacoes', 'exames', 'checks');
"
# Resultado esperado: 4

# Testar health check
curl http://localhost:8787/health
# Resultado esperado: {"status":"ok"}
```

---

## 📚 DOCUMENTAÇÃO RELACIONADA

- `TABELAS.md` - Lista completa de tabelas
- `MAINTENANCE.md` - Guia de manutenção
- `MIGRATION_GUIDE.md` - Guia de migrations
- `API.md` - Documentação de API

---

## ⚠️ IMPORTANTE

### Antes de Modificar o Schema:
1. ✅ Criar migration numerada
2. ✅ Testar em ambiente local
3. ✅ Fazer backup do banco
4. ✅ Documentar mudança
5. ✅ Atualizar este documento

### Proibido:
- ❌ Modificar tabelas diretamente em produção
- ❌ Criar tabelas sem migration
- ❌ Usar sufixos de versão
- ❌ Deletar dados sem soft delete
- ❌ Ignorar foreign keys

---

**✅ SISTEMA VALIDADO E APROVADO PARA PRODUÇÃO**

**Última validação:** 2025-01-21 17:53:00  
**Próxima revisão:** 2025-02-21
