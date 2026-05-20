# Checks com Examinadores — Pacote Final

Este documento consolida o **schema (D1)**, **rotas (Workers + Hono)**, **fluxo frontend (React)** e um **checklist de validação E2E** para o módulo de Checks com Examinadores.

> Princípio SSOT: a qualificação gerada pelo check deve usar `qualificacoes_tipos.codigo` (via `qualificacao_codigo`) e registrar histórico em `qualificacoes_historico` sem criar “catálogo paralelo”.

---

## 1) Schema SQL (final / consolidado)

### 1.1. Funcionários

- Campo para marcar examinador:

```sql
ALTER TABLE funcionarios ADD COLUMN is_examinador INTEGER NOT NULL DEFAULT 0;
```

> Filtro oficial no backend: `?examinador=true` usa `COALESCE(is_examinador,0)=1` e `deleted_at IS NULL`.

### 1.2. Sessões (agendamentos)

- Campos para ligar examinador e marcar sessão como check:

```sql
ALTER TABLE simulador_agendamentos ADD COLUMN examinador_id INTEGER NULL;
ALTER TABLE simulador_agendamentos ADD COLUMN is_check INTEGER NOT NULL DEFAULT 0;
```

> Regra: `examinador_id != null` ⇒ `is_check = 1`.

### 1.3. Tipos de check

Tabela (base):

```sql
CREATE TABLE IF NOT EXISTS tipos_check (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  descricao TEXT,
  qualificacao_tipo_id INTEGER NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
```

Consolidação SSOT (novo): `qualificacao_codigo` (ponte direta para `qualificacoes_tipos.codigo`)

```sql
ALTER TABLE tipos_check ADD COLUMN qualificacao_codigo TEXT COLLATE NOCASE;

-- Backfill por qualificacao_tipo_id
UPDATE tipos_check
SET qualificacao_codigo = (
  SELECT UPPER(qt.codigo)
  FROM qualificacoes_tipos qt
  WHERE qt.id = tipos_check.qualificacao_tipo_id
    AND qt.deleted_at IS NULL
  LIMIT 1
)
WHERE qualificacao_codigo IS NULL
  AND qualificacao_tipo_id IS NOT NULL
  AND deleted_at IS NULL;

-- Backfill por match de codigo
UPDATE tipos_check
SET qualificacao_codigo = UPPER(codigo)
WHERE qualificacao_codigo IS NULL
  AND deleted_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM qualificacoes_tipos qt
    WHERE UPPER(qt.codigo) = UPPER(tipos_check.codigo)
      AND qt.deleted_at IS NULL
  );

CREATE INDEX IF NOT EXISTS idx_tipos_check_qualificacao_codigo
  ON tipos_check(qualificacao_codigo)
  WHERE deleted_at IS NULL;
```

### 1.4. Vínculo sessão ⇄ check

```sql
CREATE TABLE IF NOT EXISTS sessoes_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sessao_id INTEGER NOT NULL,
  tipo_check_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (sessao_id) REFERENCES simulador_agendamentos(id),
  FOREIGN KEY (tipo_check_id) REFERENCES tipos_check(id)
);
```

### 1.5. Resultados do check

```sql
CREATE TABLE IF NOT EXISTS sessoes_checks_resultados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sessao_check_id INTEGER NOT NULL,
  aprovado INTEGER NOT NULL DEFAULT 0,
  observacoes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (sessao_check_id) REFERENCES sessoes_checks(id)
);
```

### 1.6. Rastreabilidade no histórico de qualificações

Colunas usadas para vincular qualificação gerada ao check e à sessão:

```sql
ALTER TABLE qualificacoes_historico ADD COLUMN tipo_check_id INTEGER NULL;
ALTER TABLE qualificacoes_historico ADD COLUMN sessao_id INTEGER NULL;

CREATE INDEX IF NOT EXISTS idx_qualificacoes_check
  ON qualificacoes_historico(tipo_check_id, sessao_id);
```

---

## 2) Rotas Hono (Workers)

As rotas vivem em [worker-airtrust/src/routes/simuladores.ts](worker-airtrust/src/routes/simuladores.ts).

### 2.1. Listar examinadores

- **GET** `/api/funcionarios?examinador=true`
- Retorna somente `funcionarios` com `is_examinador=1` e `deleted_at IS NULL`.

### 2.2. Listar tipos de check

- **GET** `/api/simuladores/tipos-check`
- Retorno:

