# Plan 0587: Retificação formal append-only de fichas de simulador assinadas

## Context
Issue `#2237` (ficha histórica aprovada com NOTECHS `NR`) e `#2232` (PTO Rev.10 V18). O código já respondia
"Utilize o fluxo formal de retificação" ao tentar alterar ficha assinada, mas esse fluxo não existia. Esta
mudança cria o registro formal, sem tocar a ficha original.

## Scope & Guarantees
- **Targets**: `fichas_sessao_retificacoes`, `fichas_sessao_retificacoes_itens` (tabelas novas, aditivas).
- **Zero alteração** em `fichas_sessao` e `fichas_sessao_manobras`: a retificação guarda snapshot original (SHA-256),
  motivo, fundamento normativo, evidência nova, decisão de responsável distinto do solicitante e as assinaturas
  pessoais do instrutor e do aluno da ficha original.
- Append-only por trigger: sem DELETE; itens imutáveis; estados terminais congelados; assinatura imutável;
  conclusão exige decisão + as duas assinaturas + resultado recalculado.
- Sem DROP/RENAME/backfill. Nenhuma nota é inventada: cada item exige valor explícito; NOTECHS não admite NR.
- Fora de escopo (próximo passo): os leitores de histórico/qualificação ainda leem a ficha original; a adoção do
  resultado retificado por esses consumidores exige decisão normativa do RT.

## Verification & Recovery
- Testes: `simuladores-fichas-retificacoes.sqlite.test.ts` (SQLite real) e contrato do manifesto.
- Preflight/postconditions: `scripts/schema-v2/validate-0587-production-{preflight,postconditions}.sh`.
- Rollback: tabelas novas e vazias; reverter o Worker antes de qualquer uso é lossless. Time Travel capturado pelo
  workflow `apply-schema-change-v2.yml`.
