# AirTrust Open Items (Atualizado)

## FECHADO:
- PR #448 SQLITE_AUTH;
- PR #449 role ADMINISTRADOR no pré-flight;
- PR #450 loop de UX SCORM;
- PR #450 download de certificado.

## MERGEADO — PRODUÇÃO PENDENTE:
- PR #451 (preservar estado de resume de SCORM em lançamentos de ciclos);
- Correção Segura da Migração (após o merge deste PR de refactoring fail-closed).

## PRODUÇÃO PENDENTE:
- Validação AW139 real com os novos contornos fail-closed;
- Download de certificado;
- Matriz 51/918/22;
- Guias 51/30/21;
- Remediação compensatória das 5 resoluções LEGACY_EQUIVALENT (produção
  aplicou 5 códigos como TRUE_MISSING em vez de reaproveitar manobra legada —
  13 vínculos em 9 modelos correntes afetados). Migration 0443 + executor
  `admin-simuladores-matriz-remediation-executor.ts` prontos e ensaiados
  contra cópia forense real (ver
  `docs/ops/simuladores-matriz-legacy-equivalent-remediation-runbook.md`).
  Matriz base **não é considerada definitivamente fechada** até esta
  compensação ser aplicada em produção. LMS/pacotes seguem tratados à parte,
  sem relação com este item.

## REVALIDAÇÃO PÓS-DEPLOY:
- Caso do progresso bloqueado do Luís.

## MITIGAÇÃO MERGEADA, PACOTE AINDA BLOQUEADO:
- Loop do Fabiano (LMS estancado contra o loop do pacote);

## CORREÇÃO DE PACOTE PENDENTE / FONTE PENDENTE:
- Conclusão real do pacote CGA;
- Fontes ausentes de FDM / PT6C / EFB;
- Outros cursos SCORM inconsistentes (relatório emitido).
