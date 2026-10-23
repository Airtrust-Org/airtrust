# SCORM 1.2 — fixture sintética de retomada (NÃO CERTIFICADA)

## Objetivo

Reproduzir as duas posições, gravação de `cmi.core.lesson_location` e
`cmi.suspend_data`, `LMSCommit`, `LMSFinish` e retomada. É uma fixture técnica,
sem conteúdo pedagógico, prova final, nota, certificado ou alegação de
conclusão. Não faz parte dos 43 cursos F5.

## Gerar e verificar (somente local)

```sh
python3 scripts/qa/build-scorm-resume-synthetic.py \
  --output /tmp/qa-scorm-resume-uncertified.zip \
  --json-output /tmp/qa-scorm-resume-metadata.json
node --test scripts/__tests__/scorm-resume-synthetic-fixture.test.mjs
python3 -m unittest discover -s scripts/qa/tests \
  -p test_scorm_resume_synthetic.py -v
```

O gerador é determinístico e documenta SHA-256 e tamanho dos bytes. O pacote inclui `airtrust-completion-manifest.json` no contrato estático do Worker,
com `assessment.mode=EXTERNAL`, `workerApprovalRequired=true` e `release.reviewed=false`; a API do SCO nunca atribui aprovação. O arquivo
`imsmanifest.xml` contém um SCO SCORM 1.2. O runtime exige API 1.2 verdadeira,
lê CMI ao abrir, não avança sem `LMSCommit`, bloqueia erro de leitura e
inconsistência entre `lesson_location` e `suspend_data`, e **nunca** define
`passed`, `completed`, `score` ou qualquer atestação.

## Limites e gates de staging

- `Node VM PASS` e manifesto íntegro **não** equivalem a navegador real,
  backend D1/R2, Worker/Pages publicado ou certificação funcional.
- Este ZIP é `UNCERTIFIED` e **não pode ser ativado** pela API; não remover ou
  contornar o Quality Gate. Não alterar `scorm_package_r2_prefix` por SQL.
- Workflow #1727 continua `BLOCKED_NO_ACTIVE_QA_SCORM_PACKAGE` até que haja
  fixture sintética governada e tecnicamente elegível no tenant
  `qa_examiner_training`. Nunca rerodar sem alteração dessa condição.
- Caminho A: fixture ACTIVE previamente certificada e de QA.
- Caminho B: certificação/ativação técnica governada, com evidência real.
- Caminho C: edição candidata **inativa** com nova rota de QA staging-only,
  vinculada a matrícula e ciclo sintéticos, **separadamente revisada** para
  permitir Commit/readback sem ativação; preview read-only atual é insuficiente.
  Não criar esse caminho por analogia com preview: necessita revisão RBAC,
  isolamento tenant, escopo SHA, Schema V2, recovery, cleanup e grant.

O único aceite final é teste autenticado do Worker/Player real, com launch,
commit, fechamento, reabertura, readback e isolamento verificáveis, sem alunos
reais e com cleanup concluído. A PR desta fixture não executa esses writes.

## Browser and backend regression (local only)

The `scorm-resume-local-worker-browser.yml` workflow runs a SHA-pinned synthetic ZIP with a non-certifying navigation driver against a **disposable** local Worker, SQLite D1, Wrangler R2, and real Chromium/WebKit. It checks an actual authenticated asset session, Next/Commit, Finish, resume after relaunch, stored CMI, and denied cross-tenant access. The source SHA, ZIP SHA and sanitized result are bound to GitHub Actions; credentials for remote Cloudflare are denied. This is **not** trusted staging certification, authorization to activate, or a substitute for the official staging fixture prerequisite.
