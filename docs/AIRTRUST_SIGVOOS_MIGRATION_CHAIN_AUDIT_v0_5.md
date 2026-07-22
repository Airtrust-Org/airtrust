# AirTrust — SIGVOOS Migration Chain Audit v0.5

## 1. Objetivo

Auditar a cadeia de migrations SIGVOOS após a Sprint Z1 para determinar se a `0354_auditoria_critica_schema_hardening.sql` depende de uma tabela que ainda não existia por migration anterior e, com isso, decidir se a `0387_integracoes_sigvoos_base_tables.sql` é suficiente para liberar a remoção do fallback `ensureSigvoosTables()`.

## 2. Resumo executivo

O achado principal foi confirmado localmente: `0354` faz `ALTER TABLE integracoes_sigvoos_config ADD COLUMN notificar_falha_email TEXT` antes de existir qualquer migration numerada que crie `integracoes_sigvoos_config`. A `0387` criada no Sprint Z1 versiona a tabela base, mas vem numericamente depois da `0354` e portanto **não corrige** uma cadeia limpa de migrations em ambiente novo.

Conclusão conservadora:
- `0387` continua válida como versionamento do schema runtime atual.
- O fallback `ensureSigvoosTables()` deve permanecer.
- O estado correto de R01 passa a ser `MIGRATION_CHAIN_BLOCKED_BY_0354`.
- Não houve probe remoto SIGVOOS nesta sprint: `SKIPPED_NO_SIGVOOS_SCHEMA_PROBE`.

## 3. Achado principal

`0354_auditoria_critica_schema_hardening.sql` contém:

```sql
ALTER TABLE integracoes_sigvoos_config ADD COLUMN notificar_falha_email TEXT;
```

Não existe migration anterior que crie `integracoes_sigvoos_config`. Em ambiente limpo, a cadeia falha na `0354` antes da `0387` ser alcançada. O fallback runtime foi a forma histórica pela qual essa tabela passou a existir em ambientes vivos.

## 4. Linha do tempo das migrations SIGVOOS

| Migration | Operação | Objeto | Segurança em schema limpo | Observação |
|---|---|---|---|---|
| `0217_frms_importacao_fira.sql` | `CREATE TABLE` | `frms_importacao_fira` | Sim | Relacionada a FIRA, não cria tabelas base SIGVOOS |
| `0352_sigvoos_frms_pendencias_e_enriquecimento.sql` | `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE` | `sigvoos_mapeamento_manual`, `frms_jornada_pendente`, `frms_jornada` | Parcial | Cobre apenas 2 das 5 tabelas do runtime SIGVOOS; exige `frms_jornada` existente |
| `0354_auditoria_critica_schema_hardening.sql` | `ALTER TABLE`, `UPDATE`, `CREATE INDEX` | `frms_jornada`, `integracoes_sigvoos_config`, `rate_limit_store` | **Não** | Depende de `integracoes_sigvoos_config` pré-existente |
| `0387_integracoes_sigvoos_base_tables.sql` | `CREATE TABLE`, `CREATE INDEX` | `integracoes_sigvoos_config`, `integracoes_sigvoos_eventos`, `integracoes_sigvoos_mapeamentos` | Sim isoladamente | Não resolve o fato de vir depois da `0354` |

## 5. Relação entre 0354 e 0387

- `0354` altera `integracoes_sigvoos_config`.
- `0387` cria `integracoes_sigvoos_config`.
- `0387` tem número posterior a `0354`.
- Portanto, a cadeia ordenada `... -> 0354 -> ... -> 0387` continua inválida em bootstrap limpo.

O teste local atualizado em [sigvoos-base-tables-schema.test.ts](<AIRTRUST_ROOT>/worker-airtrust/src/__tests__/migrations/sigvoos-base-tables-schema.test.ts) confirmou dois pontos:
- `0354` falha em schema limpo com pré-requisitos mínimos por ausência de `integracoes_sigvoos_config`.
- Concatenar `0387` depois da `0354` não resgata a execução, porque a falha ocorre antes.

## 6. Estado do runtime fallback

`ensureSigvoosTables()` permanece necessário nesta fase.

Motivo:
- ambientes existentes provavelmente já têm as tabelas base por drift de runtime;
- ambientes novos ainda não têm cadeia de migrations segura;
- remover o fallback agora criaria assimetria entre ambientes já aquecidos e ambientes frios/rebuildados.

## 7. Impacto em ambientes existentes

Em ambientes já operados:
- a `0354` pode ter sido aplicada com sucesso porque `integracoes_sigvoos_config` já existia via runtime;
- a `0387` tende a ser idempotente para as 3 tabelas base e 4 índices;
- ainda assim, isso **não prova** segurança de cadeia limpa.

Nesta sprint não foi executado probe remoto SIGVOOS porque não havia script estrutural read-only já aprovado para essas tabelas dentro do escopo permitido.

Status:
- `SKIPPED_NO_SIGVOOS_SCHEMA_PROBE`

## 8. Impacto em ambiente novo

Em ambiente limpo que aplique migrations em ordem numérica:
- `0354` alcança `ALTER TABLE integracoes_sigvoos_config ...`;
- a tabela ainda não existe;
- a execução falha antes da `0387`.

Conclusão: `0387` por si só não torna seguro um bootstrap baseado apenas em migrations ordenadas.

## 9. Opções consideradas

### Opção A — Alterar 0354

Descartada para esta fase. `0354` é antiga e potencialmente já aplicada em ambientes existentes. Reescrever seu conteúdo agora aumentaria o risco operacional e não garantiria replay seguro retroativo.

### Opção B — Criar migration posterior corretiva

Insuficiente como solução completa para cadeia limpa. Uma migration posterior continua vindo depois da `0354` e não impede a falha anterior.

### Opção C — Manter fallback runtime até baseline/schema reset

Opção mais segura no curto prazo. Preserva funcionamento em ambientes existentes e evita assumir uma ordem de migrations que o repositório não garante hoje.

### Opção D — Criar baseline migration futura

Viável como solução estrutural. Exige fase própria para definir:
- baseline ou rebuild canônico para ambientes novos;
- estratégia de apply em ambientes existentes;
- momento seguro para remover o fallback R01.

## 10. Decisão recomendada

Decisão conservadora: **manter o fallback runtime e reclassificar R01 para `MIGRATION_CHAIN_BLOCKED_BY_0354`.**

A `0387` deve permanecer versionada, mas não é suficiente para liberar a remoção do runtime nem para afirmar `READY_FOR_CONTROLLED_APPLY` sem um plano adicional de cadeia/baseline.

## 11. Próximos passos seguros

1. Definir uma fase específica para normalizar a cadeia SIGVOOS, sem editar `0354` às cegas.
2. Decidir entre:
   - baseline/rebuild canônico para ambientes novos; ou
   - estratégia explícita de provisionamento inicial antes da cadeia legada.
3. Só depois preparar um apply controlado da `0387`.
4. Remover `ensureSigvoosTables()` apenas após a cadeia segura estar definida e validada.

## 12. Fora do escopo

- aplicar migrations remotas;
- tocar D1 remoto;
- remover `ensureSigvoosTables()`;
- editar `0354` ou `0387` sem plano operacional validado;
- deploy Worker/API;
- qualquer alteração em auth, RBAC, tenant ou R2.
