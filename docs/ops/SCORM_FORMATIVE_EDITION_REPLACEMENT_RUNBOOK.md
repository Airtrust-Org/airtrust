# Runbook — substituição de edição SCORM formativa sem prova final (`FORMATIVE_NO_EXAM_V1`)

Escopo: cursos SCORM 1.2 **formativos, sem prova final** (ex.: MGM). Não altera, nem afrouxa, o caminho de cursos com nota mínima ou prova externa — esses continuam exigindo a certificação funcional completa (Chromium + WebKit, atestação independente).

Este runbook descreve o procedimento; **ele não autoriza nenhuma execução**. Staging segue o fluxo oficial; produção exige autorização atual e específica (SHA do código, pacote, curso e escopo).

## Princípios (o que o servidor garante, não a interface)

| Garantia | Onde é imposta |
|---|---|
| O perfil só existe se o **manifesto estático** do ZIP cumpre o contrato (`assessment.mode=NONE`, sem nota, `requiredInteractions=[]`, `passStatusFromSCORM=false`, `workerApprovalRequired=true`, `formative.scored=false`, atividades ⊂ slides). Campos `release.*` do ZIP **nunca** são lidos. | `lms-scorm-formative-profile.ts`, Quality Gate |
| Política e perfil da edição são gravados pelo servidor e **write-once** (trigger). | schema 0569, `createScormPackageCandidate*` |
| A jornada real do aluno (1 Chromium, 9 casos, certificado PDF real, testemunho Worker/D1) chega como evidência **assinada (HMAC) pelo CI governado**, presa ao SHA do ZIP e ao SHA do Worker. Não é presa a tenant/curso/pacote de staging. | `sign-scorm-formative-attestation.mjs` ⇄ `verifyFormativeAttestation` |
| A ligação a **tenant + curso + pacote + SHA** em produção é feita pela **aprovação administrativa** autenticada (somente `admin`), append-only, idempotente, com justificativa de 10–500 caracteres. | `lms_scorm_package_approvals`, `approveFormativePackage` |
| Ativação é **uma transação D1**: congela ciclos já encerrados com a política vigente, grava a edição anterior, troca o ponteiro **e** a política do curso, audita e invalida diagnósticos. Pacote adulterado ou obsoleto não muda nada. | `commitCertifiedScormActivation` |
| Política avaliativa é **por edição / ciclo**, não global do curso: ciclo encerrado mantém as regras sob as quais terminou; ciclo aberto segue a edição ativa. Matrículas/conclusões históricas nunca são reclassificadas. | `lms_matricula_ciclos.assessment_policy`, `EFFECTIVE_ASSESSMENT_POLICY_SQL` |
| `PUT` do curso **não** muda a política de curso com matrículas (409 `POLICY_CHANGE_REQUIRES_EDITION_ACTIVATION`). | `lms-course-policy-guard.ts` |

## Ordem obrigatória de implantação

1. **Schema V2 `lms-scorm-edition-policy-approvals-0569`** (aditivo, DDL-only, zero backfill) em staging pelo workflow `staging-apply-schema-v2.yml`; em produção pelo fluxo governado equivalente. *Schema antes do Worker.*
2. Worker com o código desta mudança.
3. Só então o procedimento abaixo.

Reverter o Worker é seguro e suficiente para voltar ao comportamento anterior; **nunca** `DROP` das colunas/tabela (provas imutáveis).

## Procedimento

Todos os passos ficam em **Curso → Edições do pacote SCORM** (painel do detalhe do curso).

1. **Enviar ZIP.** O botão de substituição para na validação quando o pacote é formativo (não executa conformance nem ativa); a edição fica `VALIDATED`/inativa. Confira o SHA-256 completo exibido contra o SHA do artefato aprovado.
2. **Homologar (staging).** O CI governado roda a jornada real do aluno sobre os bytes exatos e assina a evidência (`sign-scorm-formative-attestation.mjs`, só em `main` protegida). Casos exigidos (9): `FIRST_ACCESS`, `REQUIRED_CONTENT_COVERAGE`, `REQUIRED_INTERACTIONS`, `PERSISTENCE_VERIFIED`, `SUSPEND_RESUME`, `EXPLICIT_FINALIZATION`, `REOPEN_COMPLETED`, `NO_STATUS_DOWNGRADE`, `TENANT_CYCLE_ISOLATION`. Validade da evidência: 30 dias.
3. **Importar a evidência** no painel (arquivo JSON assinado). Item `JOURNEY_EVIDENCE` da pré-checagem passa a ✔. Evidência de outro SHA/runtime, adulterada ou vencida é recusada (409).
4. **Aprovar** (administrador): justificativa + referência editorial opcional + digitar os 12 primeiros caracteres do SHA. Item `ADMIN_APPROVAL` ✔. Após a aprovação a evidência não pode ser substituída.
5. **Ativar.** A pré-checagem é a **mesma função** que a ativação executa. Informa quantos ciclos serão congelados e quantas matrículas em andamento passarão a seguir a nova edição (exige ciência da quantidade). Confirmação: SHA (12 caracteres) + curso. Se qualquer requisito falhar: 409 `ACTIVATION_PREFLIGHT_FAILED`, nada muda.
6. **Conferir o resultado** (card da edição ativa): curso, SHA ativo, política. Verificar no player uma matrícula de teste/administrativa e, se aplicável, que conclusões antigas continuam intactas (ciclos encerrados mantêm `assessment_policy`).

## Rollback (administrador)

No card da edição ativa → **Restaurar edição anterior** (digitar 12 caracteres do SHA da anterior).

- A edição anterior é a que estava ATIVA **dentro da transação** de ativação (não um valor lembrado do upload).
- Verifica que os arquivos da edição anterior existem no R2 antes de trocar.
- Congela os ciclos encerrados sob a edição que sai, restaura ponteiro **e** política do curso, e audita `ROLLED_BACK` + `ACTIVATED`.
- Restaurar uma edição avaliativa exige nota mínima positiva no curso (`ROLLBACK_THRESHOLD_MISSING`).
- Sem edição anterior recuperável → 409 `ROLLBACK_NO_PREVIOUS`.

## Códigos de erro úteis

`FORMATIVE_PROFILE_NOT_ELIGIBLE`, `FORMATIVE_ATTESTATION_<MOTIVO>` (`PACKAGE_SHA_MISMATCH`, `RUNTIME_SHA_MISMATCH`, `ATTESTATION_EXPIRED`, `ATTESTATION_SIGNATURE_INVALID`, `JOURNEY_NOT_CERTIFIED`…), `FORMATIVE_ATTESTATION_MISSING`, `FORMATIVE_ALREADY_APPROVED`, `ACTIVATION_CONFIRMATION_REQUIRED`, `ACTIVATION_IN_PROGRESS_ACK_REQUIRED`, `ACTIVATION_PREFLIGHT_FAILED`, `ROLLBACK_*`.

## O que este mecanismo **não** faz

- Não ativa nada sozinho, não reescreve conclusões, notas, qualificações ou certificados existentes.
- Não aceita string/flag do ZIP como aprovação (`release.*` é ignorado).
- Não dispensa homologação: sem evidência assinada **e** aprovação administrativa a ativação é recusada.
- Não substitui as autorizações de staging/produção.

## Evidência mínima para solicitar autorização de produção

SHA do código (commit na `main`), SHA-256 do ZIP, curso e tenant alvo (confirmados por leitura autenticada), relatório dos 8 gates oficiais, evidência de schema 0569 aplicado e verificado, evidência assinada importada em staging com PDF de certificado real, e plano de rollback acima.
