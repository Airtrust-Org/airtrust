# Frente 6 — contrato de reparo incremental dos quatro casos QA (NÃO AUTORIZA WRITE)

**Data:** 17/10/2026. **Escopo:** staging D1, tenant isolado `999013`, quatro alertas `qa-frms-ux-case-{1..4}` e, no máximo, quatro jornadas QA correspondentes. **Autoridade:** issue #1426, PRs #1550/#1554/#1556 e run #39074090911. Não envolve produção, tripulantes reais, índices shadow nem políticas de SIGVOOS.

## Prova existente e origem histórica

- Pré-flight read-only oficial #39074090911, SHA da main `1f6d7b74ccaceb442f2374c2ec560f7995087743`: `evaluated=4, valid=0, writes=0`; todos `CASE_IDENTITY_OR_TYPE_MISMATCH`. Guard de fonte sanitizada e 4 testes puros PASS. O run **não** prova valores individuais da preimagem e **não autoriza reparo sem uma segunda inspeção congelada**.
- Gerador de carga antigo `e4bc968e5408a5324e45a9585d631fec0ea0a17c` (execução 13/10): cria casos 1..4 associados respectivamente a tripulantes fictícios 07, 05, 04, 14, com `jornada_id=NULL`; jornadas sintéticas com `origem='MANUAL'` e `observacao='CENARIO SINTETICO - SEM VALIDADE OPERACIONAL'`. Nada neste histórico prova que não houve alterações posteriores no D1.
- Gerador corrigido da PR #1550: só quatro casos com tripulante e jornada da mesma data, simulando SIGVOOS **apenas no tenant 999013** e rotulado `FONTE SIMULADA SEM VALIDADE OPERACIONAL`. Sem relaxar `buscarAlertas` nem ingressar em fluxos reais.

| ID fictício | Código do tripulante previsto na carga antiga | Dia antigo | Novo código esperado | Nova data | Tipo |
| --- | --- | --- | --- | --- | --- |
| `qa-frms-ux-case-1` | `QA-FRMS-UX-07` | 13/10/2026 | `QA-FRMS-UX-01` | 12/10/2026 | `REPOUSO` |
| `qa-frms-ux-case-2` | `QA-FRMS-UX-05` | 12/10/2026 | `QA-FRMS-UX-02` | 11/10/2026 | `FDP_DIARIO` |
| `qa-frms-ux-case-3` | `QA-FRMS-UX-04` | 10/10/2026 | `QA-FRMS-UX-01` | 10/10/2026 | `HV_7D` |
| `qa-frms-ux-case-4` | `QA-FRMS-UX-14` | 09/10/2026 | `QA-FRMS-UX-02` | 09/10/2026 | `REPOUSO` |

## Preflight adicional bloqueante — leitura exclusivamente

Antes de compor um write plan, executar sob `environment: staging`, `GITHUB_ACTIONS=true`, SHA fixado e credencial D1 do ambiente uma inspeção apenas de `SELECT`, emitindo somente **contagens e booleans** nos logs:

1. Conferir UUID exato do D1 `bf9963f4-eb12-439b-a830-20bbf577ac22`; `empresas.id=999013` ativa e código `qa_frms_ux_30d`. Confirmar identidade do usuário QA de login por fingerprint/contagem, **sem imprimir dados pessoais**; registrar contagem de 14 funcionários sintéticos ativos.
2. Para cada caso, identificar por `id` fixo, resolver `tripulante_id` usando `funcionarios.empresa_id=999013`, conferir código antigo, tipo, nível, `jornada_id IS NULL`, `resolvido=0`, `deleted_at IS NULL`, conteúdo do marcador QA e ausência de tratamento/fechamento prévio. **Interromper se algum campo divergir**, em vez de fazer blind update.
3. Verificar existência e unicidade de cada jornada-alvo `qa-frms-ux-j-YYYY-MM-DD-QA-FRMS-UX-NN` associada ao mesmo funcionário, data e tenant; `deleted_at IS NULL`, `registrado_por='QA_FRMS_UX'`, `origem='MANUAL'` e observação sintética antiga. Verificar duração da jornada (casos FDP usam `duracao_jornada_minutos` como valor de alerta, não duração de voo).
4. Garantir que nenhuma linha de tripulante ou jornada-alvo tenha origem operacional real, nenhuma migração/seed/repair esteja concorrendo e nenhuma ação administrativa de QA esteja pendente.
5. Guardar a **preimagem exata dos 4 alertas e 4 jornadas**, junto com hashes e totais pré-mudança, como artefato criptografado de acesso restrito e retenção curta; nunca imprimir a preimagem no Actions, na issue, em capturas ou em chat. A preimagem é necessária para compensação por linha.

