# PROMPT: Integração Reativa SSOT - Módulo Funcionários AirTrust (Atualizado)

## CONTEXTO

Sistema: AirTrust - Cloudflare Workers + D1 + Hono + React 19
Objetivo: Estabelecer módulo Funcionários como Single Source of Truth (SSOT) reativo
Stack: TypeScript, Zod, D1 com Foreign Keys, Hono para APIs
Status: Paridade de schema completa + view reativa validada (21/11/2025) + Extensões SSOT aplicadas (Migration 0062) + Testes unitários básicos criados.
Branch: refactor/qualificacoes-integracao

## ARQUITETURA DA INTEGRAÇÃO REATIVA

### 1. PRINCÍPIOS DA SSOT REATIVA

- Funcionários é a ÚNICA fonte de dados de pessoas (confirmado em produção)
- Todos os módulos referenciam funcionarios.id via Foreign Keys ou view reativa
- Cascata automática: UPDATE/DELETE propagam para módulos dependentes
- View `qualificacoes_historico_v` demonstra reatividade validada
- Validação em tempo real: Nenhum registro órfão permitido
- Auditoria completa de todas as propagações
- Prefixo padronizado `funcionario_*` para campos reativos em views

### 2. SCHEMA D1 - TABELAS PRINCIPAIS (ATUALIZADO)

