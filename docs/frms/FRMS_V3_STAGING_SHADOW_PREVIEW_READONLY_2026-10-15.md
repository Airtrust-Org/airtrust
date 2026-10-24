# FRMS V3 — preview governado de exposição e evidência (somente staging)

**Escopo técnico:** endpoint read-only `GET /api/frms/ima-v3/schedule-exposure-shadow`, montado no router autenticado do snapshot FRMS. Não há integração na UI, índice numérico operacional, PVT diagnóstico, migração ou escrita D1/R2. Ref.: issue #1476 e PR #1485 (adaptador puro já na `main`).

## Controles *fail-closed*

- O endpoint retorna **404** em produção, desenvolvimento ou quando falta a variável `FRMS_V3_SHADOW_PREVIEW_TENANTS`. A configuração aceita **somente lista explícita de IDs**; `all` não habilita ninguém.
- Só permite consulta de usuários autenticados com direito **`frms.team.view` / equipe FRMS**, incluindo o mecanismo vigente de override DENY/GRANT. Perfil individual sem permissão recebe **403** antes de qualquer consulta ao banco.
- Usa `getEmpresaId` do contexto de tenant autenticado e confirma no backend que o `funcionario_id` solicitado pertence à empresa e está ativo, antes do snapshot.
- Os parâmetros `data_inicio`, `data_fim`, `funcionario_id` e `reference_utc_offset_minutes` são obrigatórios; janela de **1 a 7 dias**. Não permite dias impossíveis. A referência de fuso é uma **hipótese explícita do solicitante** e não constitui validação histórica de fuso/horário de verão.
- A única resposta positiva contém **agregados de exposição e cobertura**, sem nomes, matrícula, IDs de pessoa, linhas individuais ou dados de sono individuais. Evidência contaminada por outro tenant, funcionário, duplicidade, sobreposição ou inconsistência do modelo é rejeitada sem detalhes individuais.
- `fatigueIndex=null`, `fitForDuty=null`, `flightAuthorization=NOT_PROVIDED`, `modelValidation=NOT_VALIDATED`. Nenhum valor representa autorização, percentagem de aptidão ou avaliação regulatória. A rota não modifica políticas, escalas, check-ins nem configurações.

## Governança de ativação

Apenas criar/mergear o código **NÃO HABILITA** esta rota. Para uso futuro em staging será necessário: autorização de consulta de dados reais por tenant, revisão de perfis/RBAC, escolha de janela/fuso, configuração explícita da allowlist no ambiente autorizado, gates da revisão e validação auditável. **Não habilitar em produção.**

Este endpoint demonstra a conexão técnica com o snapshot existente, mas não resolve por si só a investigação de 60–90 dias, a proveniência do horário de adormecer, calibração prospectiva com KSS/PVT ou o parecer FRMS/GAGEF. Esses permanecem na issue #1476 e não devem ser declarados concluídos.

## Verificação

Testar a rota com banco simulado e fixtures sem dados reais: production disabled, allowlist ausente/`all`/outro tenant, perfil sem escopo, vínculo de empregado inválido, datas impossíveis/janela excessiva, cenário autorizado somente agregado e contaminação cross-tenant. Validar os oito gates no SHA da PR e na `main`; ativação do flag e qualquer deploy exigem passos independentes de governança.
