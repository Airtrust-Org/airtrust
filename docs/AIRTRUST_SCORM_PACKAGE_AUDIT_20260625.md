# AIRTRUST SCORM PACKAGE AUDIT 20260625

## Escopo real desta fase

Auditoria local somente leitura sobre os pacotes SCORM versionados em `Arquivos - EAD` e verificação da presença dos cursos de Manutenção listados no incidente.

Sem deploy, sem escrita em produção, sem alteração de matrícula real e sem reempacotamento nesta fase.

## Método usado

- varredura local de diretórios com `imsmanifest.xml`;
- leitura de `imsmanifest.xml`, `config.json` e bundles `.js`;
- checagem de evidência textual para `LMSInitialize`, `LMSSetValue`, `LMSCommit`, `LMSFinish`, `lesson_location`, `suspend_data`, `lesson_status`, `score.raw` e `alert()`;
- conferência de `launch file` e ativos referenciados;
- classificação por curso usando apenas o que existe neste workspace.

Script adicionado para reproduzir a auditoria:

- `node scripts/audit-scorm-maintenance-packages.mjs`

## Pacotes encontrados localmente

| pasta | titulo | slides | decisão | observações |
| --- | --- | ---: | --- | --- |
| `CGA - Conhecimentos Gerais de Aeronaves` | `CGA - Conhecimentos Gerais de Aeronaves` | 89 | `PACKAGE_REPACKAGING_REQUIRED` | `Initialize/SetValue/Commit/Finish` presentes; sem evidência textual de `lesson_location` e `suspend_data`; bundle contém `alert()` |
| `Emergências Gerais` | `Emergências Gerais` | 103 | `PACKAGE_REPACKAGING_REQUIRED` | `Initialize/SetValue/Commit/Finish` presentes; sem evidência textual de `lesson_location` e `suspend_data`; bundle contém `alert()` |
| `Operações Offshore` | `Operações Offshore` | 148 | `PACKAGE_REPACKAGING_REQUIRED` | `Initialize/SetValue/Commit/Finish` presentes; sem evidência textual de `lesson_location` e `suspend_data`; bundle contém `alert()` |
| `Operações PBN` | `PBN` | 76 | `PACKAGE_REPACKAGING_REQUIRED` | `Initialize/SetValue/Commit/Finish` presentes; sem evidência textual de `lesson_location` e `suspend_data`; bundle contém `alert()` |

## Cursos prioritários de Manutenção

Status com base no workspace atual:

| prioridade | curso | decisão |
| --- | --- | --- |
| 1 | `AW139 - Manutenção` | `PACKAGE_BLOCKED_BY_MISSING_SOURCE` |
| 2 | `PT6C-67C / PT6 - Manutenção` | `PACKAGE_BLOCKED_BY_MISSING_SOURCE` |
| 2 | `MGM - Manual Geral de Manutenção` | `PACKAGE_BLOCKED_BY_MISSING_SOURCE` |
| 2 | `HUMS-VXP` | `PACKAGE_BLOCKED_BY_MISSING_SOURCE` |
| 2 | `SGSO para Manutenção` | `PACKAGE_BLOCKED_BY_MISSING_SOURCE` |
| 2 | `Treinamento técnico Integração Manutenção` | `PACKAGE_BLOCKED_BY_MISSING_SOURCE` |
| 2 | `Inspeção IIO & APRS` | `PACKAGE_BLOCKED_BY_MISSING_SOURCE` |
| 3 | `MCQ` | `PACKAGE_BLOCKED_BY_MISSING_SOURCE` |
| 3 | `MOM` | `PACKAGE_BLOCKED_BY_MISSING_SOURCE` |
| 3 | `HUMS` | `PACKAGE_BLOCKED_BY_MISSING_SOURCE` |
| 3 | `Heliwise` | `PACKAGE_BLOCKED_BY_MISSING_SOURCE` |

## Conclusões objetivas

1. Os pacotes prioritários de Manutenção pedidos no incidente não estão versionados neste workspace, então não é possível corrigi-los nem gerar `.zip` finais honestamente nesta fase.
2. O repositório contém pacotes EAD de referência, mas todos exigem revisão/reempacotamento antes de serem usados como baseline SCORM 1.2 para o padrão solicitado no incidente.
3. O problema de retomada/progresso do LMS já tem histórico recente de hardening no player e no worker, mas isso não substitui auditoria do pacote-fonte real `AW139 - Manutenção`.

## Próximo passo correto

Para avançar na correção pedida no incidente, é necessário exportar do R2 de produção os pacotes reais de:

- `AW139 - Manutenção`
- `PT6C-67C / PT6 - Manutenção`
- `MGM - Manual Geral de Manutenção`
- `HUMS-VXP`
- `SGSO para Manutenção`
- `Treinamento técnico Integração Manutenção`
- `Inspeção IIO & APRS`
- `MCQ`
- `MOM`
- `HUMS`
- `Heliwise`, se ativo

Os pacotes estão no R2 com prefixo `lms/scorm/{empresa_id}/{curso_id}/`.
Para descobrir os `curso_id` reais, executar o SQL de descoberta em:
`docs/AIRTRUST_LMS_MANUTENCAO_PROGRESS_RECOVERY_AND_SCORM_AUDIT_20260626.md` (Block 1).

Sem acesso ao R2, a decisão tecnicamente correta permanece:

- `REAL_PACKAGE_EXPORT_REQUIRED`

## Fase seguinte

Documentos criados em 2026-06-26:

- `docs/AIRTRUST_LMS_MANUTENCAO_PROGRESS_RECOVERY_AND_SCORM_AUDIT_20260626.md` — mapeamento completo, plano de recuperação, decisões
- `docs/scorm-agent-handoff/20260626/SCORM_PACKAGE_COMMUNICATION_CONTRACT.md` — contrato técnico para o agente SCORM
- `docs/scorm-agent-handoff/20260626/SCORM_PACKAGE_FIX_REQUEST_AW139.md` — pedido específico para AW139
- `docs/scorm-agent-handoff/20260626/SCORM_PACKAGE_FIX_REQUEST_MAINTENANCE_ALL.md` — pedido para todos os cursos de Manutenção
- `scripts/restore-lms-progress-dry-run.mjs` — dry-run de recuperação de progresso dos alunos afetados
