# Auditoria Técnica: SIGVOOS → Controle de Voos → FRMS

> Data: 2026-06-14 | Status: READ-ONLY | Nenhuma alteração de código foi feita

---

## 1. Resumo Executivo

A integração SIGVOOS hoje alimenta o FRMS **diretamente**, sem passar pelo módulo de Controle de Voos. O fluxo atual é:

```
SIGVOOS API → syncSigvoosForFrms() → frms_jornada (origem=SIGVOOS) → FRMS/Alertas/Rolling
```

O módulo de **Controle de Voos (CV)** existe com schema N1 completo (`cv_voos`, `cv_rdv_operacional`, `cv_voo_tripulantes`, `cv_voo_eventos`), mas **não possui nenhuma ponte para o FRMS** nem nenhuma integração com o SIGVOOS.

A migração para a arquitetura alvo:
```
SIGVOOS API → Controle de Voos (tabelas cv_*) → Adaptador → FRMS
```
requer: (a) um importador SIGVOOS→CV, (b) campos de rastreabilidade nos cv_*, (c) um adaptador CV→FRMS, (d) rodagem em shadow mode antes de desligar o caminho antigo.

**Nenhuma dessas peças existe ainda. A auditoria identifica o que falta e propõe o caminho.**

---

## 2. Fluxo Atual SIGVOOS → FRMS

### 2.1 Autenticação

```
POST {base_url}/get/token  { username, password, system }
→ Bearer token (accessToken / access_token / token)
```

### 2.2 Coleta de Etapas

```
POST {base_url}/relatorios/voos/tripulantes/etapas/pesquisa
  { date_start, date_finish, page, page_size, limit }
→ array de registros brutos (estrutura variável, múltiplos candidatos de campo)
```

Paginação: cron chama por janelas mensais (`buildSigvoosMonthlyWindows`). Para via manual a janela é configurável por `chunkDays` (padrão 1 dia).

### 2.3 Normalização

`normalizeSigvoosRecord(raw)` → `SigvoosNormalizedLeg`:
- Tenta múltiplos candidatos para cada campo (fallback robusto)
- Agrupa por `(canac || nome_normalizado) × data` → `SigvoosGroupedDay`
  - Soma `horasVooMin`, `tempoNoturnoMin`, `tempoIfrMin`
  - Earliest presentation time, latest termination time

### 2.4 Importação para FRMS

1. Resolve tripulante: `MANUAL mapping → CANAC → MATRICULA (5 dígitos) → NOME_FUZZY (Levenshtein ≥ 0.86)`
2. Cria `frms_importacao_fira` (preview)
3. Chama `confirmarImportacaoFira()` (função compartilhada com o fluxo FIRA/Excel)
4. `confirmarImportacaoFira` cria/substitui registros em `frms_jornada` com `origem = 'SIGVOOS'`
5. `relabelImportedJornadasAsSigvoos()` converte jornadas `FIRA` ou `APUS` do mesmo dia para `SIGVOOS`
6. `enrichImportedSigvoosJornadas()` preenche `matricula_aeronave`, `tempo_noturno_str`, `tempo_ifr_str`, `fonte_resolucao_sigvoos`
7. Resolve pendências (`frms_jornada_pendente`)

### 2.5 Reprocessamento FRMS

Após importação, `reprocessarTripulanteCompleto()` recalcula:
- `calcFatorizacao()` → `frms_fatorizacao_jornada`
- `calcEffectiveness()` → `frms_effectiveness`
- `calcAcumuloRolling()` → `frms_acumulo_rolling`
- `processarAlertas()` → `frms_alerta`

---

## 3. Arquivos e Funções Envolvidos

### 3.1 Backend

| Arquivo | Função principal |
|---|---|
| `worker-airtrust/src/routes/integracoes_sigvoos.ts` | Roteador HTTP + lógica de chunking/retry |
| `worker-airtrust/src/services/sigvoos-frms.ts` | Todo o core da integração (2.813 linhas) |
| `worker-airtrust/src/lib/frms/frms-source-policy.ts` | Política canônica (`SIGVOOS` = única fonte operacional) |
| `worker-airtrust/src/lib/frms/db-service-jornadas.ts` | `salvarJornada`, `confirmarImportacaoFira`, `reprocessarTripulanteCompleto` |
| `worker-airtrust/src/lib/frms/fira-service.ts` | Preview de importação e confirmação (compartilhado com FIRA) |
| `worker-airtrust/src/cron/scheduled-handler.ts` | Cron `*/10 * * * *` → `runSigvoosFrmsDailySync()` |
| `worker-airtrust/src/routes/controle-voos.ts` | Módulo CV N1 completo (sem conexão com SIGVOOS/FRMS) |

### 3.2 Frontend

| Caminho | Estado |
|---|---|
| `src/react-app/pages/controle-voos/ControleVoosDashboard.tsx` | Dashboard OCC (sem SIGVOOS) |
| `src/react-app/pages/controle-voos/ControleVoosVoos.tsx` | Lista de voos |
| `src/react-app/pages/controle-voos/ControleVoosJornadas.tsx` | Página de jornadas (placeholder, sem backend CV→FRMS) |
| `src/react-app/hooks/useControleVoos.ts` | Hook de dados CV |

---

## 4. Rotas Atuais

