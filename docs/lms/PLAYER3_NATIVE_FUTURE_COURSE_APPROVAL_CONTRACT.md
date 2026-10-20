# F5 → F4 — Contrato de aprovação técnica Native para QA

Status: contrato de elegibilidade para QA de um único curso, não autorização de publicação, matrícula, conclusão nem certificado. Owner Learning Factory: F4, PR #1389. Owner da verificação independente: F5. Coordenação: issue #776.

## Reutilização
Não alterar conversores, motor, Player 3, banco ou publicador da F4. Reutilizar hashes de origem/edição, banco privado, projeção learner, crosswalk, política e relatórios. Reutilizar o princípio já existente no SCORM produtivo: Ed25519, chave pública registrada em ambiente protegido, identidade independente e assinatura vinculada a hashes byte-exatos. O recibo SCORM não certifica Native.

## Manifesto privado de um único curso

Arquivo evidence.json, schema AIRTRUST_PLAYER3_NATIVE_QA_APPROVAL_EVIDENCE_V1. Campos obrigatórios: status REVIEW_ONLY_NEVER_DEPLOY ou REQUIRES_PEDAGOGICAL_AND_TECHNICAL_REVIEW, publicationPerformed=false, courseId, packageVersion, authorReference, editionSha256, artifacts, media[] e humanReview.

Cada chave obrigatória em artifacts contém path relativo e sha256 hex de 64 caracteres:
- source: fonte individual autorizada, bytes originais e hash, nunca ZIP original em GitHub.
- edition: JSON AIRTRUST_NATIVE_COURSE_V1, courseId, packageVersion, assets[]; SHA do próprio arquivo igual a editionSha256 (edição imutável).
- learner: projeção JSON courseId, packageVersion e questions[].id, sem gabarito/feedback privado.
- privateBank: banco exclusivamente privado, questions[].id, nunca exposto ao aluno.
- policy: AIRTRUST_PLAYER3_GRADE_POLICY_V1, courseId, editionSha256, modo MODULE_CERTIFIED, FINAL_CERTIFIED ou ATTENDANCE_ONLY; para avaliação, masteryScore de 0 a 100 e moduleGate booleano explícito.
- crosswalk: AIRTRUST_PLAYER3_QUESTION_CROSSWALK_V1, questions[] com sourceQuestionId, privateQuestionId, learnerQuestionId e stageId; cobertura exata de questões privadas e learner, sem duplicações.
- navigation: AIRTRUST_PLAYER3_NAVIGATION_INTERACTION_REVIEW_V1, status PASS, checks NAVIGATION, INTERACTIONS e REOPEN PASS, sem outros checks reprovados.
- fidelity: AIRTRUST_PLAYER3_FIDELITY_REVIEW_V1, status PASS, hashes exatos sourceSha256 e editionSha256 e reviewedScreens[] não vazio.

media[] lista exaustivamente os assets da edição com caminho, SHA e bytes presentes. Assets JS/HTML/JSON servidos ao aluno não podem conter padrões estáticos conhecidos de gabaritos. A análise estática não dispensa revisão humana de CSS, layout, imagem/vídeo, acessibilidade, roteamento, interações, JS dinâmico e fidelidade pedagógica.

humanReview.visual e humanReview.pedagogical exigem status APPROVED, reviewerReference diferente de authorReference, e evidenceSha256 igual respectivamente aos hashes de fidelity e crosswalk. A mesma identidade independente assina ambos. Sem qualquer evidência: REJEITAR.

## Assinatura e proveniência
approval.json contém exatamente kind AIRTRUST_PLAYER3_NATIVE_QA_APPROVAL_ED25519_V1, evidenceSha256, reviewerKeyId, reviewerReference, approvedAt (ISO UTC milissegundos) e signature (Ed25519 base64). A mensagem assinada é UTF-8 da concatenação, separada por LF, nesta ordem: kind, evidenceSha256, reviewerKeyId, reviewerReference, approvedAt.

evidenceSha256 é SHA-256 dos bytes exatos do evidence.json, que fixa todos os hashes internos. Registro externo PLAYER3_TRUSTED_REVIEWER_PUBLIC_KEYS_JSON é provisionado exclusivamente no ambiente CI protegido e indexado por reviewerKeyId; cada entrada tem reviewerReference, role INDEPENDENT_PEDAGOGICAL_REVIEWER e publicKeyPem. Jamais permitir que o autor forneça o registro confiável ou a chave privada. Qualquer mudança exige nova revisão e nova assinatura.

## Operação somente-leitura
Executar node scripts/ci/player3-native-qa-approval-gate.mjs com três argumentos: diretório privado, evidence.json e approval.json. Definir variável de ambiente protegida PLAYER3_TRUSTED_REVIEWER_PUBLIC_KEYS_JSON. O código não executa comandos externos nem grava arquivos/D1/R2.

O único resultado positivo é QA_ELIGIBLE_NOT_AUTHORIZED_TO_PUBLISH com hashes de fonte, edição, evidência e assinatura, ID do revisor e flags publicationPerformed=false, enrollmentChanged=false, certificationPerformed=false. Não constitui licença para converter REVIEW_ONLY em PUBLISHED nem prova QA física de curso real.

Futuro publicador real deverá ter contrato **distinto**, grants específicos F4/F0, release SHA, 8 gates oficiais, autorização/tenant/RBAC, Schema V2, origem R2/Pages privada, lock de staging, QA física e rollback. O publicador sintético da F4 não pode publicar curso real.

## Ensaios e handoff
Executar: node --test scripts/__tests__/player3-native-qa-approval-gate.test.mjs

Fixture inteiramente sintética, chave efêmera, zero dados reais. Negativos: fonte adulterada, mídia faltante, gabarito no aluno ou JS, política ausente/incompleta, edição alterada, falta/forja de assinatura, revisor igual a autor, revisão visual recusada, navegação incompleta, crosswalk com questões ausentes, alteração pós-assinatura, mídia omitida e caminho inseguro.

F4 só poderá apresentar o primeiro curso futuro mediante fonte individual autorizada, revisão humana de fidelidade pedagógica e visual, política assinada e banco realmente segregado; não iniciar conversão dos 22 cursos nesta execução. Cursos #15 e #41 intocados. Nenhuma publicação, matrícula, Schema V2 ou produção nesta F5.
