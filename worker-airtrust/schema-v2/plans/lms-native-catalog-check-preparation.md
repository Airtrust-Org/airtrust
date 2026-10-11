# Native V1 — preparação do CHECK do catálogo (sem SQL de apply)

**Estado:** investigação concluída em leitura; planejamento governado pendente.
**Não é migration versionada; não concede autorização de escrita, merge ou deploy.**

## Evidência de staging (consulta D1 estritamente read-only, 2026-10-10)

- Target Wrangler: `airtrust-db-staging-baseline-20260701`, `--env staging --remote`.
- Catálogo: `lms_cursos.tipo_conteudo CHECK (tipo_conteudo IN ('scorm','h5p','video','pdf','pptx'))`. **Não aceita `native`.**
- Hash SHA-256 da DDL exata de `lms_cursos` no snapshot:
  `ef84c6e67f284984e7843be226f05a04034ca7b861d40111cef6d5247bb96612`.
- Hash SHA-256 da coleção ordenada de 12 objetos `[type,name,sql]` (1 tabela, 6 índices, 5 triggers):
  `bb867870b5524b0dda21784a017fd0d3f855f116b3c8ff49fd947f05f80a89de`.
- Objetos dependentes diretos da tabela:
  - índices: `idx_lms_cursos_dominio_codigo`, `idx_lms_cursos_empresa_categoria`,
    `idx_lms_cursos_empresa_deleted`, `idx_lms_cursos_empresa_publicado`,
    `idx_lms_cursos_formato`, `idx_lms_cursos_qualificacao_tipo`;
  - triggers: `trg_lms_course_qualification_category_fk_insert_0457`,
    `trg_lms_course_qualification_category_fk_update_0457`,
    `trg_lms_course_qualification_category_snapshot_insert_0457`,
    `trg_lms_course_qualification_category_snapshot_update_0457`,
    `trg_lms_cursos_updated_at`.
- Três tabelas no mesmo staging contêm referências FK SQL explícitas a `lms_cursos`:
  `lms_cursos_setores`, `lms_matriculas` e `lms_scorm_package_versions`.
  Uma consulta adicional a `pragma_foreign_key_list` confirmou que as três apontam por `curso_id` e declaram `ON DELETE NO ACTION` (não CASCADE). Isso reduz um risco específico, mas **não prova** que qualquer sequência de DROP/RENAME seja transacionalmente segura no executor real.
- A consulta read-only ao inventário das quatro tabelas do Schema V2 0549 confirmou **nenhuma presente em staging**. Portanto 0549 não foi aplicado nesse ambiente.

Os hashes descrevem apenas o snapshot de staging capturado: não inferir equivalência com produção, nem presumir validade após avanço do schema.

## Portão reproduzível sem escrita

Capturar via Wrangler **apenas DDL, nunca registros/PII**:

```sh
cd worker-airtrust
npx wrangler d1 execute airtrust-db-staging-baseline-20260701 \
  --env staging --remote --json \
  --command "SELECT type,name,sql FROM sqlite_master WHERE name='lms_cursos' OR tbl_name='lms_cursos' ORDER BY type,name" \
  > /caminho/privado/lms-catalog-staging-schema.json
cd ..
node scripts/schema-v2/native-v1-catalog-readonly-preflight.mjs \
  /caminho/privado/lms-catalog-staging-schema.json \
  bb867870b5524b0dda21784a017fd0d3f855f116b3c8ff49fd947f05f80a89de
```

O checker rejeita mudanças de tabela, trigger, índice, CHECK e fingerprint.
Saída aceita = `REVIEW_ONLY_REBUILD_REQUIRED`, **não** SQL executável.
Qualquer drift exige novo snapshot e revisão do delta, nunca atualização cega do hash.

## Ensaio offline do rebuild com DDL real (sem aplicar migration)

Um novo runner de validação **somente local**, `scripts/schema-v2/rehearse-native-catalog-rebuild.py`, recebe a captura read-only do `sqlite_master`, confirma a fingerprint dos **12 objetos** e reproduz a reconstrução em um banco `:memory:` com **registros sintéticos**, contendo três tabelas referenciadoras `ON DELETE NO ACTION`. O runner não recebe token Cloudflare, não consulta D1, não escreve arquivos de SQL executável e retorna `migrationPrepared=false` e `remoteMutationPerformed=false`.

