# AirTrust — ponto de restauração de código antes de qualquer migração LMS Native

Data de preparação: 2026-10-13 (UTC). Finalidade: registrar SHA e impedir substituição prematura de cursos SCORM.

## Snapshot de origem

- Repositório: Airtrust-Org/airtrust.
- Código canônico capturado de main: `48861928d726746752bf25d362409d74244a816f`.
- Branch de segurança criada desse SHA: `backup/lms-before-native-rollout-20261013`.
- A existência deste documento/commit NÃO equivale a backup de banco de dados, R2, nem rollback de produção.
- Nunca usar checkout/force-push sobre main para restauração: restaurar por PR controlada com delta revisado e todos os gates.
- Capturar backup D1, versões imutáveis R2, manifests/hashes e recovery/compensation conforme Schema V2 ANTES de migrar qualquer dado real.

## Situação que não pode ser inferida como concluída

- PR #1389 Native V1 está DRAFT e não integrada na main; Schema V2 0550 ainda depende de aplicação governada.
- Prévia local dos nove cursos via ZIP não é publicação, matrícula, conclusão ou certificado canônico.
- PR #1409 é revisão de layout/reprodutor staging com seletor SCORM/Native e não publica cursos no catálogo de produção.
- O player SCORM existente deve continuar operante, sem renomear `tipo_conteudo` nem substituir assets vinculados a matrículas históricas.
- Novos cursos só poderão substituir versão existente após validação individual de equivalência pedagógica, matrícula/tenant, avaliação server-side, fechamento, certificado e recuperação.
- A autorização de produção tem de apontar SHA exato, artefatos, escopo e migrations conforme contrato vigente.

## Critério do retorno seguro

1. Mapear curso atual -> novo curso Native e registrar versão SHA/asset sem apagar SCORM.
2. Publicar revisão candidata em staging pelo mecanismo oficial com Worker/Pages/schema governados.
3. Testar aluno real autorizado (ou conta de QA isolada): inscrição, retomada, avaliação, nota, aprovação/reprovação, conclusão, certificado, compliance, histórico e rollback.
4. Somente depois obter autorização de produção específica por SHA/artefato e executar fluxo oficial. Conferir provenance pós-deploy, tenant e dados.

Este commit é um marcador de recuperação de CÓDIGO e governança, sem modificação de runtime ou dados.
