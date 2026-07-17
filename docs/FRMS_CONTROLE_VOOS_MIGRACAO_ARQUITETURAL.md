# Migração arquitetural: SIGVOOS/SIGI → Controle de Voos → FRMS

Status: **EM TRANSIÇÃO — infraestrutura de shadow-mode implementada, ativação em produção não realizada.**

## Arquitetura canônica decidida (destino)

```
SIGVOOS/SIGI  (sistemas externos de origem)
     ↓ ingestão, autenticação, rastreabilidade, identificação de origem
CONTROLE DE VOOS  (fonte canônica interna de dados operacionais normalizados)
     ↓ dados operacionais normalizados
FRMS  (cálculos, jornadas, alertas e risco de fadiga)
```

- **SIGVOOS/SIGI**: sistemas externos de origem, fora do controle direto do AirTrust.
- **Integrações**: ingestão, autenticação, rastreabilidade e identificação da origem dos dados.
- **Controle de Voos**: fonte canônica interna dos dados operacionais normalizados (tabelas `cv_*`).
- **FRMS**: consumidor dos dados do Controle de Voos; proprietário apenas das derivações de
  fadiga (scores, jornadas FRMS, alertas, decisões de risco). **Não deve consumir ou
  sincronizar SIGVOOS diretamente** após a migração completa.

## Arquitetura legada (ainda ativa em produção)

Existe hoje um caminho de produção real e ativo que **ainda é o caminho oficial**:

```
SIGVOOS  →  worker-airtrust/src/services/sigvoos-frms.ts (syncSigvoosForFrms)  →  frms_jornada
```

Pontos de entrada do caminho legado:
- `worker-airtrust/src/cron/scheduled-handler.ts` (`runSigvoosFrmsDailySync`, cron diário por empresa).
- `worker-airtrust/src/routes/integracoes_sigvoos.ts` (sincronização manual via API).
- `worker-airtrust/src/routes/frms.ts` (endpoints de configuração/status do SIGVOOS para o FRMS).
- `worker-airtrust/src/lib/frms/frms-source-policy.ts` — **não alterado neste ciclo**. Define
  `FRMS_CANONICAL_OPERATIONAL_SOURCE = 'SIGVOOS'` como fonte operacional canônica hoje. Esta
  política decide se um registro é usado em alertas/rolling/score. Migrar isso é uma mudança
  funcional de alto risco e está **fora do escopo deste ciclo** — ver "Bloqueios" abaixo.

O caminho legado **continua funcionando sem alteração** após este ciclo. Nenhuma linha da
lógica de sincronização, do cron, ou de `frms-source-policy.ts` foi modificada.

## O que foi implementado neste ciclo (infraestrutura aditiva, somente leitura)

1. **Contrato canônico tipado** (`worker-airtrust/src/lib/frms/controle-voos-source.ts`):
   `ControleVoosOperationalRecord` — o formato que o FRMS deve consumir do Controle de Voos.
   Implementado como adaptador fino sobre o read-model já existente e testado
   `services/controle-voos/controle-voos-jornadas.ts::listControleVoosJornadas` (usado hoje
   pelo dashboard de Controle de Voos). Não foi criada uma nova fonte da verdade paralela.

2. **Comparador em shadow-mode** (`controle-voos-shadow-comparator.ts`): função pura, sem I/O,
   que compara chaves tripulante+data entre o Controle de Voos e `frms_jornada` (legado) e
   produz um resumo estatístico de divergências. Nunca grava, nunca altera score/alerta/jornada
   oficial, nunca expõe nome/matrícula/CPF (apenas `tripulanteId` numérico).

3. **Feature flag por tenant, sem migration** (`controle-voos-shadow-flag.ts` + `Env.CONTROLE_VOOS_FRMS_SHADOW_MODE_TENANTS`):
   variável de ambiente (Wrangler var, não secret) que aceita vazio/ausente (desativado —
   default seguro), `'all'`, ou uma lista de ids de empresa separada por vírgula. Rollback =
   remover a empresa da lista ou limpar a variável; não requer deploy de código.

4. **Hook aditivo no cron** (`scheduled-handler.ts::runSigvoosFrmsDailySync`): após a
   sincronização legada (que continua executando normalmente), se a flag estiver ativa para a
   empresa, busca os dados do Controle de Voos para a mesma janela, compara com `frms_jornada`,
   e **apenas loga** o resumo (contagens e categorias de divergência, sem PII). Envolvido em
   `try/catch` isolado — uma falha na comparação nunca afeta o caminho legado.

