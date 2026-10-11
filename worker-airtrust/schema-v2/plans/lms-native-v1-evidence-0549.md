# lms-native-v1-evidence-0549 — Schema V2 additivo (NÃO APLICAR SEM PREFLIGHT)

## Objetivo e escopo

Preparar o armazenamento governado de edições imutáveis e evidências de aprendizagem para o futuro AirTrust Native V1. Esta mudança é **somente aditiva**, não atualiza `lms_cursos`, `lms_matriculas`, `lms_matricula_ciclos`, qualificações, certificados ou usuários. A existência das tabelas não permite usar `tipo_conteudo='native'`: o CHECK legado do catálogo continua bloqueando esse valor e demandará mudança Schema V2 separada, baseada no schema real do ambiente.

O aplicativo Native V1 **não recebe autorização para matrícula ou emissão de certificado** por esta migration. O PR #1389 permanece draft e a issue operacional #1325 permanece aberta.

## Modelo persistido

- `lms_native_edicoes`: empresa, curso, SHA-256 do artefato validado, versão, prefixo R2 escopado, estados DRAFT / REVIEWED / PUBLISHED / REVOKED. Sem substituir objeto publicado. Validação de identidade tenant/curso na inserção, prefixo R2 governado e transições limitadas. Publicação exige revisão e carimbo.
- `lms_native_matricula_edicoes`: pin **imutável** da edição por empresa/matrícula/ciclo. Trigger valida vínculo atual da matrícula ao curso, tenant e edição publicada; UNIQUE impede troca silenciosa de versão durante uma matrícula/ciclo ativo.
- `lms_native_eventos`: recibos de cobertura de unidade por matrícula/ciclo/edição, com hash de payload, event_id idempotente e sequência contígua; UNIQUE/eventos sem UPDATE/DELETE. O evento só é aceitável após as verificações do Worker sobre conteúdo e matrícula, e a gravação deve ser atômica.
- `lms_native_tentativas`: tentativas de quiz/decisão e resultado de correção pelo Worker, sem gabarito persistido no registro do aluno. Dados de respostas são privados e devem ter limites/retenção governados. UNIQUE por tentativa/ciclo, sem UPDATE/DELETE.

**Limitação técnica explícita:** restrições SQL não provam visualização real da unidade, propriedade do token de acesso, aprovação ou persistência idempotente das transações que ligam evidência ao LMS; esses controles continuam obrigatórios no Worker. `score_pct` e `assessment_satisfied` são resultados do backend, nunca campos gravados diretamente por payload do navegador. A montagem de curso/native content ainda não está exposta.

## Pré-condições obrigatórias para qualquer aplicação remota

1. Capturar SHA exato da main + oito gates, ambiente D1 correto, status do baseline `production-d1-baseline-v2-20260714`, entradas do ledger `airtrust_schema_changes_v2`, backup/recovery point e workflow atual.
2. Inspecionar **somente leitura** `sqlite_master`, `PRAGMA table_info`, índices/FKs/triggers de `lms_cursos`, `lms_matriculas` e `lms_matricula_ciclos`. Confirmar os três objetos existentes e a presença de `ciclo_atual`, `curso_id`, `empresa_id`, `deleted_at` usados nos triggers.
3. Confirmar ausência de TODAS as quatro tabelas `lms_native_*` e dos triggers/índices declarados, para impedir colisão com um outro change ou ambiente divergente. O SQL se recusa a rodar se alguma tabela-alvo existir.
4. Validar hashes do arquivo SQL e deste plano contra o manifest Schema V2 versionado; testar o bundle oficial e dry-run com SQLite local e bases sintéticas representativas, antes de qualquer ambiente.
5. Aplicação só pelo workflow Schema V2 vigente, com autorização atual e específica para SHA/artefato/escopo, recuperação D1 e pós-condições. **Nenhum SQL remoto ad hoc**.

## Testes locais e pós-condições

`scripts/__tests__/test_lms_native_v1_evidence_0549.py` usa somente SQLite em memória. Exercita ausência de alteração do LMS existente, recusa a segunda aplicação, integridade por tenant e tipo, ciclo/curso errado, edição não revisada, alteração de hash, vinculação e eventos imutáveis, sequência/duplicata, tentativas formativas/notas e FKs desabilitadas onde aplicável.

Após aplicação autorizada, confirmar **quatro tabelas e todos os triggers/índices presentes**, sem quaisquer registros Native criados; snapshots de contagem/checksum das tabelas legadas inalterados. Confirmar que o player SCORM, cursos PDF/PPTX/H5P e o processo atual de conclusão não mudaram.

## Etapas posteriores (dependências)

1. Schema V2 específico para permitir `tipo_conteudo='native'` no CHECK de `lms_cursos`. Recriar a tabela a partir do `sqlite_master` *real* e conferir TODOS os índices/triggers/FKs, evitando copiar a migration histórica 0341. Migrar com fail-closed por diferença de schema, sem alterar conteúdo ou matrículas.
2. Repositório Native R2 imutável + publicação revisada + pin de edição por ciclo, seguido do endpoint autenticado de launch/assets com autenticação e RBAC existentes; assinaturas/hashes são autoridade.
3. Serviço de eventos/tentativas com transações atômicas, preenchendo as tabelas exclusivamente pelo Worker. Recalcular a prova com gabarito reservado, confirmar integridade/tenant/ciclo/edição e persistência. Replays devem retornar resposta idempotente ou erro de conflito sem recriar evento.
4. Entregar resultado aprovado à transação de conclusão canônica `completeLmsMatricula`, preservando idempotência de qualificação/certificado e eventos para recuperação.
5. Staging real (mesmo SHA para Worker/Pages/schema) com primeiro acesso, interrupção, retomada, reprovação, aprovação, certificado, compliance, revisão read-only, cross-tenant, replay, versões e dispositivos. Sem liberação de turmas antes da certificação pedagógica do ZIP específico.

## Recovery/compensação

DDL D1 é governado e exige recovery point antes do apply. As quatro tabelas começam vazias; compensação eventual após publicação não pode apagar tentativas ou evidências de funcionários. Se houver dados, usar novo plano revisado com preservação do histórico, nunca `DROP TABLE` improvisado. O baseline e a autorização de produção dependem do candidato efetivo do release.

**Importante:** adicionar este SQL/manifest no Git não o aplica em staging ou produção.
