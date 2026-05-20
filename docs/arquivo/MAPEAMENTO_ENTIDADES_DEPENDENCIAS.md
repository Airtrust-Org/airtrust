# MAPEAMENTO DE ENTIDADES E DEPENDÊNCIAS - AirTrust

**Atualizado em: 2025-12-05**

## 🔑 REGRA CRÍTICA

> **TODA atualização em uma entidade DEVE propagar para TODAS as suas dependências.**

---

## 📊 ENTIDADES PRINCIPAIS

### 1. AERONAVES (tabela: `aeronaves`)

```
Campos: id, codigo, modelo, fabricante, status
PK: id
UK: codigo (ex: "AW139", "SK76")
```

#### Dependentes de AERONAVES:

| Tabela                     | Campo FK          | Deve ser atualizado quando |
| -------------------------- | ----------------- | -------------------------- |
| `simuladores`              | `aeronave_codigo` | Aeronave.codigo muda       |
| `modelos_sessao`           | `codigo_aeronave` | Aeronave.codigo muda       |
| `fichas_sessao`            | `tipo_aeronave`   | Aeronave.codigo muda       |
| `manobras`                 | `tipo_aeronave`   | Aeronave.modelo muda       |
| `historico_notas_manobras` | `tipo_aeronave`   | Aeronave.modelo muda       |

---

### 2. SIMULADORES (tabela: `simuladores`)

```
Campos: id, nome, modelo, tipo, fabricante, aeronave_codigo, status
PK: id
FK: aeronave_codigo → aeronaves.codigo
```

#### Dependentes de SIMULADORES:

| Tabela                | Campo FK           | Deve ser atualizado quando   |
| --------------------- | ------------------ | ---------------------------- |
| `agendamento_slots`   | `simulador_id`     | Simulador.id muda (não deve) |
| `sessoes` (via slots) | (via simulador_id) | Nome simulador muda          |

---

### 3. TIPOS DE SESSÃO (tabela: `tipos_sessao`)

```
Campos: id, codigo, nome, descricao
PK: id
UK: codigo (ex: "INITIAL", "RECURRENT", "CHECKRIDE")
```

#### Dependentes de TIPOS DE SESSÃO:

| Tabela           | Campo FK         | Deve ser atualizado quando |
| ---------------- | ---------------- | -------------------------- |
| `modelos_sessao` | `tipo_sessao_id` | Tipo.id muda (não deve)    |
| `fichas_sessao`  | `tipo_sessao`    | Tipo.codigo muda           |
| `manobras`       | `tipo_sessao`    | Tipo.codigo muda           |

---

### 4. MODELOS DE SESSÃO (tabela: `modelos_sessao`)

```
Campos: id, codigo, nome, tipo_sessao_id, codigo_aeronave, tipo_aeronave
PK: id
FK: tipo_sessao_id → tipos_sessao.id
FK: codigo_aeronave → aeronaves.codigo
```

#### Dependentes de MODELOS DE SESSÃO:

| Tabela                   | Campo FK           | Deve ser atualizado quando |
| ------------------------ | ------------------ | -------------------------- |
| `modelo_sessao_manobras` | `modelo_sessao_id` | Modelo.id muda (não deve)  |
| `fichas_sessao`          | `modelo_sessao_id` | Modelo.id muda (não deve)  |

---

### 5. FUNCIONÁRIOS (tabela: `funcionarios`)

```
Campos: id, nome, matricula, cpf, codigo_anac, funcao, cargo
PK: id
UK: matricula
UK: cpf
```

#### Dependentes de FUNCIONÁRIOS:

| Tabela                       | Campo FK               | Deve ser atualizado quando     |
| ---------------------------- | ---------------------- | ------------------------------ |
| `qualificacoes_funcionarios` | `funcionario_id`       | Funcionario.id muda (não deve) |
| `qualificacoes_historico`    | `funcionario_id`       | Funcionario.id muda (não deve) |
| `fichas_sessao`              | `colaborador_id_aluno` | Funcionario.id muda (não deve) |
| `fichas_sessao`              | `instrutor_id`         | Funcionario.id muda (não deve) |
| `agendamento_participantes`  | `funcionario_id`       | Funcionario.id muda (não deve) |
| `certificados`               | `funcionario_id`       | Funcionario.id muda (não deve) |
| `licencas`                   | `funcionario_id`       | Funcionario.id muda (não deve) |

---

### 6. TIPOS DE QUALIFICAÇÃO (tabela: `tipos_qualificacao`)

```
Campos: id, codigo, nome, categoria, validade_meses
PK: id
UK: codigo (ex: "FAP14", "TT", "INICIAL")
```

#### Dependentes de TIPOS DE QUALIFICAÇÃO:

| Tabela                       | Campo FK  | Deve ser atualizado quando |
| ---------------------------- | --------- | -------------------------- |
| `qualificacoes_funcionarios` | `tipo_id` | Tipo.id muda (não deve)    |
| `qualificacoes_historico`    | `tipo_id` | Tipo.id muda (não deve)    |