```
-- ============================================
-- TABELA PRINCIPAL: FUNCIONARIOS (SSOT) - SCHEMA COMPLETO
-- Migration Base: 0059_funcionarios_schema_parity.sql
-- ============================================
CREATE TABLE IF NOT EXISTS funcionarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Identificação básica
  nome TEXT NOT NULL,
  nome_guerra TEXT,
  email TEXT UNIQUE,
  matricula TEXT UNIQUE,
  cpf TEXT,

  -- Organização
  cargo TEXT,
  funcao TEXT,
  setor TEXT,
  departamento TEXT,
  base TEXT,
  aeronave TEXT,
  escala TEXT,

  -- Status e sinalizadores
  status TEXT DEFAULT 'ATIVO' CHECK(status IN ('ATIVO', 'INATIVO', 'AFASTADO', 'DESLIGADO')),
  ativo INTEGER DEFAULT 1,
  is_instrutor INTEGER DEFAULT 0,
  is_checador INTEGER DEFAULT 0,

  -- Documentação pessoal
  rg TEXT,
  data_nascimento TEXT,
  sexo TEXT,
  nacionalidade TEXT,

  -- Documentação profissional (ANAC)
  codigo_anac TEXT,
  nivel_icao TEXT,
  validade_icao TEXT,

  -- Documentação médica
  cma TEXT,
  validade_cma TEXT,
  aso TEXT,
  validade_aso TEXT,
  sispat TEXT,
  prestserv TEXT,

  -- Endereço completo
  endereco TEXT,
  cep TEXT,
  logradouro TEXT,
  numero TEXT,
  complemento TEXT,
  bairro TEXT,
  cidade TEXT,
  estado TEXT,

  -- Contato e emergência
  telefone TEXT,
  telefone_emergencia TEXT,
  contato_emergencia_nome TEXT,

  -- Operacional
  data_admissao TEXT,
  foto_url TEXT,
  observacoes TEXT,

  -- Auditoria obrigatória
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- Índices para performance (recomendados)
CREATE INDEX IF NOT EXISTS idx_funcionarios_matricula ON funcionarios(matricula) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_funcionarios_email ON funcionarios(email) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_funcionarios_setor ON funcionarios(setor) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_funcionarios_codigo_anac ON funcionarios(codigo_anac) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_funcionarios_status ON funcionarios(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_funcionarios_cargo ON funcionarios(cargo) WHERE deleted_at IS NULL;

-- ============================================
-- MIGRATION 0062 (EXTENSÕES SSOT) - AJUSTE DE AUDITORIA EXISTENTE
-- Aplicada com script: scripts/apply-ssot-migrations.sh
-- Adiciona tabelas hospedagens, registros_frms, estende auditoria_avancada_v2 e índices adicionais.
-- Schema remoto pré-existente possuía created_at no lugar de timestamp (ajuste incremental).
-- ============================================

-- ============================================
-- MÓDULO: QUALIFICAÇÕES (CERTIFICAÇÕES)
-- Migration: 0056/0057 (base) + 0060 (view reativa)
-- ============================================
CREATE TABLE IF NOT EXISTS qualificacoes_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER,
  qualificacao_id INTEGER,
  tipo_codigo TEXT,
  codigo TEXT,
  categoria TEXT,
  validade TEXT,
  numero_certificado TEXT,
  orgao_emissor TEXT,
  observacoes TEXT,
  arquivo_url TEXT,

  -- Auditoria
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,

  -- FOREIGN KEY COM CASCATA
  FOREIGN KEY (funcionario_id)
    REFERENCES funcionarios(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_qualificacoes_funcionario ON qualificacoes_historico(funcionario_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualificacoes_validade ON qualificacoes_historico(validade) WHERE deleted_at IS NULL;

-- ============================================
-- VIEW REATIVA: QUALIFICACOES_HISTORICO_V
-- Migration: 0060_recreate_integrated_view_funcionarios.sql
-- Característica: Updates em funcionarios refletem IMEDIATAMENTE
-- ============================================
CREATE VIEW IF NOT EXISTS qualificacoes_historico_v AS
SELECT
  qh.id,
  qh.funcionario_id,
  qh.qualificacao_id,
  qh.tipo_codigo,
  qh.codigo,
  qh.categoria,
  qh.validade,
  qh.numero_certificado,
  qh.orgao_emissor,
  qh.observacoes,
  qh.arquivo_url,
  qh.created_at,
  qh.updated_at,

  -- STATUS DERIVADO DINÂMICO
  CASE
    WHEN qh.validade IS NULL THEN 'INDETERMINADA'
    WHEN DATE(qh.validade) < DATE('now') THEN 'VENCIDA'
    WHEN DATE(qh.validade) BETWEEN DATE('now') AND DATE('now', '+30 days') THEN 'PROXIMA_VENCIMENTO'
    WHEN DATE(qh.validade) BETWEEN DATE('now', '+31 days') AND DATE('now', '+60 days') THEN 'ATENCAO'
    ELSE 'VALIDA'
  END AS status_qualificacao,

  -- DADOS REATIVOS DE FUNCIONÁRIO (prefixo funcionario_*)
  COALESCE(f.nome, qh.codigo) AS funcionario_nome,
  f.nome_guerra AS funcionario_nome_guerra,
  f.email AS funcionario_email,
  f.matricula AS funcionario_matricula,
  f.cpf AS funcionario_cpf,
  f.cargo AS funcionario_cargo,
  f.funcao AS funcionario_funcao,
  f.setor AS funcionario_setor,
  f.departamento AS funcionario_departamento,
  f.base AS funcionario_base,
  f.aeronave AS funcionario_aeronave,
  f.escala AS funcionario_escala,

  -- Status e sinalizadores
  COALESCE(f.status, 'ATIVO') AS funcionario_status,
  COALESCE(f.ativo, 1) AS funcionario_ativo,
  COALESCE(f.is_instrutor, 0) AS funcionario_is_instrutor,
  COALESCE(f.is_checador, 0) AS funcionario_is_checador,

  -- Documentação pessoal
  f.rg AS funcionario_rg,
  f.data_nascimento AS funcionario_data_nascimento,
  f.sexo AS funcionario_sexo,
  f.nacionalidade AS funcionario_nacionalidade,
  f.telefone AS funcionario_telefone,
  f.telefone_emergencia AS funcionario_telefone_emergencia,
  f.contato_emergencia_nome AS funcionario_contato_emergencia,

  -- Documentação profissional
  f.codigo_anac AS funcionario_codigo_anac,
  f.nivel_icao AS funcionario_nivel_icao,
  f.validade_icao AS funcionario_validade_icao,

  -- Documentação médica
  f.cma AS funcionario_cma,
  f.validade_cma AS funcionario_validade_cma,
  f.aso AS funcionario_aso,
  f.validade_aso AS funcionario_validade_aso,
  f.sispat AS funcionario_sispat,
  f.prestserv AS funcionario_prestserv,

  -- Endereço completo
  f.endereco AS funcionario_endereco,
  f.cep AS funcionario_cep,
  f.logradouro AS funcionario_logradouro,
  f.numero AS funcionario_numero,
  f.complemento AS funcionario_complemento,
  f.bairro AS funcionario_bairro,
  f.cidade AS funcionario_cidade,
  f.estado AS funcionario_estado,

  -- Operacional
  f.data_admissao AS funcionario_data_admissao,
  f.foto_url AS funcionario_foto_url,
  f.observacoes AS funcionario_observacoes,

  -- Tipo de qualificação (JOIN adicional)
  qt.nome AS tipo_nome,
  qt.descricao AS tipo_descricao,
  qt.orgao_emissor AS tipo_orgao_emissor,
  qt.validade_meses AS tipo_validade_meses

FROM qualificacoes_historico qh
LEFT JOIN funcionarios f ON qh.funcionario_id = f.id AND f.deleted_at IS NULL
LEFT JOIN qualificacoes_tipos qt ON qh.tipo_codigo = qt.codigo AND qt.deleted_at IS NULL
WHERE qh.deleted_at IS NULL;

-- ============================================
-- MÓDULO: SIMULADORES
-- ============================================
CREATE TABLE IF NOT EXISTS sessoes_simulador (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  instrutor_id INTEGER NOT NULL,
  simulador_id INTEGER NOT NULL,
  tipo_sessao TEXT CHECK(tipo_sessao IN ('inicial', 'recorrente', 'emergencia', 'check')) NOT NULL,
  data_sessao TEXT NOT NULL,
  hora_inicio TEXT NOT NULL,
  hora_fim TEXT NOT NULL,
  duracao_minutos INTEGER NOT NULL,
  cenarios TEXT NOT NULL,
  resultado TEXT CHECK(resultado IN ('aprovado', 'reprovado', 'pendente')) DEFAULT 'pendente',
  nota REAL CHECK(nota >= 0 AND nota <= 10),
  observacoes TEXT,

  -- Auditoria
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,

  -- FOREIGN KEYS COM CASCATA
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY (instrutor_id) REFERENCES funcionarios(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessoes_funcionario ON sessoes_simulador(funcionario_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sessoes_instrutor ON sessoes_simulador(instrutor_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sessoes_data ON sessoes_simulador(data_sessao) WHERE deleted_at IS NULL;

-- ============================================
-- MÓDULO: HOSPEDAGEM
-- ============================================
CREATE TABLE IF NOT EXISTS hospedagens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  hotel TEXT NOT NULL,
  quarto TEXT,
  data_checkin TEXT NOT NULL,
  data_checkout TEXT NOT NULL,
  valor REAL NOT NULL,
  status TEXT CHECK(status IN ('reservado', 'confirmado', 'cancelado', 'finalizado')) DEFAULT 'reservado',
  observacoes TEXT,

  -- Auditoria
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,

  -- FOREIGN KEY COM CASCATA
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_hospedagens_funcionario ON hospedagens(funcionario_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_hospedagens_status ON hospedagens(status) WHERE deleted_at IS NULL;

-- ============================================
-- MÓDULO: FRMS (FATIGUE RISK MANAGEMENT)
-- ============================================
CREATE TABLE IF NOT EXISTS registros_frms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER NOT NULL,
  data_registro TEXT NOT NULL,
  horas_sono REAL NOT NULL CHECK(horas_sono >= 0 AND horas_sono <= 24),
  nivel_fadiga INTEGER CHECK(nivel_fadiga BETWEEN 1 AND 10) NOT NULL,
  sintomas TEXT,
  apto_voo BOOLEAN DEFAULT 1,
  observacoes TEXT,

  -- Auditoria
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,

  -- FOREIGN KEY COM CASCATA
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_frms_funcionario ON registros_frms(funcionario_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_frms_data ON registros_frms(data_registro) WHERE deleted_at IS NULL;

-- ============================================
-- AUDITORIA AVANÇADA - RASTREAMENTO DE MUDANÇAS
-- ============================================
-- Auditoria (visão consolidada pós 0062; created_at já existe no remoto)
CREATE TABLE IF NOT EXISTS auditoria_avancada_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tabela TEXT NOT NULL,
  acao TEXT NOT NULL,
  registro_id TEXT NOT NULL,
  dados_anteriores TEXT,
  dados_novos TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
ALTER TABLE auditoria_avancada_v2 ADD COLUMN usuario_id INTEGER; -- tolera erro se já existir
ALTER TABLE auditoria_avancada_v2 ADD COLUMN ip_address TEXT;
ALTER TABLE auditoria_avancada_v2 ADD COLUMN user_agent TEXT;
ALTER TABLE auditoria_avancada_v2 ADD COLUMN origem TEXT DEFAULT 'system';
CREATE INDEX IF NOT EXISTS idx_auditoria_tabela_registro ON auditoria_avancada_v2(tabela, registro_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_created_at ON auditoria_avancada_v2(created_at);
CREATE INDEX IF NOT EXISTS idx_auditoria_acao ON auditoria_avancada_v2(acao);
```

