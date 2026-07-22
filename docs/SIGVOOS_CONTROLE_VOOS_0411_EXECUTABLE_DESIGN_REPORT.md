# SIGVOOS -> Controle de Voos: 0411 Executable Design Report

Data: 2026-06-15

## 1. Veredito

**Veredito: DESIGN 0411 FECHADO.**

Este relatorio fecha o desenho tecnico executavel da futura 0411, com contrato de schema,
testes obrigatorios, rollback local e criterios de aceite. Ele nao cria a migration 0411,
nao aplica migration, nao altera staging, nao altera producao, nao executa deploy e nao muda
o FRMS canonico.

A futura 0411 deve ser uma alteracao **aditiva** para preparar o Controle de Voos N1 a receber,
em fase posterior, dados SIGVOOS com granularidade de etapa. O caminho direto atual SIGVOOS -> FRMS
permanece intacto ate uma fase futura de shadow mode e virada controlada.

## 2. Estado inicial registrado

Comandos exigidos nesta etapa:

```text
git status --short --branch
## main...origin/main [ahead 1]

git rev-parse HEAD
6ce7dd902dfd6de34f51738c2d3bdb50f310a398

git rev-parse origin/main
6495cd409583872bb58ae79c36c737441298a7f6
```

Auditoria complementar de inicio:

```text
pwd
<AIRTRUST_ROOT>

git branch --show-current
main

git rev-list --left-right --count origin/main...HEAD
0	1
```

Working tree inicial: limpo.

Revalidacao da etapa em 2026-06-15, apos o relatorio ter sido criado como artefato local:

```text
git status --short --branch
## main...origin/main [ahead 1]
?? docs/MANUTENCAO_FUNCIONARIOS_RECONCILIACAO_JUNHO26.md
?? docs/SIGVOOS_CONTROLE_VOOS_0411_EXECUTABLE_DESIGN_REPORT.md

git rev-parse HEAD
6ce7dd902dfd6de34f51738c2d3bdb50f310a398

git rev-parse origin/main
6495cd409583872bb58ae79c36c737441298a7f6
```

`docs/MANUTENCAO_FUNCIONARIOS_RECONCILIACAO_JUNHO26.md` e arquivo nao versionado fora do escopo
desta etapa e foi preservado sem leitura, stage ou alteracao.

## 3. Referencias revisadas

- `docs/SIGVOOS_CONTROLE_VOOS_PRE_IMPLEMENTATION_DECISION_REPORT.md`
- `docs/AUDITORIA_SIGVOOS_CONTROLE_VOOS_FRMS.md`
- `docs/DECISOES_FASE0_SIGVOOS_CONTROLE_VOOS_FRMS.md`
- `docs/PLANO_MIGRACAO_SIGVOOS_PARA_CONTROLE_VOOS.md`
- `docs/CONTROLE_DE_VOOS_N1_SCHEMA_0411_DESIGN.md`
- `worker-airtrust/migrations/0410_controle_voos_n1_schema.sql`

## 4. Estado atual da 0410

A migration `0410_controle_voos_n1_schema.sql` cria hoje estas tabelas `cv_*`:

- `cv_aeroportos`
- `cv_tipos_voo`
- `cv_naturezas_voo`
- `cv_motivos_operacionais`
- `cv_voos`
- `cv_rdv_operacional`
- `cv_voo_tripulantes`
- `cv_voo_eventos`

O schema atual cobre a operacao manual N1: catalogos, voo, RDV operacional, tripulantes por voo
e eventos de auditoria. Ele ainda nao cobre:

- etapa/perna do voo;
- rastreabilidade SIGVOOS em `cv_voos`;
- staging raw sanitizado SIGVOOS;
- idempotencia por `flight_report.id`;
- idempotencia por `flight_report_leg.number`;
- idempotencia por `staff.id`;
- conflitos auditaveis entre valor AirTrust e valor externo recebido;
- ponte CV -> FRMS.

## 5. Alteracoes aditivas necessarias na futura 0411

A 0411 futura deve fazer somente mudancas de schema:

1. Criar `cv_voo_etapas`.
2. Criar `cv_sigvoos_staging`.
3. Criar `cv_conflitos_integracao`.
4. Adicionar colunas nullable/default em `cv_voos`.
5. Adicionar colunas nullable em `cv_voo_tripulantes`.
6. Criar indices parciais para idempotencia.
7. Preservar voos manuais N1 sem exigir nenhum campo SIGVOOS.

Nao entra na 0411:

- importador SIGVOOS -> CV;
- adaptador CV -> FRMS;
- alteracao de `frms-source-policy.ts`;
- alteracao de origem canonica FRMS;
- deploy;
- backfill;
- seed com dado real;
- chamada a Cloudflare, D1 remoto, R2 ou secrets.

## 6. Contrato de schema proposto

Todo SQL abaixo e **design conceitual nao aplicavel nesta etapa**. A futura PR tecnica deve converter
este contrato em `worker-airtrust/migrations/0411_*` apenas apos uma decisao separada.

### 6.1 Nova tabela `cv_voo_etapas`

```sql
-- DESIGN 0411 - NAO EXECUTAR NESTA ETAPA
CREATE TABLE IF NOT EXISTS cv_voo_etapas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  voo_id INTEGER NOT NULL,
  numero_etapa INTEGER NOT NULL,
  sigvoos_leg_number INTEGER,
  origem_icao TEXT,
  destino_icao TEXT,
  horario_motor_ligado TEXT,
  horario_decolagem TEXT,
  horario_pouso TEXT,
  horario_motor_desligado TEXT,
  tempo_decolagem_pouso TEXT,
  tempo_total TEXT,
  tempo_navegacao TEXT,
  tempo_ifr TEXT,
  tempo_noturno TEXT,
  pousos_diurnos INTEGER,
  pousos_noturnos INTEGER,
  starts INTEGER,
  pax INTEGER,
  payload REAL,
  combustivel_inicio REAL,
  combustivel_fim REAL,
  unidade_combustivel TEXT,
  origem_dados TEXT NOT NULL DEFAULT 'MANUAL',
  sigvoos_importado_em TEXT,
  sigvoos_content_hash TEXT,
  metadata_sigvoos_json TEXT,
  created_by INTEGER,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (voo_id) REFERENCES cv_voos(id),
  CHECK (numero_etapa >= 1),
  CHECK (origem_dados IN ('MANUAL', 'SIGVOOS')),
  CHECK (pousos_diurnos IS NULL OR pousos_diurnos >= 0),
  CHECK (pousos_noturnos IS NULL OR pousos_noturnos >= 0),
  CHECK (starts IS NULL OR starts >= 0),
  CHECK (pax IS NULL OR pax >= 0),
  CHECK (payload IS NULL OR payload >= 0),
  CHECK (combustivel_inicio IS NULL OR combustivel_inicio >= 0),
  CHECK (combustivel_fim IS NULL OR combustivel_fim >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cv_voo_etapas_empresa_voo_leg
  ON cv_voo_etapas (empresa_id, voo_id, sigvoos_leg_number)
  WHERE sigvoos_leg_number IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_voo_etapas_empresa_voo_numero
  ON cv_voo_etapas (empresa_id, voo_id, numero_etapa)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_voo_etapas_empresa_importado
  ON cv_voo_etapas (empresa_id, sigvoos_importado_em)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_voo_etapas_empresa_deleted
  ON cv_voo_etapas (empresa_id, deleted_at);
```

Regra de deduplicacao por etapa: quando houver `sigvoos_leg_number`, a chave e
`(empresa_id, voo_id, sigvoos_leg_number)`. Etapas sem `sigvoos_leg_number` continuam permitidas
para compatibilidade com fluxo manual ou fallback controlado.

### 6.2 Novas colunas em `cv_voos`

