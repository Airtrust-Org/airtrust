# AIRTRUST — Escala Diária de Voo Audit and Design v0.4-A

## 1) Metadados da auditoria
- Data da auditoria: 2026-05-21
- Workspace: `/Users/filipedaumas/Documents/Airtrust`
- Branch: `main`
- HEAD: `ec9e20845e06c79b250807916383548a6d15a6d0`
- origin/main: `95699e0b4de02bfda9ff1169e08e57c47dc4c36e`
- Ahead/behind (`origin/main...HEAD`): `0 1`
- Working tree no início da auditoria: sem tracked modifications, sem staged diff, 3 docs untracked preexistentes.

## 2) Nota de base de auditoria
Esta auditoria foi executada sobre o working tree atual em `HEAD ec9e208`, que está **1 commit local à frente** de `origin/main`. As conclusões abaixo são válidas para este estado divergente aceito e devem ser revalidadas em árvore limpa antes de implementação.

## 3) Resumo executivo
- O módulo **Escalas** já está robusto para escala mensal (CRUD, calendário, alocações, cobertura por aeronave, quinzenas, conflitos, publicação e snapshots).
- A funcionalidade de **Escala Diária de Voo** já existe parcialmente como **EVD**:
  - Frontend: `/escalas/evd` (`EvdPage.tsx`)
  - Backend: `/api/evd` (`escalas-evd.ts`)
  - Tabela: `escala_voo_diaria` (migration 0279)
- O FRMS/fadiga diário já existe e produz sinal de risco operacional consumível por Escalas:
  - check-in diário (`frms_fadiga_checkin`)
  - status diário (`/api/frms/daily-fatigue`)
  - alertas diários (`/api/frms/daily-fatigue/alerts` + `frms_alerta`)
- `FrmsEscalas` não é escala operacional por aeronave/prefixo; é escala quinzenal FRMS por tripulante (`frms_escala_quinzenal`), útil como visão analítica de risco/ciclo.
- SIGVOOS já integra e reprocessa FRMS por cron e também possui gatilho manual.

## 4) Estado atual do módulo Escalas

### 4.1 Frontend (rotas e páginas)
- `src/react-app/App.tsx`
  - `/escalas` → `EscalasMensais`
  - `/escalas/configuracoes`
  - `/escalas/minha-escala`
  - `/escalas/evd` → `EvdPage`
- `src/react-app/navigation.config.ts`
  - menu “Escalas e FRMS” inclui “Planejamento de Escala” e “Voo Diário (EVD)”.

### 4.2 Componentes principais Escalas
- `src/react-app/pages/escalas/EscalasPage.tsx`
- `src/react-app/pages/escalas/EscalaPageContext.tsx`
- `src/react-app/pages/escalas/views/EscalasListagemView.tsx`
- `src/react-app/pages/escalas/views/EscalasDetalheView.tsx`
- Hooks/query infra:
  - `.../hooks/queries/useEscalasQueries.ts`
  - `.../hooks/mutations/useEscalasMutations.ts`
  - `.../hooks/queries/escalas-types.ts`

### 4.3 Como mensal/disponibilidade/quinzena/folga aparecem
- Modelo mensal principal: `escalas_mensais`.
- Cobertura por aeronave/dia: `escala_cobertura_diaria` via `/:id/cobertura`.
- Alocação individual operacional: `escala_alocacoes` com:
  - `funcao` (PIC/SIC etc.)
  - `aeronave_id` (pode ser null para situação)
  - `situacao_tipo` (ex.: STB, FERIAS, MED, etc.)
  - `quinzena_id`, `data_inicio`, `data_fim`, `status`.
- Situações sem aeronave (`escalas-situacoes.ts`) já permitem standby e afastamentos sem voo.
- Quinzena está explicitamente tratada em rotas de cobertura e alocação.