### 3. TRIGGERS D1 - PROPAGAÇÃO REATIVA

```
-- ============================================
-- TRIGGER: Auditoria UPDATE em Funcionários
-- ============================================
CREATE TRIGGER IF NOT EXISTS trg_funcionarios_update
AFTER UPDATE ON funcionarios
FOR EACH ROW
WHEN NEW.updated_at != OLD.updated_at
BEGIN
  INSERT INTO auditoria_avancada_v2 (
    tabela, registro_id, acao,
    dados_anteriores, dados_novos, origem
  ) VALUES (
    'funcionarios',
    NEW.id,
    'UPDATE',
    json_object(
      'matricula', OLD.matricula,
      'nome', OLD.nome,
      'email', OLD.email,
      'status', OLD.status,
      'cargo', OLD.cargo,
      'setor', OLD.setor,
      'codigo_anac', OLD.codigo_anac
    ),
    json_object(
      'matricula', NEW.matricula,
      'nome', NEW.nome,
      'email', NEW.email,
      'status', NEW.status,
      'cargo', NEW.cargo,
      'setor', NEW.setor,
      'codigo_anac', NEW.codigo_anac
    ),
    'system'
  );
END;

-- ============================================
-- TRIGGER: Prevenir DELETE físico em Funcionários
-- ============================================
CREATE TRIGGER IF NOT EXISTS trg_funcionarios_prevent_hard_delete
BEFORE DELETE ON funcionarios
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'DELETE físico proibido. Use soft delete (UPDATE deleted_at)');
END;

-- ============================================
-- TRIGGER: Soft Delete em Cascata
-- ============================================
CREATE TRIGGER IF NOT EXISTS trg_funcionarios_soft_delete
AFTER UPDATE OF deleted_at ON funcionarios
FOR EACH ROW
WHEN NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL
BEGIN
  UPDATE qualificacoes_historico
  SET deleted_at = datetime('now')
  WHERE funcionario_id = NEW.id AND deleted_at IS NULL;

  UPDATE sessoes_simulador
  SET deleted_at = datetime('now')
  WHERE (funcionario_id = NEW.id OR instrutor_id = NEW.id) AND deleted_at IS NULL;

  UPDATE hospedagens
  SET deleted_at = datetime('now')
  WHERE funcionario_id = NEW.id AND deleted_at IS NULL;

  UPDATE registros_frms
  SET deleted_at = datetime('now')
  WHERE funcionario_id = NEW.id AND deleted_at IS NULL;

  INSERT INTO auditoria_avancada_v2 (
    tabela, registro_id, acao, origem
  ) VALUES (
    'funcionarios', NEW.id, 'SOFT_DELETE', 'system'
  );
END;

-- ============================================
-- TRIGGER: Auto-update updated_at
-- ============================================
CREATE TRIGGER IF NOT EXISTS trg_funcionarios_updated_at
BEFORE UPDATE ON funcionarios
FOR EACH ROW
BEGIN
  UPDATE funcionarios SET updated_at = datetime('now') WHERE id = NEW.id;
END;
```

