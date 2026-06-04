# AirTrust — Final Local Residual Closure and Controlled Execution Bridge v0.5

**Data:** 2026-06-04
**Branch:** `main`
**Modo:** fechamento residual local + ponte para execucao controlada. Sem D1 remoto. Sem deploy. Sem backfill real. Sem rebaseline real. Sem apply remoto da `0389`.

## 1. Veredito

A etapa local residual esta encerrada. Os dois residuos apontados pela auditoria Opus foram tratados e a transicao para execucao controlada permanece bloqueada por ambiente.

| Item | Status |
|---|---|
| `AUTH-RESIDUAL-01` | `RESOLVED` |
| `AUTH-RESIDUAL-02` | `RESOLVED` |
| `AUTH_TENANT` | `CONFIRMED_CLOSED` |
| `LOCAL_AUDIT_CLOSURE` | `COMPLETE_WITH_ENVIRONMENT_BLOCKERS` |
| `DQ-01` | `LOCAL_READINESS_COMPLETE_BLOCKED_BY_ENVIRONMENT` |
| `MIG-01` | `LOCAL_READINESS_COMPLETE_BLOCKED_BY_ENVIRONMENT` |
| `RBAC_SUPPORT_V2` | `LOCAL_FOUNDATION_COMPLETE_BLOCKED_BY_ENVIRONMENT` |
| `AUDIT_V2` | `LOCAL_FOUNDATION_COMPLETE_BLOCKED_BY_ENVIRONMENT` |

## 2. AUTH-RESIDUAL-01

Arquivo:
- `worker-airtrust/src/shared/syncEscalaEventosExternos.ts`

Correcao:
- removido o fallback `f.empresa_id IS NULL` do filtro de ferias sincronizadas para escala;
- o caminho opcional sem `empresaId` continua preservado como `? IS NULL`;
- com `empresaId` presente, funcionario sem tenant nao entra mais na sincronizacao.

Status:
- `AUTH-RESIDUAL-01 = RESOLVED`

## 3. AUTH-RESIDUAL-02

Arquivo:
- `worker-airtrust/src/routes/escalas-tripulacoes.ts`

Classificacao das duas ocorrencias:
- lookup de `aeronaves` por prefixo: `TENANT_SCOPED_REQUIRES_HARDENING`;
- lookup de `funcionarios` para validar habilitacao do PIC: `TENANT_SCOPED_REQUIRES_HARDENING`.

Correcao:
- ambos passaram de `(empresa_id IS NULL OR empresa_id = ?)` para `empresa_id = ?`;
- as `LEFT JOINs` de listagem continuam documentadas como excecao de baixo risco porque estao ancoradas por `em.empresa_id = ?` e apenas enriquecem nomes.

Status:
- `AUTH-RESIDUAL-02 = RESOLVED`

## 4. Fechamento adicional encontrado pela busca

A busca final tambem apontou um filtro invertido em `worker-airtrust/src/routes/sgso-next-gen-extra.ts`:
- antes: `(f.empresa_id = ? OR f.empresa_id IS NULL)`;
- depois: `f.empresa_id = ?`.

Classificacao:
- ownership filter tenant-scoped em metrica SGSO;
- corrigido localmente com o mesmo guard SEC-02.

## 5. Ambiente controlado

Gates executados:
- `bash scripts/controlled-execution-gate.sh`
- `bash scripts/dq01-controlled-backfill-gate.sh`
- `bash scripts/mig01-controlled-rebaseline-gate.sh`

Resultado esperado sem variaveis aprovadas:
- `CONTROLLED_EXECUTION_GATE=BLOCKED_BY_ENVIRONMENT_CONTRACT`
- `DQ01_BACKFILL_GATE=BLOCKED_BY_ENVIRONMENT_READINESS`
- `MIG01_REBASELINE_GATE=BLOCKED_BY_ENVIRONMENT_READINESS`

Faltam:
- target aprovado;
- snapshot;
- rollback;
- aprovacao explicita;
- comando seguro revisado;
- evidencia de banco alvo.

Consequencia:
- nao houve DQ backfill;
- nao houve MIG rebaseline;
- nao houve apply da `0389`;
- nao houve D1 remoto;
- nao houve deploy.

## 6. Testes e guards

Guard alterado:
- `worker-airtrust/src/__tests__/security/sec02-null-empresa-scope.test.ts`

Cobertura adicionada:
- bloqueia retorno do triple-null em `syncEscalaEventosExternos.ts`;
- bloqueia ownership lookup com `empresa_id IS NULL` em `escalas-tripulacoes.ts`;
- inclui `sgso-next-gen-extra.ts` na lista de arquivos endurecidos.

## 7. Proximos 3 blocos grandes

1. Provisionar ambiente controlado real e executar `DQ-01`.
2. Executar `MIG-01` somente depois de `DQ-01`, em janela separada.
3. Aplicar `0389` em ambiente aprovado e validar `Audit v2` + `RBAC/Suporte v2` antes de qualquer enforcement amplo.