### 4.1 SIGVOOS (`/api/integracoes/sigvoos/*`)

| Método | Rota | Autenticação | Função |
|---|---|---|---|
| GET | `/ping` | admin/manager | Health check |
| GET | `/config` | admin/manager | Ler configuração (sanitizada) |
| PUT | `/config` | admin/manager | Atualizar credenciais/config |
| GET | `/historico` | admin/manager | Log de eventos de sincronização |
| GET | `/mapeamento-manual` | admin/manager | Listar mapeamentos + não mapeados |
| POST | `/mapeamento-manual` | admin/manager | Criar mapeamento |
| POST | `/mapear` | admin/manager | Mapear + reprocessar previews |
| GET | `/pendentes` | admin/manager | Jornadas sem tripulante |
| POST | `/sincronizar-frms` | admin/manager | Sincronização manual (com chunking) |
| POST | `/reprocessar-previews` | admin/manager | Reprocessar previews sem tripulante |
| POST | `/reconciliar-pendencias` | admin/manager | Reconciliar janelas com erro |
| POST | `/maintenance/sincronizar-frms` | MAINTENANCE_SECRET | Sincronização de manutenção |

### 4.2 Controle de Voos (`/api/controle-voos/*`)

| Método | Rota | Autenticação | Função |
|---|---|---|---|
| GET | `/voos` | auth | Listar voos com filtros |
| POST | `/voos` | auth + editor | Criar voo |
| GET | `/voos/:id` | auth | Buscar voo |
| PATCH | `/voos/:id` | auth + editor | Atualizar voo (patch parcial) |
| POST | `/voos/:id/status` | auth + editor | Mudar status (máquina de estados) |
| GET | `/voos/:id/rdv` | auth | Buscar RDV do voo |
| PUT | `/voos/:id/rdv` | auth + editor | Criar/atualizar RDV |
| POST | `/voos/:id/rdv/finalizar-preenchimento` | auth + editor | Finalizar RDV |
| GET | `/dashboard` | auth | Dashboard OCC |
| GET | `/relatorios/resumo-operacional` | auth | Resumo operacional por período |
| GET | `/catalogos/:nome` | auth | Aeroportos, tipos, naturezas, motivos |

---

## 5. Tabelas Atuais

### 5.1 Integração SIGVOOS

| Tabela | Descrição |
|---|---|
| `integracoes_sigvoos_config` | Key-value: `username`, `password` (marcador), `password_encrypted` (AES-GCM), `base_url`, `system`, `last_sync_*`, `auto_sync_*`, `notificar_falha_email` |
| `integracoes_sigvoos_eventos` | Log de cada execução de sync (status: PROCESSANDO → SUCESSO/ERRO/FALHA) |
| `integracoes_sigvoos_mapeamentos` | Tabela legada de mapeamentos (mantida por retrocompat) |
| `sigvoos_mapeamento_manual` | Tabela canônica: `nome_sigvoos`, `inscricao_sigvoos`, `canac_sigvoos` → `funcionario_id` |
| `frms_jornada_pendente` | Jornadas SIGVOOS sem tripulante resolvido (status PENDENTE/RESOLVIDO) |

### 5.2 FRMS (campos relevantes)

| Tabela | Campo chave |
|---|---|
| `frms_jornada` | `origem` CHECK IN ('MANUAL','APUS','SIMULADOR','FIRA','SIGVOOS') |
| `frms_jornada` | `matricula_aeronave`, `tempo_noturno_str`, `tempo_ifr_str` (migration 0352) |
| `frms_jornada` | `fonte_resolucao_sigvoos` (CANAC/MATRICULA/NOME_FUZZY/MANUAL/NAO_ENCONTRADO) |
| `frms_importacao_fira` | Reaproveitada para SIGVOOS (arquivo_nome = `SIGVOOS_${canac}_${ano-mes}.json`) |
| `frms_acumulo_rolling` | Apenas jornadas `origem='SIGVOOS'` alimentam rolling accruals |
| `frms_alerta` | Apenas jornadas `origem='SIGVOOS'` geram alertas operacionais |

### 5.3 Controle de Voos

| Tabela | Campos relevantes |
|---|---|
| `cv_voos` | `prefixo`, `data_programacao`, `origem_id`, `destino_id`, `aeronave_id`, `horario_previsto_*`, `horario_real_*`, `status` (7 estados) |
| `cv_rdv_operacional` | `horas_voadas`, `numero_pousos`, `ciclos`, `combustivel_*`, `horario_decolagem_real`, `horario_pouso_real` |
| `cv_voo_tripulantes` | `voo_id`, `funcionario_id`, `funcao` (PIC/SIC/COM/MEC/OUTRO), `horario_apresentacao`, `horario_dispensa` |
| `cv_voo_eventos` | Audit trail completo por voo |
| `cv_aeroportos` | Catálogo de aeroportos/plataformas/helipontos |
| `cv_tipos_voo`, `cv_naturezas_voo`, `cv_motivos_operacionais` | Catálogos de apoio |

---

## 6. Campos Atualmente Importados do SIGVOOS

O normalizador (`normalizeSigvoosRecord`) extrai os seguintes campos:

| Campo AirTrust | Candidatos SIGVOOS (ordem de preferência) |
|---|---|
| `identificadorSigvoos` | `staff.inscription`, `inscription`, `staff_inscription`, `matricula`, `employee_code`, `crew_code` |
| `canac` | `staff.canac`, `staff.codigo_anac`, `canac`, `codigo_anac`, `codigoAnac`, `tripulante_canac` |
| `tripulanteNome` | `staff.name`, `tripulante_nome`, `crew_name`, `nome` |
| `data` | `date`, `data`, `data_voo`, `calco_fora`, `partida_real`, `off_block`, `on_block` |
| `horaApresentacao` | `flight_report_leg.engine_start_time_str`, `hora_apresentacao`, `inicio_jornada`, `calco_fora`, `off_block` |
| `horaTermino` | `flight_report_leg.engine_shutoff_time_str`, `landing_time_str`, `hora_termino`, `calco_dentro`, `on_block` |
| `horasVooMin` | `horas_voo_minutos`, `flight_minutes`, `block_minutes`, `navigation_time_str`, `total_time_str`, `horas_voo` |
| `localBase` | `flight_report_leg.departure_location.icao_code`, `origem`, `aerodromo_origem`, `base`, `local_base` |
| `matriculaAeronave` | `flight_report.aircraft.registration`, `aircraft.registration`, `matricula_aeronave`, `aeronave` |
| `tempoNoturnoMin` | `flight_report_leg.night_time_str`, `night_time_str`, `tempo_noturno` |
| `tempoIfrMin` | `flight_report_leg.ifr_time_str`, `ifr_time_str`, `tempo_ifr` |

---

## 7. Campos Ausentes ou Descartados

Campos que o payload SIGVOOS pode conter mas **não são consumidos hoje**:

| Campo potencial | Relevância para CV | Relevância para FRMS |
|---|---|---|
| `voo_id` ou `flight_id` externo | **ALTA** — chave de idempotência por voo | Baixa |
| `numero_voo` / `prefixo` / `flight_number` | **ALTA** — identifica o voo no CV | Baixa |
| `destino` / `arrival_location` | **ALTA** — destino do voo | Baixa |
| `origem` / `departure_location` detalhada | **ALTA** — aeroporto de origem | Baixa |
| `numero_pousos` / `landings` | Média (RDV) | Baixa |
| `combustivel_*` | Média (RDV) | Baixa |
| `pob` / `carga_kg` | Baixa | Nenhuma |
| `ciclos` | Baixa (manutenção) | Nenhuma |
| `tipo_voo` / `flight_type` | **ALTA** — classificação operacional | Baixa |
| `natureza_voo` | **ALTA** — comercial/particular/treinamento | Baixa |
| `aeronave_id` interno AirTrust | Sem equivalência | Sem equivalência |
| Campos `repouso_plataforma_*` | Nenhuma (CV) | **ALTA** (FRMS offshore) |
| `tripulacao_aumentada` | Nenhuma (CV) | **ALTA** (FRMS fadiga) |

**A integração atual descarta completamente a identidade do voo** (número, rota, tipo). Só preserva dados de jornada do tripulante (quando começou, quando terminou, quanto voou). Isso é suficiente para FRMS mas insuficiente para Controle de Voos.

---

## 8. Pontos de Acoplamento Forte entre SIGVOOS e FRMS

1. **`frms-source-policy.ts:7`**: `FRMS_CANONICAL_OPERATIONAL_SOURCE = 'SIGVOOS'` — hard-coded. Qualquer jornada com `origem ≠ 'SIGVOOS'` é excluída de alertas e rolling accruals.

2. **`db-service-jornadas.ts`**: `confirmarImportacaoFira()` é a única via de criação de jornadas vindas de importação. Hoje é chamado por `syncSigvoosForFrms` com `importador = 'SIGVOOS'`. Para migrar ao CV, precisará de um novo importador ou o mesmo adaptador.

3. **`scheduled-handler.ts:234`**: Cron `*/10 * * * *` chama `runSigvoosFrmsDailySync()` que chama `syncSigvoosForFrms` seguido de `reprocessarTripulanteCompleto`. Se o SIGVOOS for desligado, este cron ficará idle ou quebrará.

4. **`frms_importacao_fira`**: A tabela foi reutilizada para importações SIGVOOS (arquivo_nome começa com `SIGVOOS_`). Não existe tabela separada para staging de importação do SIGVOOS, o que causa acoplamento estrutural.

5. **`clearExistingFiraDataForEmpresa()`**: Limpa `frms_alerta`, `frms_fatorizacao_jornada`, `frms_jornada`, `horas_voo_lancamentos` filtrando `origem IN ('FIRA','APUS','SIGVOOS')`. Uma migração para CV precisará incluir a nova origem ou o método de limpeza ficará incompleto.

---

## 9. Estado Atual do Módulo Controle de Voos

### O que existe (N1 completo):
- Schema de banco completo (`cv_voos`, `cv_rdv_operacional`, `cv_voo_tripulantes`, `cv_voo_eventos`, catálogos)
- CRUD completo de voos com máquina de estados (7 status: planejado → liberado → em_andamento → pousado → concluido_operacionalmente / cancelado / alternado_divergido)
- CRUD de RDV operacional com ciclo rascunho → preenchimento_finalizado
- Gestão de tripulação por voo (`cv_voo_tripulantes`) com `horario_apresentacao` e `horario_dispensa`
- Dashboard OCC (`/dashboard`) e relatório operacional (`/relatorios/resumo-operacional`)
- Audit trail completo (`cv_voo_eventos`)
- Catálogos de aeroportos, tipos de voo, naturezas, motivos
- Frontend com 8 páginas: Dashboard, Voos, RDV, Jornadas (placeholder), Indisponibilidades, Hangaragem, Relatórios, Tabelas

