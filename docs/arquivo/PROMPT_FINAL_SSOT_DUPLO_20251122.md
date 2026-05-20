# PROMPT FINAL: Sistema SSOT Duplo AirTrust - Consolidado com Validação 21-22/11/2025

## CONTEXTO EXECUTIVO

Sistema: AirTrust - Cloudflare Workers + D1 + Hono + React 19
Arquitetura: SSOT Duplo (funcionarios + qualificacoes_tipos) + Tabela Relação (qualificacoes_historico)
Status: Migração 0062 estrutural concluída (chunked) + Validação endpoints 80% funcional
Pendências: Enriquecimento semântico (qualificacao_id) + Triggers soft delete + FK reintrodução
Branch: refactor/qualificacoes-integracao

## HISTÓRICO DE MIGRATIONS CRÍTICAS

0059: Paridade schema funcionarios (40+ campos)
0060: View reativa inicial qualificacoes_historico_v
0061: Coluna telefone adicionada
0062: Consolidação SSOT dupla (chunked - preservação dados)
0063: Normalização qualificacoes_historico
0064-0066: View reativa progressiva (compatibilidade legado)
0067: Auditoria BEFORE UPDATE + triggers cleanup

## VALIDAÇÃO ATUAL (21-22/11/2025)

### Endpoints Funcionais ✅

- GET /api/health → 200 OK
- GET /api/qualificacoes/historico?limit=2 → 200 OK (~2.9s primeira, 523 registros)
- GET /api/funcionarios-ssot?limit=2 → 200 OK (~400ms)
- POST /api/funcionarios-ssot → 201 Created
- PUT /api/funcionarios-ssot/:id → 200 OK (reatividade validada)

### Endpoints com Falha ❌

- GET /api/funcionarios-ssot/:id?include=all → 500 (schema divergente sessoes_simulador)
- DELETE /api/funcionarios-ssot/:id → 500 (trigger soft delete falha em cascata)

### Métricas Pós-Migration 0062

- Funcionários ativos: N (preservados 100%)
- Tipos qualificações: M (incrementado com inserções automáticas)
- Histórico ativo: 523 registros
- Mapeamento qualificacao_id: 0/523 (0%) ⚠️ CRÍTICO
  - Causa: Colunas tipo_codigo e codigo nulas no histórico existente
  - Solução: Enriquecimento heurístico necessário

## ARQUITETURA DE DADOS VALIDADA

### SSOT #1: funcionarios (✅ Funcional)

```sql
CREATE TABLE funcionarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  nome_guerra TEXT,
  email TEXT UNIQUE,
  matricula TEXT UNIQUE,
  cpf TEXT,
  cargo TEXT,
  funcao TEXT,
  setor TEXT,
  departamento TEXT,
  base TEXT,
  aeronave TEXT,
  escala TEXT,
  status TEXT DEFAULT 'ATIVO',
  ativo INTEGER DEFAULT 1,
  is_instrutor INTEGER DEFAULT 0,
  is_checador INTEGER DEFAULT 0,
  rg TEXT,
  data_nascimento TEXT,
  sexo TEXT,
  nacionalidade TEXT,
  codigo_anac TEXT,
  nivel_icao TEXT,
  validade_icao TEXT,
  cma TEXT,
  validade_cma TEXT,
  aso TEXT,
  validade_aso TEXT,
  sispat TEXT,
  prestserv TEXT,
  endereco TEXT,
  cep TEXT,
  logradouro TEXT,
  numero TEXT,
  complemento TEXT,
  bairro TEXT,
  cidade TEXT,
  estado TEXT,
  telefone TEXT,
  telefone_emergencia TEXT,
  contato_emergencia_nome TEXT,
  data_admissao TEXT,
  foto_url TEXT,
  observacoes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX idx_funcionarios_matricula ON funcionarios(matricula) WHERE deleted_at IS NULL;
CREATE INDEX idx_funcionarios_email ON funcionarios(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_funcionarios_codigo_anac ON funcionarios(codigo_anac) WHERE deleted_at IS NULL;
```

### SSOT #2: qualificacoes_tipos (✅ Funcional)

