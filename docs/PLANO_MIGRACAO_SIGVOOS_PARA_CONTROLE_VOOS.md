# Plano de Migração: SIGVOOS → Controle de Voos → FRMS

> Data: 2026-06-14 | Operacional e objetivo | Sem alterações de código

---

## Visão Geral

| | Hoje | Destino |
|---|---|---|
| Fonte canônica do FRMS | SIGVOOS direto (`syncSigvoosForFrms`) | Controle de Voos AirTrust |
| Tabela de entrada FRMS | `frms_jornada` com `origem='SIGVOOS'` | `frms_jornada` derivada de `cv_voo_tripulantes` |
| Edição manual | Não existe (via UI FIRA separada) | `cv_voos` + flag `editado_manualmente` |
| Rastreabilidade por voo | Apenas log em `integracoes_sigvoos_eventos` | `cv_voo_eventos` por voo + staging raw |

**Princípio:** o caminho antigo nunca é desligado antes do shadow mode validar equivalência dos resultados.

---

## Fases da Implementação

### Fase 0 — Decisões e Pré-requisitos

**Duração estimada**: 1–2 semanas (não tem código, só decisões)

**Ações:**
1. Confirmar com o fornecedor SIGVOOS se a API expõe `voo_id` ou `etapa_id` estável
2. Decidir: nova origem `'CONTROLE_VOOS'` no FRMS ou manter `'SIGVOOS'` como alias?
3. Definir granularidade no CV: etapas individuais ou voos consolidados?
4. Definir política de campos protegidos vs. campos livres para sobrescrita do SIGVOOS
5. Definir janela de backfill histórico (quantos meses)

**Critério de saída:** todas as 10 decisões da auditoria documentadas e aprovadas

---

### Fase 1 — Schema / Migration

**Duração estimada**: 3–5 dias

**Alterações de banco (não implementar antes das decisões da Fase 0):**

#### 1A. Extensões em `cv_voos`
```sql
ALTER TABLE cv_voos ADD COLUMN sigvoos_voo_id TEXT;
ALTER TABLE cv_voos ADD COLUMN sigvoos_sync_at TEXT;
ALTER TABLE cv_voos ADD COLUMN sigvoos_payload_json TEXT;
ALTER TABLE cv_voos ADD COLUMN origem_importacao TEXT NOT NULL DEFAULT 'MANUAL'
  CHECK(origem_importacao IN ('MANUAL','SIGVOOS','CV_INTERNO'));
ALTER TABLE cv_voos ADD COLUMN campos_editados_json TEXT;
ALTER TABLE cv_voos ADD COLUMN conflito_sigvoos_json TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cv_voos_empresa_sigvoos_id
  ON cv_voos(empresa_id, sigvoos_voo_id)
  WHERE sigvoos_voo_id IS NOT NULL AND deleted_at IS NULL;
```

#### 1B. Extensões em `cv_voo_tripulantes`
```sql
ALTER TABLE cv_voo_tripulantes ADD COLUMN sigvoos_identificador TEXT;
ALTER TABLE cv_voo_tripulantes ADD COLUMN sigvoos_canac TEXT;
ALTER TABLE cv_voo_tripulantes ADD COLUMN horas_voo_min INTEGER;
ALTER TABLE cv_voo_tripulantes ADD COLUMN tempo_noturno_min INTEGER;
ALTER TABLE cv_voo_tripulantes ADD COLUMN tempo_ifr_min INTEGER;
ALTER TABLE cv_voo_tripulantes ADD COLUMN jornada_frms_id TEXT;
ALTER TABLE cv_voo_tripulantes ADD COLUMN jornada_derivada_em TEXT;
ALTER TABLE cv_voo_tripulantes ADD COLUMN fonte_resolucao TEXT;
```

#### 1C. Nova tabela `cv_sigvoos_staging`
```sql
CREATE TABLE IF NOT EXISTS cv_sigvoos_staging (
  id             TEXT PRIMARY KEY,
  empresa_id     INTEGER NOT NULL,
  data_voo       TEXT NOT NULL,
  sigvoos_leg_id TEXT,
  payload_raw    TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'PENDING'
                 CHECK(status IN ('PENDING','PROCESSED','IGNORED','CONFLICT','ERROR')),
  cv_voo_id      INTEGER,
  cv_tripulante_id INTEGER,
  erro_msg       TEXT,
  processado_em  TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_cv_sigvoos_staging_empresa_data
  ON cv_sigvoos_staging(empresa_id, data_voo) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cv_sigvoos_staging_status
  ON cv_sigvoos_staging(empresa_id, status) WHERE deleted_at IS NULL;
```

