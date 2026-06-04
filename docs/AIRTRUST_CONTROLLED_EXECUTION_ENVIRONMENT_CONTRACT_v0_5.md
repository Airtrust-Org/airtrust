# AirTrust — Controlled Execution Environment Contract v0.5

**Data:** 2026-06-04  
**Branch:** `main`  
**HEAD base:** `6bec63ad638011f1510ec4b97a06966c0e810875`  
**Modo:** documental/local. Sem D1 remoto. Sem mutation. Sem deploy.

---

## 1. Objetivo

Este contrato define o pacote mínimo obrigatório para liberar qualquer janela controlada de:
- `DQ-01 controlled backfill`
- `MIG-01 controlled rebaseline`

Sem este contrato completo, o gate deve falhar fechado.

---

## 2. Targets permitidos

Targets aceitos:
- `local-copy`
- `staging`
- `production`

Regras:
- `production` é proibido por padrão;
- `production` só pode passar no gate com autorização adicional explícita;
- `local-copy` e `staging` continuam sujeitos a snapshot, rollback, aprovação e comando seguro revisado;
- o target declarado deve bater com a evidência operacional usada na janela.

---

## 3. Variáveis obrigatórias

Contrato canônico do gate:

| Variável | Obrigatória | Descrição |
|---|---|---|
| `AIRTRUST_CONTROLLED_MODE` | sim | `dq01-backfill` ou `mig01-rebaseline` |
| `AIRTRUST_CONTROLLED_TARGET` | sim | `local-copy`, `staging` ou `production` |
| `AIRTRUST_CONTROLLED_APPROVAL` | sim | identificador da aprovação operacional/humana |
| `AIRTRUST_DB_PATH` ou `AIRTRUST_CONTROLLED_TARGET_REF` | sim | evidência do banco alvo ou referência operacional equivalente |
| `AIRTRUST_CONTROLLED_SNAPSHOT_PATH` ou `AIRTRUST_CONTROLLED_SNAPSHOT_REF` | sim | evidência do snapshot pré-janela |
| `AIRTRUST_CONTROLLED_ROLLBACK_PATH` ou `AIRTRUST_CONTROLLED_ROLLBACK_REF` | sim | evidência do rollback documentado |
| `AIRTRUST_CONTROLLED_SAFE_COMMAND` | sim | comando exato aprovado para a janela |
| `AIRTRUST_CONTROLLED_SAFE_COMMAND_REVIEWED` | sim | deve ser `YES` |

Variáveis adicionais:

| Variável | Quando usar | Regra |
|---|---|---|
| `AIRTRUST_CONTROLLED_PRODUCTION_APPROVED` | apenas target `production` | deve ser `YES` |
| `AIRTRUST_CONTROLLED_ALLOW_REMOTE_D1` | somente se existir autorização adicional explícita | default `NO`; ausência bloqueia `--remote` |
| `AIRTRUST_CONTROLLED_ALLOWED_TARGETS` | wrappers específicos | restringe targets válidos por stream |

Wrappers de stream podem aceitar aliases específicos (`AIRTRUST_DQ01_*`, `AIRTRUST_MIG01_*`), mas o contrato canônico do gate é o namespace `AIRTRUST_CONTROLLED_*`.

---

## 4. Formato esperado de snapshot

O snapshot aceito precisa provar que existe um ponto de restauração anterior à janela:
- arquivo local legível (`*.sqlite`, `*.db`, `*.sql`, `*.dump`, `*.tar.gz`) via `AIRTRUST_CONTROLLED_SNAPSHOT_PATH`; ou
- referência operacional rastreável via `AIRTRUST_CONTROLLED_SNAPSHOT_REF`.

Requisitos mínimos:
- data/hora da captura;
- origem do target;
- responsável pela captura;
- identificador único ou path rastreável;
- confirmação de que o snapshot precede a execução.

---

## 5. Formato esperado de rollback

Rollback aceito:
- arquivo legível com procedimento explícito via `AIRTRUST_CONTROLLED_ROLLBACK_PATH`; ou
- referência operacional rastreável via `AIRTRUST_CONTROLLED_ROLLBACK_REF`.

O rollback deve responder:
- quem executa;
- como restaurar o snapshot;
- qual o critério de abort;
- como validar que o estado restaurado ficou íntegro;
- onde registrar a evidência pós-rollback.

---

## 6. Aprovação operacional

`AIRTRUST_CONTROLLED_APPROVAL` deve registrar um identificador curto e não sensível, por exemplo:
- ticket interno;
- changelog id;
- referência de janela aprovada;
- nome curto do aprovador combinado com data/hora.

Não registrar:
- secrets;
- tokens;
- dados pessoais desnecessários;
- payloads com PII.

---

## 7. Comando seguro revisado

`AIRTRUST_CONTROLLED_SAFE_COMMAND` deve conter o comando exato planejado para a janela.

Regras do gate:
- `dq01-backfill` deve conter `backfill` e não pode conter `rebaseline`;
- `mig01-rebaseline` deve conter `rebaseline` e não pode conter `backfill`;
- qualquer menção a `deploy` bloqueia;
- qualquer `D1 remote` bloqueia por padrão;
- `D1 remote` só é elegível com autorização adicional explícita e nunca deve ser usado por engano;
- o gate não executa o comando, apenas valida o contrato.

`AIRTRUST_CONTROLLED_SAFE_COMMAND_REVIEWED=YES` é obrigatório.

---

## 8. Produção e validação anti-engano

Para evitar tocar produção por engano:
- se `AIRTRUST_CONTROLLED_TARGET=production`, exigir `AIRTRUST_CONTROLLED_PRODUCTION_APPROVED=YES`;
- se o target declarado for `local-copy` ou `staging`, mas o path/ref/comando parecer apontar para `prod`, `production` ou `live`, o gate deve bloquear;
- nunca usar logs do gate para imprimir paths completos, dumps ou payloads sensíveis;
- revisar o comando antes da janela e registrá-lo no runbook.

---

## 9. PII e logs

O gate e os docs devem logar somente:
- status do gate;
- modo;
- target;
- presença/ausência de evidência;
- motivos de bloqueio.

Não logar:
- dados reais de linha;
- SQL com parâmetros sensíveis;
- paths sensíveis de produção se não forem necessários;
- tokens, cookies, headers, credenciais;
- nomes completos ou identificadores pessoais sem necessidade operacional.

---

## 10. Ordem recomendada

Ordem operacional recomendada:
1. `DQ-01 controlled backfill`
2. `MIG-01 controlled rebaseline`
3. deploy funcional, se necessário, em janela separada

Motivo:
- DQ limpa inconsistências de base antes de cristalizar baseline futura;
- MIG não deve misturar saneamento de dados com reorganização estrutural;
- deploy funcional precisa ficar desacoplado para reduzir blast radius e facilitar rollback.

---

## 11. Resultado desta fase

Este contrato deixa os dois streams prontos para uma janela controlada futura, mas não autoriza execução real por si só.

Status recomendado após este pacote:
- `DQ-01 = READY_FOR_CONTROLLED_EXECUTION_ENVIRONMENT`
- `MIG-01 = READY_FOR_CONTROLLED_EXECUTION_ENVIRONMENT`