```sql
CREATE TABLE qualificacoes_tipos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  categoria TEXT,
  orgao_emissor TEXT NOT NULL,
  validade_meses INTEGER,
  requer_renovacao INTEGER DEFAULT 1,
  parent_id INTEGER,
  obrigatoria_para_cargo TEXT,
  pre_requisitos TEXT,
  cor_status TEXT,
  icone TEXT,
  ordem_exibicao INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (parent_id) REFERENCES qualificacoes_tipos(id) ON DELETE SET NULL
);

CREATE INDEX idx_qualificacoes_tipos_codigo ON qualificacoes_tipos(codigo) WHERE deleted_at IS NULL;
CREATE INDEX idx_qualificacoes_tipos_categoria ON qualificacoes_tipos(categoria) WHERE deleted_at IS NULL;
```

### RELAÇÃO: qualificacoes_historico (⚠️ Mapeamento Pendente)

```sql
CREATE TABLE qualificacoes_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER,
  qualificacao_id INTEGER, -- ⚠️ NULL em 523/523 registros
  tipo_codigo TEXT, -- NULL (enriquecimento necessário)
  codigo TEXT, -- NULL (enriquecimento necessário)
  categoria TEXT,
  validade TEXT,
  numero_certificado TEXT,
  orgao_emissor TEXT,
  observacoes TEXT,
  arquivo_url TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
  -- FK removida temporariamente devido órfãos (0063)
  -- FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id) ON DELETE RESTRICT ON UPDATE CASCADE
  -- FOREIGN KEY (qualificacao_id) REFERENCES qualificacoes_tipos(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX idx_qualificacoes_historico_funcionario ON qualificacoes_historico(funcionario_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_qualificacoes_historico_qualificacao ON qualificacoes_historico(qualificacao_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_qualificacoes_historico_validade ON qualificacoes_historico(validade) WHERE deleted_at IS NULL;

-- Índice único (aguardando enriquecimento completo)
-- CREATE UNIQUE INDEX idx_qualificacoes_historico_unico
-- ON qualificacoes_historico(funcionario_id, qualificacao_id, numero_certificado)
-- WHERE deleted_at IS NULL AND numero_certificado IS NOT NULL;
```

### VIEW REATIVA: qualificacoes_historico_v (✅ Funcional)

```sql
CREATE VIEW qualificacoes_historico_v AS
SELECT
  qh.id,
  qh.funcionario_id,
  qh.qualificacao_id,
  qh.tipo_codigo,
  qh.codigo,
  qh.categoria,
  qh.validade AS data_validade,
  qh.numero_certificado,
  qh.orgao_emissor AS historico_orgao_emissor,
  qh.observacoes AS historico_observacoes,
  qh.arquivo_url,
  qh.created_at,
  qh.updated_at,
  CASE
    WHEN qh.validade IS NULL THEN 'INDETERMINADA'
    WHEN DATE(qh.validade) < DATE('now') THEN 'VENCIDA'
    WHEN DATE(qh.validade) BETWEEN DATE('now') AND DATE('now', '+30 days') THEN 'PROXIMA_VENCIMENTO'
    WHEN DATE(qh.validade) BETWEEN DATE('now', '+31 days') AND DATE('now', '+60 days') THEN 'ATENCAO'
    ELSE 'VALIDA'
  END AS status_qualificacao,
  CASE
    WHEN qh.validade IS NULL THEN NULL
    ELSE CAST((julianday(qh.validade) - julianday('now')) AS INTEGER)
  END AS dias_ate_vencimento,
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
  COALESCE(f.status, 'ATIVO') AS funcionario_status,
  COALESCE(f.ativo, 1) AS funcionario_ativo,
  COALESCE(f.is_instrutor, 0) AS funcionario_is_instrutor,
  COALESCE(f.is_checador, 0) AS funcionario_is_checador,
  f.codigo_anac AS funcionario_codigo_anac,
  f.nivel_icao AS funcionario_nivel_icao,
  f.validade_icao AS funcionario_validade_icao,
  f.cma AS funcionario_cma,
  f.validade_cma AS funcionario_validade_cma,
  f.aso AS funcionario_aso,
  f.validade_aso AS funcionario_validade_aso,
  f.telefone AS funcionario_telefone,
  f.telefone_emergencia AS funcionario_telefone_emergencia,
  f.foto_url AS funcionario_foto_url,
  f.data_admissao AS funcionario_data_admissao,
  f.rg AS funcionario_rg,
  f.data_nascimento AS funcionario_data_nascimento,
  f.sexo AS funcionario_sexo,
  f.nacionalidade AS funcionario_nacionalidade,
  f.cep AS funcionario_cep,
  f.logradouro AS funcionario_logradouro,
  f.numero AS funcionario_numero,
  f.complemento AS funcionario_complemento,
  f.bairro AS funcionario_bairro,
  f.cidade AS funcionario_cidade,
  f.estado AS funcionario_estado,
  f.sispat AS funcionario_sispat,
  f.prestserv AS funcionario_prestserv,
  f.contato_emergencia_nome AS funcionario_contato_emergencia,
  f.observacoes AS funcionario_observacoes,
  COALESCE(qt.codigo, qh.tipo_codigo, qh.codigo) AS qualificacao_codigo,
  COALESCE(qt.nome, qh.tipo_codigo, qh.codigo) AS qualificacao_nome,
  qt.descricao AS qualificacao_descricao,
  COALESCE(qt.categoria, qh.categoria) AS qualificacao_categoria,
  COALESCE(qt.orgao_emissor, qh.orgao_emissor) AS qualificacao_orgao_emissor,
  qt.validade_meses AS qualificacao_validade_meses,
  qt.requer_renovacao AS qualificacao_requer_renovacao,
  qt.obrigatoria_para_cargo AS qualificacao_obrigatoria_para_cargo,
  qt.pre_requisitos AS qualificacao_pre_requisitos,
  qt.cor_status AS qualificacao_cor_status,
  qt.icone AS qualificacao_icone,
  qt.ordem_exibicao AS qualificacao_ordem_exibicao,
  NULL AS data_conclusao,
  NULL AS nota,
  NULL AS instrutor,
  NULL AS local_treinamento,
  NULL AS carga_horaria,
  NULL AS modalidade
FROM qualificacoes_historico qh
LEFT JOIN funcionarios f ON qh.funcionario_id = f.id AND f.deleted_at IS NULL
LEFT JOIN qualificacoes_tipos qt ON qh.qualificacao_id = qt.id AND qt.deleted_at IS NULL
WHERE qh.deleted_at IS NULL;
```

