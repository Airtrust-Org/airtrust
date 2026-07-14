# AirTrust — Esquema de Banco de Dados

> **Versão:** 1.1 | **Data:** 2026-07-14 | **HEAD:** `6d4fe1e8d`
> **Banco:** Cloudflare D1 (SQLite) | **Migrations:** 378 arquivos

## 1. Visão Geral

Cloudflare D1 (SQLite-compatível) com replicação automática na edge.

| Ambiente | Nome |
|---|---|
| Produção | `airtrust-db` (WEUR) |
| Staging | `airtrust-db-staging` |
| Development | `airtrust-db-dev` |
| Local | SQLite via Miniflare |

> **[INTERNO]** Os database IDs (UUIDs Cloudflare) são gerenciados via `wrangler.toml` e não
> devem ser documentados aqui. Consultar o painel Cloudflare ou `wrangler d1 list`.

## 2. Diagrama ER Principal

```mermaid
erDiagram
    empresas ||--o{ usuarios_empresas : "N:N"
    usuarios ||--o{ usuarios_empresas : "N:N"
    empresas ||--o{ funcionarios : "1:N"
    usuarios ||--o| funcionarios : "funcionario_id"
    funcionarios ||--o{ qualificacoes_historico : "1:N"
    qualificacoes_tipos ||--o{ qualificacoes_historico : "1:N"
    funcionarios ||--o{ frms_jornadas : "1:N"
    funcionarios ||--o{ lms_matriculas : "1:N"
    lms_cursos ||--o{ lms_matriculas : "1:N"
    funcionarios ||--o{ simulador_agendamentos : "1:N"
    simulador_sessoes ||--o{ simulador_agendamentos : "1:N"
    simulador_sessoes ||--o{ fichas_sessao : "1:N"
    funcionarios ||--o{ fichas_sessao : "avaliado_id"
    empresas ||--o{ notificacoes_sistema : "1:N"
    funcionarios ||--o{ sgso_relatos : "1:N"
    funcionarios ||--o{ escalas_eventos : "1:N"
    escalas ||--o{ escalas_eventos : "1:N"
    funcionarios ||--o{ documentos : "1:N"

    empresas {
        int id PK
        string nome
        string codigo UK
        string dominio
        string plano "basic/pro/enterprise"
        boolean ativo
        datetime created_at
        datetime deleted_at
    }

    usuarios {
        int id PK
        string email UK
        string password_hash
        string nome
        string perfil
        int funcionario_id FK
    }

    funcionarios {
        int id PK
        int empresa_id FK
        string nome
        string matricula
        string funcao
        string setor
        string aeronave
        boolean ativo
        boolean is_instrutor
        datetime created_at
        datetime deleted_at
    }

    qualificacoes_historico {
        int id PK
        int empresa_id FK
        int funcionario_id FK
        int qualificacao_id FK
        date data_conclusao
        date data_vencimento
        string status "VALIDA/VENCIDA/RENOVADA"
        string codigo
        datetime created_at
        datetime deleted_at
    }

    lms_cursos {
        int id PK
        int empresa_id FK
        string nome
        string tipo "scorm/h5p/video/pdf/pptx"
        int validade_meses
        boolean ativo
    }

    lms_matriculas {
        int id PK
        int empresa_id FK
        int usuario_id FK
        int curso_id FK
        string status "EM_ANDAMENTO/CONCLUIDO"
        float progresso
        date data_expiracao
    }
```

## 3. Tabelas por Módulo

### Core / Multi-Tenant
`empresas`, `usuarios`, `usuarios_empresas`, `convites_usuarios`, `password_reset_tokens`,
`refresh_tokens`, `token_blocklist`, `token_reset_tokens`, `rate_limit_store`

### Qualificações
`qualificacoes_tipos`, `qualificacoes_historico`, `qualificacoes_reclass_queue`,
`categorias`, `certificados`, `certificados_modelos`

### FRMS
`frms_jornada`, `frms_fatorizacao`, `frms_acumulo_rolling`, `frms_alerta`,
`frms_escala_quinzenal`, `frms_configuracao_limites`, `frms_fadiga_checkin`,
`frms_justificativas` (0356), `frms_explicacao_dia_cache` (0357),
`frms_jornada_origem_sigvoos` (0351), `frms_read_ack_events` (0384), `frms_fadiga_evento`

### Escalas
`escalas`, `escalas_eventos`, `escalas_tripulacoes`, `escalas_confirmacoes`

### LMS
`lms_cursos` (0335), `lms_matriculas` (0336), `lms_progresso_scorm` (0337),
`lms_h5p_conteudos` (0337), `lms_xapi_statements` (0339), `lms_matricula_ciclos` (0346),
`lms_historico_legado_edapp` (0342)

### Simuladores
`simuladores`, `simulador_sessoes`, `simulador_agendamentos`, `fichas_sessao`,
`fichas_sessao_edicoes`, `modelos_sessao`, `manobras`, `modelos_aeronave`,
`sessoes_participantes`, `simulador_atribuicoes_curriculares`,
`simulador_agendamento_segmentos`, `simulador_segmento_atribuicoes`,
`simulador_segmento_participantes`, `modelos_sessao_requisitos`,
`fichas_sessao_instrutor_meta`

### SGSO
`sgso_relatos`, `sgso_auditorias`, `sgso_nao_conformidades`, `sgso_acoes`,
`sgso_avaliacoes_risco`, `sgso_fatores_humanos`

### Outras
`funcionarios`, `funcoes`, `setores`, `setores_gestores`, `aeronaves`,
`modelos_aeronave`, `licencas`, `habilitacoes`, `horas_voo`, `hospedagem`,
`pasta_virtual`, `documentos`, `notificacoes_sistema`, `alertas_whatsapp_templates`,
`backups_controle`, `backups_logs`, `matriz_treinamento_registros`,
`requisitos_compliance`, `integracoes_sigvoos_*` (4), `auditoria`, `auditoria_avancada_v2`

