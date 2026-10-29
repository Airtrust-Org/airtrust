# Schema V2 0570 — renovações imutáveis da aprovação formativa SCORM

## Dependência e risco
Depende de 0569 aplicado e ledger verificado. A aprovação original é imutável e
única por tenant/curso/pacote. Sem uma trilha de renovações, atestações expiradas
(30 dias) ou geradas para outro runtime deixam o candidato permanentemente
inativável. A mudança é **aditiva, DDL-only e sem backfill**.

## Contrato
- Nova tabela `lms_scorm_package_approval_renewals`, vinculada à aprovação
  original, ao tenant, curso, pacote, SHA do ZIP e SHA da atestação.
- Cadeia estritamente monotônica por `(approval_id, sequence)`; cada renovação
  registra o digest anterior, digest novo, administrador, justificativa, revisão
  editorial opcional e timestamp. Não há UPDATE/DELETE: triggers bloqueiam.
- Trigger de INSERT exige candidato `VALIDATED`, perfil formativo, escopo
  idêntico ao registro original e digest da atestação já importada, assinado
  e verificado pelo Worker. Replays de digest já aprovado são recusados no Worker.
- A aprovação inicial e todas as renovações antigas permanecem preservadas.
  Preflight e ativação consultam **somente o último digest aprovado**; importar
  nova evidência assinada nunca autoriza ativação automaticamente.

## Pré-condições físicas
1. Ledger exato 0569 em staging, tabelas `lms_scorm_package_approvals` e
   `lms_scorm_package_versions` presentes; 0570 ainda não aplicada.
2. Tabela, índice e três triggers 0570 ausentes; D1 Time Travel recuperável.
3. Oito gates do SHA candidato, grant staging e mutex exclusivo válidos.

## Pós-condições
Ledger 0570 com SHA/manifesto exatos, tabela + índice + 3 triggers presentes,
zero linhas em renovações e contagens preservadas de aprovações, pacotes,
matrículas, ciclos, progresso e qualificações. Nenhum objeto R2 é alterado.

## Rollback
Antes de apply: abortar sem alterações. Depois: restaurar bookmark D1 Time
Travel no processo governado, se necessário, antes de qualquer Worker novo;
não fazer DROP manual de evidências. Nenhuma produção autorizada por este plano.

## Aceite funcional separado
Teste SQLite de expiração e troca de runtime, reimportação de evidência HMAC,
renovação administrativa, imutabilidade, replay e isolamento. QA real do ZIP
exato em staging, qualificação e PDF ainda exige atestação trusted-main e
aprovação específica; CI verde sozinho não é homologação.
