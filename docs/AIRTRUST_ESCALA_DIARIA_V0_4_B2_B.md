# AIRTRUST v0.4-B2-b — Regras mínimas de bloqueio e alertas FRMS resumidos (sem migration)

## 1) Objetivo
Implementar um incremento mínimo e seguro na Escala Diária:
- reforçar bloqueios duros essenciais no backend EVD;
- exibir alertas FRMS resumidos no frontend;
- exigir justificativa operacional transitória via `observacoes` quando houver alerta FRMS relevante;
- sem migration e sem alteração de cálculo FRMS.

## 2) Estado inicial
- Branch: `main`
- HEAD inicial da fase: `61581657c042fa116cb85467ca9a6107779a0d73`
- origin/main: `95699e0b4de02bfda9ff1169e08e57c47dc4c36e`
- Ahead/behind no início: `0 2`
- Working tree: sem tracked modified/staged; apenas docs untracked locais.

## 3) Arquivos alterados
- `worker-airtrust/src/routes/escalas-evd.ts`
- `src/react-app/pages/escalas/EvdPage.tsx`
- `docs/AIRTRUST_ESCALA_DIARIA_V0_4_B2_B.md`

## 4) Validações backend implementadas (EVD)
No backend EVD foram adicionadas validações mínimas centralizadas:

1. **PIC e SIC não podem ser o mesmo tripulante**
- aplicado na criação (`POST /api/evd`) e na publicação (`POST /api/evd/:id/publicar`).

2. **Duplicidade de tripulante na mesma data/intervalo**
- aplicada na criação e na publicação;
- considera `empresa_id`, `data`, registros não deletados e não cancelados;
- regra conservadora por intervalo:
  - usa `hora_apresentacao` / `hora_decolagem_prevista` / `hora_pouso_previsto`;
  - se horários forem insuficientes para comprovar não sobreposição, assume conflito.

3. **Publicação sem tripulação completa**
- mantém bloqueio de publicação sem PIC/SIC com mensagem clara.

4. **Repouso mínimo inválido**
- mantém bloqueio de publicação com mensagem operacional curta e padronizada.

## 5) Integração FRMS resumida no frontend
Na tela de Escala Diária (`EvdPage`):
- consumo de `GET /api/frms/daily-fatigue?date=...&scope=team`;
- consumo de `GET /api/frms/daily-fatigue/alerts?date=...`;
- mapeamento por tripulante de sinal resumido FRMS;
- exibição de badges por PIC/SIC com:
  - status resumido;
  - indicação de revisão operacional;
  - indicação de alerta ativo.

## 6) Campos sensíveis explicitamente não expostos
Foi mantida a política de não expor dados sensíveis do check-in de fadiga na Escala Diária.

Não expostos:
- KSS, horas de sono detalhadas, sintomas, meds/álcool;
- observações pessoais e textos livres do check-in.

Expostos apenas:
- status resumido de risco;
- necessidade de revisão operacional;
- existência/severidade de alerta.

## 7) Justificativa transitória via `observacoes`
Sem migration, a justificativa operacional foi tratada de forma tática:
- ao criar voo com PIC/SIC em estado FRMS relevante, `observacoes` passa a ser obrigatória (mínimo de texto);
- ao publicar voo com estado FRMS relevante e `observacoes` insuficiente, o fluxo exige justificativa antes de concluir a publicação;
- não há inserção automática de dados sensíveis em `observacoes`.

## 8) Limitações desta fase
- não há justificativa operacional estruturada por tabela dedicada;
- não há trilha formal por alerta/decisor além do texto em `observacoes`;
- não foram implementadas validações por qualificação AW139/SK76;
- não foram implementadas validações por disponibilidade mensal nesta fase;
- não há publicação versionada, PDF ou canais externos.

## 9) Itens para B2-c / B3
- justificativa operacional estruturada com migration;
- validação comandante/copiloto e qualificação AW139/SK76 com fonte de dados consolidada;
- validação de disponibilidade macro mensal integrada ao EVD;
- publicação versionada;
- exportação PDF;
- preparação para e-mail/WhatsApp.