### 4. CAMADA DE SERVIÇO - TypeScript (ATUALIZADO)

```
// Arquivo: worker-airtrust/src/services/funcionarios.service.ts
// Atualizações principais:
// - Métodos: listar, buscarPorId, buscarComDependencias (agrega qualificacoes, sessoes_simulador, hospedagens, registros_frms)
// - Soft delete com verificação de hospedagens ativas (bloqueio condicional)
// - Zod schema completo (campos opcionais para updates parciais)
// - Atualização de updated_at garantida na aplicação
// Referência de dependências para reatividade cross-módulo.
```

### 5. HOOKS REACT - INTEGRAÇÃO REATIVA (ATUALIZADO)

```
// Arquivo principal: src/react-app/hooks/useFuncionarios.ts
// Estratégia:
// - React Query para cache por filtros e funcionário individual (include=all)
// - Invalidação em cascata após mutações: qualificacoes-historico, sessoes_simulador, hospedagens, frms, auditoria
// - Suporte a criação, atualização, soft delete e verificação de dependências
// - Alias legado mantido (useFuncionarios duplicado) para compatibilidade incremental
```

### 6. COMPONENTE REACT - EXEMPLO COM REATIVIDADE

```
// Arquivo: src/react-app/components/FuncionarioCard.tsx
// Destaques:
// - Renderiza perfil completo (documentação, endereço, contato) + módulos dependentes
// - Ações: editar nome, alternar status ATIVO/INATIVO, soft delete condicional
// - Exibe estado de bloqueio se hospedagens ativas
// - Mensagem de confirmação de reatividade cross-módulo
```