### O que NÃO existe:
- Nenhum campo de rastreabilidade de origem SIGVOOS em `cv_voos`
- Nenhum importador SIGVOOS → `cv_voos`
- Nenhum adaptador `cv_voo_tripulantes` → `frms_jornada`
- Página "Jornadas" não tem backend funcional (apenas UI placeholder)
- Nenhuma flag de "editado manualmente" nos campos de cv_voos
- Sem staging/raw layer para payload SIGVOOS original
- Sem lógica de conflito (quando SIGVOOS traz valor diferente de campo já editado)

---

## 10. Lacunas do Controle de Voos para Receber o SIGVOOS Completo

### 10.1 Campos Faltantes em `cv_voos`

| Campo necessário | Tipo | Descrição |
|---|---|---|
| `sigvoos_voo_id` | TEXT | ID único do voo no SIGVOOS (chave de idempotência) |
| `origem_importacao` | TEXT CHECK('SIGVOOS','MANUAL','CV_INTERNO') | Fonte do registro |
| `sigvoos_sync_at` | TEXT | Timestamp da última sincronização SIGVOOS |
| `sigvoos_payload_json` | TEXT | Payload raw original do SIGVOOS |
| `editado_manualmente` | INTEGER DEFAULT 0 | Flag: algum campo foi editado manualmente após importação |
| `campos_editados_json` | TEXT | Lista de campos que foram editados manualmente |
| `conflito_sigvoos_json` | TEXT | Conflitos pendentes de resolução quando SIGVOOS traz valor diferente |

### 10.2 Campos Faltantes em `cv_voo_tripulantes`

| Campo necessário | Tipo | Descrição |
|---|---|---|
| `sigvoos_identificador` | TEXT | Identificador do tripulante no SIGVOOS |
| `sigvoos_canac` | TEXT | CANAC vindo do SIGVOOS |
| `jornada_frms_id` | TEXT | FK para `frms_jornada` (quando derivado) |
| `jornada_derivada_em` | TEXT | Timestamp da derivação ao FRMS |
| `horas_voo_min` | INTEGER | Horas de voo em minutos (para derivação FRMS) |
| `tempo_noturno_min` | INTEGER | Tempo noturno em minutos |
| `tempo_ifr_min` | INTEGER | Tempo IFR em minutos |

### 10.3 Tabela nova: `cv_sigvoos_staging`

Necessária para armazenar o payload bruto antes de normalizar, permitindo reprocessamento sem nova chamada à API:

```sql
-- Proposta conceitual (não criar ainda)
cv_sigvoos_staging (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  sigvoos_voo_id TEXT,       -- ID externo do voo
  data_voo TEXT NOT NULL,
  payload_raw_json TEXT,     -- Payload original da API
  status TEXT CHECK('PENDING','PROCESSED','ERROR','IGNORED'),
  processado_em TEXT,
  erro_msg TEXT,
  created_at TEXT,
  updated_at TEXT
)
```

### 10.4 Serviços Faltantes

| Serviço | Descrição |
|---|---|
| `sigvoos-cv-importer.ts` | Importa etapas SIGVOOS para `cv_voos` e `cv_voo_tripulantes` |
| `cv-frms-adapter.ts` | Deriva `cv_voo_tripulantes` → `frms_jornada` por tripulante/data |
| `cv-conflict-resolver.ts` | Regras de precedência entre dado importado e dado editado |

---

## 11. Regras Necessárias para Edição Manual no AirTrust

Baseado na análise do fluxo atual e requisitos:

### 11.1 Regras de Precedência

1. **Campo nunca editado**: SIGVOOS sempre pode sobrescrever.
2. **Campo editado manualmente após importação**: SIGVOOS não sobrescreve automaticamente — gera conflito.
3. **Campo com conflito**: Fica pendente de resolução manual, com visualização da diferença (SIGVOOS vs. AirTrust).
4. **Resolução de conflito por operador**: Operador escolhe qual valor prevalecer; a escolha é registrada em `cv_voo_eventos`.
5. **Regra de exceção configurável**: `sigvoos_pode_sobrescrever_campos_editados` por tipo de campo (ex: horarios reais sempre podem ser atualizados pelo SIGVOOS, mas dados de tripulação não).

### 11.2 Campos que NUNCA devem ser sobrescritos automaticamente

- `cancelado_motivo_id` (decisão operacional)
- `observacoes` (registro manual do operador)
- `ocorrencias` / `divergencias` no RDV

### 11.3 Campos que SEMPRE podem ser atualizados pelo SIGVOOS

- `horario_real_partida`, `horario_real_chegada` (se ainda não houve edição manual posterior)
- `horas_voadas` no RDV
- `tempo_noturno_min`, `tempo_ifr_min` dos tripulantes

---

## 12. Riscos de Sobrescrita de Dados Editados

**Risco CRÍTICO**: O importador SIGVOOS atual não tem mecanismo de proteção contra sobrescrita de dados editados. Ao migrar para CV→SIGVOOS→CV, se um operador editou o horário real de partida e o SIGVOOS traz outro valor na próxima sincronização, o dado do operador seria sobrescrito sem aviso.

