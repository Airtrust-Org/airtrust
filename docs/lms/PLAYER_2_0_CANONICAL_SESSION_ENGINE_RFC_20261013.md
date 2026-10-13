# AirTrust Player 2.0 — decisão arquitetural, protocolo de conclusão e migração

**Estado:** arquitetura proposta + contrato puro executável; **não ativado no runtime**, sem migrations ou deploy.  
**Autoridade:** GitHub `Airtrust-Org/airtrust`, CI Actions, D1/R2 e Schema V2 governados.  
**Objetivo operacional:** uploads SCORM 1.2/2004 conformes funcionarem sem exigir metadados AirTrust proprietários; Native compartilhar o mesmo fechamento, matrícula, qualificação e certificado. Não converter automaticamente treinamento pré-existente.

## Evidência de falha sistêmica e por que remendos não bastam

- Incidente real: curso *Doutrinamento em Segurança e Qualidade*, matrícula #911, 42/42 e barra de 100% dentro do pacote, mas prova do módulo 8 em **0/10**; wrapper mostra 99%/diagnóstico `SCORM_COMPLETION_ACCEPTED`, enquanto finalização é recusada com `PROGRESS_EVIDENCE_MISSING` / `SCORM_FINALIZATION_FAILED`. A matrícula **não deve** ser aprovada com avaliação incompleta.
- Auditoria read-only anterior: 29 matrículas em 100% bruto sem conclusão em 18 cursos (entre 2.066 matrículas, 50 cursos ativos); outros casos envolvem PBN, MEL, NR-26, MGM, FDM, SGSO etc. 100% bruto **não significa** 29 aprovações indevidamente faltantes.
- O código tem autoridades conflitantes: SCO, wrapper SCORM, `buildScormCompletionDiagnostic` (pode sinalizar accepted só por status), `hasCompleteScormSlideCoverage` (exige `airtrust.viewed_slides`, não obrigatório pela especificação SCORM), `lms-completion-integrity`, `lms-completion-evidence`, `LmsPlayer` e serviço de certificado.
- Troca de edição pode misturar evidências antigas (ex.: matrícula #842, 41/41 antigo versus pacote de 37 unidades). A versão da edição, ciclo e hash do pacote têm de ser vinculados à sessão.
- Correções de rede/ACK e de exceção do certificado já integradas são necessárias, mas não eliminam desacordos de política e fluxo.

## Decisão

**Reescrever o mecanismo de sessão/normalização/fechamento como AirTrust LMS Session Engine V2; manter o catálogo, dados históricos e assets R2.**

Nenhuma conclusão vem de 100%, `LMSFinish`, troca de tela ou um `postMessage`. Um pacote SCORM entrega *evidência*, não emite certificado. O backend possui a única máquina de estados e o commit de matrícula. O player só apresenta a projeção do servidor.

### Camadas

1. **Adapter SCORM 1.2 / SCORM 2004 (isolado por iframe e sessão):** traduz `LMSInitialize/Finish/Get/Set/Commit` e `Initialize/Terminate/GetValue/SetValue/Commit` para eventos tipados, com identidade autenticada pelo Worker, sessão/edição/ciclo imutáveis, capability HttpOnly scoped e ACK real de persistência. Ignora comandos/frames sem mesma origem/identidade.
2. **Adapter Native:** produz os mesmos eventos canônicos de progresso e avaliação, com evidências verificáveis de interações, notas e requisitos; não utiliza um caminho de conclusão alternativo.
3. **Session Engine V2:** estado da matrícula a partir de eventos persistidos, perfil de evidência aprovado, regra pedagógica versionada, prova e status terminal. Contrato inicial puro em `lms-session-engine-v2.ts`. NÃO se ativará por simples merge desta especificação.
4. **Committer do Worker:** uma operação idempotente e atômica no D1 para conclusão + referência de qualificação exigida; token/version CAS e ledger de evidências com `empresa_id, matricula_id, ciclo, course_version, idempotency_key`. Falha de certificado depois do commit deixa `CERTIFICATE_PENDING`, jamais conclusão falsa ou repetida.
5. **Certifier/outbox:** geração e verificação de certificado idempotentes em fluxo separado com reconciliação governada; histórico/compliance leem o resultado da matrícula e da qualificação, não a porcentagem.
6. **Player React 2.0:** única máquina de apresentação. Mostra fases `Em andamento`, `Avaliação pendente`, `Pronto para finalizar`, `Aguardando confirmação`, `Concluído/certificado pendente` e `Concluído`; oferece reenvio idempotente sem refrescar o iframe. Nunca exibe `SCORM_COMPLETION_ACCEPTED` como sinônimo de `CONCLUIDO`.

### Perfis de evidência — compatibilidade SCORM sem afrouxamento silencioso

**STRICT_TRACKED** (padrão obrigatório para todo curso atual): preserva exigência de todos os slides distintos e interações/avaliações; o máximo `42/42` não satisfaz, por si só, `1..42`.

**SCORM_CONFORMANT** (somente por pacote/edição explicitamente aprovado): não exige `airtrust.viewed_slides` porque isso não é SCORM. Exige sessão válida, `Commit` persistido, status terminal SCORM 1.2/2004 emitido pelo SCO após avaliação, nota/política pedagógica válida, identidade da versão e ação explícita do aluno. Aprovado exclusivamente após Quality Gate executar pacote e demonstrar que ele **não declara sucesso antecipadamente**. Sem prova de conformidade, não é elegível para publicação nesse perfil.

Nunca inferir que um SCO é conforme apenas por ZIP válido ou apresentação 100%. Questionário com 0/10 num curso que exige dez respostas bloqueia. Os módulos que não expõem evidência suficiente são classificados como `PACOTE_NAO_CONFORME`, com explicação e necessidade de adaptação/revisão; não recebem aprovação artificial.

## Máquina de estados e invariantes

`BLOCKED/CONTINUE → READY_TO_FINALIZE → AWAITING_SERVER_COMMIT → (QUALIFICATION_PENDING | CERTIFICATE_PENDING | COMPLETED)`.

- Sessão autenticada, tenant RBAC, escopo de asset, vínculo de edição e atividade da matrícula são verificados no Worker.
- Evento de navegador não carrega `empresa_id` autoritativo e nunca altera status diretamente.
- Status de prova `failed`, nota menor que mastery ou questões não concluídas impedem sucesso, mesmo com tela 42/42.
- Persistência HTTP responde com sequência/ACK do servidor. Retry usa idempotency key e mesmo ciclo; perda de rede gera estado desconhecido consultável no servidor, não aprovação.
- Conclusão e referência de qualificação sob transação/CAS única; a emissão material do certificado pode ser reconciliada, preservando terminal canônico.
- Falha de uma etapa NÃO desmancha conclusão D1 já confirmada; falha de qualificação exigida NÃO marca conclusão sem vínculo.
- Cursos antigos continuam SCORM em rota legada enquanto a edição nova não for homologada, sem perda dos certificados anteriores.

## Plano de implantação — gates objetivos, sem Big Bang em dados reais

1. **Contract/golden master (esta PR):** máquina pura + testes do caso #911, #842 (edição), quadro 29/18, SCORM 1.2/2004 com/sem campos proprietários, Native, avaliação, conclusão, qualificação, certificado, tenant/ciclo. Apenas código aditivo não executado.
2. **Evidence adapter conformance:** especificar esquema versionado `sessionId, tenant, cycleId, courseEditionHash, eventId, monotonicSeq, standard, rawCMI, assessment`; testes automatizados contra ZIPs originais dos cursos em falha e mais ZIP padrão externo. Quality Gate grava perfil aprovado por edição; nenhuma promoção sem relatório legível.
3. **Ledger/committer + Schema V2:** migration aditiva, manifest/hashes/baseline, backup e recovery/compensação. Nunca SQL remoto improvisado. Tenant/RBAC, PK única/idempotência e serialização de concorrência via D1.
4. **Shadow read-only staging:** para matrículas de teste, V1 e V2 processam as mesmas evidências; comparar divergências, sem gravação dupla/certificado. Reproduzir 42/42 + 0/10 e 100% com finalização real. Cobrir os 29 casos sem mutar dados produtivos.
5. **Player 2.0 canário:** habilitação por tenant/curso/edição explicitamente aprovado no staging; SCORM e Native selecionáveis, versões legadas intactas. QA humano/browser em desktop/iPad/offline/slow network/tab-close, aceite da Gerência de Treinamento.
6. **Produção:** candidato SHA específico e 8 gates, Worker/Pages/schema publicado pelo fluxo oficial, migrations governadas quando necessárias, flag de ativação seletiva, pós-validação por matrícula real autorizada, verificação de histórico/certificado e rollback da flag. Nenhuma matrícula histórica é migrada ou concluída em massa.

### Critérios de aceite para o produto, não somente para o código

- Um aluno usa um pacote SCORM 1.2/2004 aprovado e conclui sem intervenção de administrador: progresso persistido, abandono/retomada, avaliação, reprovação, aprovação, idempotência, conclusão e certificado.
- Matrícula #911 com avaliação 0/10 **não conclui**, e a tela aponta `Avaliação pendente: 10 questões` em vez de erro `PROGRESS_EVIDENCE_MISSING` inexplicável.
- Pacote terceiro sem `airtrust.viewed_slides`, mas conforme e aprovado no Quality Gate, conclui pelo perfil SCORM_CONFORMANT sem artifício específico AirTrust.
- Troca de edição (#842) requer novo ciclo e mantém evidências e histórico de certificados da edição anterior.
- 29/18 pendências auditadas classificadas por causa: **sem evidência legítima, prova pendente, conflito de edição, falha de persistência, falha de finalização ou certificado**, sem fechamento automático.
- Zero conclusão falsa, zero cross-tenant, zero certificado duplicado em corrida, zero perda de progresso após reload e zero UI que confunda “posição final” com “certificado emitido”.

### O que esta PR NÃO entrega

Não substitui `LmsPlayer` ainda; não implementa adaptadores/ledger/Schema V2; não publica SCORM/Native; não altera matrícula real. O merge futuro desta primeira PR **não habilita** o motor nem corrige sozinho as 29 matrículas. A migração real é trabalho de software com integração e validação de ponta a ponta, não uma troca de CSS ou edição de porcentagem.