```sql
-- DESIGN 0411 - NAO EXECUTAR NESTA ETAPA
ALTER TABLE cv_voos ADD COLUMN sigvoos_flight_report_id INTEGER;
ALTER TABLE cv_voos ADD COLUMN sigvoos_flight_report_id_confident INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cv_voos ADD COLUMN sigvoos_report_number TEXT;
ALTER TABLE cv_voos ADD COLUMN sigvoos_flight_number TEXT;
ALTER TABLE cv_voos ADD COLUMN sigvoos_importado_em TEXT;
ALTER TABLE cv_voos ADD COLUMN sigvoos_content_hash TEXT;
ALTER TABLE cv_voos ADD COLUMN origem_importacao TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE cv_voos ADD COLUMN campos_editados_json TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cv_voos_empresa_sigvoos_fr_id
  ON cv_voos (empresa_id, sigvoos_flight_report_id)
  WHERE sigvoos_flight_report_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cv_voos_empresa_origem_importacao
  ON cv_voos (empresa_id, origem_importacao, data_programacao)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_voos_empresa_sigvoos_importado
  ON cv_voos (empresa_id, sigvoos_importado_em)
  WHERE deleted_at IS NULL;
```

Contrato obrigatorio:

- `sigvoos_flight_report_id` e nullable.
- O indice unico parcial so se aplica quando `sigvoos_flight_report_id IS NOT NULL`.
- A deduplicacao forte de voo e `(empresa_id, sigvoos_flight_report_id)` quando o ID existe.
- Registros manuais N1 continuam validos com `sigvoos_flight_report_id = NULL`.
- `origem_importacao` recebe `DEFAULT 'MANUAL'` para preservar todos os dados existentes.
- CHECK em coluna adicionada por `ALTER TABLE` deve ser evitado na 0411 para manter compatibilidade SQLite/D1; se a regra for necessaria, aplicar em codigo ou em migration futura de recriacao controlada de tabela.

### 6.3 Novas colunas em `cv_voo_tripulantes`

```sql
-- DESIGN 0411 - NAO EXECUTAR NESTA ETAPA
ALTER TABLE cv_voo_tripulantes ADD COLUMN etapa_id INTEGER;
ALTER TABLE cv_voo_tripulantes ADD COLUMN sigvoos_staff_id INTEGER;
ALTER TABLE cv_voo_tripulantes ADD COLUMN sigvoos_staff_inscription TEXT;
ALTER TABLE cv_voo_tripulantes ADD COLUMN funcao_origem TEXT;
ALTER TABLE cv_voo_tripulantes ADD COLUMN resolucao_funcionario_fonte TEXT;
ALTER TABLE cv_voo_tripulantes ADD COLUMN sigvoos_content_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cv_voo_tripulantes_empresa_etapa_staff
  ON cv_voo_tripulantes (empresa_id, etapa_id, sigvoos_staff_id)
  WHERE etapa_id IS NOT NULL AND sigvoos_staff_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_voo_tripulantes_empresa_etapa
  ON cv_voo_tripulantes (empresa_id, etapa_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_voo_tripulantes_empresa_sigvoos_staff
  ON cv_voo_tripulantes (empresa_id, sigvoos_staff_id)
  WHERE sigvoos_staff_id IS NOT NULL AND deleted_at IS NULL;
```

Contrato obrigatorio:

- `etapa_id` e nullable para retrocompatibilidade com voos manuais.
- A deduplicacao por tripulante importado e `(empresa_id, etapa_id, sigvoos_staff_id)` quando
  `etapa_id` e `sigvoos_staff_id` existem.
- `sigvoos_staff_inscription` deve armazenar o valor recebido convertido para texto.
- A normalizacao operacional de `staff.inscription` para match local e:

```text
String(staff.inscription ?? '')
  -> remover nao digitos
  -> padStart(5, '0')
```

- CANAC nao e premissa para resolver tripulante.
- Se o funcionario nao for resolvido, nao criar `cv_voo_tripulantes` sem `funcionario_id` valido;
  registrar conflito ou erro de staging sanitizado.

### 6.4 Nova tabela `cv_sigvoos_staging`

