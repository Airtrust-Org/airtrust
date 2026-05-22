# AIRTRUST v0.4-B2-a — Auditoria dirigida do contrato EVD para regras de bloqueio/alerta

## 1) Metadados Git
- Data: 2026-05-21
- Branch: `main`
- HEAD: `61581657c042fa116cb85467ca9a6107779a0d73`
- origin/main: `95699e0b4de02bfda9ff1169e08e57c47dc4c36e`
- Ahead/behind (`origin/main...HEAD`): `0 2`
- Working tree no início: sem tracked modified; untracked docs locais pré-existentes.

## 2) Contrato atual de `/api/evd` (backend)
Arquivo principal: `worker-airtrust/src/routes/escalas-evd.ts`.

### 2.1 Métodos existentes
- `GET /api/evd?data=YYYY-MM-DD` — lista do dia.
- `GET /api/evd/semana?inicio=YYYY-MM-DD` — lista semanal.
- `GET /api/evd/:id` — detalhe.
- `POST /api/evd` — cria item (status inicial `RASCUNHO`).
- `PUT /api/evd/:id` — atualiza campos permitidos.
- `DELETE /api/evd/:id` — soft delete (`deleted_at`).
- `POST /api/evd/:id/publicar` — publica (`status = PUBLICADA`).

### 2.2 Payloads e respostas observados
- `GET /api/evd?data=...`
  - Requer query `data`.
  - Retorna `e.*` de `escala_voo_diaria` + `pic_nome/pic_guerra/sic_nome/sic_guerra`.
- `POST /api/evd`
  - Schema validado por Zod (`evdCreateSchema`):
    - obrig.: `data`
    - opcionais: `escala_id`, `pic_id`, `sic_id`, `pic_funcao`, `sic_funcao`, `aeronave_prefixo`, `aeronave_modelo`, `hora_*`, `origem`, `destino`, `tipo_missao`, `observacoes`.
  - Retorno: `{ success: true, data: { id, warnings[] } }`.
- `PUT /api/evd/:id`
  - Aceita apenas `allowed[]` (data, PIC/SIC, funções, aeronave, horários, rota/missão, observações).
  - Não recalcula repouso.
- `DELETE /api/evd/:id`
  - Soft delete por `empresa_id`.
- `POST /api/evd/:id/publicar`
  - Bloqueia se:
    - `repouso_minimo_ok === 0`
    - ausência de `pic_id` ou `sic_id`
  - Define `status='PUBLICADA'`, `aprovado_em`.

### 2.3 Publicação hoje
- Publicação é por **registro individual** de EVD (`/:id/publicar`), não por “pacote diário”.
- Pré-condições atuais:
  - voo existe;
  - não já publicado;
  - repouso mínimo ok;
  - tripulação completa (PIC+SIC).

## 3) Schema atual de `escala_voo_diaria`
Fonte: `worker-airtrust/migrations/0279_create_escala_voo_diaria.sql`.

### 3.1 Campos principais
- Identificação/tenant: `id`, `empresa_id`, `escala_id`, `data`, `status`.
- Tripulação: `pic_id`, `sic_id`, `pic_funcao`, `sic_funcao`.
- Aeronave: `aeronave_prefixo`, `aeronave_modelo`.
- Horários: `hora_apresentacao`, `hora_decolagem_prevista`, `hora_pouso_previsto`, `hora_decolagem_real`, `hora_pouso_real`, `hora_corte_motor`.
- Repouso: `repouso_anterior_minutos`, `repouso_minimo_ok`.
- Rota/missão: `origem`, `destino`, `tipo_missao`.
- Texto: `observacoes`.
- Auditoria básica: `criado_por`, `aprovado_por`, `aprovado_em`, `created_at`, `updated_at`, `deleted_at`.

### 3.2 Justificativa/intervalo
- Não há campo dedicado de justificativa operacional estruturada.
- Existe `observacoes` (texto livre) que pode ser reuso tático.
- Não há modelo explícito de “intervalos múltiplos por aeronave/dia” além de múltiplas linhas independentes por `data`.

## 4) Contrato atual do frontend (Escala Diária)
Arquivos:
- `src/react-app/pages/escalas/EvdPage.tsx`
- `src/react-app/App.tsx`
- `src/react-app/navigation.config.ts`

### 4.1 Rotas
- `/escalas/diaria` e `/escalas/evd` apontam para `EvdPage`.
- Menu aponta para `/escalas/diaria`.

### 4.2 Carga de dados
- `useApi('/api/evd?data=${data}')` por data selecionada.

### 4.3 Criar/editar/remover
- Criar: formulário inline (PIC, SIC, prefixo, horários, origem/destino, missão, observações) via `POST /api/evd`.
- Remover: botão “Excluir” em rascunho via `DELETE /api/evd/:id`.
- Editar: **não há fluxo de edição na UI** hoje (ícone `Edit3` importado, mas não utilizado).

