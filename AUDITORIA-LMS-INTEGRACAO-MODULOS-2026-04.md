# AUDITORIA: LMS × Todos os Módulos — AirTrust

**Data:** Abril 2026  
**Escopo:** Observação e mapeamento. Zero correções.  
**Objetivo:** O que cada módulo faz, quais dados produz/consome, e onde e como o LMS se encaixa (ou não) em cada fluxo.

---

## 1. INVENTÁRIO DE MÓDULOS

| Módulo                       | Arquivo(s) principal(is)                          | Tabelas centrais                                                               |
| ---------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------ |
| LMS – Cursos                 | `lms-cursos.ts`                                   | `lms_cursos`                                                                   |
| LMS – Matrículas             | `lms-matriculas.ts`                               | `lms_matriculas`                                                               |
| LMS – Progresso              | `lms-progresso.ts`                                | `lms_progresso_scorm`, `lms_xapi_statements`                                   |
| LMS – Relatórios             | `lms-relatorios.ts`                               | (reads above)                                                                  |
| LMS – EdApp Legacy           | `lms-edapp-legado.ts`, `integracoes_edapp.ts`     | `lms_historico_importado`                                                      |
| Qualificações – Histórico    | `qualificacoes/` (dir)                            | `qualificacoes_historico`                                                      |
| Qualificações – Tipos        | `qualificacoes/` (dir)                            | `qualificacoes_tipos`                                                          |
| Qualificações – Alertas      | `qualificacoes-alertas.ts`                        | reads `qualificacoes_historico`                                                |
| Qualificações – Certificados | `qualificacoes-certificados*.ts`                  | `qualificacoes_historico`, `certificados_templates`                            |
| Compliance                   | `compliance.ts`, `compliance-recalculate.ts`      | `compliance_status`, `historico_compliance`, `requisitos_compliance` (ausente) |
| Simuladores                  | `simuladores-sessoes.ts`, `simuladores-fichas.ts` | `sessoes_simulador`, `sessoes_checks`, `qualificacoes_historico`               |
| Escalas                      | `escalas-*.ts` (20 arquivos)                      | `escalas_mensais`, `escala_eventos`, `escala_tripulacoes`                      |
| FRMS                         | `frms*.ts`                                        | `frms_fadiga_checkin`, `frms_jornada`, `frms_alerta`, etc.                     |
| SGSO                         | `sgso*.ts`                                        | `sgso_relatos`, `sgso_auditorias`, `sgso_nao_conformidades`, etc.              |
| Notificações                 | `notificacoes.ts`, `cron/notificacoes.ts`         | `notificacoes_inapp`, `notificacoes_log`, `notificacoes_config`                |
| Dashboard                    | `dashboard.ts`, `services/dashboardService.ts`    | reads múltiplas tabelas                                                        |
| Solicitações Treinamento     | `solicitacoes-treinamento.ts`                     | `solicitacoes_treinamento`                                                     |
| Funcionários                 | `funcionarios.ts`, `funcionarios-mutations.ts`    | `funcionarios`                                                                 |
| Ficha 360                    | `ficha360.ts`                                     | UNION: `lms_matriculas` ∪ `lms_historico_importado`                            |

---

## 2. MÓDULO LMS — ANÁLISE DETALHADA

### 2.1 O que o módulo faz

O LMS gerencia cursos digitais (SCORM 1.2/2004, H5P/xAPI, vídeo, PDF, PPTX) com matrículas por funcionário. Suporta:

- Catálogo de cursos (`lms_cursos`)
- Matrículas individuais e em lote (`lms_matriculas`)
- Armazenamento de estado SCORM (suspend_data, CMI completo)
- Statements xAPI para conteúdo H5P
- Geração automática de qualificação ao concluir
- Notificações inapp em eventos de matrícula
- Lembretes de prazo via cron diário

### 2.2 Schema central

**`lms_cursos`** — campos relevantes para integração:

```
qualificacao_tipo_id   INTEGER   → FK 1:1 para qualificacoes_tipos (UM tipo por curso)
gerar_qualificacao_ao_concluir  INTEGER DEFAULT 0
tipo_conteudo          TEXT      scorm | h5p | video | pdf | pptx
version_tag            TEXT
```

**`lms_matriculas`** — campos relevantes:

```
status                 NAO_INICIADO | EM_ANDAMENTO | CONCLUIDO | REPROVADO | CANCELADO
qualificacao_historico_id  INTEGER → FK para qualificacoes_historico (preenchido pós-conclusão)
data_expiracao         DATE      prazo de conclusão (não validade da qualificação)
UNIQUE(curso_id, funcionario_id, empresa_id) → uma matrícula ativa por curso
```

### 2.3 Fluxo de geração de qualificação

Três caminhos disparam `createLmsQualificationOnCompletion()`:

```
SCORM commit  ───── isScormSuccess() = true ─────┐
xAPI statement ──── COMPLETION_VERBS + result ───┼──► createLmsQualificationOnCompletion()
Admin manual  ───── PATCH /:id/status → CONCLUIDO ┘
```

O serviço `lms-qualification.ts` faz:

1. Checa se `existingHistoricoId` já existe → retorna sem duplicar (idempotente)
2. Checa por deduplicação por `(empresa_id, funcionario_id, qualificacao_codigo, data_conclusao)`
3. Insere em `qualificacoes_historico` com:
   - `tipo = 'LMS'`
   - `status = 'CONCLUIDA'`
   - `observacoes = 'Origem: LMS | Gerado automaticamente ao concluir: <titulo>'` (texto livre, não estruturado)
   - `validade_meses` = validade do tipo (padrão 12 se null)
   - `data_vencimento` calculada via `calcularDataVencimento()`
4. Faz `UPDATE lms_matriculas SET qualificacao_historico_id = ?` (link unidirecional)

### 2.4 Dados produzidos pelo LMS

| Dado                  | Tabela                    | Observação                                                                         |
| --------------------- | ------------------------- | ---------------------------------------------------------------------------------- |
| Registro de matrícula | `lms_matriculas`          | Com status e progresso                                                             |
| Estado SCORM          | `lms_progresso_scorm`     | suspend_data, CMI, scores                                                          |
| Statements xAPI       | `lms_xapi_statements`     | Para H5P                                                                           |
| Qualificação          | `qualificacoes_historico` | Apenas se `gerar_qualificacao_ao_concluir = 1` E `qualificacao_tipo_id` preenchido |
| Notificação inapp     | `notificacoes_inapp`      | Nova matrícula, cancelamento, prazo vencendo (1d/7d)                               |
| Audit log             | `audit_log`               | Ações de matrícula/conclusão/cancelamento                                          |

### 2.5 EdApp Legacy (canal paralelo)

O módulo `lms-edapp-legado.ts` importa histórico do EdApp para `lms_historico_importado`. Este canal é **separado** de `lms_matriculas`. A tabela `lms_historico_importado` contém registros de conclusão legados com campos equivalentes mas estrutura diferente.

Atualmente, **apenas `ficha360.ts`** faz UNION entre `lms_matriculas` e `lms_historico_importado`. Os demais módulos (compliance, alertas, relatórios) **não enxergam** os registros legados EdApp.

---

## 3. MÓDULO QUALIFICAÇÕES — ANÁLISE DETALHADA

### 3.1 O que o módulo faz

Registra o histórico de qualificações (INICIAL, RECORRENTE, UPGRADE, ESPECÍFICO) por funcionário. É a tabela de verdade para status de validade de habilitações aeronáuticas. Alimenta compliance, alertas e a ficha 360.

### 3.2 Schema central

**`qualificacoes_historico`** — 32 colunas. Relevantes:

```
tipo                TEXT   'LMS' | 'PRESENCIAL' | 'SIMULADOR' | (outros)
status              TEXT   'CONCLUIDA' | 'PLANEJADA' | ...
sessao_id           INT    → FK sessoes_simulador (quando origem = simulador)
renovacao_de        INT    → self-FK para renovações encadeadas
tipo_treinamento    TEXT   'INICIAL' | 'RECORRENTE' | 'UPGRADE' | 'ESPECIFICO'
```

**Ausências significativas no schema:**

- Sem `lms_matricula_id` — não há FK de volta para `lms_matriculas`
- Sem campo `origem` enum estruturado (a origem LMS é inferida pelo campo texto `observacoes`)
- Sem booleano/FK indicando "gerado automaticamente vs manual"

### 3.3 Módulo de alertas (`qualificacoes-alertas.ts`)

- Lê `qualificacoes_historico` + funcionarios + qualificacoes_tipos
- Calcula `dias_ate_vencimento` a partir do `data_vencimento` armazenado
- Filtra para mostrar alertas com `dias_ate_vencimento <= 60` (vencendo) ou `< 0` (vencido)
- Urgências: critical (≤0d), high (?), medium (?), low (≤60d)
- **Sem conexão com LMS**: não sabe se o funcionário já tem uma matrícula LMS ativa para renovar a qualificação expirando

### 3.4 Compliance (`compliance.ts`)

O módulo calcula conformidade por funcionário comparando qualificações/licenças ativas com requisitos por função.

**Estado atual em produção: motor effective INOPERANTE.**

```sql
-- Tabela requisitos_compliance NÃO existe em produção
-- O código tem try/catch e silencia o erro:
try {
  const reqCols = await getTableColumns(c.env.DB, 'requisitos_compliance');
  if (reqCols.size > 0) { /* buscar requisitos */ }
} catch { /* ignorado */ }
```

Consequência: Todo funcionário retorna `requisitos: []` e `status: 'conforme'` por default — sem qualquer verificação real.

A tabela `historico_compliance` existe mas não há código que escreva nela nas rotas lidas.

---

## 4. MÓDULO SIMULADORES — INTEGRAÇÃO COM QUALIFICAÇÕES

### 4.1 O que o módulo faz

Gerencia sessões de simulador (agendamento, participantes, fichas de avaliação, checks).

### 4.2 Integração com Qualificações

- `sessoes_checks`: tabela N:N entre `sessao_id` e `qualificacao_tipo_id`
- Quando um check é aprovado em sessão de simulador, o módulo `simuladores-fichas.ts` gera uma entrada em `qualificacoes_historico` com `sessao_id` preenchido
- A tabela `qualificacoes_historico.sessao_id` é a evidência dessa origem

### 4.3 Integração com LMS

**Zero.** O módulo de simuladores não referencia `lms_cursos`, `lms_matriculas` ou verifica se o participante concluiu algum pré-requisito de e-learning antes da sessão.

---

## 5. MÓDULO ESCALAS — ANÁLISE

### 5.1 O que o módulo faz

20 arquivos de rota — gerencia escalas mensais de tripulação, eventos, confirmações, exportação, conflitos, disponibilidade, tripulações, etc.

### 5.2 Verificação de conflitos (`escalas-conflitos.ts`)

O módulo verifica:

- Sobreposições de eventos do mesmo funcionário
- Restrições de tripulação (quem não pode voar junto)
- Conflitos de tripulações sobrepostas

O conjunto `AUTO_EVENTOS_SUBSTITUIVEIS` inclui `'treinamento_simulador'` e `'licenca'` mas isso é sobre **tipo de evento** no calendário, não sobre verificação de validade de qualificação.

**O que o módulo NÃO verifica:**

- Validade de qualificações do piloto para o voo agendado
- Licença ANAC/ANPAS válida
- Conclusão de cursos LMS obrigatórios para aquela operação
- Status de compliance do tripulante

