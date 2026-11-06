# AirTrust FRMS — execução incremental IOGP 690 / HeliOffshore (05/11/2026)

Estado: **plano aprovado para desenvolvimento e testes; nenhum novo critério operacional, limiar ou score está automaticamente aprovado para produção.**

Autoridade: [issue #1476](https://github.com/Airtrust-Org/airtrust/issues/1476#issuecomment-6662493659), [#1426](https://github.com/Airtrust-Org/airtrust/issues/1426), [#776](https://github.com/Airtrust-Org/airtrust/issues/776).

## Decisão do proprietário

Na Costa do Sol, usar simultaneamente as regras aplicáveis da Lei 13.475/2017, RBAC 117/IS ANAC e apêndice pertinente, ACT vigente, IOGP 690-2 v1.3 (como padrão offshore adicional adotado pela gestão), política interna e obrigações contratuais. Para mesma métrica, unidade e janela, o menor máximo ou maior mínimo domina. Não substituir mês civil por 28 dias, ano civil por 365 dias, voo por jornada por voo por dia, ou repouso por oportunidade de sono. Perfil/contrato/modalidade de operação e vigência devem ser documentados. A IOGP é referência setorial adotada, não lei brasileira; não transferir parâmetros de manutenção para piloto.

IOGP/IPIECA 626, ICAO Doc 9966 e HeliOffshore Safety Performance Model sustentam avaliação sistêmica de fadiga, relato aberto, cultura justa, tratamento do risco, mitigação e verificação de eficácia. Não fornecem tabela pública universal que valide a soma de +10 check-in, +7 estimado, −6 descanso ou limiares 45/75 da fórmula legada.

**Invariant safety:** ausência de dados gera UNKNOWN; violação demonstrada gera VIOLATION mesmo com cobertura parcial; índice de fadiga favorável não neutraliza limite nem libera operação automaticamente.

## Reaproveitamento (não reconstruir)

Manter SIGVOOS→CV→FRMS, jornadas/escala, acumulados, check-ins, KSS/PVT-B, tipos de recuperação, casos/alertas/auditoria, painel regulatório, módulos existentes `compliance-policy.ts` e `frms-iogp-*-shadow`. O shadow IOGP **não é** enforcement canônico. Score legado permanece histórico e rotulado não validado; motor V3 IMA é experimental e não pode declarar aptidão.

## Lotes ordenados

| Lote | Objetivo | Critério técnico | Bloqueio de ativação |
|---|---|---|---|
| 0 | Registrar plano e snapshot | #1476/#776, PR rastreada, SHA base | nenhum |
| 1A | Proteger cobertura IOGP em shadow | acumulado sem dias verificados = UNKNOWN; ultrapassagem demonstrada = VIOLATION; testes reais unitários | sem alteração da decisão canônica |
| 1B | Corrigir dados de fadiga (FAD-001..004) | sono informado corretamente, sem default 8h; KSS real com proveniência, sinais importantes não compensáveis | compatibilidade/histórico e teste de UX |
| 2 | Unificar matriz ANAC/IOGP/ACT, mantendo janelas | por perfil/empresa/data/tipo de operação; fontes, regras mais restritivas, regras paralelas e gaps explícitos; dias SIGVOOS/CV verificados (AUD-005/025) | vigência, revisão governada, parecer jurídico art.42 |
| 3 | Processos HeliOffshore/IOGP 626 | relato não punitivo, investigação, responsável/prazo, mitigação, avaliação de eficácia; RBAC/tenant | proteção de dados e aceite do SGSO |
| 4 | Modelo V3 quantitativo em shadow | retrospectiva 60–90d ou amostra adequada, proveniência, KSS/PVT, falso negativo/alerta e estabilidade, sem pesos transplantados | validação científica e operacional |
| 5 | Aceite e release | teste focado + regressão, 8 gates GitHub, staging real, Worker/Pages SHA, postdeploy | autorização específica para production SHA/escopo/artefato |

## Pontos técnicos abertos

- FAD-001: `db-service-jornadas.ts`, `fadiga-score.ts`, `calculos.ts`: passagem de horas de sono reais.
- FAD-003/004: KSS deve ser recebido e interpretado sem normalizar escala heterogênea/default 5; triagem humana não é certificação de aptidão.
- AUD-005/025: validar cobertura *por janela* e fonte de sincronização, não inferir dias sem voo de ausência de importação. Identificar início/fim e possíveis lacunas por perfil/empresa; Schema V2 para novas colunas quando necessário.
- AUD-001: cálculo Lei art.42 já existe com `law_art42_enforced` sob parecer de aplicabilidade — não ativar por conta própria.
- Recuperação: oportunidade de descanso ≠ sono realizado. Rever compensações automáticas e crédito de voo do dia anterior.
- PR #1650 BOA é frente independente (não modificar). PR #1922 já mesclada, evitar refazer.

## Primeiro delta desta branch

No builder observacional IOGP, exigir **prova explícita de cobertura das janelas** antes de declarar COMPLIANT. Um acumulado parcial acima do teto continua violação demonstrada. Um acumulado igual ou inferior ao teto sem confirmação da cobertura resulta UNKNOWN. Esta correção é **somente shadow**; ainda não ativa novos bloqueios canônicos nem altera os limites e o score de produção.

## Handoff em qualquer nova conversa

"Retome o plano `docs/frms/FRMS_IMPLEMENTATION_PLAN_IOGP_HELIOFFSHORE_2026-11-05.md` e a issue #1476 no GitHub `Airtrust-Org/airtrust`. Confirme PR/HEAD/CI atuais; avance somente no lote ainda pendente. Não refaça #1922 ou F0C QA, não interfira na #1650, preserve histórico, tenant e oito gates. Produção requer autorização SHA-específica. Priorize correção testada e integração governada."

Documento rastreável versionado — atualizar aqui ou registrar checkpoints em #1476/#776 após cada lote concluído, nunca confiar em estado histórico sem revalidar GitHub.