**Riscos desta fase:**
- Campos NULLABLE, sem DEFAULT restritivo → sem risco de regressão nos dados existentes
- Schema aditivo puro

**Rollback:**
- `ALTER TABLE ... DROP COLUMN` (SQLite ≥ 3.35) ou recriar a tabela sem os campos
- `DROP TABLE cv_sigvoos_staging`

**Critério de aceite:**
- Migration aplicada em local e CI/CD passa
- `PRAGMA table_info('cv_voos')` e `cv_voo_tripulantes` mostram novos campos
- Testes existentes de controle-voos continuam passando

---

### Fase 2 — Importador SIGVOOS → CV

**Duração estimada**: 2–3 semanas

**Arquivo novo**: `worker-airtrust/src/services/sigvoos-cv-importer.ts`

**Endpoint novo**: `POST /api/controle-voos/sigvoos/sincronizar`

**O que faz:**
1. Autentica no SIGVOOS (igual ao `authenticateSigvoos` atual)
2. Busca etapas por período (igual ao loop atual de `syncSigvoosForFrms`)
3. Para cada registro bruto:
   - Insere em `cv_sigvoos_staging` com `payload_raw`
   - Tenta resolver o voo (por `sigvoos_voo_id` ou por `prefixo+data`)
   - Se voo não existe: cria em `cv_voos` com `origem_importacao='SIGVOOS'`
   - Se voo existe e campo não editado: atualiza
   - Se voo existe e campo editado: registra conflito em `cv_voos.conflito_sigvoos_json`
4. Para cada tripulante por voo:
   - Resolve por CANAC → MATRICULA → NOME_FUZZY (mesma lógica atual)
   - Upsert em `cv_voo_tripulantes` com dados de tempo
5. Registra evento em `integracoes_sigvoos_eventos` para rastreabilidade

**NÃO faz:**
- Não chama `confirmarImportacaoFira()` (caminho antigo continua separado)
- Não cria `frms_jornada` (isso é da Fase 3)

**Riscos:**
- Dedup por voo pode ser frágil se SIGVOOS não tem ID único por voo
- Criação de voos duplicados se `prefixo+data` não for único
- Conflito de catálogo: `cv_aeroportos`, `cv_tipos_voo` precisam ter os aeroportos que o SIGVOOS usa

**Rollback:**
- Apenas desligar o endpoint e limpar `cv_sigvoos_staging` + registros em `cv_voos` com `origem_importacao='SIGVOOS'`
- O caminho antigo SIGVOOS→FRMS não foi tocado

**Critério de aceite:**
- Sincronia manual com 1 dia de dados retorna os voos corretos em `cv_voos`
- `cv_voo_tripulantes` contém os tripulantes do período com dados de tempo
- Idempotência: sincronizar o mesmo período 3x não cria duplicatas
- Tripulantes não encontrados ficam em `frms_jornada_pendente` (ou equivalente em CV)

---

### Fase 3 — Adaptador CV → FRMS

**Duração estimada**: 2–3 semanas

**Arquivo novo**: `worker-airtrust/src/services/cv-frms-adapter.ts`

**Endpoint novo**: `POST /api/controle-voos/frms/derivar?periodo=YYYY-MM`

**O que faz:**
1. Busca `cv_voo_tripulantes` onde:
   - `cv_voos.status = 'concluido_operacionalmente'`
   - `cv_voo_tripulantes.jornada_derivada_em IS NULL` (não derivado ainda)
   - `cv_voos.data_programacao` dentro do período
2. Agrupa por `(funcionario_id, data_voo)`:
   - `horaApresentacao = MIN(horario_apresentacao)`
   - `horaTermino = MAX(horario_dispensa)`
   - `horasVooMin = SUM(horas_voo_min)`
   - `tempoNoturnoMin = SUM(tempo_noturno_min)`
   - `tempoIfrMin = SUM(tempo_ifr_min)`
3. Chama `salvarJornada()` com:
   - `origem = 'CONTROLE_VOOS'` (ou 'SIGVOOS' se source policy não for expandida)
4. Atualiza `cv_voo_tripulantes.jornada_frms_id` e `jornada_derivada_em`