---

## 🔄 FLUXO DE ATUALIZAÇÃO EM CASCATA

### Quando AERONAVE é atualizada:

```sql
-- Se aeronaves.codigo mudar de "OLD" para "NEW":

-- 1. Atualizar simuladores
UPDATE simuladores
SET aeronave_codigo = 'NEW'
WHERE aeronave_codigo = 'OLD';

-- 2. Atualizar modelos_sessao
UPDATE modelos_sessao
SET codigo_aeronave = 'NEW',
    tipo_aeronave = 'NEW'
WHERE codigo_aeronave = 'OLD' OR tipo_aeronave = 'OLD';

-- 3. Atualizar fichas_sessao
UPDATE fichas_sessao
SET tipo_aeronave = 'NEW'
WHERE tipo_aeronave = 'OLD';

-- 4. Atualizar manobras
UPDATE manobras
SET tipo_aeronave = 'NEW'
WHERE tipo_aeronave = 'OLD';

-- 5. Atualizar historico_notas_manobras
UPDATE historico_notas_manobras
SET tipo_aeronave = 'NEW'
WHERE tipo_aeronave = 'OLD';
```

---

## ✅ CHECKLIST DE VALIDAÇÃO

Antes de qualquer deploy, verificar:

### Aeronaves ↔ Simuladores

```sql
SELECT s.id, s.nome, s.aeronave_codigo, a.codigo
FROM simuladores s
LEFT JOIN aeronaves a ON s.aeronave_codigo = a.codigo
WHERE a.codigo IS NULL AND s.aeronave_codigo IS NOT NULL;
-- Deve retornar 0 linhas
```

### Aeronaves ↔ Modelos Sessão

```sql
SELECT ms.id, ms.nome, ms.codigo_aeronave, a.codigo
FROM modelos_sessao ms
LEFT JOIN aeronaves a ON ms.codigo_aeronave = a.codigo
WHERE a.codigo IS NULL AND ms.codigo_aeronave IS NOT NULL;
-- Deve retornar 0 linhas
```

### Tipos Sessão ↔ Modelos Sessão

```sql
SELECT ms.id, ms.nome, ms.tipo_sessao_id, ts.id
FROM modelos_sessao ms
LEFT JOIN tipos_sessao ts ON ms.tipo_sessao_id = ts.id
WHERE ts.id IS NULL;
-- Deve retornar 0 linhas
```

---

## 🛡️ PROTEÇÕES IMPLEMENTADAS

### No Frontend (ModalNovaSessao.tsx):

```typescript
// Filtro com fallback para compatibilidade:
const filtrados = simuladores.filter(
  (s) => s.aeronave_codigo === codigo || s.tipo === codigo || s.modelo === codigo,
);
```

### Na API (simuladores.ts):

```typescript
// PUT /simuladores/:id agora atualiza aeronave_codigo
await c.env.DB.prepare(
  "UPDATE simuladores SET ..., aeronave_codigo=?, ... WHERE id=?"
).bind(..., b.aeronave_codigo, ...);
```

---

## 📝 CONVENÇÕES DE NOMENCLATURA

| Campo             | Formato          | Exemplo | Usado em         |
| ----------------- | ---------------- | ------- | ---------------- |
| `aeronave_codigo` | aeronaves.codigo | "AW139" | simuladores      |
| `codigo_aeronave` | aeronaves.codigo | "AW139" | modelos_sessao   |
| `tipo_aeronave`   | aeronaves.modelo | "AW139" | fichas, manobras |

**NOTA:** Idealmente deveríamos unificar para um único nome (`aeronave_codigo`), mas mantemos por compatibilidade.

---

## 🚨 ALERTAS DE INCONSISTÊNCIA

O sistema deve alertar quando:

1. **Simulador sem aeronave válida**

   - `simuladores.aeronave_codigo` não existe em `aeronaves.codigo`

2. **Modelo sem aeronave válida**

   - `modelos_sessao.codigo_aeronave` não existe em `aeronaves.codigo`

3. **Tipo de sessão órfão**

   - `tipos_sessao` sem nenhum modelo associado

4. **Funcionário sem qualificações obrigatórias**
   - Pilotos sem TT, FAP, etc.

---

## 📅 HISTÓRICO DE CORREÇÕES

| Data       | Correção                                               | Registros Afetados |
| ---------- | ------------------------------------------------------ | ------------------ |
| 2025-12-05 | Atualizado simulador.aeronave_codigo para "AW139"      | 1                  |
| 2025-12-05 | Atualizado modelos_sessao.codigo_aeronave para "AW139" | 12                 |
| 2025-12-05 | Filtro ModalNovaSessao com fallback                    | N/A                |

---

## 🔧 SCRIPTS DE MANUTENÇÃO

### Verificar integridade completa:

```bash
./scripts/audit-data-integrity.sh
```

### Corrigir aeronave_codigo em cascata:

```bash
./scripts/fix-aeronave-codigo-cascata.sh OLD_CODE NEW_CODE
```
