# Contrato operacional de encerramento de PR e release AirTrust

## Regra de estado: nunca presumir publicação

Toda correção deve registrar separadamente:

1. **Código corrigido:** branch e HEAD, causa suficiente, testes focados.
2. **PR pronta:** HEAD atualizado, oito gates obrigatórios, mergeabilidade.
3. **Integrada:** SHA de merge presente na `main`. Uma PR aberta **não** está integrada.
4. **Publicada:** workflow oficial de deploy `success`, Worker + Pages identificados por source SHA/provenance; validar se o SHA de merge é ancestral do SHA realmente publicado. Uma PR mergeada sem essa prova continua `MERGED_NOT_DEPLOYED`.
5. **Validada operacionalmente:** teste real do fluxo específico, com usuário/tenant permitido, sem mascarar falhas. D1 Schema V2 exige também ledger, pós-condições e recovery; SCORM exige finalização de matrícula e qualificação, não apenas `LMSFinish` ou nota 100.

O diagnóstico seguro de release fica no workflow `Release Coverage Audit (Read-only)`: `.github/workflows/release-coverage-audit.yml`, script `scripts/ops/release-coverage-audit.mjs`.

O resultado `CODE_IN_PRODUCTION` comprova **ancestralidade de código**, não aceitação funcional, hashes completos de artefato ou migrações aplicadas. Um `PROVENANCE_UNVERIFIED` nunca pode ser convertido em PASS por suposição. O workflow não publica código, não altera D1/R2 nem libera produção.

## Checklist para comunicação entre frentes

Usar estado expresso, sem o termo ambíguo "finalizado":

- `PR_READY`: código/testes aprovados, sem merge;
- `MERGED_MAIN`: merge SHA confirmado em `main`, publicação não demonstrada;
- `STAGING_PUBLISHED`: SHA candidato, Worker/Pages e schema verificados em staging;
- `PRODUCTION_PUBLISHED`: autorização atual para SHA/artefato/escopo + deploy oficial + provenance confirmada;
- `OPERATIONALLY_VALIDATED`: evidência do caso real sem bypass/retroconclusão.

Quando o QA depende de senha/conta ou de D1, usar os workflows oficiais com segredos protegidos e relatórios sanitizados. Não divulgar nomes de alunos, matrículas, tokens ou CPF.

## Risco das frentes existentes

- PRs abertas não devem ser incluídas no inventário de mudanças publicadas.
- Mudanças de schema aplicadas por workflow governado têm prova própria e não se confundem com publicação do Worker.
- Clean-up de workflow só precisa merge/revalidação dos disparos; não implica deploy de Pages/Worker.
- Correções LMS de conclusão não são consideradas entregues antes de validar o fechamento atômico (progresso, matrícula, qualificação, histórico/auditoria) sob os gates atuais.
- Correções não relacionadas podem prosseguir em paralelo; serializar merge/deploy concorrente no mesmo alvo.

Referências: `CI_RELEASE_GOVERNANCE.md`, `EXECUTION_SURFACES_GITHUB_FIRST.md`, `INSTRUCOES_CANONICAS_PROJETO_AIRTRUST_V6.md`.