```sql
-- DESIGN 0411 - NAO EXECUTAR NESTA ETAPA
CREATE TABLE IF NOT EXISTS cv_sigvoos_staging (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  sigvoos_flight_report_id INTEGER,
  sigvoos_leg_number INTEGER,
  sigvoos_staff_id INTEGER,
  data_operacional TEXT NOT NULL,
  source_window_start TEXT NOT NULL,
  source_window_end TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  payload_sanitizado_json TEXT,
  import_status TEXT NOT NULL DEFAULT 'PENDING',
  cv_voo_id INTEGER,
  cv_etapa_id INTEGER,
  cv_tripulante_id INTEGER,
  tentativas INTEGER NOT NULL DEFAULT 0,
  erro_msg TEXT,
  processado_em TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  CHECK (import_status IN ('PENDING', 'PROCESSED', 'ERROR', 'IGNORED', 'CONFLICT')),
  CHECK (tentativas >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cv_sigvoos_staging_empresa_hash
  ON cv_sigvoos_staging (empresa_id, payload_hash)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_sigvoos_staging_empresa_status_data
  ON cv_sigvoos_staging (empresa_id, import_status, data_operacional)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_sigvoos_staging_empresa_fr_id
  ON cv_sigvoos_staging (empresa_id, sigvoos_flight_report_id)
  WHERE sigvoos_flight_report_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_sigvoos_staging_empresa_window
  ON cv_sigvoos_staging (empresa_id, source_window_start, source_window_end)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_sigvoos_staging_empresa_deleted
  ON cv_sigvoos_staging (empresa_id, deleted_at);
```

Contrato obrigatorio:

- `payload_sanitizado_json` nunca deve conter token, senha, secret ou credencial.
- O hash deve ser deterministico sobre payload sanitizado/canonico suficiente para detectar repeticao e alteracao retroativa sem gravar dado sensivel.
- `sigvoos_flight_report_id` e nullable tambem no staging.
- Quando `flight_report.id` vier ausente, o importador futuro deve calcular fallback hash e manter `sigvoos_flight_report_id_confident = 0` no voo resultante.

Fallback minimo quando `flight_report.id` estiver ausente:

```text
empresa_id
+ data_operacional
+ aircraft_registration, se existir
+ engine_start_time_str
+ departure_location.icao_code
```

Se o fallback nao puder ser calculado, o staging deve ir para `ERROR` ou `CONFLICT` com erro sanitizado.
O fallback nao pode ser tratado como identidade definitiva silenciosa.

### 6.5 Nova tabela `cv_conflitos_integracao`

```sql
-- DESIGN 0411 - NAO EXECUTAR NESTA ETAPA
CREATE TABLE IF NOT EXISTS cv_conflitos_integracao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  entidade_tipo TEXT NOT NULL,
  entidade_id INTEGER NOT NULL,
  campo TEXT NOT NULL,
  valor_airtrust TEXT,
  valor_sigvoos TEXT,
  staging_id TEXT,
  severidade TEXT NOT NULL DEFAULT 'MEDIA',
  status TEXT NOT NULL DEFAULT 'ABERTO',
  resolvido_por INTEGER,
  resolvido_em TEXT,
  decisao TEXT,
  justificativa TEXT,
  created_by INTEGER,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  CHECK (entidade_tipo IN ('voo', 'etapa', 'tripulante')),
  CHECK (severidade IN ('BAIXA', 'MEDIA', 'ALTA', 'CRITICA')),
  CHECK (status IN ('ABERTO', 'RESOLVIDO', 'IGNORADO')),
  CHECK (decisao IS NULL OR decisao IN ('MANTER_AIRTRUST', 'ACEITAR_SIGVOOS', 'IGNORAR'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cv_conflitos_empresa_entidade_campo_aberto
  ON cv_conflitos_integracao (empresa_id, entidade_tipo, entidade_id, campo)
  WHERE status = 'ABERTO' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_conflitos_empresa_status_severidade
  ON cv_conflitos_integracao (empresa_id, status, severidade, created_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_conflitos_empresa_staging
  ON cv_conflitos_integracao (empresa_id, staging_id)
  WHERE staging_id IS NOT NULL AND deleted_at IS NULL;
```

Contrato obrigatorio:

- Conflitos devem ser registrados, nao resolvidos silenciosamente.
- Campos editados manualmente no AirTrust nao devem ser sobrescritos automaticamente.
- No maximo um conflito aberto por `(empresa_id, entidade_tipo, entidade_id, campo)`.
- Valores devem ser serializados como texto sanitizado.

## 7. Fixtures sanitizadas minimas para a futura PR tecnica

Se a futura PR tecnica precisar de fixtures, elas devem ser sinteticas e sanitizadas. Nenhuma fixture
deve conter dados reais, credenciais, tokens ou identificadores pessoais reconheciveis.

Conjunto minimo:

1. `sigvoos-com-flight-report-id.json`
   - contem `flight_report.id`;
   - contem `flight_report.report_number`;
   - contem `flight_report.flight_number`;
   - contem `flight_report_leg.number`;
   - contem `staff.id`.

2. `sigvoos-sem-flight-report-id.json`
   - nao contem `flight_report.id`;
   - contem campos suficientes para fallback hash;
   - deve resultar em `sigvoos_flight_report_id = NULL`.

3. `sigvoos-com-staff-id.json`
   - contem `staff.id`;
   - permite deduplicacao por `(empresa_id, etapa_id, sigvoos_staff_id)`.

4. `sigvoos-apenas-staff-inscription.json`
   - nao depende de CANAC;
   - contem `staff.inscription` como numero e como string em casos separados;
   - valida normalizacao para 5 digitos.

5. `sigvoos-sem-canac.json`
   - garante que a ausencia de CANAC nao bloqueia staging;
   - se funcionario nao resolver, gera conflito/pendencia sanitizada.

## 8. Testes obrigatorios antes de qualquer aplicacao futura

A futura PR tecnica da 0411 deve incluir testes locais antes de qualquer aplicacao fora do ambiente
local:

- Migration local cria `cv_voo_etapas`, `cv_sigvoos_staging` e `cv_conflitos_integracao`.
- Migration local adiciona todas as colunas esperadas em `cv_voos`.
- Migration local adiciona todas as colunas esperadas em `cv_voo_tripulantes`.
- Migration e aditiva: nenhuma tabela/coluna existente da 0410 e removida.
- Voos manuais continuam validos sem campos SIGVOOS.
- `sigvoos_flight_report_id NULL` nao quebra importacao/staging.
- Indice parcial de `cv_voos` permite multiplos `NULL`.
- Indice parcial de `cv_voos` bloqueia duplicidade quando `sigvoos_flight_report_id` existe na mesma empresa.
- O mesmo `sigvoos_flight_report_id` pode existir em empresas diferentes.
- Idempotencia por etapa bloqueia duplicidade de `(empresa_id, voo_id, sigvoos_leg_number)`.
- Idempotencia por tripulante bloqueia duplicidade de `(empresa_id, etapa_id, sigvoos_staff_id)`.
- Tenant isolation por `empresa_id` em voos, etapas, staging, tripulantes e conflitos.
- Hash de payload sanitizado e deterministico.
- Fixture sem `flight_report.id` usa fallback hash e marca baixa confianca.
- Fixture sem funcionario resolvido registra `CONFLICT` ou erro sanitizado.
- `staff.inscription` numerico e string normalizam para a mesma matricula de 5 digitos.
- CANAC ausente nao impede staging nem e chave primaria.
- Rollback local documentado e validado em banco local descartavel.

## 9. Rollback local

Rollback local da 0411 futura deve ser testado apenas em banco local descartavel.

Como a 0411 sera aditiva, o rollback local conceitual e:

```sql
-- DESIGN DE ROLLBACK LOCAL - NAO EXECUTAR NESTA ETAPA
DROP INDEX IF EXISTS idx_cv_conflitos_empresa_staging;
DROP INDEX IF EXISTS idx_cv_conflitos_empresa_status_severidade;
DROP INDEX IF EXISTS idx_cv_conflitos_empresa_entidade_campo_aberto;
DROP TABLE IF EXISTS cv_conflitos_integracao;

DROP INDEX IF EXISTS idx_cv_sigvoos_staging_empresa_deleted;
DROP INDEX IF EXISTS idx_cv_sigvoos_staging_empresa_window;
DROP INDEX IF EXISTS idx_cv_sigvoos_staging_empresa_fr_id;
DROP INDEX IF EXISTS idx_cv_sigvoos_staging_empresa_status_data;
DROP INDEX IF EXISTS idx_cv_sigvoos_staging_empresa_hash;
DROP TABLE IF EXISTS cv_sigvoos_staging;

DROP INDEX IF EXISTS idx_cv_voo_tripulantes_empresa_sigvoos_staff;
DROP INDEX IF EXISTS idx_cv_voo_tripulantes_empresa_etapa;
DROP INDEX IF EXISTS idx_cv_voo_tripulantes_empresa_etapa_staff;

DROP INDEX IF EXISTS idx_cv_voos_empresa_sigvoos_importado;
DROP INDEX IF EXISTS idx_cv_voos_empresa_origem_importacao;
DROP INDEX IF EXISTS idx_cv_voos_empresa_sigvoos_fr_id;

DROP INDEX IF EXISTS idx_cv_voo_etapas_empresa_deleted;
DROP INDEX IF EXISTS idx_cv_voo_etapas_empresa_importado;
DROP INDEX IF EXISTS idx_cv_voo_etapas_empresa_voo_numero;
DROP INDEX IF EXISTS idx_cv_voo_etapas_empresa_voo_leg;
DROP TABLE IF EXISTS cv_voo_etapas;
```