### 5.3 Potencial de integração com LMS

Nenhum fluxo atual. Um piloto com qualificação vencida ou treinamento LMS pendente pode ser escalonado sem qualquer alerta.

---

## 6. MÓDULO FRMS — ANÁLISE

### 6.1 O que o módulo faz

Gerencia Fatigue Risk Management System: check-ins de fadiga, acúmulo de jornada, alertas de limite, rolling windows mensais, importação FIRA, avaliação de gestor.

### 6.2 Integração com LMS/Qualificações

**Zero.** As tabelas FRMS são completamente isoladas do LMS e qualificações. O cron `frms-daily-check.ts` e `frms-fadiga-reminder.ts` enviam notificações próprias.

**Potencial não realizado:** Uma alta pontuação de fadiga poderia disparar automaticamente a recomendação de um curso LMS de CRM/fatigue awareness. Não há esse caminho.

---

## 7. MÓDULO SGSO — ANÁLISE

### 7.1 O que o módulo faz

Sistema de Gerenciamento de Segurança Operacional: relatos de perigos, avaliações de risco, Bow-Tie, MOC (Management of Change), não-conformidades, auditorias, KPIs SPI.

### 7.2 Integração com LMS/Qualificações

**Zero.** `sgso-next-gen.ts` não tem uma única referência a `lms_*`, `qualificacoes_*`, `treinamento`, ou `capacitacao`.

**Potencial não realizado (arquiteturalmente crítico):**

- Uma não-conformidade de safety poderia triggar uma ação corretiva de treinamento
- Uma auditoria com finding poderia gerar uma solicitação de treinamento automática
- Um relato de perigo recorrente poderia exigir recertificação de qualificação
- Nada disso existe no código atual

---

## 8. MÓDULO NOTIFICAÇÕES / CRON — ANÁLISE

### 8.1 Scheduled jobs (cron/scheduled-handler.ts)

| Gatilho         | Job                                          | Integração LMS                                                  |
| --------------- | -------------------------------------------- | --------------------------------------------------------------- |
| `*/10 * * * *`  | EdApp reconciliation                         | Sim — reconcilia completions EdApp com lms_historico_importado  |
| `0 8 * * *`     | `alertasDiariosHandler`                      | Não — qualificações expirando                                   |
| `0 8 * * *`     | LMS deadline reminders                       | **Sim** — query em `lms_matriculas` para `data_expiracao` 1d/7d |
| `0 8 * * *`     | `processarNotificacoesSgso`                  | Não                                                             |
| `0 8 * * *`     | `frmsDailyCheck`                             | Não                                                             |
| `0 8 * * *`     | `frmsFadigaReminder`                         | Não                                                             |
| `0 3/4/5 * * *` | Backup automático                            | Não                                                             |
| Daily           | Snapshot qualificacoes_historico_stats_daily | Não (stats only)                                                |

### 8.2 Notificações LMS cobertas

- `lms_nova_matricula` → notificação inapp ao ser matriculado
- `lms_matricula_status` → notificação de cancelamento
- `lms_prazo_conclusao_1_dia` → cron diário
- `lms_prazo_conclusao_7_dias` → cron diário

### 8.3 Notificações LMS ausentes

- Conclusão de curso gerando qualificação → nenhuma notificação ao gestor/RH
- Qualificação expirando com curso LMS disponível → nenhuma sugestão de matrícula
- Tripulante com compliance crítico e LMS incompleto → nenhum alerta combinado

---

## 9. MÓDULO DASHBOARD — ANÁLISE

### 9.1 Endpoints existentes