```json
{
  "success": true,
  "data": [{ "id": 1, "codigo": "OPC", "nome": "...", "qualificacao_codigo": "OPC" }]
}
```

### 2.3. Criar sessão (ponto de entrada do fluxo)

- **POST** `/api/simuladores/sessoes`
- Payload (trecho relevante):

```json
{
  "examinador_id": 123,
  "checks": [1, 2, 3]
}
```

Regras no backend:

- Se `examinador_id` existe ⇒ `is_check=1`.
- Se `is_check=1` ⇒ exige `checks.length > 0`.
- Valida `examinador_id` com `funcionarios.is_examinador=1`.
- Valida cada `tipo_check_id` em `tipos_check.deleted_at IS NULL`.
- Cria vínculos em `sessoes_checks`.

### 2.4. Editar sessão (inclui mudar/remover examinador + checks)

- **PUT** `/api/simuladores/sessoes/:id`
- Suporta atualização de:
  - `examinador_id` (setar ou remover)
  - `checks` (substituição completa)

Comportamento:

- Ao atualizar checks/examinador, faz **soft-delete** dos `sessoes_checks` existentes e também dos `sessoes_checks_resultados` atrelados.

### 2.5. Listar checks de uma sessão

- **GET** `/api/simuladores/sessoes/:id/checks`

Retorna `sessoes_checks` + `tipos_check` + (se existir) `sessoes_checks_resultados`.

### 2.6. Salvar resultados + gerar qualificação

- **POST** `/api/simuladores/sessoes/:id/checks/resultados`

Payload:

```json
{
  "resultados": [{ "sessao_check_id": 10, "aprovado": true, "observacoes": "OK" }]
}
```

Regras:

- Só permite se `simulador_agendamentos.is_check = 1`.
- Para cada resultado `aprovado=true`, gera registro em `qualificacoes_historico` usando:
  - `funcionario_cpf` (ou `cpf` legado, se for o schema antigo)
  - `qualificacao_codigo` (preferencial) vindo de `tipos_check.qualificacao_codigo`
  - `data_conclusao`/`data_realizacao` e `data_vencimento`
  - `tipo_check_id` e `sessao_id` quando existirem no schema
- Validade: tenta usar `qualificacoes_tipos.validade` (fallback 12 meses).

---

## 3) Fluxo Frontend (React)

O ponto de entrada real do agendamento (calendário) é [src/react-app/components/modals/ModalNovaSessao.tsx](src/react-app/components/modals/ModalNovaSessao.tsx).

### 3.1. No Modal de Agendamento

- UI:

  - Select: **Examinador (opcional)**
  - Checklist: **Checks vinculados** (habilita apenas quando há examinador)

- Carregamentos:

  - `GET /api/funcionarios?examinador=true`
  - `GET /api/simuladores/tipos-check`

- Validação:

  - Se selecionou examinador ⇒ exige ao menos 1 check selecionado.

- Payload:
  - Envia `examinador_id` + `checks` junto do restante do agendamento.

### 3.2. Na Ficha / Assinatura

A ficha já faz o fluxo de avaliação e chama o endpoint de resultados antes da assinatura do instrutor.

---

## 4) Checklist de validação (E2E)

### Agendamento

- Criar sessão sem examinador ⇒ `is_check=0`, `examinador_id=NULL`, nenhum registro em `sessoes_checks`.
- Criar sessão com examinador + 1+ checks ⇒ `is_check=1`, vínculos em `sessoes_checks` criados.
- Editar sessão removendo examinador ⇒ `is_check=0` e soft-delete em `sessoes_checks` + `sessoes_checks_resultados`.
- Editar sessão trocando checks ⇒ soft-delete dos antigos e inserts dos novos.

### Avaliação / Qualificações

- Abrir ficha de sessão de check ⇒ endpoint `GET /sessoes/:id/checks` retorna lista.
- Enviar resultados com aprovado/observações ⇒ grava em `sessoes_checks_resultados`.
- Para cada aprovado, cria linha em `qualificacoes_historico` com `qualificacao_codigo` (ou colunas legadas, se aplicável).
- Confere validade:
  - Se existir `qualificacoes_tipos.validade`, usa este valor.
  - Caso contrário, fallback 12 meses.

### Auditoria

- Criar sessão e editar examinador/checks ⇒ gera logs via `audit(...)`.
- Gerar qualificação automática ⇒ auditoria `INSERT_AUTO_CHECK`.
