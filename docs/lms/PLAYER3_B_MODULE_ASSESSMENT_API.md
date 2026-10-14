# Player 3 — Contrato de avaliações por módulo (Frente B)

**Estado 2026-10-14:** Código em PR #1389, em draft. Staging desativado por padrão, migrations **não aplicadas**. Não constitui homologação do LMS.

## API para Frentes A e D

**POST /api/lms/native/matriculas/{matriculaId}/etapas/{stageId}/tentativas**

A aplicação AirTrust envia Authorization JWT e Content-Type application/json.
O corpo tem limite de 128 KiB e os seguintes campos estritos:

- eventId: ID estável e exclusivo da submissão; usar o mesmo no replay;
- attemptNumber: contador de 1 a 500, independente para cada etapa;
- answers: lista de objetos contendo somente questionId e optionId.

Nunca enviar grade, correctOptionId, certificate, tenant, ciclo ou edition
no corpo. A identidade do funcionário, curso, ciclo e edição é verificada
diretamente pelo Worker a partir de autenticação, banco e R2 privado.

**Resposta:** HTTP 201 para nova tentativa e 200 para replay idêntico.
Inclui state, stage_id, attempt_number, edition_sha256, score_pct,
stage_passed e completion_supported=false. Não retorna gabaritos. HTTP
400 para corpo inválido, 401/403 para credencial inválida, 404 para gate
desligado, 409 para conflito e 503 para indisponibilidade.

## Gates de execução

Somente staging com três allowlists exatas e independentes,
todas exigindo o mesmo tenant sem wildcard:

- NATIVE_LEARNER_PREVIEW_ENABLED_TENANTS
- NATIVE_LEARNER_WRITE_ENABLED_TENANTS
- PLAYER3_MODULE_ATTEMPTS_ENABLED_TENANTS (novo, default OFF)

**Frente A:** manter o HTML5 visual original, mas nenhuma mensagem da página
pode certificar aluno. O AirTrust usa a API acima para tentar a prova. Só
liberar o próximo módulo após recibo persistido de stage_passed=true.
Após perda de conexão, reconsultar recibo (GET autenticado ainda pendente).
Nunca confiar no contador local ou no fechamento de janela.

**Frente D:** testar aprovação, reprovação, replay, colisão, interrupção,
volta de conexão, mesma edição, troca de edição, tenant/ciclo divergente,
reabertura Safari/Chromium e SCORM de fornecedor externo. O E2E não está
homologado até existir leitura reconciliada e conclusão real/certificado.

## D1 e R2 (propriedade da Frente B)

Migration aditiva Schema V2: worker-airtrust/schema-v2/changes/
0553_lms_player3_module_attempts.sql (requer 0552). Não aplicada.

As tabelas lms_player3_politicas e lms_player3_tentativas_modulares mantêm
respectivamente política e hashes aprovados por edição e tentativas append-only
com sequência independente por etapa, nota do backend e replay idempotente.

No R2 privado e prefixo imutável da edição, o Worker espera:
- player3-approved-policy.json
- player3-server-private-bank.json

Os dois documentos precisam ter SHA-256 ancorado no D1, e o banco de
respostas jamais pode sair pelo endpoint do aluno ou pelo ZIP HTML5.
Não existe API de publicação habilitada; dados de revisão são privados.

**Aprovação de uma etapa NÃO conclui treinamento.** O gate canônico ainda
precisa exigir todas as provas obrigatórias, evidências de aprendizagem,
qualificação e certificado verificável, sob ciclo e edição imutáveis.

## Próximas condições

1. HTML5 fiel sem gabaritos e política pedagógica aprovada (Frente A).
2. Aplicação Schema V2 0552/0553 apenas por workflow governado em staging.
3. Política e gabarito SHA-pinned armazenados no R2 privado.
4. GET autenticado de retomada de etapas, verificação server-side e
   integração do resultado com completeLmsMatricula.
5. E2E real Doutrinamento 42/42 e SCORM externo, depois oito gates,
   autorização específica de SHA/escopo e fluxo oficial de release.

Nenhuma matrícula foi atualizada, migrada ou concluída nesta etapa.