### 4.4 PIC/SIC e aeronave/prefixo no estado atual
- PIC/SIC já são campos operacionais reais, não apenas planejados:
  - legado: `escala_tripulacoes` (`pic_id`, `sic_id`, `aeronave`)
  - operacional atual: `escala_alocacoes` por função (`PIC`/`SIC`) + aeronave.
- Aeronave/prefixo já aparece no backend e frontend (joins com `aeronaves.prefixo`, `modelo`).

### 4.5 Endpoints relevantes Escalas
- Core mensal: `/api/escalas` (crud, status, calendário, eventos, conflitos, export, alocações, cobertura, etc.).
- FRMS score para alocação: `GET /api/escalas/frms-score/:funcionarioId`.
- EVD diário: `/api/evd` (`GET/POST/PUT/DELETE`, `POST /:id/publicar`, `GET /semana`).

### 4.6 Lacunas para Escala Diária
- EVD existe, mas ainda com foco em “voo” unitário e menos orientado a quadro diário por frota com publicação versionada por dia.
- Regras FRMS ainda não estão plenamente acopladas ao fluxo de decisão da escala diária (com justificativa estruturada em cada override).
- Necessidade de normalizar estado de “não alocado” para visão diária operacional (standby/disponível/não escalado).

## 5) Estado atual do FRMS/fadiga

### 5.1 Frontend FRMS existente
- `FrmsCheckinFadiga.tsx`
- `FrmsFadigaPainel.tsx`
- `FrmsFadigaAcumulada.tsx`
- `FrmsFadigaHistorico.tsx`
- `FrmsAlertasPainel.tsx`
- `FrmsEscalas.tsx`
- hooks: `useFadigaCheckin.ts`, `useFrms.ts`

### 5.2 Backend FRMS existente
- `worker-airtrust/src/routes/frms.ts`
- `worker-airtrust/src/routes/frms-fadiga-checkin.ts`
- `worker-airtrust/src/routes/frms-fadiga-acumulada.ts`
- `worker-airtrust/src/routes/frms-fira.ts`
- libs: `lib/frms/*` (alertas, cálculos, score, db-services).

### 5.3 Cálculo/score e status
- Score diário em `lib/frms/fadiga-score.ts` (KSS, sono, sintomas, meds/álcool).
- Níveis: `VERDE/AMARELO/LARANJA/VERMELHO`.
- Status operacional derivado: `APTO/APTO_COM_RESSALVA/INAPTO` e também `normal/attention/critical/unfit_for_duty/not_submitted` no daily-fatigue.

### 5.4 Dados FRMS já produzidos para uso em Escalas
- `GET /api/frms/daily-fatigue?date=...&scope=team`:
  - status por tripulante (`normal`, `attention`, `critical`, `unfit_for_duty`, `not_submitted`, `no_duty`)
  - `requires_operational_review`
  - indicador de origem (`crew_reported` vs `default_estimate`)
- `GET /api/frms/daily-fatigue/alerts?date=...`:
  - alertas persistidos e sintéticos para não preenchimento.

### 5.5 Mapa/heatmap/histórico
- Heatmap FRMS: `GET /api/frms/heatmap` (`frms-fira.ts`).
- Histórico de check-in: `GET /api/frms/fadiga-checkin/historico`.
- Painéis diários e analytics de fadiga já consumidos no frontend.

## 6) Estado atual de alertas
- FRMS alertas em `frms_alerta`, painel em `/frms/alertas`.
- Rotas FRMS de alerta:
  - `GET /api/frms/alertas`
  - `GET /api/frms/alertas/count`
  - `PUT /api/frms/alertas/:id/visualizar`
  - `PUT /api/frms/alertas/:id/resolver`
- Check-in diário cria alerta de fadiga (`[FADIGA_DIARIA]`) quando risco não normal.
- Há inserção de `notificacoes_sistema` para coordenação/gestão.
- `worker-airtrust/src/routes/alertas.ts` é majoritariamente alerta de vencimentos/WhatsApp (não substitui FRMS alert pipeline).

