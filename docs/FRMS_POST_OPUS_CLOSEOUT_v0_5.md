# FRMS Post-Opus Closeout v0.5

## 1) Status atual do módulo
O FRMS está operacionalmente utilizável como ferramenta de triagem/sinalização de risco de fadiga com revisão humana obrigatória. A trilha pós-Opus removeu overclaims metodológicos, reforçou guardrails e estabilizou o fluxo de explicação diária e copy operacional.

## 2) Versões publicadas
- Worker/API: `e68731a` (`builtAt: 2026-05-30T18:17:46Z`)
- Pages build: `e68731a`
- Merge pós-Opus em `main`: `e68731acc1470588af09cfb2279e97db35df31d8`
- Worker Version ID reportado: `5fb66800-c0ca-43db-9e0a-932eb8f42bb7`

## 3) O que foi corrigido pós-Opus
- `fator_basica` deixou de ser exibido como impacto em pontos percentuais.
- `basica` passou a ser tratada como contexto basal.
- Claims fortes de cientificidade foram removidos/suavizados na UX.
- Disclaimers persistentes de triagem operacional adicionados nos pontos críticos.
- Linguagem operacional reforçou revisão humana e não decisão automática.
- Explanation trace backend/frontend consolidado com melhor rastreabilidade da explicação.

## 4) O que o FRMS é
- Ferramenta de triagem operacional.
- Sinalizador de risco/atenção para tomada de decisão humana.
- Apoio estruturado à revisão por coordenação/gestão.

## 5) O que o FRMS não é
- Não é diagnóstico médico.
- Não é modelo cientificamente validado externamente.
- Não é SAFTE-FAST validado.
- Não é decisor automático de aptidão/restrição operacional.

## 6) Evidências técnicas consolidadas
- Testes frontend FRMS: `94/94` (trilha pós-Opus).
- Testes worker: `566/566` (trilha pós-Opus).
- Smoke autenticado pós-Opus: rotas `200`, guardrails e copy confirmados.
- Endpoint/trace de explicação do dia publicado e auditado em produção.
- Bundle auditado com presença de guardrails e ausência dos termos proibidos operacionais.

## 7) Riscos residuais
- Backfill C2 histórico permanece pendente de plano controlado com snapshot/rollback e lote piloto.
- Persistência e governança de `wake_time_source`/`confidence` precisam seguir monitoradas conforme estado real dos dados.
- Validação científica/local formal ainda não executada (apenas adequação metodológica de triagem).
- Decomposição analítica de janelas 7d/28d ainda tem limitações para leitura causal fina.
- Necessidade contínua de monitoramento operacional para falsos positivos/negativos.

## 8) Decisão consolidada
`FRMS_OPERATIONAL_TRIAGE_ACCEPTABLE_WITH_LIMITS`

## 9) Critérios que impedem claims mais fortes
- Ausência de protocolo concluído de validação científica/local com métricas formais.
- Ausência de calibração longitudinal por base/função/escala com amostra mínima definida.
- Ausência de comprovação externa para declarar equivalência/validação SAFTE-FAST.
- Dependência de dados estimados em parte dos cenários operacionais.

## 10) Critérios para reabrir revisão metodológica
Reabrir revisão metodológica se ocorrer qualquer item abaixo:
- Mudança de fórmula, pesos, sinais, thresholds ou semântica de decisão.
- Alteração estrutural no cálculo de effectiveness, WOCL ou fatores de composição.
- Mudança no contrato de explicação/trace que reduza auditabilidade.
- Evidência operacional relevante de drift, viés ou aumento de falsos positivos/negativos.
- Início de fase de calibração científica local com revisão de thresholds.

## 11) Status de fechamento desta etapa
A etapa pós-Opus fica fechada como trilha de triagem operacional, com pendência explícita de backfill C2 e validação científica/local em fases separadas e controladas.