**Mitigação necessária**:
- Flag `editado_manualmente` por campo em `cv_voos`
- `campos_editados_json` rastreando quais campos foram tocados
- Política no importador: `IF campos_editados AND sigvoos_value != cv_value THEN conflito`
- Visualização de conflitos na UI

---

## 13. Riscos de Duplicidade

### 13.1 Risco SIGVOOS → CV

- SIGVOOS não garante `voo_id` estável entre respostas
- Sincronizações repetidas do mesmo período criarão duplicatas em `cv_voos` se não houver chave de idempotência
- **Mitigação**: `UNIQUE(empresa_id, sigvoos_voo_id)` ou `UNIQUE(empresa_id, prefixo, data_programacao)` no staging

### 13.2 Risco CV → FRMS

- Se o adaptador CV→FRMS rodar múltiplas vezes para o mesmo `funcionario_id + data`, criará jornadas duplicatas
- `frms_jornada` tem `UNIQUE INDEX (tripulante_id, data) WHERE deleted_at IS NULL`
- **Mitigação**: O adaptador deve checar por tripulante+data antes de inserir, e só substituir se `origem` permitir

### 13.3 Risco de Jornada com Múltiplos Voos

- Um tripulante pode ter 2 voos no mesmo dia; hoje a integração SIGVOOS já lida com isso agrupando por `(canac, data)`
- O adaptador CV→FRMS precisa agregar todos os `cv_voo_tripulantes` do mesmo `funcionario_id` no mesmo dia em uma única `frms_jornada`

---

## 14. Riscos de Multi-Tenant e RBAC

### 14.1 Rota de Manutenção (CRÍTICO)

**Arquivo**: `integracoes_sigvoos.ts:697`

A rota `POST /api/integracoes/sigvoos/maintenance/sincronizar-frms`:
- É **excluída do middleware de autenticação** (`isPublicPath`)
- Aceita `empresaId` **do corpo do request** sem validação de tenant
- Em produção, protegida apenas por `MAINTENANCE_SECRET` + check de localhost/header
- **Risco**: Se `MAINTENANCE_SECRET` vazar, um atacante pode sincronizar dados para qualquer empresa (incluindo `empresaId: 1` default)

**Melhoria necessária**: Adicionar validação de que `empresaId` é válida e pertence ao contexto autorizado, mesmo na rota de manutenção.

### 14.2 Resolvedor de Empresa SIGVOOS

**Arquivo**: `sigvoos-frms.ts:617`

`resolveSigvoosEmpresaId()` tem um fallback que retorna qualquer empresa com credenciais configuradas quando `empresaId` é nulo. Em cenário multi-tenant onde múltiplas empresas têm SIGVOOS configurado, isso pode sincronizar para a empresa errada.

### 14.3 Controle de Voos — RBAC

- Rotas de leitura: apenas `auth()` (qualquer usuário autenticado)
- Rotas de escrita: `auth()` + `requireControleVoosWrite()` (mínimo: `editor`)
- Catálogos são tenant-scoped (`empresa_id = ?` em todas as queries)
- **OK**: `cv_voos`, `cv_rdv_operacional`, `cv_voo_tripulantes` têm `empresa_id` em todas as queries

### 14.4 Logs de Credenciais

- Senha SIGVOOS nunca aparece em logs (é substituída por `__REDACTED__` antes de logar o input)
- Token Bearer não é logado
- `sanitizeSigvoosConfig()` nunca retorna a senha

---

## 15. Riscos de Rota de Manutenção

Resumindo os riscos específicos de `/api/integracoes/sigvoos/maintenance/sincronizar-frms`:

| Risco | Severidade | Status |
|---|---|---|
| `empresaId` vindo do body sem validação de tenant | ALTO | EM ABERTO |
| Default `empresaId = 1` quando não informado | MÉDIO | EM ABERTO |
| `ENABLE_DEV_AUTH_BYPASS = true` desabilita verificação de secret | ALTO | Depende de config |
| Localhost check passável em Cloudflare (header `Host`) | BAIXO | Mitigado pelo secret |
| Route fora do auth middleware global | ALTO | Design intencional, mas precisa review |

---

## 16. Proposta de Arquitetura-Alvo

```
┌─────────────────────────────────────────────────────────────────┐
│                         FASE A (Transitória)                     │
│                                                                   │
│  SIGVOOS API                                                      │
│     │                                                             │
│     ▼                                                             │
│  cv_sigvoos_staging   ←── importador-sigvoos-cv.ts               │
│     │                                                             │
│     ▼                                                             │
│  cv_voos + cv_voo_tripulantes   ←── normalização + dedup         │
│     │                           │                                 │
│     │                           ▼                                 │
│     │                     edição manual (UI)                      │
│     │                     + resolução de conflito                 │
│     │                                                             │
│     ▼                                                             │
│  cv-frms-adapter.ts                                               │
│     │                                                             │
│     ▼                                                             │
│  frms_jornada (origem='CONTROLE_VOOS' ou 'SIGVOOS')             │
│     │                                                             │
│     ▼                                                             │
│  FRMS: fatorizacao + alertas + rolling                           │
└─────────────────────────────────────────────────────────────────┘
                                                                   
┌─────────────────────────────────────────────────────────────────┐
│                         FASE B (Futura)                          │
│                                                                   │
│  Controle de Voos AirTrust (fonte primária operacional)         │
│     │                                                             │
│     ▼                                                             │
│  cv-frms-adapter.ts (mesmo serviço da Fase A)                   │
│     │                                                             │
│     ▼                                                             │
│  FRMS (sem dependência do SIGVOOS)                               │
└─────────────────────────────────────────────────────────────────┘
```

