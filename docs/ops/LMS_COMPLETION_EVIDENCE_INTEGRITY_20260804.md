# LMS — Integridade de conclusão, qualificação e certificado

**Frente:** 12  
**Base:** `c3259a7967412c4a4219beba095f4b5515fb71b9`  
**Branch:** `fix/lms-completion-evidence-integrity-20260804`  
**Escopo:** contrato de conclusão e caminhos laterais; sem migration, reparação histórica, upload, validade ou deploy.

## 1. Ponto único e barreira de entrada

A persistência de uma conclusão continua passando por `completeLmsMatricula` em
`worker-airtrust/src/services/lms-completion.ts`. Antes de qualquer handler LMS,
`enforceLmsCompletionIntegrity` aplica a mesma decisão de evidência a SCORM,
xAPI/H5P, finalização manual e PATCH administrativo.

O guard `guard:lms-completion-single-entry-point` impede que rotas LMS criem
histórico de qualificação ou certificado por SQL/gerador direto e comprova que o
gate é executado antes dos handlers legados. A emissão idempotente de certificado
permanece uma pós-condição do histórico criado pelo serviço canônico; não existe
rota SCORM autorizada a criar qualificação ou PDF diretamente.

A reversão usa um ponto de entrada governado separado,
`enforceLmsCompletionReversal`, executado antes do gate genérico e dos handlers
legados. Isso permite aplicar o contrato de revogação compatível com o schema sem
criar rota paralela de conclusão.

## 2. Precedência canônica

A ordem é fail-closed:

1. formato de mastery/score inválido;
2. reprovação explícita (`failed`, `explicitFailure`, `success=false`);
3. estado conflitante (`failed + completed`, `failed + passed`, `incomplete + passed`);
4. score abaixo do mastery;
5. matrícula, curso, pacote, sessão de asset e tenant;
6. progresso registrado;
7. evidência independente de conclusão;
8. autorização administrativa e justificativa, quando aplicável;
9. aceitação idempotente pelo serviço canônico.

Nenhum `lesson_status=passed` isolado é suficiente.

## 3. Regras de mastery e score

| Situação | Decisão |
|---|---|
| mastery ausente em curso avaliado | rejeitar |
| mastery vazio, NaN, string ou fora de 0–100 | rejeitar |
| mastery zero em curso avaliado/qualificante | rejeitar |
| mastery ausente em curso informativo sem avaliação | permitido |
| score zero com mastery positivo | score válido, porém reprovado |
| score inválido | rejeitar |
| score abaixo do mastery | reprovação prevalece |
| `scaled` válido | converter para percentual |
| `raw/min/max` válidos | normalizar para percentual |
| `raw` sem escala, entre 0–100 | interpretar como percentual |

## 4. Tabela de decisão resumida

| Evidência | Resultado |
|---|---|
| `passed`, progresso 0 | rejeitado |
| `passed`, sem linha/estado de progresso | rejeitado |
| `passed`, score abaixo do mastery | reprovado/rejeitado |
| `failed + completed` | falha prevalece |
| `failed + passed` | falha prevalece |
| concluído, pacote ou asset session divergente | rejeitado |
| curso informativo, progresso 100%, sem avaliação | aceito |
| curso qualificante, mastery e score válidos, progresso e sessão válidos | aceito |
| repetição da mesma conclusão | decisão determinística; persistência canônica idempotente |
| conclusão administrativa | exige papel autorizado, justificativa e evidência coerente |

## 5. Sessão de asset

Para conclusão originada no player, o cookie HttpOnly
`airtrust_lms_asset_token` é verificado no servidor. O token deve:

- ser do tipo `lms_asset`;
- ter escopo `course_assets`;
- corresponder à empresa, curso e matrícula;
- não ser token de preview;
- estar válido segundo `verifyJWT`.

A posse da matrícula não substitui essa evidência de sessão.

## 6. Progresso próprio

