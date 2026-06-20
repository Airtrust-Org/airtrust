# LMS Progress Persistence Incident 2026-06-20

## Veredito

Fechado com ressalvas.

## Incidente

- Sintoma: aluno em curso AW139 perdeu progresso e respostas e voltou ao início do treinamento.
- Causa raiz: fluxos normais de rematrícula e renovação automática reutilizavam `resetMatriculaForNewCycle()`, que zerava `lms_matriculas` e limpava `lms_progresso_scorm`.
- Superfícies afetadas:
  - rematrícula manual;
  - matrícula em lote;
  - cron de renovação automática EAD;
  - commits SCORM/xAPI com payload stale.

## Correção

- Backend LMS:
  - fluxos normais deixaram de reutilizar reset destrutivo;
  - matrícula existente passou a ser preservada em vez de reaberta zerada;
  - cron de renovação automática não reaproveita matrícula existente.
- SCORM/xAPI:
  - progresso passou a ser monotônico;
  - `CONCLUIDO` não é rebaixado;
  - `score_final`, `ultimo_slide` e `progresso_pct` não regredem;
  - `suspend_data` e `cmi_json` mais novos não são sobrescritos por payload stale.
- Player:
  - wrapper SCORM ganhou retry curto e aviso de falha de persistência.

## Arquivos alterados

- `worker-airtrust/src/routes/lms-matriculas.ts`
- `worker-airtrust/src/routes/lms-progresso.ts`
- `worker-airtrust/src/routes/lms-assets.ts`
- `worker-airtrust/src/cron/scheduled-handler.ts`
- `worker-airtrust/src/services/lms-progress-guardrails.ts`
- `worker-airtrust/src/__tests__/routes/lms-matriculas-progress-integrity.test.ts`
- `worker-airtrust/src/__tests__/routes/lms-progresso.test.ts`
- `worker-airtrust/src/__tests__/cron/scheduled-handler-renovacao-lms.test.ts`

## Testes executados

No `worker-airtrust`:

```bash
npx vitest run src/__tests__/routes/lms-matriculas-progress-integrity.test.ts src/__tests__/routes/lms-progresso.test.ts src/__tests__/cron/scheduled-handler-renovacao-lms.test.ts
npx tsc -p tsconfig.json --noEmit
```

No repositório:

```bash
npx tsc --noEmit
npm run lint
npm run build
git diff --check
npm run guard:tracked-secrets
npm run ops:guard
```

## Cobertura de regressão

- rematrícula manual não zera matrícula existente;
- matrícula em lote ignora matrícula já existente sem reset;
- cron de renovação não reutiliza reset destrutivo;
- commit SCORM stale não sobrescreve `suspend_data`/`cmi_json` mais novos;
- commit SCORM stale não reduz slide mais avançado;
- xAPI não rebaixa matrícula concluída.

## Limitações residuais

- ainda não existe endpoint explícito e auditado de `force_reset`;
- o pacote não inclui recuperação de dados históricos;
- o pacote não executa migration, backfill nem SQL manual em produção.

## Segurança

- sem migration;
- sem SQL manual;
- sem reset indevido de matrícula;
- sem limpeza de `suspend_data`/`cmi_json` em fluxo normal;
- sem inclusão de PII, tokens ou secrets.