### 16.1 Princípios da Arquitetura-Alvo

1. **Staging layer**: `cv_sigvoos_staging` preserva o raw payload para reprocessamento offline.
2. **Camada normalizada**: `cv_voos` + `cv_voo_tripulantes` são os dados canônicos do Controle de Voos.
3. **Camada de edição**: Qualquer campo pode ser editado manualmente; edições são protegidas com flag e histórico.
4. **Camada de derivação FRMS**: O adaptador `cv-frms-adapter` lê `cv_voo_tripulantes` e deriva `frms_jornada`, agregando por (tripulante, data).
5. **Regra de precedência**: `cv_voos.editado_manualmente` protege edições; SIGVOOS só sobrescreve campos não editados.
6. **Rastreabilidade**: Toda mudança tem `origem_importacao`, `sigvoos_sync_at`, e entrada em `cv_voo_eventos`.

---

## 17. Modelo Sugerido de Tabelas (Proposta, Sem Migration)

### 17.1 Extensões de `cv_voos`

```sql
-- Campos a adicionar em cv_voos (via migration futura):
sigvoos_voo_id          TEXT,          -- ID externo do voo no SIGVOOS
sigvoos_prefixo         TEXT,          -- Prefixo/número do voo no SIGVOOS
sigvoos_sync_at         TEXT,          -- Timestamp da última sync SIGVOOS bem-sucedida
sigvoos_payload_json    TEXT,          -- Payload bruto do SIGVOOS para este voo
origem_importacao       TEXT NOT NULL DEFAULT 'MANUAL'
                        CHECK(origem_importacao IN ('MANUAL','SIGVOOS','CV_INTERNO')),
campos_editados_json    TEXT,          -- JSON array com nomes dos campos editados manualmente
conflito_sigvoos_json   TEXT,          -- JSON com valores em conflito (campo: {cv_value, sigvoos_value})
```

### 17.2 Extensões de `cv_voo_tripulantes`

```sql
-- Campos a adicionar em cv_voo_tripulantes (via migration futura):
sigvoos_identificador   TEXT,          -- Identificador do tripulante no SIGVOOS
sigvoos_canac           TEXT,          -- CANAC vindo do SIGVOOS
horas_voo_min           INTEGER,       -- Horas de voo em minutos (para derivação FRMS)
tempo_noturno_min       INTEGER,       -- Tempo noturno em minutos
tempo_ifr_min           INTEGER,       -- Tempo IFR em minutos
jornada_frms_id         TEXT,          -- FK para frms_jornada (quando derivado)
jornada_derivada_em     TEXT,          -- Timestamp da derivação ao FRMS
fonte_resolucao         TEXT,          -- CANAC/MATRICULA/NOME_FUZZY/MANUAL/NAO_ENCONTRADO
```

### 17.3 Nova Tabela `cv_sigvoos_staging`

```sql
-- Tabela de staging (proposta):
CREATE TABLE cv_sigvoos_staging (
  id              TEXT PRIMARY KEY,
  empresa_id      INTEGER NOT NULL,
  sigvoos_voo_id  TEXT,                -- ID do voo no SIGVOOS (se disponível)
  sigvoos_leg_id  TEXT,                -- ID da etapa (se disponível)
  data_voo        TEXT NOT NULL,       -- Data da etapa (YYYY-MM-DD)
  payload_raw     TEXT NOT NULL,       -- JSON bruto da etapa
  status          TEXT NOT NULL DEFAULT 'PENDING'
                  CHECK(status IN ('PENDING','PROCESSED','ERROR','IGNORED','CONFLICT')),
  cv_voo_id       INTEGER,             -- FK para cv_voos quando processado
  erro_msg        TEXT,
  processado_em   TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at      TEXT
);
```

### 17.4 Extensão do FRMS Source Policy

Quando o CV se tornar canônico, a source policy precisará ser expandida:

```typescript
// frms-source-policy.ts — futura mudança:
export const FRMS_CANONICAL_OPERATIONAL_SOURCES = ['SIGVOOS', 'CONTROLE_VOOS'] as const;
// Ou, mais limpo: renomear SIGVOOS para CONTROLE_VOOS e fazer o adaptador inserir com essa origem
```

---

## 18. Estratégia de Sincronização Incremental

### 18.1 Importador SIGVOOS → CV

```
1. Ler janela de datas (cron ou manual)
2. Chamar SIGVOOS API (mesmo padrão atual de paginação e auth)
3. Para cada etapa:
   a. Inserir em cv_sigvoos_staging (status=PENDING)
   b. Tentar resolver voo em cv_voos:
      - UNIQUE por (empresa_id, sigvoos_voo_id) se disponível
      - Fallback: (empresa_id, prefixo, data_programacao)
   c. Se voo não existe → criar
   d. Se voo existe e campos não editados → atualizar
   e. Se voo existe e campo editado → criar conflito
4. Resolver tripulantes (mesma cascata: MANUAL → CANAC → MATRICULA → NOME_FUZZY)
5. Upsert em cv_voo_tripulantes
6. Marcar staging como PROCESSED ou CONFLICT
```