## Governança obrigatória antes da escrita

Criar PR **separada** contendo SQL versionado restrito aos quatro alertas QA e quatro jornadas QA exatas, com testes SQLite, manifest/plan/hash/allowlist conforme contrato atual, verificação de RBAC/tenant, e pós-condições automáticas. O executor só pode rodar via workflow governado de staging com confirmação explícita atual para **SHA + quatro IDs + tabelas + D1 UUID**. Reservar lock compartilhado com outros writes e deploys. Capturar bookmark de recovery **Cloudflare D1 Time Travel** antes da primeira mutação; não usar recuperação global sem coordenação (pode reverter operações de outras frentes). Definir rollback preferencial por preimagem e comparação de versão por linha.

## Alteração proposta — somente após autorização e preimagem

- Em uma transação governada, condicional e contabilizada, converter **apenas as quatro jornadas-alvo** `QA_FRMS_UX` de `origem=MANUAL` para **`SIGVOOS` simulado**, conservando `registrado_por='QA_FRMS_UX'` e substituindo a observação por `CENARIO SINTETICO - FONTE SIMULADA SEM VALIDADE OPERACIONAL`. Isto testa uma política de leitura em QA, não é importação SIGVOOS nem autorização para shadow/preview em operação real.
- Para cada um dos **quatro alertas já existentes**, alterar de forma condicional e com comparação de valores antigos `tripulante_id`, `jornada_id`, `valor_atual_min` (derivado da jornada-alvo) e data sintética do evento, preservando `id`, `tipo_limite`, `nivel`, texto da mensagem, marca de não resolvido e trilha da preimagem. **Não tocar funcionários, login, escala, check-in, outros alertas ou jornadas do período.**
- Resultado permitido: exatos 4 alertas atualizados + no máximo 4 jornadas atualizadas. Idempotência estrita: reexecução após sucesso deve apenas confirmar pós-condições, não gerar escrita ou logs duplicados. Se qualquer `WHERE old_value` falhar, abortar a transação inteira; proibir UPDATE por prefixo/LIKE genérico.
- Compensação: quatro UPDATEs reversos por `id` exato com comparação ao pós-estado, usando a preimagem criptografada. Não usar o `buildRollbackSql` legado (desativa empresa, setor e funcionários). Exigir contagens e hashes pós-compensação iguais às preimagens.

## Pós-condições e aceite operacional

1. Rodar novamente `staging-frms-ux-cases-preflight.yml`: `valid=4, verdict=READONLY_ACCEPTANCE_READY, writes=0` para os quatro IDs. Conferir que outras identidades, totais QA e registros fora da allowlist não mudaram.
2. Confirmar Worker+Pages do **mesmo SHA efetivo** com os gates requeridos; não disparar deploy concorrente nem assumir que o HEAD do dispatch seja o SHA publicado.
3. Rodar o QA Chromium autenticado, que deve provar os quatro casos visíveis, motivo, jornada e abertura do tratamento **sem write**; conferir check-in recebido **azul/informativo** no painel e nos quatro sinais, sem implicar aptidão.
4. Para **ciclo completo** de caso, definir uma ação de QA mutativa **separada**, com autorização própria, usuário/responsável fictício, prazo, mitigação, evidência de acompanhamento, verificação de eficácia e encerramento, registrando eventos de auditoria e evitando excluir a evidência. Este contrato não permite registrar/encerrar um caso.
5. Verificar link real EVD→FRMS com data/pessoa e filtros de Relatórios/Manutenção respeitando RBAC. Não declarar homologação visual sem screenshot sanitizado no artefato de QA e resultado auditável.

**Limite científico:** IMA V3 continua shadow e exige validação FRMS/GAGEF na issue #1476. Nenhum indicador biomatemático é promovido por esta intervenção.
