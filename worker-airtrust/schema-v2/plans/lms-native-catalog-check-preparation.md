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
- A consulta read-only ao inventário das quatro tabelas do Schema V2 0550 confirmou **nenhuma presente em staging**. Portanto 0550 não foi aplicado nesse ambiente.

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

## Compatibilidade efetiva do Cloudflare D1 — limitador de arquitetura (11/10/2026)

Após o ensaio offline, as [instruções oficiais do Cloudflare D1](https://developers.cloudflare.com/d1/sql-api/foreign-keys/) foram confrontadas com o caso real de três tabelas referenciadoras `ON DELETE NO ACTION`. O D1 impõe `foreign_keys=ON` em transações implícitas, inclusive migrations, e **não permite desativar essa checagem com `PRAGMA foreign_keys=OFF`** dentro da execução. A alternativa oficial `PRAGMA defer_foreign_keys=ON` só posterga a validação; não neutraliza a semântica `ON DELETE`.

**Prova reproduzida no teste:** com FK ativa e `defer_foreign_keys=ON`, é possível observar `foreign_key_check` vazio antes do COMMIT e ainda ter `FOREIGN KEY constraint failed` no COMMIT ao dropar a tabela pai; o rollback recupera o esquema. Isso corresponde à advertência do [issue técnico do workerd](https://github.com/cloudflare/workerd/issues/2471) e impede converter o ensaio bem-sucedido em `:memory:` (onde a FK foi desabilitada **antes** da transação) numa migration D1 viável.

**Decisão de segurança:** *não executar* `DROP/RENAME` de `lms_cursos` no D1, nem promover o runner de ensaio a executor remoto. A frente seguinte deve verificar primeiro um **marcador nativo aditivo em tabela/coluna separada** e sua compatibilidade com as rotas legadas e o Schema V2 0550. Essa alternativa precisa de auditoria de dados, tenant e contratos antes de ser adotada. Se for indispensável manter `tipo_conteudo='native'`, será necessária uma estratégia de migração referencial muito mais ampla, explicitamente autorizada, sem pressupor que o D1 suporta o rebuild local.

## Mapa mínimo de compatibilidade para alternativa aditiva

Levantamento no **HEAD da PR #1389**, sem alterações de schema nem decisão de migração:

- **DB 0550:** quatro predicados `c.tipo_conteudo='native'` em triggers de pin, eventos e tentativas.
- **Serviços Worker:** dois predicados em `lms-native-checkpoint-writer.ts`, dois em `lms-native-attempt-writer.ts`, um em `lms-native-enrollment-starter.ts`, um em `lms-native-readiness-repository.ts` e admissão em `lms-native-enrollment-access.ts`.
- **Proteção legada crítica:** `lms-completion-integrity.ts` (finalização, administração, SCORM, xAPI, progresso), `lms-matriculas.ts` (commit SCORM mesmo não terminal) e `lms-progresso.ts` (xAPI não terminal). Todos devem reconhecer o formato nativo **antes** de qualquer write legado, ainda que a coluna antiga fisicamente permaneça `scorm`.
- **UX/catálogo:** conferir rotas administrativas, seletor de formato, matrícula, relatórios, conteúdo LMS e exposição de SCORM assets, para impedir que um curso marcado Native seja lançado por uma tela/rota de SCORM legado.
- **Testes:** atualizar os predicados SQL, fixtures de 0550, autorização multi-tenant, sequência de eventos, conclusão negada por legados, regressão SCORM sem marcador e fail-closed quando a extensão de schema não existir.

**Critério para escolher abordagem:** preferir mutação **estritamente aditiva** (coluna booleana validada ou tabela de vínculo tenant+curso), que o executor Schema V2 atual aceite e que não dependa de desativar FKs. O sinal Native tem de ser autoritativo no backend e não conflitar com `tipo_conteudo` legado. Proibir atalhos como registrar um curso Native como SCORM e deixá-lo completar por regras antigas. Somente adotar após testar compatibilidade integral, inclusive UI, dados, auditoria e certificado.

## Ensaio adicional: marcador aditivo, mantendo FKs habilitadas (11/10/2026)

A prova offline `scripts/schema-v2/rehearse-native-additive-marker.py` reutiliza a captura SHA-256 exata do catálogo de staging, reproduz os **12 objetos catalogados** e inclui modelos sintéticos mínimos das tabelas de qualificações referidas pelos triggers 0457. Numa base em memória com `PRAGMA foreign_keys=ON`, testa a alternativa ilustrativa:

```sql
-- APENAS EXEMPLO NO RUNNER OFFLINE — NÃO APLICAR A D1
ALTER TABLE lms_cursos ADD COLUMN native_pilot_format INTEGER
  NOT NULL DEFAULT 0 CHECK(native_pilot_format IN (0,1));
```

Resultado reproduzido no snapshot real, **sem acessar nem escrever no D1 remoto**: `foreignKeyCheck=PASS`, `integrityCheck=PASS`, **11 índices/triggers preservados**, curso legado existente permanece `native_pilot_format=0`, outro curso sintético pode receber marcador 1 sem alterar seu `tipo_conteudo`, e flags fora de 0/1 são rejeitadas. **Quatro testes** verificam compatibilidade sintética, drift de DDL, assinatura inválida e rollback de uma falha injetada após `ALTER TABLE` e `UPDATE`: a transação com `foreign_keys=ON` restaura a DDL original, dados e todos os índices/triggers.

```sh
PYTHONDONTWRITEBYTECODE=1 python3 \
  scripts/schema-v2/rehearse-native-additive-marker.py \
  /caminho/privado/lms-catalog-staging-schema.json \
  bb867870b5524b0dda21784a017fd0d3f855f116b3c8ff49fd947f05f80a89de
```

**Achado crítico:** a coluna aditiva é tecnicamente possível com FKs ativas, porém **não resolve isoladamente o suporte Native**. Um curso marcado 1 continua com o valor físico `tipo_conteudo='scorm'` exigido pelo CHECK legado. Sem alterar e testar as rotas de player/upload/SCORM/xAPI/status/progresso, tarefas administrativas, catálogo, qualificações e certificados, esse curso seria elegível ao caminho SCORM e poderia burlar requisitos de evidência. **É proibido ativar esse marcador até todas as rotas legadas reconhecerem o estado efetivo Native e falharem fechadas, com testes de não regressão SCORM e multi-tenant.**

Esta é **apenas uma alternativa de design**: não existe migration 0550 ou qualquer apply gerado, nenhuma edição remota, nenhum campo novo na D1 real e nenhuma autorização para habilitar cursos. Para chegar a uma migration de produção, será necessário comparar o escopo de isolamento de todas as rotas legadas e estabelecer como o frontend evita exibir/exportar um curso Native como SCORM. O rebuild do CHECK continua bloqueado pelo contrato Schema V2.

## Progresso do isolamento obrigatório de rotas legadas (11/10/2026)

**Implementação incremental anterior à migration aditiva, com `tipo_conteudo='native'` no contrato atual:**

- `worker-airtrust/src/routes/lms-progresso.ts`: agora bloqueia também `GET /scorm/state/:matriculaId` para curso Native, após validar tenant e funcionário, antes de consultar `lms_progresso_scorm`. O `POST /xapi/statements` já negava escrita Native; os testes validam a recusa e a continuidade de SCORM legítimo.
- `worker-airtrust/src/routes/lms-native-write.ts`: o corpo JSON de evidências é limitado a 128 KiB **durante o consumo da stream**, mesmo sem `Content-Length`. Testes cobrem envio por partes, recusa de excesso e ausência de acesso privado R2 após requisição inválida.
- `worker-airtrust/src/services/lms-native-content-loader.ts`: edição privada revalidada em SELECT conjunto, incluindo funcionário dono, status de matrícula e ciclo, tenant e publicação antes de acessar o R2.

**Riscos ainda não isolados para o possível `native_pilot_format=1` com `tipo_conteudo='scorm'`:**

| Superfície de produção | Entradas relevantes | Estado para o marcador aditivo |
| --- | --- | --- |
| `lms-assets.ts` | `/scorm/assets/:empresa_id/:curso_id/*`, `/scorm/assets-by-curso/:cursoId/*`, `/scorm/launch/:matricula_id`, `/scorm/preview/:curso_id`, `/assets/session` | Requer teste de fail-closed usando **formato efetivo** |
| `lms-matriculas.ts` | `/scorm/commit`, `/:id/finalizar`, `/:id/status`, `/:id/progresso`, recuperações administrativas | Bloqueia Native físico; **marcador aditivo ainda não reconhecido** |
| `lms-progresso.ts` | `/xapi/statements`, `/scorm/state/:matriculaId` | Bloqueia Native físico; **marcador aditivo ainda não reconhecido** |
| `lms-completion-integrity.ts` | SCORM, xAPI, manual, administração, finalização | Bloqueia Native físico; **marcador aditivo ainda não reconhecido** |
| `lms-cursos-upload-routes.ts` e serviços de versionamento | Upload, ativação, conformidade de pacote SCORM/H5P | Precisa bloquear no estado Native efetivo, inclusive administrador |
| `lms-cursos-legacy.ts` | CRUD, edição e cadastro, publicação do catálogo | Precisa distinguir com segurança formato efetivo, validação e permissões |
| Frontend `LmsCatalogo`, `LmsPlayer`, `LmsCursoDetalhe`, `LmsAdminCursos`, `useLms` | Exibição, lançamento, matrícula e navegação | Não apresentar player SCORM para Native marcado; não inferir certificação |
| Histórico, qualificações, certificado e Compliance | Integração com finalização `completeLmsMatricula` | Proibido concluir antes de readiness Native server-owned e transação canônica |

**Decisão:** nenhuma coluna ou migration aditiva é aplicada enquanto os caminhos que usam o campo físico SCORM não forem todos protegidos e testados, mantendo o legado inalterado. As alterações desta etapa reduzem exposição do Native físico, mas **não são suficientes para habilitar o marcador**.

## Riscos e próximos gates para a migration efetiva

1. **Pré-flight real** de produção separadamente, incluindo `sqlite_master`, `PRAGMA table_info`, `PRAGMA foreign_key_list`, contagem de linhas, integridade e dependentes transitivos. Só consultas read-only. Nunca reutilizar fingerprint de staging como autorização para produção.
2. Alterar o CHECK do SQLite exige mecanismo de reconstrução de tabela, não apenas `ALTER COLUMN`. **O builder oficial atual `scripts/schema-v2/build-reviewed-schema-apply.mjs` bloqueia explicitamente `DROP TABLE` combinado com `ALTER TABLE ... RENAME TO`, emitindo `NON_ATOMIC_TABLE_REBUILD_REQUIRES_DEDICATED_EXECUTOR`.** Essa proteção é um bloqueio correto; não modificá-la nem contorná-la para liberar o Native. O procedimento precisa preservar **todas** as colunas e defaults do schema real, seus seis índices, cinco triggers, e relações FK/cascatas nas três tabelas identificadas, além de dependentes transitivos e políticas de qualificação. Não usar `PRAGMA writable_schema`, `foreign_keys=OFF` remoto improvisado nem troca de nomes que reescreva FKs sem plano.
3. Preparar migration Schema V2 **separada** com ID único atual, manifest/hash, executor suportado, plano de rollback/compensação e recovery point. Exigir prova de atomicidade e `PRAGMA foreign_key_check` em fixture representativa antes de staging; não aplicar a partir desta nota.
4. Aplicar em staging somente após autorização do escopo, mantendo 0550 e o CHECK em ordem governada, sem writers nativos habilitados. Publicar pacote privado revisado e matrícula fictícia somente após schema comprovado.
5. Executar E2E completo do LMS: início, ciclo SSOT, evidências, prova/reprovação, reentrada, qualificação/certificado/Compliance. Produção requer autorização explícita para SHA/artefatos/escopo.

**Situação real:** a migration do CHECK não foi criada/aplicada porque, sem executor de reconstrução SQLite referencialmente seguro, fazê-lo seria um risco de dados maior que o bloqueio atual. Nenhuma rota Native foi habilitada.

## Segunda alternativa em estudo: tabela de ativação imutável (11/10/2026)

Em vez de `ALTER TABLE lms_cursos` ou `DROP/RENAME`, o novo ensaio **somente offline** `scripts/schema-v2/rehearse-native-catalog-activation-table.py` usa a mesma captura SHA-256 dos 12 objetos de `sqlite_master` e cria uma tabela filha para indicar *identidade efetiva Native*. A coluna física `tipo_conteudo` continua `scorm` devido ao CHECK legado, mas uma consulta **tenant-scoped** com `LEFT JOIN` é capaz de distinguir um curso Native novo. `PRAGMA foreign_keys=ON` permanece ativo; os seis índices e cinco triggers legados são preservados literalmente.

O ensaio não aceita ativação de um curso já matriculado ou com versões de pacote SCORM; a linha de ativação deve apontar para o curso da mesma empresa, sem `scorm_launch_file` nem `scorm_package_r2_prefix`. Triggers sintéticos tornam a ativação imutável e impedem transformar depois o curso em H5P ou atribuir pacote SCORM. O propósito é provar viabilidade de DDL aditiva **sem tocar em matrículas atuais**. Não são executadas migrations, e o SQL contido no runner não é um bundle de aplicação.

**Atenção: a alternativa continua NÃO PRONTA**. Qualquer rota legada que apenas leia `tipo_conteudo='scorm'`, sem consultar a tabela filha, ainda permitiria playback, progresso ou conclusão indevida. Antes de produzir `schema-v2/changes` é obrigatório incluir o isolamento de **todas** as entradas legadas (mídia, launch, upload, SCORM/xAPI, manual/admin, histórico, certificado e Compliance), propagar o formato efetivo no frontend e criar um mecanismo de ativação governado e auditável. O ensaio não concede permissão de publicação e não substitui preflight D1 atual, manifest, hashes, recovery, autorização staging e E2E.

### Revalidação da DDL real de staging, estritamente read-only — 11/10/2026

O snapshot foi recapturado por `wrangler d1 execute --env staging --remote --json` usando **apenas** `SELECT type,name,sql FROM sqlite_master` para os objetos de `lms_cursos`. A fingerprint permaneceu `bb867870b5524b0dda21784a017fd0d3f855f116b3c8ff49fd947f05f80a89de`, sem drift do snapshot anterior. Um arquivo temporário local privado continha exclusivamente DDL e foi descartado no final do comando.

O novo ensaio de tabela de ativação, executado **sobre essa DDL real e registros sintéticos em memória**, retornou `foreignKeysKeptOn=true`, `foreignKeyCheck=PASS`, `integrityCheck=PASS`, **11 definições originais de índices/triggers preservadas** e `nativeEffectiveIdentityOnNewCourse=true`. Os testes focados dos dois ensaios aditivos resultaram em **9/9 PASS**. `migrationPrepared=false`, `remoteMutationPerformed=false` e `approvalForActivation=false`.

**Escopo do que não foi provado:** não se verificou a inexistência de objetos R2 órfãos ou a ausência de conteúdo de pacote fora das colunas do catálogo. Uma ativação real deverá exigir curso **novo** (sem histórico de matrículas nem pacote SCORM anterior), inventário R2 e garantia de que nenhum legado pode ler/escrever esse curso como SCORM. O ensaio não confirma segurança de aplicação remota do marcador nem valida o Schema V2 0550 no ambiente.