### 4.4 Publicar
- Botão “Publicar” apenas quando `status === 'RASCUNHO'`, chama `POST /api/evd/:id/publicar`.

### 4.5 Estados e campos operacionais
- Estado visível: `RASCUNHO` e `PUBLICADA` (badge).
- UI de PIC/SIC: sim.
- UI de aeronave/prefixo: sim.
- UI de horário: sim (`hora_apresentacao`, `decolagem/pouso previstos`; reais exibidos quando presentes).

### 4.6 Onde cabem FRMS e justificativa
- FRMS: espaço natural no bloco de cabeçalho (placeholder já existe).
- Justificativa operacional:
  - no submit de criação/edição (campo dedicado);
  - no ato de publicar quando houver alertas/override.

### 4.7 Risco de mexer na tela agora
- Baixo a moderado para incrementos localizados (badge FRMS, modal de justificativa, bloqueios em botões).
- Moderado para refatorações grandes (board por aeronave com múltiplos intervalos e workflow diário consolidado).

## 5) Contrato FRMS diário consumível
Fontes:
- `worker-airtrust/src/routes/frms-fadiga-checkin.ts`
- `src/react-app/hooks/useFrms.ts`
- `src/react-app/hooks/useFadigaCheckin.ts`

### 5.1 Endpoints corretos
- Status resumido: `GET /api/frms/daily-fatigue` (usar `?date=...&scope=team` para coordenação).
- Alertas: `GET /api/frms/daily-fatigue/alerts`.

### 5.2 Status suportados
- `normal`, `attention`, `critical`, `unfit_for_duty`, `not_submitted`, `no_duty`.
- Campo-chave: `requires_operational_review`.

### 5.3 Payload relevante para Escala Diária
De `daily-fatigue` (team):
- `funcionario_id`, `funcionario_nome`, `status`, `status_label`, `requires_operational_review`, `data_source`, `date`.
- opcionais úteis: `score_fadiga`, `nivel_fadiga`, `status_operacional`.

De `daily-fatigue/alerts`:
- `id`, `tripulante_id`, `tripulante_nome`, `nivel`, `tipo_limite`, `mensagem`, `alert_type`, `requires_operational_review`, `resolvido`.

## 6) Campos seguros vs sensíveis para exibição na escala

### 6.1 Seguros (visão ampla operacional)
- Identificação operacional: nome/id do tripulante.
- Status resumido FRMS: `status`, `status_label`, `requires_operational_review`.
- Sinal de origem: `data_source` (tripulante vs estimativa padrão).
- Presença de alerta e severidade (`nivel`, `alert_type`).

### 6.2 Sensíveis (não expor na visão ampla)
- Dados clínico-comportamentais detalhados do check-in:
  - `kss_score`, `horas_sono`, `horas_sono_48h`, `qualidade_sono`, `wake_time`, `subjective_fatigue_level`, `sleepiness_level`, `sintomas_json`, `meds_ult_12h`, `alcool_ult_12h`, `motivo_inaptidao`, textos livres (`observacoes`, etc.).
- Esses campos devem ficar em visão restrita FRMS/gestão, não no quadro geral de escala.

## 7) Gaps para bloqueios (B2-b)

### 7.1 Já existe
- Bloqueio de publicação por repouso mínimo.
- Bloqueio de publicação por tripulação incompleta (PIC/SIC).

### 7.2 Faltando no contrato atual EVD
- Bloqueio de copiloto escalado como PIC sem elegibilidade/cargo adequado.
- Bloqueio por qualificação de modelo (AW139/SK76).
- Bloqueio por indisponibilidade macro da escala mensal/alocações.
- Bloqueio de duplicidade no mesmo intervalo (tripulante e/ou aeronave).
- Bloqueio por indisponibilidade de aeronave.
- Bloqueio por qualificação vencida (se dado disponível no cadastro).

## 8) Gaps para alertas com justificativa
- Não há persistência estruturada para justificativa operacional por alerta/decisão.
- `observacoes` existe, mas é texto livre sem trilha de decisão (quem decidiu, quando, qual alerta foi aceito).
- Não há endpoint dedicado para “aceite operacional de risco” antes/depois da publicação.

## 9) Decisão B2-b: sem migration ou com migration?

### 9.1 Opção A — B2-b sem migration (tática)
Possível para entrar rápido com menor risco estrutural:
- Implementar bloqueios duros no backend EVD (criação/publicação).
- Implementar alertas FRMS em tempo de UI/backend sem persistência dedicada.
- Exigir justificativa textual mínima reaproveitando `observacoes` quando houver override.

