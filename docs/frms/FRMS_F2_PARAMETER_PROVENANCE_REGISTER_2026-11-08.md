# FRMS F2 — Registro de proveniência de parâmetros (2026-11-08)

Base: `main` 00da69b7e. Escopo: classificar cada parâmetro como **NORMATIVO**, **CONTRATUAL**, **INTERNO (política)**, **HIPÓTESE** ou **EVIDÊNCIA CIENTÍFICA**. Nada aqui altera produção nem valida cientificamente coeficientes. Não é parecer jurídico nem homologação regulatória.

## 1. Limites regulatórios (motor canônico `regulatory-compliance.ts` / `compliance-policy.ts`)

| Parâmetro | Valor | Classe | Fonte | Observação |
|---|---|---|---|---|
| Voo/dia helicóptero | 8 h | NORMATIVO | Lei 13.475 art. 32 IV | RBAC 117 A: 7 h (b1) / 8 h (b2–b6) em `compliance-policy` |
| Voo/mês civil | 90 h | NORMATIVO | Lei art. 33 IV | janela civil, não 28 d |
| Voo/ano civil | 930 h | NORMATIVO | Lei art. 33 IV | janela civil, não 365 d |
| Jornada | 11/14/18 h | NORMATIVO | Lei art. 37 | composição da tripulação não está no snapshot → 11–18 h = UNKNOWN |
| Trabalho mês | 176 h | NORMATIVO + CONTRATUAL | Lei art. 41; ACT cl. 8ª | ACT citado só na vigência 2025-12-01..2027-11-30 |
| Missão 21 d / 17 d efetivos / folga = efetivos − 2 | — | NORMATIVO + CONTRATUAL | Lei art. 41 §§2–4; ACT cl. 9ª | |
| Repouso 12/16/24 h | — | NORMATIVO | RBAC 117 A117.23(b) | A117.23(d) (+2 h/fuso) **não modelado** |
| Voo 28 d / 365 d (93 h / 930 h); trabalho 7 d/14 d (60/100 h) | — | NORMATIVO **condicional** | RBAC 117 B/C117.25–.27 | só se apêndice B/C documentado para o operador (manifesto: `UNCONFIRMED_OPERATOR_SELECTION`) |
| Art. 42 madrugadas (≤2 consec., ≤4/168 h) | — | NORMATIVO, **aplicabilidade pendente** | Lei art. 42 | `law_art42_enforced` desligado; exige parecer jurídico |
| IOGP 690-2: 10 h/1 d, 45 h/7 d, 120 h/28 d, 1200 h/365 d, FDP 14 h, repouso max(10 h, FDP), 12 h standby noturno | — | CONTRATUAL/ADOTADO (decisão do proprietário, plano IOGP 2026-11-05) | IOGP 690-2 Tab. 17-1, §18C–20C | **Achado:** (a) fonte primária não consta no manifesto regulatório (sem URL/hash); conferência feita só contra transcrição secundária de checklist; (b) valores da Tab. 17-1 são para **tripulação dupla** — o código não verifica composição; (c) é **shadow**, não enforcement canônico |

## 2. Parâmetros internos / hipóteses (índice acumulado, issue #1476)

Sem fonte normativa nem calibração publicada: `limiar_atencao=45`, `limiar_critico=75`, peso 0,65 sobre % HV 168 h, +10 check-in pendente, +7 dado estimado, −4 completude, +14/+8 consecutividade, −6 repouso ≥13 h, −5 jornada média ≤6 h, −3 sem apresentação <07 h, −8 dias sem atividade (neutralizado no V2), créditos de recuperação V2 (tetos 4 / 1,5 pt/dia), +16/+12/+14 agravantes de repouso/sono/KSS/efetividade. Classe: **INTERNO/HIPÓTESE**. IOGP 626, ICAO Doc 9966 e HeliOffshore sustentam a *abordagem sistêmica*, não estes números.

## 3. Problemas estruturais a decidir pelo responsável FRMS (propostas, nada aplicado)

1. **Segregar quatro eixos** na saída: risco fisiológico (sono/KSS/PVT/efetividade), conformidade (limites acima), completude da coleta (check-in, estimados, cobertura SIGVOOS/CV) e recuperação comprovada. +10/+7/−4 pertencem ao eixo *completude*, não ao fisiológico; nenhum deles deve produzir "verde".
2. **Dupla contagem**: check-in pendente (+10) + dia atenção/incompleto (+7/+18) + sobreposição `status=ATENCAO`; consecutividade (+14) × tendência (+6) × carga HV; repouso ≥13 h (−6) × crédito V2. Proposta: um único contribuinte por causa-raiz.
3. **Atenuadores**: repouso/crédito por *oportunidade* ≠ sono realizado; não podem compensar agravante crítico isolado nem violação normativa (já garantido no canônico: o avaliador regulatório não recebe score).
4. **Análise de sensibilidade** (a executar sobre coorte staging/histórico autorizado): variar cada peso ±50 %, limiares 45/75 ±10 pt, e medir mudança de classe, falso alerta/omissão e estabilidade. Requer decisão do responsável antes de qualquer valor ir à produção.
5. **IOGP**: registrar fonte primária (URL+hash) no manifesto e condicionar os limites de tripulação dupla à composição conhecida; até lá, mantê-lo em shadow.

## 4. Lacunas de evidência (não resolvíveis por código)

EVD positivo e readback real SIGVOOS→CV ao vivo; atividades sem voo/jornadas mistas; seleção de apêndice RBAC 117 pelo operador; parecer art. 42; A117.23(d); validação científica do V3.