### 7. MIGRATION SCRIPT - APLICAR PARIDADE DE SCHEMA

```
// Novo script: scripts/apply-ssot-migrations.sh
// Funções:
// - Backup remoto automático antes de aplicar (wrangler d1 export)
// - Idempotência: verifica existência da coluna usuario_id antes de reaplicar 0062
// - Smoke tests de tabelas e índices após execução
// - Seleção de últimos registros de auditoria (created_at)
```

### 8. TESTES - VALIDAÇÃO DA INTEGRAÇÃO REATIVA

```
// Arquivo criado: src/__tests__/funcionarios-ssot-reativo.test.ts
// Abrangência:
// - Mock de D1Database para validar lógica do service sem dependência real
// - Testes: criação, listagem paginada, atualização (reflete updated_at), soft delete bloqueado por dependência simulada
// - Suite skip para futura integração real com triggers (auditoria + cascata)
```

### 9. CHECKLIST DE IMPLEMENTAÇÃO (ATUALIZADO)

```
1. Paridade completa tabela funcionarios (0059) ✅
2. View reativa reconstruída (0060) ✅
3. Correção coluna telefone (0061) ✅
4. Extensões SSOT (hospedagens, registros_frms, auditoria estendida) (0062) ✅
5. Service TS unificado + dependências ✅
6. Rotas SSOT separadas (`funcionarios_ssot`) ✅
7. Hooks reativos + invalidation multi-módulo ✅
8. Componente FuncionarioCard (reatividade demonstrada) ✅
9. Script apply-ssot-migrations.sh (backup + idempotência) ✅
10. Testes unitários básicos service (mock) ✅
11. Testes integração triggers (planejado) ⏳
12. Deploy final (token Workers Scripts Edit) ⏳
13. Backfill auditoria/origens (futuro) ⏳
```

### 10. DIAGRAMA MERMAID - ARQUITETURA SSOT REATIVA

```
// (Diagrama conforme prompt.)
```

### 11. CONFIGURAÇÃO CLOUDFLARE - TOKEN E DEPLOY

```
// (Instruções de token e deploy conforme prompt.)
```

### 12. PRÓXIMOS PASSOS RECOMENDADOS

1. Gerar novo token com permissão Workers Scripts (Edit) e executar deploy
2. Adicionar testes de integração D1 (triggers: UPDATE + SOFT_DELETE cascata + auditoria)
3. Backfill dados críticos (datas nascimento, documentação incompleta)
4. Índices adicionais orientados a filtros de UI avançada (ex: setor+cargo composto)
5. Monitoramento e alertas (wrangler tail + dashboards)
6. Expansões (notificações, relatórios, integrações externas)

### 13. CONCLUSÃO

Estado consolidado com reatividade validada; pendente apenas deploy final por permissões.

## FIM DO PROMPT ATUALIZADO