Limitação:
- rastreabilidade fraca de justificativa (sem estrutura/auditoria fina por alerta).

### 9.2 Opção B — B2-b com migration (estrutural)
Mais robusta para governança operacional:
- adicionar entidade/tabela de justificativas operacionais vinculada a item EVD + alerta FRMS.
- armazenar: decisor, timestamp, tipo de alerta, justificativa, decisão.

### 9.3 Recomendação
- **B2-b pode iniciar sem migration** para bloqueios e alertas básicos.
- **Para justificativa auditável de segurança operacional, migration é recomendada e praticamente inevitável** no primeiro incremento seguinte (ou no fim da B2-b, antes de B3).

## 10) Plano recomendado de implementação (B2-b)

### 10.1 Blocos implementáveis agora (sem migration)
- Backend `escalas-evd.ts`:
  - validação de elegibilidade PIC/SIC;
  - validação de qualificação por modelo;
  - validação de disponibilidade mensal/alocações;
  - validação de duplicidade por intervalo.
- Frontend `EvdPage.tsx`:
  - consumir `daily-fatigue` por data e mostrar badge resumido por tripulante;
  - bloquear ação de publicar quando hard-block ativo;
  - exigir texto de justificativa em caso de alerta (persistindo em `observacoes` de forma transitória).

### 10.2 Itens que devem esperar B3
- publicação versionada da escala diária;
- PDF oficial;
- trilha avançada de revisões.

### 10.3 Arquivos candidatos para B2-b
- `worker-airtrust/src/routes/escalas-evd.ts`
- `src/react-app/pages/escalas/EvdPage.tsx`
- `src/react-app/hooks/useFrms.ts` (se precisar ajuste leve de consumo)
- opcional: `worker-airtrust/src/routes/escalas/index.ts` (somente se expor validação auxiliar)

### 10.4 Riscos B2-b
- false-positive de bloqueio por qualidade de dados cadastrais incompleta.
- sobrecarga na tela EVD se tentar expor dados sensíveis em vez de status resumido.
- inconsistência entre warning em criação vs bloqueio em publicação se regras não forem centralizadas.

---

## Respostas diretas solicitadas

### Backend EVD
1. Métodos em `/api/evd`: `GET` dia/semana/detalhe, `POST`, `PUT`, `DELETE`, `POST /:id/publicar`.
2. Payload: conforme schema acima; `POST` validado por Zod; `PUT` por allowlist de campos.
3. Publicar: endpoint por item, bloqueia repouso insuficiente e ausência de PIC/SIC.
4. Campos da tabela: identificação, status, PIC/SIC, aeronave, horários, repouso, rota/missão, observações, auditoria básica.
5. Campo de justificativa: não dedicado; apenas `observacoes` (texto livre).
6. Horário/intervalo: campos de hora existem; modelo é por registro (não há tabela própria de intervalos versionados).
7. PIC/SIC: `pic_id/sic_id` (+ nomes por join em `funcionarios`).
8. Aeronave/prefixo: `aeronave_prefixo` e `aeronave_modelo`.
9. Validações atuais: formato payload, repouso mínimo (warning/create + block/publish), presença PIC/SIC para publicar.
10. Validações faltantes: qualificação, disponibilidade mensal, duplicidade por intervalo, indisponibilidade aeronave, regras de função.

### Frontend EVD
1. Carregamento: `useApi('/api/evd?data=...')`.
2. Criar/editar/remover: cria (`POST`) e remove (`DELETE`); edição ainda não implementada na UI.
3. Publicar: botão em rascunho chama `POST /api/evd/:id/publicar`.
4. Estado: `RASCUNHO`/`PUBLICADA` (e backend aceita `CANCELADA`).
5. UI PIC/SIC: sim.
6. UI aeronave: sim (prefixo).
7. UI horário/intervalo: sim (hora apresentação/decolagem/pouso; sem editor de múltiplos intervalos).
8. Espaço para FRMS: bloco de topo (placeholder) e cards por tripulante.
9. Espaço para justificativa: formulário de criação/edição e fluxo de publicação.
10. Risco de alteração: baixo/moderado para incrementos pontuais; maior para refatoração estrutural.

### FRMS diário consumível
1. Endpoint status resumido: `GET /api/frms/daily-fatigue`.
2. Endpoint alertas: `GET /api/frms/daily-fatigue/alerts`.
3. Payload relevante: `status`, `requires_operational_review`, `data_source`, `tripulante`, `nivel/alert_type/mensagem`.
4. Campos seguros: status resumido e indicadores operacionais (sem dados clínicos detalhados).
5. Campos sensíveis: KSS/sono/sintomas/meds/álcool/textos pessoais e derivados detalhados.