```
GET /api/dashboard/qualificacoes       → stats de qualificacoes_historico
GET /api/dashboard/licencas            → stats de licencas
GET /api/dashboard/metrics             → getDashboardMetrics() — inclui lms
GET /api/dashboard/alertas-criticos    → getDashboardAlerts() — apenas qualificações
GET /api/dashboard/compliance-score    → getComplianceScore()
GET /api/dashboard/demanda-treinamento → getDemandaTreinamento()
GET /api/dashboard/atividades-recentes → getAtividadesRecentes()
GET /api/dashboard/taxa-conclusao-mensal
GET /api/dashboard/utilizacao-simuladores
GET /api/dashboard/system-health
```

### 9.2 Presença do LMS no dashboard

`getDashboardMetrics()` retorna um objeto `lms`:

```json
{
  "totalCursos": number,
  "totalMatriculas": number,
  "concluidos": number,
  "emAndamento": number,
  "taxaConclusaoPct": number
}
```

Este bloco existe mas é um **widget isolado** — não alimenta o compliance score, não aparece nos alertas críticos e não influencia o score de conformidade.

### 9.3 Lacunas no dashboard

- `getDashboardAlerts()` busca apenas qualificações vencendo — não inclui matrículas LMS pendentes obrigatórias
- `getDemandaTreinamento()` lê `simulador_agendamentos` (não `solicitacoes_treinamento`, não LMS)
- `getTaxaConclusaoMensal()` lê `simulador_agendamentos` (não `lms_matriculas`)
- compliance-score não é afetado por LMS

---

## 10. MÓDULO SOLICITAÇÕES DE TREINAMENTO — ANÁLISE

### 10.1 O que o módulo faz

Workflow de solicitação e aprovação de treinamentos presenciais:

```
SOLICITADA → APROVADA_GESTOR → APROVADA_OPS → AGENDADA → CONCLUIDA
                                                          ↑
                                                  (ou REJEITADA)
```

### 10.2 Schema relevante

```
solicitacoes_treinamento:
  qualificacao_id        INT    → FK qualificacoes_tipos (link para tipo requerido)
  sessao_simulador_id    TEXT   → pode linkar a sessão de simulador ao agendar
  tipo_treinamento       TEXT   INICIAL | RECORRENTE | SEMESTRAL | UPGRADE | ESPECIFICO
```

### 10.3 Integração atual com LMS

**Zero.** Ao marcar uma solicitação como CONCLUIDA:

- Nenhuma entrada em `qualificacoes_historico` é criada
- Nenhuma matrícula LMS é ativada/criada
- O link para `qualificacao_id` existe no schema mas não é usado para acionar nada

O endpoint `concluir` atualiza apenas o status e `data_realizada` — ponto final.

**Ausência crítica:** `solicitacoes_treinamento` não tem `lms_matricula_id`. Não há forma de saber se uma solicitação foi atendida via LMS ou presencialmente.

---

## 11. FICHA 360 — ANÁLISE DA VISÃO CONSOLIDADA

### 11.1 O que inclui

```sql
-- Seção Treinamentos (após fix de Abril/2026):
SELECT ... FROM lms_matriculas
WHERE funcionario_id = ? AND empresa_id = ?
UNION ALL
SELECT ... FROM lms_historico_importado
WHERE funcionario_id = ? AND empresa_id = ?
```

### 11.2 O que ainda falta na ficha

- `solicitacoes_treinamento` não aparece na ficha
- Qualificações geradas por LMS não são destacadas como tal (a coluna `tipo = 'LMS'` existe mas UI pode não mostrar)
- Não há visão de "cursos disponíveis para renovação desta qualificação"
- Histórico de compliance não aparece

---

## 12. MAPA DE INTEGRAÇÃO ATUAL (REAL)