```sh
PYTHONDONTWRITEBYTECODE=1 python3 \
  scripts/schema-v2/rehearse-native-catalog-rebuild.py \
  /caminho/privado/lms-catalog-staging-schema.json \
  bb867870b5524b0dda21784a017fd0d3f855f116b3c8ff49fd947f05f80a89de
```

**Executado na captura real de staging:** `foreignKeyCheck=PASS`, `integrityCheck=PASS`, `dependentDefinitionsPreserved=11` (seis índices e cinco triggers), `originalAutoincrementPreserved=true` e `syntheticNativeWrite=PASS`. O teste de falha injetada após `DROP TABLE` confirmou **rollback completo**, inclusive restauração de colunas, dependentes, referências e `sqlite_sequence`. O conjunto adicional de sete testes cobre fingerprint, drift, registros, índices ausentes, CHECK indevidamente alterado e falha injetada.

**Conclusão importante de engenharia:** um teste específico com `PRAGMA defer_foreign_keys=ON` dentro da transação demonstrou que `DROP TABLE` da tabela pai pode aparentar `PRAGMA foreign_key_check` vazio e **ainda assim falhar no COMMIT** por `ON DELETE NO ACTION`. Por isso **não basta ativar deferência de FK na migration Schema V2 existente**. O teste offline utiliza isolamento em memória e controle explícito de `foreign_keys` antes da transação; esse mecanismo **não pode ser copiado para um comando Wrangler remoto** sem um executor governado que prove sessão, rollback, recovery e proveniência. A proteção `NON_ATOMIC_TABLE_REBUILD_REQUIRES_DEDICATED_EXECUTOR` permanece intacta.

O ensaio com um único registro sintético **não comprova segurança para todos os dados reais**, relações transitivas ou semântica Cloudflare D1. Antes de qualquer apply, será necessário um plano governado de reconstrução, validação de estado remoto atual, backup e autorização específica de ambiente e SHA.

## Riscos e próximos gates para a migration efetiva

1. **Pré-flight real** de produção separadamente, incluindo `sqlite_master`, `PRAGMA table_info`, `PRAGMA foreign_key_list`, contagem de linhas, integridade e dependentes transitivos. Só consultas read-only. Nunca reutilizar fingerprint de staging como autorização para produção.
2. Alterar o CHECK do SQLite exige mecanismo de reconstrução de tabela, não apenas `ALTER COLUMN`. **O builder oficial atual `scripts/schema-v2/build-reviewed-schema-apply.mjs` bloqueia explicitamente `DROP TABLE` combinado com `ALTER TABLE ... RENAME TO`, emitindo `NON_ATOMIC_TABLE_REBUILD_REQUIRES_DEDICATED_EXECUTOR`.** Essa proteção é um bloqueio correto; não modificá-la nem contorná-la para liberar o Native. O procedimento precisa preservar **todas** as colunas e defaults do schema real, seus seis índices, cinco triggers, e relações FK/cascatas nas três tabelas identificadas, além de dependentes transitivos e políticas de qualificação. Não usar `PRAGMA writable_schema`, `foreign_keys=OFF` remoto improvisado nem troca de nomes que reescreva FKs sem plano.
3. Preparar migration Schema V2 **separada** com ID único atual, manifest/hash, executor suportado, plano de rollback/compensação e recovery point. Exigir prova de atomicidade e `PRAGMA foreign_key_check` em fixture representativa antes de staging; não aplicar a partir desta nota.
4. Aplicar em staging somente após autorização do escopo, mantendo 0549 e o CHECK em ordem governada, sem writers nativos habilitados. Publicar pacote privado revisado e matrícula fictícia somente após schema comprovado.
5. Executar E2E completo do LMS: início, ciclo SSOT, evidências, prova/reprovação, reentrada, qualificação/certificado/Compliance. Produção requer autorização explícita para SHA/artefatos/escopo.

**Situação real:** a migration do CHECK não foi criada/aplicada porque, sem executor de reconstrução SQLite referencialmente seguro, fazê-lo seria um risco de dados maior que o bloqueio atual. Nenhuma rota Native foi habilitada.