### 18.2 Adaptador CV → FRMS

```
1. Por empresa, buscar cv_voo_tripulantes onde status do voo = 'concluido_operacionalmente'
   E onde jornada_derivada_em IS NULL (não derivado ainda)
2. Agregar por (funcionario_id, data_voo):
   - horaApresentacao = MIN(horario_apresentacao)
   - horaTermino = MAX(horario_dispensa)
   - horasVooMin = SUM(horas_voo_min)
   - tempoNoturnoMin = SUM(tempo_noturno_min)
   - tempoIfrMin = SUM(tempo_ifr_min)
3. Chamar salvarJornada() com origem='CONTROLE_VOOS' (ou 'SIGVOOS' transitoriamente)
4. Marcar cv_voo_tripulantes.jornada_frms_id e jornada_derivada_em
```

---

## 19. Estratégia de Backfill

Para dados históricos:

1. **Fase 1**: Importar via SIGVOOS API os últimos N meses para `cv_sigvoos_staging` e `cv_voos`
2. **Fase 2**: Derivar para FRMS via adaptador CV→FRMS
3. **Fase 3**: Comparar `frms_jornada` resultante do adaptador vs. as jornadas atuais (via SIGVOOS direto)
4. **Critério de aceitação do backfill**: Divergência < 1% em `horas_voo_minutos` agregados por mês

---

## 20. Estratégia de Shadow Mode

O shadow mode consiste em **rodar os dois caminhos em paralelo** e comparar resultados:

```
Caminho A (atual):    SIGVOOS → syncSigvoosForFrms → frms_jornada(origin=SIGVOOS)
Caminho B (novo):     SIGVOOS → importador-CV → cv_voos → adaptador → frms_jornada(origin=CONTROLE_VOOS)
```

**Implementação sugerida:**
1. O adaptador CV→FRMS escreve em `frms_jornada` com `origem = 'CONTROLE_VOOS'` (não usado em alertas/rolling ainda)
2. Um novo endpoint `/api/controle-voos/frms/shadow-compare` lista divergências entre os dois caminhos por tripulante/data
3. Métricas: `horas_voo_minutos` e `duracao_jornada_minutos` por mês
4. Critério de virada: < 0.5% de divergência por 7 dias consecutivos

---

## 21. Estratégia de Comparação FRMS Antigo vs. Novo

Comparar lado a lado:

| Dimensão | FRMS Antigo (SIGVOOS direto) | FRMS Novo (via CV) |
|---|---|---|
| Total horas voo/mês por tripulante | `SUM(horas_voo_minutos) WHERE origem='SIGVOOS'` | `SUM(horas_voo_minutos) WHERE origem='CONTROLE_VOOS'` |
| Alertas gerados | `frms_alerta WHERE origem='SIGVOOS'` | `frms_alerta WHERE origem='CONTROLE_VOOS'` |
| Jornadas em `frms_acumulo_rolling` | Atual | Novo |
| Tripulantes com divergência > 30min | Target: 0 | — |

---

## 22. Plano de Migração em Etapas

### Etapa 0 — Preparação (1–2 semanas)
- [ ] Definir `sigvoos_voo_id` (ou estratégia de dedup sem ID externo)
- [ ] Confirmar se a API SIGVOOS expõe ID único de voo ou de etapa
- [ ] Definir política de campos editáveis vs. controlados pelo SIGVOOS
- [ ] Decidir: `origem='CONTROLE_VOOS'` ou manter `'SIGVOOS'` na derivação

### Etapa 1 — Schema (migration, revisão e aprovação)
- [ ] Adicionar campos em `cv_voos` (sigvoos_voo_id, origem_importacao, etc.)
- [ ] Adicionar campos em `cv_voo_tripulantes` (sigvoos_identificador, horas_voo_min, etc.)
- [ ] Criar `cv_sigvoos_staging`
- [ ] Atualizar source policy se necessário

### Etapa 2 — Importador SIGVOOS → CV
- [ ] `worker-airtrust/src/services/sigvoos-cv-importer.ts`
- [ ] Endpoint manual: `POST /api/controle-voos/sigvoos/sincronizar`
- [ ] Testes unitários com payloads reais
- [ ] Testes de idempotência (sincronizar o mesmo período 2x)

### Etapa 3 — Adaptador CV → FRMS
- [ ] `worker-airtrust/src/services/cv-frms-adapter.ts`
- [ ] Endpoint manual: `POST /api/controle-voos/frms/derivar`
- [ ] Comparador shadow: `/api/controle-voos/frms/shadow-compare`
- [ ] Testes de agregação por tripulante/data

### Etapa 4 — Shadow Mode
- [ ] Rodar importador CV em paralelo ao cron SIGVOOS atual
- [ ] Comparar resultados diariamente por 7–14 dias
- [ ] Validar alertas equivalentes

### Etapa 5 — Virada Controlada
- [ ] Atualizar source policy para aceitar `CONTROLE_VOOS`
- [ ] Desabilitar `SIGVOOS` como fonte canônica de alertas
- [ ] Redirecionar cron de `/api/integracoes/sigvoos` para `/api/controle-voos/sigvoos/sincronizar`
- [ ] Monitorar por 30 dias