```
lms_cursos ──────────────────────────────────────────────────────┐
      │  qualificacao_tipo_id (1:1)                               │
      ▼                                                           │
lms_matriculas ──── qualificacao_historico_id ──► qualificacoes_historico
      │ (lms-matriculas.ts)                              │
      │                                                  │ sessao_id
      ▼                                                  ▼
lms_progresso_scorm                               sessoes_simulador
lms_xapi_statements

     ↑ cron (EdApp reconciliation, a cada 10min)
lms_historico_importado ──── ficha360.ts (UNION) ─────────────────────────────────────────►

qualificacoes_historico ──── qualificacoes_alertas.ts ──► alertas de vencimento
                        ──── compliance.ts ──► INOPERANTE (requisitos_compliance ausente)
                        ──── dashboard.ts ──► métricas de qualificações
                        ──── notificacoes (cron) ──► alertas WhatsApp/email

lms_matriculas ──── dashboard.ts (lms widget isolado)
               ──── cron (lembretes 1d/7d inapp)

solicitacoes_treinamento ──── [isolado, sem downstream automático]
sgso_* ──── [isolado, sem ligação com LMS/qualificações]
frms_* ──── [isolado, sem ligação com LMS/qualificações]
escalas_* ──── [não verifica qualificações/LMS dos tripulantes]
```

---

## 13. LACUNAS MAPEADAS

### L1 — Rastreabilidade Bidirecional [ALTA GRAVIDADE]

**Situação:** `lms_matriculas` → `qualificacoes_historico` existe (via `qualificacao_historico_id`).  
`qualificacoes_historico` → `lms_matriculas` **NÃO existe** (sem `lms_matricula_id`).  
A "origem" da qualificação é inferida por texto livre no campo `observacoes`.

**Impacto:** Não é possível saber, a partir de uma qualificação, se ela foi gerada por LMS ou manualmente. Relatórios de compliance não conseguem distinguir.

---

### L2 — Requisitos por Função Inexistentes [ALTA GRAVIDADE]

**Situação:** `requisitos_compliance` não existe em produção. O módulo de compliance retorna `status: 'conforme'` para todos os funcionários sem verificar nada.

**Impacto:** O compliance engine é ornamental — não valida nenhum requisito real.

---

### L3 — Cursos Obrigatórios por Função [ALTA GRAVIDADE]

**Situação:** `lms_cursos_funcoes_obrigatorias` não existe. Não há como definir que "Pilotos PIC devem concluir o curso X" e rastrear automaticamente quem está em falta.

**Impacto:** Currículo obrigatório por função é puramente manual — sem automação, sem alertas, sem bloqueios de escala.

---

### L4 — Qualificação Expirando ≠ Matrícula LMS Sugerida [ALTA]

**Situação:** O módulo de alertas detecta que a qualificação Y do funcionário Z vence em 30 dias. Mas não verifica se existe um curso LMS associado ao tipo de qualificação Y, e não sugere/cria matrícula automaticamente.

**Impacto:** O operador precisa manualmente detectar o alerta, identificar o curso correspondente, e matricular o funcionário.

---

### L5 — Solicitação de Treinamento sem Efeito Downstream [ALTA]

**Situação:** Um treinamento é solicitado, aprovado e marcado como CONCLUIDO. Nenhuma qualificação é registrada, nenhuma matrícula LMS é criada ou marcada como concluída.

**Impacto:** O workflow de solicitação é uma burocracia sem consequência — não alimenta nenhum indicador real.

---

### L6 — Escalas não Verificam Validade de Treinamentos [ALTA]

**Situação:** O motor de conflitos de escalas verifica apenas sobreposição de tempo e restrições de crew pairing. Não invalida alocação de piloto com qualificação vencida ou treinamento LMS pendente obrigatório.

**Impacto:** Pilotos não conformes podem ser escalados. A conformidade operacional não é garantida pelo sistema.

---

### L7 — SGSO sem Ação Corretiva de Treinamento [MÉDIA]

**Situação:** Relatos SGSO, não-conformidades e findings de auditoria não têm forma de triggar uma ação corretiva de treinamento (LMS enrollment ou qualificação planejada).

**Impacto:** A cadeia Safety Occurrence → Ação Corretiva → Treinamento → Qualificação é completamente manual.

---

### L8 — Dashboard LMS Isolado [MÉDIA]