## 7) Estado atual do SIGVOOS/cron

### 7.1 Integração
- Rotas: `worker-airtrust/src/routes/integracoes_sigvoos.ts`
  - `POST /api/integracoes/sigvoos/sincronizar-frms`
  - `POST /api/integracoes/sigvoos/reprocessar-previews`
  - `POST /api/integracoes/sigvoos/reconciliar-pendencias`
  - maintenance local: `/maintenance/sincronizar-frms` com secret.
- Serviço: `worker-airtrust/src/services/sigvoos-frms.ts`.

### 7.2 Agendamento
- Cron principal no `wrangler.toml`: `*/10 * * * *`.
- `scheduled-handler.ts` executa sync quando hora UTC atual coincide com `auto_sync_hora_utc` da empresa e minuto < 10.
- Hora default configurada: `19` UTC (se não houver override).

### 7.3 Relação com FRMS
- Após sincronização SIGVOOS, há reprocessamento FRMS de tripulantes impactados no período.
- Dados e eventos persistidos em tabelas `integracoes_sigvoos_*` e reflexos em `frms_jornada`/alertas.

### 7.4 Onde alterar para 18h e riscos
- Ajuste principal: `auto_sync_hora_utc` por empresa (preferível via configuração, não hardcode).
- Riscos:
  - janela de dado incompleta caso operação real ainda não consolidada;
  - sobreposição com outros crons (limite de slots já citado no código);
  - dependência de timezone operacional BRT x UTC;
  - aumento de pendências se sincronização ocorrer cedo demais.

### 7.5 Chamada manual antes da montagem da escala
- Sim, já possível via endpoint manual `/api/integracoes/sigvoos/sincronizar-frms` (coordenação/ops).

## 8) Análise específica de FrmsEscalas
- `FrmsEscalas` (`/frms/escalas`) gerencia **escala quinzenal de embarque/folga por tripulante**.
- Persistência em `frms_escala_quinzenal`; não há eixo primário por aeronave/prefixo.
- Classificação: tela **analítica/apoio FRMS**, não substituta da escala operacional diária de voo.
- Não duplica diretamente `EscalasPage`; resolve problema diferente.
- Reaproveitável para contexto de ciclo e risco de fadiga, mas não como base primária de publicação operacional por aeronave.

## 9) Arquitetura recomendada (sem implementação)

### 9.1 Decisão macro
Implementar Escala Diária no **módulo Escalas** (núcleo operacional), com **FRMS como fonte de risco** e FrmsEscalas permanecendo como visão FRMS.

### 9.2 Rota frontend recomendada
- Primária: `/escalas/diaria`
- Compatibilidade: manter `/escalas/evd` como alias/transição até migração completa de UI.

### 9.3 Posição no menu
- Em “Escalas e FRMS”, abaixo de “Planejamento de Escala”.
- Rótulo sugerido: “Escala Diária de Voo”.

### 9.4 Componentes propostos
- `EscalaDiariaPage` (container)
- `EscalaDiariaBoardByAeronave` (quadro por prefixo/modelo)
- `EscalaDiariaAssignDrawer` (atribuir PIC/SIC por intervalo)
- `EscalaDiariaNaoAlocadosPanel` (standby/disponível/não escalado)
- `EscalaDiariaRiscoFrmsBadge` (status resumido)
- `EscalaDiariaPublishPanel` (pré-checagem, justificativas, publicar, PDF)
- `EscalaDiariaTimeline` (trocas intra-dia por período)

### 9.5 Endpoints propostos
Aproveitar `/api/evd` e evoluir contrato:
- `GET /api/evd?data=YYYY-MM-DD&view=frota`
- `GET /api/evd/:id`
- `POST /api/evd` (criação de bloco)
- `PUT /api/evd/:id` (troca/edição)
- `POST /api/evd/:id/publicar`
- Novo (sugerido):
  - `GET /api/evd/:data/nao-alocados`
  - `POST /api/evd/:id/justificativas` (override de alerta)
  - `GET /api/evd/:data/pdf`
  - `GET /api/evd/:data/revisoes`