### Etapa 6 — Descomissionamento (Fase B)
- [ ] Remover chamada direta SIGVOOS → FRMS
- [ ] Arquivar `syncSigvoosForFrms` como legado
- [ ] Controle de Voos passa a ser a fonte primária operacional

---

## 23. Lista de Decisões Pendentes

1. **`sigvoos_voo_id`**: A API SIGVOOS expõe um identificador estável de voo ou de etapa? Se não, como dedupliar?
2. **Origem no FRMS**: O adaptador deve criar jornadas com `origem='CONTROLE_VOOS'` (requer expansão do source policy) ou `origem='SIGVOOS'` (reutiliza a policy atual)?
3. **Granularidade do voo no CV**: O CV registra etapas individuais (um registro por trecho) ou voos completos (um registro por voo com múltiplos trechos)? O SIGVOOS entrega por etapa/leg.
4. **Tripulante sem mapeamento no CV**: O comportamento deve ser igual ao atual (jornada pendente) ou o CV deve bloquear o voo de ser criado sem tripulante?
5. **Horário de jornada FRMS**: O adaptador deve usar `cv_voo_tripulantes.horario_apresentacao` ou `cv_voos.horario_real_partida`? Podem divergir.
6. **Voo cancelado no SIGVOOS**: Deve gerar `cv_voos.status = 'cancelado'`? Ou apenas ignorar?
7. **Campos de repouso offshore**: `repouso_plataforma_*` são críticos para FRMS offshore. O CV deve capturar isso? O SIGVOOS fornece?
8. **Shadow mode duration**: Quanto tempo de comparação antes de virar? 7 dias? 30 dias?
9. **Manutenção de backfill**: Quantos meses de histórico do SIGVOOS devem ser backfillados para o CV antes da virada?
10. **Política de sobrescrita**: Por campo ou por categoria de campo? Ou uma opção configurável por empresa?

---

## 24. Lista de Perguntas Técnicas para o Fornecedor/API SIGVOOS

1. A resposta de `/relatorios/voos/tripulantes/etapas/pesquisa` inclui um campo de ID único por etapa (leg) ou por voo (flight)?
2. Existe endpoint de voos completos (não por etapa/tripulante) que retorne número do voo, origem, destino, tipo?
3. O campo `staff.inscription` é único por tripulante em todos os contextos?
4. Quando um voo é cancelado, ele aparece na pesquisa de etapas ou não?
5. Existe webhook ou mecanismo de push para notificação de novos voos ou alterações?
6. Qual a janela máxima de retroatividade que a API aceita sem degradação?
7. O campo `flight_report_leg` está sempre presente ou é opcional?
8. `date_start` e `date_finish` filtram por data de partida ou por qualquer data da etapa?
9. O sistema suporta paginação real ou sempre retorna tudo em uma página?
10. Existe ambiente de sandbox/homologação para testes de integração?

---

## 25. Checklist para a Próxima Etapa de Implementação

### Antes de criar qualquer migration:
- [ ] Confirmar identificador único de voo no SIGVOOS (perguntas 1 e 3 acima)
- [ ] Definir `origem_importacao` values (decisão 2)
- [ ] Revisar `frms-source-policy.ts` com a equipe para decidir se CONTROLE_VOOS precisa de novo valor
- [ ] Revisar segurança da rota de manutenção

### Antes de implementar o importador SIGVOOS → CV:
- [ ] Schema migration aprovado e aplicado em local
- [ ] Testes do importador com payload real do SIGVOOS
- [ ] Definir comportamento de dedup (decisão 1)
- [ ] Definir comportamento de cancelamento (decisão 6)

### Antes de implementar o adaptador CV → FRMS:
- [ ] Regras de agregação definidas (decisão 5)
- [ ] Campos de repouso offshore mapeados (decisão 7)
- [ ] Testes de divergência em shadow mode

### Antes de virar o FRMS para o CV:
- [ ] Shadow mode por mínimo 7 dias sem divergência > 0.5%
- [ ] Alertas FRMS equivalentes validados manualmente para 3 tripulantes-amostra
- [ ] Rollback plan documentado e testado
- [ ] Comunicação para equipe operacional sobre mudança de fonte

---

## Conclusão

**O próximo passo correto é a sequência de 5 etapas listada no escopo:**

1. **Criar tabelas de staging/raw** para SIGVOOS no Controle de Voos (extensões em `cv_voos`, `cv_voo_tripulantes` + nova `cv_sigvoos_staging`)
2. **Criar importador SIGVOOS → CV** em paralelo ao fluxo atual (não substituir ainda)
3. **Criar adaptador CV → FRMS** escrevendo jornadas com nova origem (shadow mode)
4. **Comparar resultados** em shadow mode por 7–14 dias
5. **Só então desligar** o caminho antigo `SIGVOOS → frms_jornada` diretamente

O caminho antigo (`syncSigvoosForFrms`) deve ser mantido em produção **até o shadow mode validar a equivalência dos resultados FRMS**. Não há risco em manter os dois em paralelo — o source policy atual já filtra por `origem`, então jornadas com nova origem não interferem nos alertas e acúmulos vigentes.