**Situação:** Métricas LMS existem no dashboard (`lms.totalCursos`, `lms.taxaConclusaoPct`) mas são exibidas isoladamente. Não afetam o compliance score, não geram alertas críticos, não aparecem na demanda de treinamento.

**Impacto:** LMS é percebido como módulo separado, não como pilar do compliance operacional.

---

### L9 — lms_historico_importado EdApp Invisível para Compliance/Alertas [MÉDIA]

**Situação:** Registros legados EdApp em `lms_historico_importado` só aparecem na Ficha 360 (após o fix de Abril/2026). Não são considerados em `compliance.ts`, `qualificacoes-alertas.ts`, ou relatórios LMS.

**Impacto:** Histórico legado existe mas não contribui para indicadores de conformidade.

---

### L10 — Relação N:N Curso ↔ Qualificação Não Modelada [BAIXA-MÉDIA]

**Situação:** `lms_cursos.qualificacao_tipo_id` é 1:1 (um curso gera no máximo um tipo de qualificação). Não existe tabela N:N.

**Impacto:** Um curso que gera múltiplas qualificações (ex: check de dupla habilitação) não é suportado. Conversamente, não é possível listar todos os cursos que habilitam para uma qualificação específica.

---

### L11 — catalogo_treinamentos vs lms_cursos [BAIXA]

**Situação:** Duas tabelas de catálogo coexistem: `catalogo_treinamentos` (pré-LMS) e `lms_cursos` (atual).

**Impacto:** Potencial de confusão. Propósito e relação entre elas não está documentado no código.

---

## 14. O QUE O LMS JÁ FAZ BEM (PONTOS DE FORÇA)

| Ponto                              | Detalhe                                                             |
| ---------------------------------- | ------------------------------------------------------------------- |
| Geração automática de qualificação | SCORM, xAPI e admin manual cobertos; idempotente e com deduplicação |
| Audit log completo                 | Todos os eventos de matrícula registrados em `audit_log`            |
| Notificações inapp                 | Nova matrícula, cancelamento e prazo cobertas                       |
| Lembretes de prazo (cron)          | 1d e 7d antes do `data_expiracao` com deduplicação                  |
| SCORM runtime persistence          | `suspend_data` persistido; aluno retoma de onde parou               |
| Multi-tenancy                      | `empresa_id` em tudo; nenhum vazamento cross-tenant detectado       |
| Reativação de matrícula cancelada  | Reusa o registro (resets estado), evita duplicidade UNIQUE          |
| Reconciliação EdApp (cron 10min)   | Sincronização contínua do legado                                    |

---

## 15. RESUMO EXECUTIVO

O LMS do AirTrust é **funcionalmente correto** como módulo isolado: gerenncia cursos, matrículas e progresso SCORM/xAPI, e produz qualificações ao concluir. O problema não é o que ele faz — é o que ele **não conecta**.

O sistema **ainda não** trata LMS como um pilar do compliance aeronáutico. Os três fluxos críticos para uma organização de aviação — (1) Qualificação expirando → currículo de renovação → matrícula automática, (2) Coluna vertebral de requisitos por função → verificação antes de escalar, (3) Ocorrência de segurança → ação corretiva → treinamento rastreável — estão completamente manuais.

A tabela `requisitos_compliance` inexistente em produção é a lacuna mais crítica do sistema: sem ela, o compliance engine retorna "conforme" para todos, tornando uma suite inteira de features ornamental.

A próxima evolução natural do LMS é **deixar de ser um catálogo de cursos** e se tornar o **motor de conformidade de treinamento** — conectado a qualificações por função, gatilhado por alertas de vencimento e por ocorrências SGSO, e verificado antes de publicar uma escala de voo.

---

_Auditoria gerada por mapeamento estático de código-fonte e schema D1 em produção._  
_Versão do worker auditada: `2026-04-20T22:15:36Z-770b6a005`_
