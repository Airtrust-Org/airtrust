# Refatoração Completa do Sistema de Aeronaves

**Data:** 13 de Janeiro de 2026

## 🎯 Objetivo

Simplificar e padronizar o sistema de aeronaves, usando apenas "modelo" como referência única em todo o sistema.

## ✅ Alterações Realizadas

### 1. **Banco de Dados** ✅

#### Tabela `modelos_aeronave`

- ❌ **Removido:** coluna `codigo`
- ✏️ **Renomeado:** coluna `nome` → `modelo`
- 🔑 **Chave única:** `modelo` (ex: "AW139", "S76", "EC135")

#### Tabela `aeronaves`

- ❌ **Removido:** coluna `codigo`
- ❌ **Removido:** coluna `fabricante` (já está em modelos_aeronave)
- ✅ **Mantido:** coluna `modelo` (referência ao modelo)
- ✅ **Mantido:** `prefixo` (identificador único da aeronave física - ex: PT-ABC)

#### Tabela `modelos_sessao`

- ✏️ **Renomeado:** `codigo_aeronave` → `modelo_aeronave`

#### Migrations Criadas

- `0150_refactor_aeronaves_remove_codigo.sql` - Remove código, renomeia campos
- `0151_migrate_aeronave_references.sql` - Migra dados e referências existentes

---

### 2. **API Backend** ✅

#### Rotas Atualizadas

- **`/api/modelos-aeronave`**
  - Campos: `modelo`, `fabricante`, `tipo`, `categoria`, `descricao`
  - Validação: `modelo` é obrigatório e único
- **`/api/aeronaves`**
  - Campos: `modelo`, `prefixo`, `ano_fabricacao`, `status`, `observacoes`
  - Removido: `codigo`, `fabricante`

#### Schemas Zod Atualizados

- `simuladorCreateSchema`: `codigo_aeronave` → `modelo_aeronave`
- `modeloSessaoCreateSchema`: `codigo_aeronave` → `modelo_aeronave`

#### Arquivos Modificados

- ✅ `worker-airtrust/src/routes/modelos-aeronave.ts`
- ✅ `worker-airtrust/src/routes/aeronaves.ts`
- ✅ `worker-airtrust/src/routes/simuladores.ts` (32 substituições)
- ✅ `worker-airtrust/src/schemas/index.ts`

---

### 3. **Frontend React** ✅

#### Componentes Atualizados

- **`Cadastros.tsx`**
  - Tabela Modelos: removida coluna "Código", "Nome" → "Modelo"
  - Tabela Aeronaves: removidas colunas "Código" e "Fabricante"
  - Modal Modelos: campo `modelo` (único e obrigatório)
  - Modal Aeronaves: campos `modelo`, `prefixo`, `ano_fabricacao`, `status`

---

### 4. **Estrutura de Dados** 📊

#### Antes:

```
modelos_aeronave
├── codigo (ex: "AW139")  ❌ REMOVIDO
├── nome (ex: "AgustaWestland AW139")  ❌ RENOMEADO
└── fabricante (ex: "Leonardo")

aeronaves
├── codigo (ex: "AW139")  ❌ REMOVIDO
├── modelo (ex: "AW139")
├── fabricante (ex: "Leonardo")  ❌ REMOVIDO
└── prefixo (ex: "PT-ABC")
```

#### Depois:

```
modelos_aeronave
├── modelo (ex: "AW139")  ✅ ÚNICO E OBRIGATÓRIO
├── fabricante (ex: "Leonardo")
├── tipo (ex: "Helicóptero")
└── categoria (ex: "Executivo")

aeronaves
├── modelo (ex: "AW139")  → FK para modelos_aeronave.modelo
├── prefixo (ex: "PT-ABC")  ✅ ÚNICO
├── ano_fabricacao
└── status
```

---

### 5. **Relações no Sistema** 🔗

Todas as referências a aeronaves agora usam **`modelo`**:

- **Funcionários:** `modelo_aeronave_id` → FK para `modelos_aeronave.id`
- **Modelos de Sessão:** `modelo_aeronave` → nome do modelo (ex: "AW139")
- **Manobras:** `tipo_aeronave` → nome do modelo
- **Qualificações:** `modelo_aeronave_id` → FK para `modelos_aeronave.id`
- **Simuladores:** `modelo_aeronave` → nome do modelo

---

### 6. **Dados de Exemplo** 📝

Modelos populados automaticamente:

```sql
AW139        → Leonardo (AgustaWestland)  → Helicóptero Executivo
S76          → Sikorsky                    → Helicóptero Comercial
EC135        → Airbus Helicopters          → Helicóptero Executivo
Bell 407     → Bell Helicopter             → Helicóptero Executivo
A320         → Airbus                      → Jato Comercial
B737         → Boeing                      → Jato Comercial
E195         → Embraer                     → Jato Comercial
ATR72        → ATR Aircraft                → Turboélice Comercial
```

---

## 🚀 Como Usar

### Cadastrar Modelo de Aeronave

1. Acesse **Configurações → Cadastros → Modelos**
2. Clique em **"+ Novo Modelo"**
3. Preencha:
   - **Modelo:** (ex: "AW139") - obrigatório e único
   - **Fabricante:** (ex: "Leonardo")
   - **Tipo:** (ex: "Helicóptero")
   - **Categoria:** (ex: "Executivo")

### Cadastrar Aeronave Física

1. Acesse **Configurações → Cadastros → Aeronaves**
2. Clique em **"+ Nova Aeronave"**
3. Preencha:
   - **Modelo:** (ex: "AW139") - deve existir em Modelos
   - **Prefixo:** (ex: "PT-ABC") - identificação única
   - **Ano de Fabricação:** (opcional)
   - **Status:** ATIVO, MANUTENÇÃO, INATIVO

### Vincular Funcionário a Modelo

- No cadastro de funcionário, selecione o **Modelo de Aeronave** (não mais código)
- O sistema usa `modelo_aeronave_id` internamente

---

## 📋 Próximos Passos

- [ ] Executar migration 0150
- [ ] Executar migration 0151
- [ ] Testar cadastro de modelos
- [ ] Testar cadastro de aeronaves
- [ ] Testar criação de sessões
- [ ] Verificar relatórios e certificados
- [ ] Deploy em produção

---

## 🔄 Rollback (se necessário)

Se precisar reverter:

1. Backup criado: `modelos_sessao_backup_20260113`
2. Migrations podem ser revertidas recriando as tabelas antigas
3. Restaurar dados do backup SQL

---

## ✨ Benefícios

✅ **Simplicidade:** Apenas 1 campo de referência (modelo)  
✅ **Consistência:** Mesmo nome em todo o sistema  
✅ **Manutenibilidade:** Menos campos duplicados  
✅ **Clareza:** Modelo é autoexplicativo (ex: "AW139")  
✅ **Normalização:** Dados do fabricante centralizados

---

**Status:** ✅ Refatoração completa concluída  
**Próximo:** Executar migrations e validar
