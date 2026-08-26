# Carga cadastral Costa do Sol (empresa_id=6) — 2026-08-26

Os arquivos com PII real dos 97 funcionários (nome, CPF, RG, nascimento,
telefone, e-mail) NÃO ficam neste repositório — só o código/tooling que os
consome. Isso evita PII completo no histórico do git (diffs de PR, clones,
logs de CI).

Arquivos versionados aqui:
- `costa-do-sol-setores-seed-20260826.sql` — cria/reativa os setores
  canônicos do tenant 6. Sem PII.
- `README-costa-do-sol-cadastral-20260826.md` — este arquivo.

Arquivos NÃO versionados (mantidos fora do repositório, aplicados
diretamente a partir de local seguro pelo fluxo governado):
- SQL de atualização/inserção cadastral dos 97 funcionários (55 UPDATE por
  CPF + 1 UPDATE por funcionario_id para Paloma, preservando CPF + 41
  INSERT para os genuinamente ausentes).
- JSON de candidatos a login ALUNO (cpf/email/nome, sem senha em claro),
  consumido por
  `worker-airtrust/scripts/generate-costa-do-sol-student-provisioning.mjs`.

Ordem de aplicação (produção, após autorização explícita e backup válido):
1. `worker-airtrust/migrations/0471_setores_add_centro_custo_reference.sql`
2. `costa-do-sol-setores-seed-20260826.sql`
3. SQL de atualização/inserção cadastral (fora do repo)
4. Novo preflight de usuários para os 97 (incluindo os 41 recém-criados)
5. `generate-costa-do-sol-student-provisioning.mjs` → gera SQL de
   provisionamento ALUNO → aplicar pelo fluxo governado