### 9.6 Modelo de dados (reuso + extensões)
Reusar:
- `escala_voo_diaria` como base diária operacional.
- `escalas_mensais` + `escala_alocacoes` como disponibilidade macro.
- `frms_fadiga_checkin` + `frms_alerta` para risco.

Novas tabelas sugeridas (mínimas):
- `escala_voo_diaria_publicacoes`
  - snapshot versionado por data/empresa (payload + hash + publicado_por/em)
- `escala_voo_diaria_justificativas`
  - vincula decisão operacional a alertas/risco por item (quem, quando, motivo, aceite)
- Opcional: `escala_voo_diaria_status_tripulante`
  - normaliza `standby/disponivel/nao_escalado` por dia e janela.

### 9.7 Vínculos funcionais
- Escala mensal: fonte de elegibilidade/disponibilidade para a diária.
- FRMS: fornece status resumido e alertas (não bloqueio automático por fadiga alta).
- SIGVOOS: atualiza base de jornada/horas para melhor qualidade do risco antes da montagem diária.
- Alertas/notificações: coordenação, gestor FRMS e segurança operacional com trilha de resolução.

### 9.8 Troca PIC/SIC ao longo do dia
- Tratar cada bloco por intervalo (`hora_apresentacao` + janela operacional).
- Permitir múltiplos registros no mesmo dia/prefixo sem sobreposição de intervalo.
- Registrar motivo da troca + autor + timestamp + versão publicada impactada.

### 9.9 Não alocados (sem reserva formal)
- Usar `situacao_tipo` + status diário:
  - `STB` (standby)
  - `DISPONIVEL`
  - `NAO_ESCALADO`
- Não forçar criação de módulo de reserva separado.

### 9.10 Publicação tela/PDF + futuro e-mail/WhatsApp
- Tela: board diário interno com filtros por base/modelo/prefixo.
- PDF: endpoint de publicação/snapshot com render determinístico.
- Futuro: usar camada de notificações já existente para anexar snapshot/links (email/WhatsApp) sem reestruturar domínio.

### 9.11 Auditoria e versionamento
- Cada publicação diária gera revisão imutável.
- Edições pós-publicação exigem:
  - justificativa obrigatória
  - registro de diff entre revisões
  - identificação do decisor operacional.

## 10) Decisão recomendada
**Escala Diária deve ficar em Escalas, com FRMS como fonte de risco.**

Justificativa:
- Escalas já é o domínio de alocação operacional por aeronave/função/intervalo.
- FRMS já calcula risco e alerta, mas não é o domínio primário de publicação de escala por prefixo.
- Evita duplicação de módulo e mantém separação de responsabilidade: operação (Escalas) vs risco (FRMS).

## 11) Modelo de dados proposto (detalhado)

### Reuso obrigatório
- `escalas_mensais`
- `escala_alocacoes`
- `escala_voo_diaria`
- `frms_fadiga_checkin`
- `frms_alerta`

### Extensões propostas
- `escala_voo_diaria_publicacoes`
  - `id`, `empresa_id`, `data_ref`, `revisao`, `status`, `payload_json`, `checksum`, `publicado_por`, `publicado_em`, `created_at`
- `escala_voo_diaria_justificativas`
  - `id`, `escala_voo_diaria_id`, `funcionario_id`, `tipo_alerta`, `nivel_alerta`, `origem_alerta`, `justificativa`, `decisao`, `decisor_id`, `created_at`
- `escala_voo_diaria_movimentos` (opcional)
  - histórico de troca PIC/SIC por intervalo, antes/depois.