## 4. Migrations

### Nomenclatura: `NNNN_descricao_em_snake_case.sql`

Ordem de aplicação: **alfabética** pelo nome do arquivo.

### Migrations Recentes (0408–0429)

| # | Descrição |
|---|---|
| 0408 | LMS cursos ↔ setores |
| 0409 | Backfill LMS cursos ↔ setores |
| 0410 | Controle de voos N1 schema |
| 0411 | Integração SIGVOOS schema |
| 0412 | Classificação de qualificações |
| 0413 | NOTECHS categoria por item |
| 0414 | `manobras.referencias_json` |
| 0415 | `qualificacoes_historico_v.tipo_treinamento` |
| 0416 | Reconcile do ledger D1 |
| 0417 | `tripulante` em `modelos_sessao_manobras` |
| 0418 | NOTECHS categorizados |
| 0419 | Normalização PT-BR de modelos |
| 0420 | `notificacoes_log.empresa_id` |
| 0421 | Sessões compartilhadas por segmento |
| 0422 | `modelos_sessao_requisitos` |
| 0423 | Multi-currículo por participante |
| 0424 | Fichas universais de examinador |
| 0425 | Event models com atribuição curricular |
| 0426 | SK76 nomenclatura periódica |
| 0427 | SK76 caixa mista |
| 0428 | AW139 códigos periódicos |
| 0429 | Modelos de instrutor e metadados canônicos |

## 4.1 Baseline formal de produção

Desde 2026-07-14 o schema de produção passa a ser governado por:

- snapshot read-only versionado em [docs/database/production-schema-snapshot-20260714/README.md](/Users/filipedaumas/SAAS/Airtrust-worktrees/schema-baseline-v2-20260714/docs/database/production-schema-snapshot-20260714/README.md);
- contrato versionado em [docs/database/schema-contracts/production-d1-baseline-v2.json](/Users/filipedaumas/SAAS/Airtrust-worktrees/schema-baseline-v2-20260714/docs/database/schema-contracts/production-d1-baseline-v2.json);
- ledger V2 em `worker-airtrust/schema-v2/`.

Regras operacionais:

- `COMPARACAO_ESTATICA_NAO_EXECUTADA`: o corpus histórico de migrations não foi replayado localmente para gerar este baseline;
- `simuladores` deve ser tratado como catálogo compartilhado, não como tabela tenant-scoped;
- `sessoes_participantes` não tem `empresa_id`;
- `modelos_sessao` usa `tipo_sessao_id`, não `tipo_sessao_codigo`;
- presença do arquivo `.sql` no repositório não comprova aplicação em `d1_migrations`.

## 5. Migrations com Número Duplicado

**30 números** com duplicatas. Principais:

| Número | Arquivo A | Arquivo B |
|---|---|---|
| **0332** | `create_audit_logs_compatible` | `normalize_edapp_historical_renewals` |
| **0347** | `lms_cursos_content_filename` | `lms_edapp_tenant_indexes` |
| **0367** | `classificar_dificuldade_sk76` | `sk76_reaquisicao_experiencia` |

**Risco**: Ordem alfabética determina aplicação. Sem dependências cruzadas atualmente,
mas risco existe para futuras duplicatas.

## 6. Auto-Migration no Cold Start

`runApiBootstrap` (invocado no primeiro request) verifica e cria tabelas críticas
(ex: `documentos` se migration 0388 não aplicada).

## 7. Setup Local

```bash
npm run setup:local        # Primeira vez
npm run setup:local:reset  # Reset completo
npm run db:status          # Listar tabelas
```

Banco local: `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite`

## 8. Índices

Padrão predominante: `empresa_id`, `deleted_at`, composite `(empresa_id, deleted_at)`.

Exceções confirmadas no baseline de produção:
- `simuladores` não possui `empresa_id`;
- `sessoes_participantes` não possui `empresa_id`.

Específicos por performance:
- `qualificacoes_historico`: `(funcionario_id, deleted_at)`, `(qualificacao_id, deleted_at)`
- `frms_jornada`: `(tripulante_id, data)`
- `frms_alerta`: `(tripulante_id, nivel, resolvido)`
- `lms_matriculas`: `(usuario_id, deleted_at)`, `(curso_id, deleted_at)`
- `simulador_agendamentos`: `(sessao_id, deleted_at)`
- `escalas_eventos`: `(escala_id, data)`

Migrations de índices: 0261 (FRMS), 0338 (LMS), 0350 (composite deleted_at)

## 9. Soft Delete

Padrão: coluna `deleted_at TEXT` (NULL = ativo). "Delete" = `UPDATE ... SET deleted_at = datetime('now')`.

Exceções (hard delete): `token_blocklist`, `refresh_tokens`, `password_reset_tokens`, `rate_limit_store`

## 10. Convenções

| Elemento | Convenção | Exemplo |
|---|---|---|
| Tabelas | `snake_case` | `qualificacoes_tipos` |
| Colunas | `snake_case` | `data_conclusao` |
| PK | `id INTEGER PRIMARY KEY AUTOINCREMENT` | Padrão SQLite |
| FK | `entidade_id` | `funcionario_id` |
| Datas | `TEXT` ISO 8601 | `2026-06-12T14:30:00.000Z` |
| Booleanos | `INTEGER` 0/1 | `ativo`, `is_instrutor` |
| Soft delete | `deleted_at TEXT` | NULL = ativo |
| Timestamps | `created_at TEXT`, `updated_at TEXT` | ISO 8601 |