Colunas adicionadas por `ALTER TABLE` em SQLite/D1 exigem cuidado. Se a versao local suportar
`ALTER TABLE ... DROP COLUMN`, a futura PR pode validar rollback completo. Caso contrario, o rollback
documentado deve limitar-se a banco local descartavel ou recriacao controlada de tabela. Esse limite
deve estar explicito na PR tecnica antes de qualquer aplicacao fora do local.

## 10. Lista de arquivos esperada em futura PR tecnica

Uma futura PR tecnica de implementacao da 0411 deve conter, no minimo:

- `worker-airtrust/migrations/0411_controle_voos_sigvoos_traceability.sql`
- teste local de migration cobrindo criacao de tabelas, colunas e indices;
- fixtures sanitizadas sinteticas sob diretorio de testes;
- documentacao curta de rollback local, se nao ficar neste relatorio;
- atualizacao controlada de documentacao do schema, se necessario.

Nao deve conter nessa PR, salvo decisao separada:

- importador SIGVOOS -> CV;
- adaptador CV -> FRMS;
- alteracao de `worker-airtrust/src/lib/frms/frms-source-policy.ts`;
- mudanca em origem canonica FRMS;
- deploy scripts;
- credenciais ou dados reais.

## 11. Riscos restantes

- `flight_report.id` pode estar ausente em parte dos payloads; por isso o campo fica nullable.
- Estabilidade de `flight_report_leg.number` ainda precisa ser confirmada empiricamente.
- Timezone oficial dos horarios SIGVOOS ainda nao esta fechado.
- `staff.inscription` pode vir em formatos diferentes; a normalizacao precisa ser testada.
- CANAC nao deve ser usado como premissa porque pode nao existir no payload.
- Resolucao por nome fuzzy, se existir no futuro, deve ser baixa confianca e auditavel.
- SQLite/D1 limita rollback de colunas adicionadas por `ALTER TABLE`.
- Importador futuro precisa proteger campos editados manualmente e registrar conflitos.

## 12. Criterios de aceite

Este design esta aceito para futura implementacao tecnica somente se a futura PR cumprir:

- migration 0411 existe apenas em PR tecnica futura, nao nesta etapa;
- migration local passa em banco descartavel;
- todas as estruturas novas sao criadas;
- todas as alteracoes sao aditivas;
- voos manuais N1 continuam funcionando sem campos SIGVOOS;
- indices parciais comprovam multiplos `NULL` e bloqueio de duplicidade com ID;
- idempotencia por voo, etapa e tripulante esta testada;
- tenant isolation por `empresa_id` esta testado;
- fixtures sao sinteticas e sanitizadas;
- conflitos sao registrados quando nao houver resolucao de funcionario ou houver divergencia de campo protegido;
- rollback local esta documentado;
- nenhuma alteracao e feita no FRMS canonico;
- `frms-source-policy.ts` permanece intocado.

## 13. Confirmacoes desta etapa

- Nenhuma migration 0411 foi criada.
- Nenhuma migration foi aplicada.
- Nenhum deploy foi executado.
- Staging nao foi tocado.
- Producao nao foi tocada.
- Cloudflare, D1 remoto, R2 e secrets nao foram usados.
- FRMS canonico nao foi alterado.
- `worker-airtrust/src/lib/frms/frms-source-policy.ts` nao foi alterado.
- Controle de Voos nao foi declarado fonte canonica do FRMS nesta etapa.
- SIGVOOS, APUS, Diario de Bordo, eDB, SDRMe e papel nao foram substituidos.