**Endpoint de comparação (shadow mode)**: `GET /api/controle-voos/frms/shadow-compare?periodo=YYYY-MM`
- Compara `frms_jornada WHERE origem='SIGVOOS'` vs. `WHERE origem='CONTROLE_VOOS'`
- Por tripulante: diferença em `horas_voo_minutos` e `duracao_jornada_minutos`
- Retorna lista de divergências com detalhe

**Riscos:**
- Agregação por data pode diferir do SIGVOOS se voos cruzam meia-noite
- Tripulante com `horario_apresentacao IS NULL` em `cv_voo_tripulantes` → jornada sem apresentação
- Source policy não aceita `CONTROLE_VOOS` → jornadas derivadas não geram alertas (intencional no shadow mode)

**Rollback:**
- Limpar `frms_jornada WHERE origem='CONTROLE_VOOS'`
- Zerar `cv_voo_tripulantes.jornada_frms_id` e `jornada_derivada_em`
- O caminho antigo continua gerando alertas

**Critério de aceite:**
- Para 3 tripulantes-amostra: diferença < 30min de `horas_voo_minutos` mensal vs. caminho antigo
- Nenhum tripulante sem jornada derivada (todos com voo `concluido_operacionalmente` no período)
- Endpoint shadow-compare retorna lista vazia ou lista com divergências justificadas

---

### Fase 4 — Shadow Mode

**Duração estimada**: 2–4 semanas (período de observação)

**O que acontece:**
- Cron antigo (`runSigvoosFrmsDailySync`) continua rodando → `frms_jornada` com `origem='SIGVOOS'`
- Novo importador CV roda em paralelo → `cv_voos` + `cv_voo_tripulantes`
- Adaptador CV→FRMS roda após o importador → `frms_jornada` com `origem='CONTROLE_VOOS'`
- Alertas e rolling accruals continuam usando **apenas** `SIGVOOS` (source policy não muda)
- Dashboard de shadow compare é monitorado diariamente

**Critério de saída da Fase 4:**
- 7 dias consecutivos com divergência < 0.5% em `horas_voo_minutos` total por empresa
- Nenhuma divergência de tripulante > 2h por mês
- Sem jornadas perdidas (tripulantes no SIGVOOS que não apareceram no CV)
- Revisão manual de 5 tripulantes-amostra pela equipe operacional

---

### Fase 5 — Virada Controlada

**Duração estimada**: 1 semana

**Ações:**
1. Expandir `frms-source-policy.ts`:
   ```typescript
   export const FRMS_CANONICAL_OPERATIONAL_SOURCES = ['SIGVOOS', 'CONTROLE_VOOS'] as const;
   ```
   *Ou* renomear a constante e fazer o adaptador inserir com `origem='SIGVOOS'` (menos disruptivo).

2. Atualizar as queries de alertas e rolling para incluir nova origem
3. Desabilitar `auto_sync_enabled` no SIGVOOS via config (não remove o cron, só para a execução)
4. Redirecionar o cron `*/10 * * * *` para o novo importador CV em vez do `syncSigvoosForFrms`
5. Monitorar alertas por 30 dias

**Rollback desta fase:**
- Reativar `auto_sync_enabled` via `PUT /api/integracoes/sigvoos/config`
- Reverter `frms-source-policy.ts` para `SIGVOOS` único
- O cron antigo volta a rodar no próximo tick

**Critério de aceite:**
- Alertas FRMS continuum gerados normalmente após a virada
- Nenhum tripulante sem cobertura de jornada
- Rolling accruals equivalentes (dentro de 1% de tolerância)
- Equipe operacional confirma que a tela de jornadas FRMS está correta

---

### Fase 6 — Descomissionamento (Fase B futura)

**Duração estimada**: 1–2 semanas (após 30 dias de estabilidade na Fase 5)

**Ações:**
1. Arquivar `syncSigvoosForFrms()` como função legada (não deletar imediatamente)
2. Marcar rotas SIGVOOS antigas como deprecated no código
3. Remover `runSigvoosFrmsDailySync` do cron handler
4. Manter `integracoes_sigvoos_*` tabelas por 90 dias (histórico)
5. Controle de Voos passa a ser a fonte primária sem dependência externa

---

## Riscos por Fase