5. **Guard arquitetural** (`scripts/guard-frms-no-direct-sigvoos.cjs`, `npm run guard:frms-no-direct-sigvoos`,
   integrado ao `npm run lint`): impede que qualquer arquivo em `worker-airtrust/src/lib/frms/**`
   importe `services/sigvoos-frms`, `services/controle-voos/sigvoos-real-preview` ou
   `routes/integracoes_sigvoos`. Detecção por parsing de declarações de import/require reais
   (não busca textual ingênua), com testes positivos e negativos.

## Lacunas confirmadas por investigação real (não inferidas por nome de função)

Ver `CONTROLE_VOOS_FRMS_KNOWN_GAPS` em `controle-voos-source.ts` para a lista viva no código.
Resumo:

1. **Cancelamento não confirmável**: `listControleVoosJornadas` (o read-model reaproveitado)
   não seleciona `cv_voos.status`. O contrato atual não consegue garantir que um voo cancelado
   foi excluído. `statusCancelamentoConfirmado` é sempre `false` — nenhum consumidor deve tratar
   isso como "não cancelado".
2. **Sem identificador de matrícula do tripulante** no read-model reaproveitado (apenas `nome`,
   que é PII e por isso não é repassado pelo adapter). Identificação hoje é só por `tripulanteId`.
3. **Timezone implícito**: horários armazenados como `HH:MM` sem coluna de fuso horário própria;
   assume-se `America/Sao_Paulo` por convenção do restante do domínio FRMS, não por garantia de
   schema.

Nenhuma paridade foi inventada para cobrir essas lacunas. Elas devem ser resolvidas antes de
qualquer ativação de shadow-mode em produção com dados reais (ver plano abaixo).

## Fórmulas e regras de negócio — confirmação de não-alteração

Este ciclo **não tocou**:
- `worker-airtrust/src/lib/frms/fadiga-score.ts` (cálculo de score).
- `worker-airtrust/src/lib/frms/decision-policy.ts`.
- `worker-airtrust/src/lib/frms/frms-source-policy.ts` (política de fonte canônica atual = SIGVOOS).
- Qualquer threshold, peso, ou valor de check-in de sono/KSS/qualidade do sono.
- Migrations 0432, 0433, 0435.
- `assertModeloSessaoTemManobras` e regras de fichas/simuladores.

## Plano de canário, paridade, cutover e rollback (próximos ciclos — não executado neste ciclo)

1. **Canário read-only (este ciclo entrega a infraestrutura para isto)**: ativar
   `CONTROLE_VOOS_FRMS_SHADOW_MODE_TENANTS` para 1 empresa de teste/staging, observar logs
   `[SIGVOOS_CRON] [SHADOW]` por várias janelas de sincronização, sem qualquer efeito funcional.
2. **Resolução de lacunas**: antes de confiar nas divergências, resolver o gap de cancelamento
   (expor `cv_voos.status` no read-model reaproveitado ou em uma extensão dele) e avaliar se
   `tripulanteId` isolado é suficiente para todos os consumidores.
3. **Paridade**: expandir o shadow-mode para produção, com um conjunto maior de empresas,
   durante um período definido (sugestão inicial: 2 a 4 semanas de janelas diárias), monitorando
   `totalDivergencias` e `divergenciasPorTipo` até convergência (idealmente zero divergências
   não explicadas, ou divergências explicadas e documentadas como esperadas).
4. **Decisão de cutover**: somente após paridade comprovada, propor (em ciclo dedicado, com
   revisão humana) a alteração de `frms-source-policy.ts` para que o Controle de Voos passe a
   alimentar `frms_jornada` como fonte primária, mantendo SIGVOOS como fallback/legado por um
   período de transição adicional.
5. **Rollback em qualquer etapa**: antes do cutover, rollback = desativar a flag (não requer
   deploy). Depois do cutover, o rollback exigiria reverter a alteração em `frms-source-policy.ts`
   (fora do escopo deste ciclo) — este documento será atualizado quando esse ciclo ocorrer.
6. **Remoção do caminho legado**: somente em um ciclo posterior ao cutover, após confirmação
   operacional extensa, nunca neste ciclo nem no ciclo de cutover.

## Próximo prompt operacional (para o ciclo de ativação controlada do shadow-mode)

Ver seção final do relatório de entrega deste ciclo.