`PATCH /api/lms/matriculas/:id/progresso` usa o vínculo canônico
`usuarios.funcionario_id`, com fallback ao `funcionarioId` do contexto autenticado.
Não utiliza `funcionarios.usuario_id`, não aceita funcionário escolhido pelo cliente
e mantém `empresa_id` e `funcionario_id` na mutação e releitura.

A falha retorna HTTP explícito; não existe catch silencioso no backend. Nenhuma
mudança frontend foi feita para evitar conflito com a PR #807.

## 7. Auto-matrícula

Publicação não significa livre matrícula. Enquanto não existir coluna/tabela
canônica de “livre acesso”, a auto-matrícula do aluno é fail-closed e somente é
permitida quando:

- o curso está ativo e publicado;
- o aluno solicita a própria matrícula;
- existe designação explícita ao setor em `lms_cursos_setores`; ou
- o tipo de qualificação do curso está explicitamente designado ao setor em
  `qualificacoes_tipos_setores`.

Pré-requisitos, perfil especial, aprovação administrativa e outras modalidades
que não possuem contrato estrutural explícito não são inferidos.

## 8. Rematrícula

Uma matrícula cancelada/soft-deleted não é devolvida como sucesso de nova
matrícula. O POST normal responde `LMS_REMATRICULATION_REQUIRED`.

`POST /api/lms/matriculas/:id/rematricular`:

- exige admin/manager e justificativa;
- recusa matrícula ainda ativa;
- exige reversão prévia quando existe qualificação vinculada;
- encerra o ciclo anterior;
- reativa a mesma linha por causa da restrição única existente;
- cria novo ciclo com número crescente;
- reinicia estado SCORM sem apagar a evidência anterior do audit log;
- é protegido pela unicidade do ciclo ativo e trata concorrência como conflito.

## 9. Reversão de conclusão

`POST /api/lms/matriculas/:id/reverter` é admin-only e exige justificativa e uma
classificação: `CORRECAO`, `FRAUDE`, `ERRO_PACOTE`, `REGRA_HISTORICA` ou
`INVALIDACAO`.

O batch governado:

- reabre matrícula/ciclo como `EM_ANDAMENTO` e limita progresso a 99%;
- limpa o vínculo operacional com a qualificação;
- marca o histórico como `CANCELADA`, único estado de revogação compatível com o
  CHECK atual, aplica soft delete auditável e registra o motivo de invalidação;
- aplica soft delete ao documento do certificado;
- neutraliza os status finais SCORM;
- registra `LMS_COMPLETION_REVERSED` com estado anterior, ator, motivo e classe.

O endpoint público de QR já exige `qh.deleted_at IS NULL` e documento
`d.deleted_at IS NULL`; portanto o QR revogado deixa de validar. O objeto R2 não é
apagado nesta frente.

## 10. Diagnóstico histórico

`scripts/diagnose-lms-completion-integrity.sql` é somente leitura. Ele identifica
conclusões sem progresso, conflito de falha/sucesso, score abaixo do mastery,
mastery ausente/zero, vínculo de qualificação/certificado inconsistente,
duplicidade de ciclo ativo e certificados potencialmente válidos após estado
incompatível. Não contém `UPDATE`, `DELETE`, `INSERT`, `ALTER`, `DROP` ou execução
remota.

## 11. Riscos residuais

- O schema atual não possui política explícita de curso “livre acesso” nem tabela
  de pré-requisitos. A política permanece fail-closed até contrato próprio.
- O histórico SCORM é por matrícula, enquanto ciclos são separados. A rematrícula
  reinicia o runtime e preserva snapshot no audit log; uma evolução futura pode
  materializar progresso por ciclo.
- O artefato R2 de certificado revogado permanece retido; acesso público/normal é
  invalidado pelo histórico e documento soft-deleted.
- Reparação de dados anteriores pertence à Frente 10 e não é executada aqui.