| Fase | Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|---|
| 0 | SIGVOOS não tem `voo_id` único | MÉDIA | ALTO | Estratégia de dedup por `prefixo+data` |
| 1 | Migration quebra testes existentes | BAIXA | MÉDIO | Schema aditivo puro, nenhum campo NOT NULL sem default |
| 2 | Aeroportos SIGVOOS não têm cadastro em `cv_aeroportos` | ALTA | MÉDIO | Seed automático ou criação lazy |
| 2 | Tripulantes SIGVOOS sem mapeamento CV | MÉDIA | MÉDIO | Manter fila `frms_jornada_pendente` equivalente |
| 3 | Agregação por data difere do SIGVOOS (voos overnight) | MÉDIA | ALTO | Usar `date(horario_apresentacao)` como critério de agrupamento |
| 4 | Divergência sistemática > 0.5% durante shadow | BAIXA | ALTO | Investigar antes de virar; não forçar prazo |
| 5 | Source policy expandida quebra alertas existentes | BAIXA | CRÍTICO | Teste em staging com dados reais antes da virada |
| 5 | Tripulantes com jornadas SIGVOOS e CV simultâneas (período de sobreposição) | MÉDIA | MÉDIO | Regra: se existe `SIGVOOS` e `CONTROLE_VOOS` no mesmo dia → preferir `CONTROLE_VOOS` |

---

## O Que Deve Ser Testado Antes de Ligar o FRMS ao Controle de Voos

### Testes funcionais obrigatórios

- [ ] **Idempotência do importador**: Sincronizar o mesmo período 3 vezes consecutivas não cria duplicatas em `cv_voos` nem em `cv_voo_tripulantes`
- [ ] **Cobertura de tripulantes**: Todo tripulante que aparece no SIGVOOS para o período aparece em `cv_voo_tripulantes`
- [ ] **Agregação por data**: Tripulante com 3 voos no mesmo dia tem uma única jornada derivada com `horas_voo_min = soma dos 3`
- [ ] **Voo cancelado**: Voo com `status='cancelado'` no CV não gera jornada no FRMS
- [ ] **Conflito de edição**: Campo editado manualmente no AirTrust não é sobrescrito na próxima sincronização SIGVOOS
- [ ] **Resolução de conflito**: Operador consegue resolver conflito e a escolha é registrada em `cv_voo_eventos`

### Testes de integridade de dados

- [ ] **Comparação por mês**: Para 3 empresas-amostra, divergência `horas_voo_minutos` total < 30min por mês
- [ ] **Alertas FRMS equivalentes**: Tripulantes com alerta CRÍTICO no caminho antigo aparecem com alerta no novo
- [ ] **Rolling accruals**: `frms_acumulo_rolling` calculado via CV não diverge do via SIGVOOS em > 1% para janela de 28 dias

### Testes de segurança

- [ ] **Tenant isolation**: Importador jamais cria `cv_voos` para `empresa_id` diferente da configuração de acesso
- [ ] **Tripulante cross-tenant**: `cv_voo_tripulantes.funcionario_id` sempre pertence à mesma `empresa_id` do voo
- [ ] **Manutenção**: A rota `/maintenance/sincronizar-frms` (legado) rejeitará `empresaId` inválido

### Testes de rollback

- [ ] Após virada, desabilitar `CONTROLE_VOOS` como fonte canônica restaura alertas do caminho `SIGVOOS` em < 1 hora (próximo cron)
- [ ] `cv_sigvoos_staging` pode ser limpa e reimportada sem perda de dados em `cv_voos` (pois `cv_voos` é o dado canônico)

---

## Critérios de Aceite Gerais

| Critério | Threshold |
|---|---|
| Divergência `horas_voo_min` mensal por tripulante | < 30 minutos |
| Divergência `horas_voo_min` total por empresa/mês | < 0.5% |
| Tripulantes perdidos (no SIGVOOS mas não no CV) | 0 |
| Alertas FRMS críticos não gerados no novo caminho | 0 |
| Dias de shadow mode antes da virada | ≥ 7 consecutivos sem divergência |

---

## Rollback Geral (Qualquer Fase)

O rollback é sempre possível enquanto o caminho antigo existir:

1. Desabilitar o novo importador (`auto_sync_cv = false` em config ou feature flag)
2. Limpar `frms_jornada WHERE origem='CONTROLE_VOOS'`
3. Forçar reprocessamento do FRMS com `origem='SIGVOOS'` (`POST /api/integracoes/sigvoos/sincronizar-frms` para o período)
4. Verificar alertas e rolling normalizaram

O caminho antigo (`syncSigvoosForFrms`) deve ser mantido funcional até o Fase 6.