## 12) Endpoints propostos (detalhado)
- `GET /api/evd?data=...&view=frota` → board consolidado por prefixo.
- `POST /api/evd` → cria item de escala diária por intervalo.
- `PUT /api/evd/:id` → altera item (pré/pós publicação com regras).
- `POST /api/evd/:id/publicar` → publicação com validações.
- `POST /api/evd/:id/justificativas` → persistir override operacional.
- `GET /api/evd/:data/revisoes` → histórico de versões.
- `GET /api/evd/:data/pdf` → export publicado.
- `GET /api/evd/:data/nao-alocados` → painel de standby/disponível/não escalado.

## 13) Telas/componentes propostos
- Nova página principal: `/escalas/diaria` (pode inicialmente reaproveitar `EvdPage`).
- Componentes de board por aeronave/prefixo e timeline por dia.
- Painel de risco FRMS resumido por tripulante (sem expor detalhes sensíveis de check-in).
- Modal obrigatório de justificativa para manutenção de escala sob alerta.

## 14) Regras de bloqueio (duros)
- Copiloto como PIC quando não qualificado para função PIC.
- Tripulante sem qualificação válida para AW139/SK76.
- Aeronave sem PIC.
- Aeronave sem SIC.
- Tripulante fora da disponibilidade da escala mensal.
- Duplicidade do mesmo tripulante no mesmo intervalo.
- Aeronave indisponível no intervalo.
- Qualificação vencida (quando dado disponível e confiável).

## 15) Regras de alerta com justificativa
- Fadiga alta (`critical`/`unfit_for_duty`).
- Fadiga moderada (`attention`).
- Alerta FRMS ativo relevante no dia.
- Ausência de check-in (`not_submitted`) com estimativa padrão.
- Troca após publicação.
- Manutenção da escala apesar de alerta.
- Uso de status `standby`/`não escalado` em contexto operacional crítico.

## 16) Riscos técnicos
- Sobreposição conceitual entre EVD atual e nova “Escala Diária” se renomear sem plano de migração de contrato.
- Divergência de status entre mensal/alocações/EVD se não houver regra de precedência clara.
- Possível inconsistência de nomenclatura de tabela em pontos isolados (`escala_mensal` vs `escalas_mensais`) exige revisão antes de coding.
- Dependência de qualidade e timing do SIGVOOS para refletir risco FRMS atualizado.
- Exposição indevida de dados sensíveis de check-in se UI não separar resumo vs detalhe clínico/comportamental.

## 17) Riscos operacionais
- Decisões de escala com fadiga alta sem trilha formal de justificativa.
- Publicação diária sem versionamento pode comprometer auditoria de segurança.
- Trocas de última hora sem processo explícito de aceite podem gerar conflito de comando.
- Dependência excessiva de automação sem gatilho manual para coordenação em contingência.

## 18) Fases de implantação sugeridas
1. Harmonização de produto/contrato: consolidar EVD como Escala Diária no módulo Escalas (sem quebrar rota antiga).
2. Regras e validações: implementar bloqueios duros + alertas com justificativa.
3. Publicação versionada: snapshot diário + histórico de revisões + PDF oficial.
4. Integração operacional: painel de não alocados e fluxo de troca intra-dia.
5. Canais externos: habilitar notificações email/WhatsApp usando infraestrutura existente.

## 19) Lista exata de arquivos candidatos para alteração na próxima fase

### Frontend
- `src/react-app/App.tsx`
- `src/react-app/navigation.config.ts`
- `src/react-app/pages/escalas/EvdPage.tsx`
- `src/react-app/pages/escalas/EscalasPage.tsx` (se integrar entrada da diária)
- `src/react-app/pages/escalas/hooks/queries/escalas-types.ts`
- `src/react-app/pages/escalas/hooks/queries/useEscalasQueries.ts`
- `src/react-app/pages/escalas/hooks/mutations/useEscalasMutations.ts`
- `src/react-app/hooks/useFrms.ts` (somente ajustes de consumo diário, se necessário)