## CAMADA DE SERVIÇO - FuncionariosService (trecho principal corrigido)

```ts
// Ver versão completa em src/services/funcionarios.service.ts
// Destacam-se: listar, buscarComDependencias com PRAGMA, softDelete em cascade manual.
```

## MIGRATION 0068 (Planejada): ENRIQUECIMENTO SEMÂNTICO + REINTRODUÇÃO FK

Inclui heurísticas por categoria/órgão e padrão de número_certificado, criação de tipos genéricos, limpeza de órfãos e recriação segura da tabela com FKs + índices + view.

## ROADMAP FINAL

CRÍTICO: Aplicar 0068 → Mapear >=95% qualificacao_id → Retestar include=all / soft delete → Deploy.
ALTA: Backfill manual <0.8 confiança, dashboard compliance, notificações vencimentos, índices adicionais, monitoramento.
MÉDIA: Padronizar sessoes_simulador, relatórios avançados, UI CRUD tipos, upload R2 certificados, testes carga.
BAIXA: Materialização, integrações externas, API pública, multi-tenancy, mobile app.

## CHECKLIST STATUS

- Estrutura: funcionarios OK, tipos OK, histórico normalizado, view OK, FKs pendentes (0068), índices principais OK.
- Funcionalidades: CRUD funcionários (exceto delete cascade), histórico ok. include=all falha schema divergente.
- Integridade: auditoria BEFORE UPDATE ativa; soft delete manual; FKs pendentes.
- Dados: 0 perda; mapeamento qualificacao_id 0%; auditoria operacional.

## MÉTRICAS

Atual pré-0068: endpoints 83% ok, mapeamento 0%, latência ~400ms.
Meta pós-0068: endpoints 100%, mapeamento ≥95%, latência <300ms, auditoria 100%.

## COMANDOS RÁPIDOS

```bash
wrangler d1 export airtrust-db --remote --output="backup_pre_0068_$(date +%Y%m%d_%H%M%S).sql"
wrangler d1 execute airtrust-db --remote --file="migrations/0068_enrich_and_fk.sql"
wrangler deploy
wrangler tail --format pretty
wrangler d1 execute airtrust-db --remote --command "SELECT COUNT(*) FROM qualificacoes_historico;"
```

## LIÇÕES E PRÓXIMA AÇÃO

Usar chunking para grandes migrations, cascata no service, detecção de schema dinâmica, auditoria antes de update, enriquecimento incremental. Próxima ação imediata: aplicar 0068 em staging com backup e validar métricas.

## FIM DO PROMPT CONSOLIDADO
