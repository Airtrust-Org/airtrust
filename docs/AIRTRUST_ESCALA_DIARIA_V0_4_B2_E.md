# AIRTRUST v0.4-B2-e — Bloqueios confiáveis de aeronave/modelo e disponibilidade mensal

## 1) Objetivo
Implementar bloqueios operacionais da Escala Diária (EVD) apenas com fontes confiáveis, mantendo a regra de comandante/copiloto textual como alerta com justificativa, sem bloqueio duro automático.

## 2) Estado inicial
- Branch: `main`
- HEAD inicial: `3de4e11704d27b2349faaf4f7b3a396cad5fac4c`
- `origin/main`: `95699e0b4de02bfda9ff1169e08e57c47dc4c36e`
- Ahead/behind inicial: `0 4`
- Working tree inicial: sem tracked modified/staged; docs locais untracked preexistentes.

## 3) Fontes confiáveis usadas
- Cadastro mestre de aeronaves: tabela `aeronaves` (prefixo/modelo/status).
- Habilitação de modelo de tripulante:
  - `funcionarios_aeronaves` (fonte preferencial);
  - `funcionarios.modelo_aeronave_id` e `funcionarios.aeronave` (fallback legível);
  - validação reutilizada: `verificarHabilitacaoModelo(...)`.
- Disponibilidade mensal:
  - `escala_alocacoes`;
  - `escala_situacao_tipos` (`bloqueia_alocacao`);
  - `funcionario_ferias`.

## 4) Validações implementadas (backend EVD)
Arquivo principal alterado:
- `worker-airtrust/src/routes/escalas-evd.ts`

### 4.1 Resolução conservadora de aeronave por prefixo
- Novo helper resolve `aeronave_prefixo` contra cadastro mestre.
- Se resolver:
  - modelo do cadastro passa a ser fonte de verdade;
  - status da aeronave é validado (`ATIVO` esperado);
  - modelo é normalizado (`S76`/`SK76` -> `SK76`, `AW139`).
- Se **não** resolver:
  - não bloqueia por qualificação de modelo;
  - retorna warning de aeronave não resolvida no cadastro mestre.

### 4.2 Bloqueio por aeronave inativa
- Em criação/publicação, se prefixo resolve para aeronave não ativa:
  - bloqueia com erro: `Aeronave indisponível ou inativa no cadastro mestre.`

### 4.3 Bloqueio de habilitação AW139/SK76
- Aplicado somente quando:
  - aeronave foi resolvida no cadastro mestre;
  - modelo normalizado é `AW139` ou `SK76`.
- Valida PIC e SIC.
- Se habilitação ausente com fonte confiável:
  - bloqueia com erro: `Tripulante sem habilitação cadastrada para o modelo da aeronave.`
- Se dado de habilitação é ambíguo/incompleto:
  - gera warning operacional (não bloqueio cego).

### 4.4 Bloqueio por indisponibilidade mensal real
- Em criação/publicação, valida para PIC e SIC:
  - férias/afastamento em `funcionario_ferias`;
  - situações bloqueantes (`bloqueia_alocacao = 1`, exceto `FOLGA`);
  - conflito com alocação operacional mensal quando `escala_id` do EVD permite comparação confiável.
- Mensagem de bloqueio:
  - `Tripulante indisponível na escala mensal para esta data/período.`

## 5) Alertas não bloqueantes implementados
### 5.1 Comandante/copiloto por texto (não canônico)
- Se PIC selecionado tem indício textual de copiloto (`funcao`/`cargo` com `COPILOTO`, `COP`, `SIC`) sem indicação canônica de comandante (`COMANDANTE`, `PIC`, `CMT`):
  - gera alerta: `Função PIC requer validação operacional: cadastro de função não é canônico.`
  - **não bloqueia automaticamente por cargo textual**.

### 5.2 Exigência de justificativa estruturada no alerta operacional
- Na publicação, quando esse alerta estiver ativo:
  - exige justificativa operacional estruturada (`escala_voo_diaria_justificativas`) ou fallback legado em observações.
  - resposta de erro inclui `code = OPERATIONAL_ROLE_REVIEW_REQUIRED` e `requires_justificativa = true`.

## 6) Ajuste de frontend
Arquivo alterado:
- `src/react-app/pages/escalas/EvdPage.tsx`

Implementado:
- tratamento explícito de retorno de publicação com `requires_justificativa` e `code`;
- quando backend retorna `OPERATIONAL_ROLE_REVIEW_REQUIRED`, abre prompt de justificativa e reenvia publicação com justificativa estruturada (`origem_alerta = OPERACIONAL`).

Mantido:
- sem exposição de dados sensíveis FRMS/check-in.
- sem refatoração ampla da tela.

## 7) Decisão explícita sobre comandante/copiloto
- Não foi implementado bloqueio duro com base apenas em texto de cargo/função.
- Foi implementado fluxo de alerta + justificativa estruturada para validação operacional.

## 8) AW139/SK76 e aliases
- Tratamento operacional implementado para `AW139` e `SK76`.
- Alias `S76` é normalizado para `SK76`.
- A validação de habilitação usa modelo resolvido do cadastro mestre, não texto livre do EVD.

## 9) Tratamento de “W”
- “W” não foi adotado como alias de `AW139`.
- Continua tratado como indefinido até existir regra canônica de dados.

## 10) Limitações da fase
- Sem nova migration.
- EVD ainda persiste prefixo/modelo textual (sem `aeronave_id` obrigatório na tabela EVD).
- Em EVD sem `escala_id`, conflitos operacionais mensais por alocação ficam em modo conservador para evitar falso bloqueio.
- Sem mudanças em FRMS core, SIGVOOS/cron, PDF, publicação versionada.

## 11) Próximos passos recomendados
1. Introduzir papel canônico por tripulante (`pode_pic` / `pode_sic`) para substituir heurística textual.
2. Tornar vínculo de aeronave estruturado obrigatório no EVD (referência de cadastro mestre).
3. Evoluir para publicação versionada e PDF em fases seguintes.