### Backend
- `worker-airtrust/src/index.ts` (se houver novo mount/alias)
- `worker-airtrust/src/routes/escalas-evd.ts`
- `worker-airtrust/src/routes/escalas-core.ts` (integração de contrato, se necessário)
- `worker-airtrust/src/routes/escalas-alocacoes.ts` (regras cruzadas de disponibilidade)
- `worker-airtrust/src/routes/escalas-cobertura.ts` (ajustes de visão diária, se necessário)
- `worker-airtrust/src/routes/frms-fadiga-checkin.ts` (contrato de resumo/privacidade e alert sync, se necessário)
- `worker-airtrust/src/services/sigvoos-frms.ts` (se estratégia de janela operacional mudar)
- `worker-airtrust/src/cron/scheduled-handler.ts` (se política de horário automático mudar)

### Banco/Migrations (futuro)
- `worker-airtrust/migrations/*` (novas migrations para publicação versionada/justificativas da diária)

## 20) Perguntas pendentes
- Qual política final de permissões por papel para visualizar detalhe sensível de check-in vs somente status resumido?
- O status “disponível” deve ser persistido em tabela própria diária ou apenas derivado de ausência de alocação/situação?
- A publicação diária será única por empresa/data ou separada por base operacional?
- Para mudança de horário SIGVOOS, a empresa quer padrão global (18h local) ou configurável por empresa/base?

---

## Anexo A — Arquivos observados na auditoria

### Escalas
- `src/react-app/pages/escalas/EscalasPage.tsx`
- `src/react-app/pages/escalas/EscalaPageContext.tsx`
- `src/react-app/pages/escalas/views/EscalasListagemView.tsx`
- `src/react-app/pages/escalas/views/EscalasDetalheView.tsx`
- `src/react-app/pages/escalas/EvdPage.tsx`
- `worker-airtrust/src/routes/escalas/index.ts`
- `worker-airtrust/src/routes/escalas-core.ts`
- `worker-airtrust/src/routes/escalas-evd.ts`
- `worker-airtrust/src/routes/escalas-alocacoes.ts`
- `worker-airtrust/src/routes/escalas-cobertura.ts`
- `worker-airtrust/src/routes/escalas-situacoes.ts`

### FRMS/fadiga/alertas
- `src/react-app/pages/frms/FrmsEscalas.tsx`
- `src/react-app/pages/frms/FrmsFadigaPainel.tsx`
- `src/react-app/pages/frms/FrmsFadigaHistorico.tsx`
- `src/react-app/pages/frms/FrmsFadigaAcumulada.tsx`
- `src/react-app/pages/frms/FrmsAlertasPainel.tsx`
- `src/react-app/hooks/useFadigaCheckin.ts`
- `src/react-app/hooks/useFrms.ts`
- `worker-airtrust/src/routes/frms.ts`
- `worker-airtrust/src/routes/frms-fadiga-checkin.ts`
- `worker-airtrust/src/routes/frms-fadiga-acumulada.ts`
- `worker-airtrust/src/routes/frms-fira.ts`
- `worker-airtrust/src/lib/frms/fadiga-score.ts`
- `worker-airtrust/src/lib/frms/alertas.ts`
- `worker-airtrust/src/routes/alertas.ts`

### SIGVOOS/cron
- `worker-airtrust/src/routes/integracoes_sigvoos.ts`
- `worker-airtrust/src/services/sigvoos-frms.ts`
- `worker-airtrust/src/cron/scheduled-handler.ts`
- `worker-airtrust/wrangler.toml`

### DDL/migrações consultadas
- `worker-airtrust/migrations/0228_create_modulo_escalas.sql`
- `worker-airtrust/migrations/0250_escala_alocacoes.sql`
- `worker-airtrust/migrations/0256_situacoes_sem_aeronave.sql`
- `worker-airtrust/migrations/0279_create_escala_voo_diaria.sql`
- `worker-airtrust/migrations/0287_frms_fadiga_checkin_diario.sql`
- `worker-airtrust/migrations/0362_frms_daily_fatigue_v01.sql`
