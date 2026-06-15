# Controle de Voos N1 - Relatorio do Dia 2 do Piloto

Data de execucao: 2026-06-14  
Ambiente: D1 dedicado `airtrust-db-pilot-cv-n1`  
UUID: `76ec876a-8727-44b6-aa33-b8dea53cdebb`  
Modo: assistido/controlado com perfis sinteticos e validacao tecnica  
Veredito: **GO com ressalvas para o Dia 3**

## 1. Sumario executivo

O Dia 2 do piloto Controle de Voos N1 foi executado exclusivamente no D1 dedicado `airtrust-db-pilot-cv-n1`, usando o config temporario `worker-airtrust/wrangler.pilot-cv-n1.toml` e env-file temporario em `/tmp/airtrust-pilot-cv-n1/`.

O objetivo principal do Dia 2 era cobrir a lacuna do Dia 1: reabrir um RDV em rascunho, confirmar persistencia, alterar campo permitido, salvar novamente, confirmar nova persistencia e somente depois finalizar. Esse fluxo foi concluido com sucesso no voo sintetico `PILOT-CV-003` (`voo_id = 3`).

Tambem foi executada uma primeira tentativa no voo `PILOT-CV-002` (`voo_id = 2`), que revelou um incidente funcional controlado: o guard de escopo rejeitou texto livre com termo fora do vocabulário permitido e retornou HTTP `400`. O fluxo foi repetido no voo `3` com texto operacional neutro e passou. O incidente nao bloqueou o piloto, mas deve virar item de Dia 3 para revisar a orientacao de preenchimento e a mensagem de erro exibida ao usuario.

Nao houve usuario real/controlado externo nesta sessao. Logo, aceite formal, tempo subjetivo de usuario e feedback operacional real permanecem pendentes.

## 2. Participantes

| Papel | Participante | Observacao |
|---|---|---|
| Admin tecnico | Codex operando no workspace AirTrust | Execucao tecnica assistida |
| OCC/editor sintetico | `editor-pilot@pilot.airtrust.local` | Login e fluxo de RDV |
| Admin sintetico | `admin-pilot@pilot.airtrust.local` | Login confirmado |
| Viewer sintetico | `viewer-pilot@pilot.airtrust.local` | Login confirmado e escrita bloqueada |
| Usuario real/controlado | Nao executado | Pendente para Dia 3 |

Credenciais sinteticas permaneceram exclusivamente em `/tmp/airtrust-pilot-cv-n1/` e nao foram registradas neste documento.

## 3. Ambiente

| Item | Estado |
|---|---|
| D1 dedicado | `airtrust-db-pilot-cv-n1` |
| UUID | `76ec876a-8727-44b6-aa33-b8dea53cdebb` |
| Config temporario | `worker-airtrust/wrangler.pilot-cv-n1.toml` |
| Env temporario | `/tmp/airtrust-pilot-cv-n1/pilot-cv-n1.env` |
| Worker preview | `http://localhost:8791`, encerrado ao fim da execucao |
| Frontend local | `http://localhost:3000`, proxyado para `http://localhost:8791`, encerrado ao fim da execucao |
| Snapshot pos-Dia 2 | `/tmp/airtrust-pilot-cv-n1/pilot-cv-n1-post-dia2-20260614214604.sql` |

O config temporario confirmou:

```text
database_name = "airtrust-db-pilot-cv-n1"
database_id = "76ec876a-8727-44b6-aa33-b8dea53cdebb"
```

## 4. Confirmacoes de seguranca

Confirmado nesta execucao:

- nenhum comando contra `airtrust-db` de producao;
- nenhum comando contra `airtrust-db-staging`;
- nenhum comando com `--env production`;
- nenhum deploy;
- nenhuma migration aplicada;
- nenhuma criacao ou aplicacao de `0411`;
- nenhuma integracao SIGVOOS ou FRMS;
- nenhum uso de eDB, SDRMe, MRO real ou Records Core;
- nenhum secret de producao lido, listado ou alterado;
- nenhum arquivo de `/tmp/airtrust-pilot-cv-n1/` movido para o repo;
- nenhum commit realizado;
- D1 dedicado preservado.

`0411` continua ausente:

- nenhum arquivo `*0411*` encontrado em `worker-airtrust/migrations/` ou `worker-airtrust/migrations_experimental/`;
- no D1 dedicado, `schema_0411_count = 0` para `cv_voo_etapas`, `cv_sigvoos_staging` e `cv_conflitos_integracao`.

## 5. Baseline Dia 1 validado

Pre-checagem read-only no D1 dedicado confirmou:

| Checagem | Resultado |
|---|---:|
| Tabelas `cv_%` | 8 |
| Voos sinteticos | 8 |
| RDVs antes do Dia 2 | 1 |
| RDVs finalizados antes do Dia 2 | 1 |
| `regulated_count` | 0 |
| Tabelas 0411 | 0 |
| Escopos inesperados SIGVOOS/FRMS/eDB/SDRMe/Records Core | 0 |

Usuarios sinteticos confirmados por login:

```text
admin-pilot@pilot.airtrust.local
editor-pilot@pilot.airtrust.local
viewer-pilot@pilot.airtrust.local
```

O perfil viewer foi bloqueado em escrita com HTTP `403`.

## 6. Fluxos executados

### 6.1 Login e dashboard

| Fluxo | Resultado |
|---|---|
| Login admin sintetico | HTTP 200 |
| Login editor sintetico | HTTP 200 |
| Login viewer sintetico | HTTP 200 |
| Dashboard via API | HTTP 200, `nao_regulado = true` |
| Lista de voos | HTTP 200, 8 voos |

### 6.2 Reabertura de rascunho - primeira tentativa

Voo: `PILOT-CV-002` (`voo_id = 2`)

| Etapa | Resultado |
|---|---|
| GET RDV antes do fluxo | Sem RDV |
| Criar rascunho | HTTP 201, status `rascunho` |
| Reabrir por GET | Persistencia inicial confirmada |
| Atualizar rascunho com texto livre contendo termo bloqueado pelo guard de escopo | HTTP 400 |
| Finalizar depois da tentativa parcial | HTTP 200, status `preenchimento_finalizado` |

Incidente: o guard de escopo retornou `Payload contem termo fora do escopo` quando o texto livre incluiu termo proibido pelo bloqueio preventivo de linguagem regulatoria. Como o objetivo do Dia 2 exigia confirmar alteracao e nova persistencia antes de finalizar, o roteiro foi repetido em outro voo com texto operacional neutro.

### 6.3 Reabertura de rascunho - fluxo aprovado

Voo: `PILOT-CV-003` (`voo_id = 3`)

| Etapa | Resultado |
|---|---|
| GET RDV antes do fluxo | Sem RDV |
| Criar RDV rascunho | HTTP 201, status `rascunho` |
| Fechar/reabrir por GET | Numero, horas voadas e consumo persistidos |
| Alterar campo permitido com payload completo | HTTP 200 |
| Reabrir por GET novamente | `horas_voadas = 1.17` e `combustivel_consumo = 465` persistidos |
| Finalizar apos persistencia | HTTP 200, status `preenchimento_finalizado` |
| Reabrir apos finalizacao | Finalizacao persistida |

Resultado: **fluxo principal do Dia 2 aprovado**.

## 7. Validacao de UI

UI autenticada foi aberta em frontend local `http://localhost:3000` com proxy para o Worker piloto `http://localhost:8791`.

Validacoes confirmadas:

- login via UI com usuario editor sintetico saiu da tela de login;
- dashboard exibiu modulo Controle de Voos;
- banner exibiu `Operacional interno`, `N1`, `A1` e `NAO REGULADO`;
- texto do dashboard registrou: uso operacional interno, nao regulado, nao fiscal e nao substitui Diario de Bordo, eDB ou SDRMe;
- atalhos demonstrativos aparecem antes do clique na navegacao/subnav como `DEMO`;
- tela de Jornadas exibiu banner proprio `Prototipo - nao regulado`, `N0`, `A0`, `PROTOTIPO`, `NAO REGULADO`;
- nao foi encontrada linguagem de assinatura juridica nas telas de Controle de Voos capturadas.

Ressalva de UI:

- a rota `/controle-voos/rdv/3` ficou em estado `Carregando RDV...` na captura Playwright, apesar de as APIs do RDV terem respondido corretamente no roteiro tecnico;
- os logs do Worker mostram `GET /api/controle-voos/voos/3`, `GET /api/controle-voos/voos/3/rdv` e `GET /api/controle-voos/catalogos/aeroportos` com HTTP 200 durante a captura;
- no mesmo carregamento, endpoints globais do app retornaram 500 por tabelas ausentes no baseline minimo (`empresas_config`, `notificacoes_sistema`), o que pode ter afetado o estado visual do frontend;
- por isso, o botao `Finalizar preenchimento` nao foi observado renderizado na captura autenticada final;
- a revisao estatica do componente `ControleVoosRdvDetalhe.tsx` confirma que o botao usa o texto `Finalizar preenchimento` e nao usa linguagem de assinatura juridica;
- Dia 3 deve repetir a verificacao visual do RDV com usuario real/controlado ou investigar por que a tela permaneceu em loading no Playwright.

## 8. Feedback de usuario

Nao houve usuario real/controlado nesta execucao.

Status dos itens obrigatorios com usuario real:

| Item | Estado |
|---|---|
| Aceite explicito de escopo nao regulado | Nao executado |
| Roteiro com OCC ou observador real | Nao executado |
| Duvidas subjetivas | Nao coletadas |
| Tempo aproximado de usuario real | Nao coletado |
| Confusao regulatoria observada | Nao observada tecnicamente; pendente com usuario real |
| Feedback operacional | Nao coletado |

Tempo tecnico aproximado do fluxo automatizado aprovado: cerca de 13 segundos entre login editor, criacao, reaberturas, atualizacao e finalizacao no voo `3`.

## 9. Comparacao operacional inicial

Comparacao manual com SIGVOOS/APUS/papel: **nao executada**.

Motivo:

- nao havia dado controlado externo disponivel nesta sessao;
- nao houve integracao SIGVOOS/APUS;
- o piloto continua usando apenas voos sinteticos do D1 dedicado.

Template de divergencias para Dia 3:

| Voo | Fonte externa | Campo | AirTrust | Referencia externa | Divergencia | Acao |
|---|---|---|---|---|---|---|
| pendente | SIGVOOS/APUS/papel | pendente | pendente | pendente | pendente | pendente |

## 10. Incidentes

| ID | Incidente | Severidade | Status | Acao recomendada |
|---|---|---|---|---|
| D2-I1 | Guard de escopo rejeitou termo de texto livre no RDV do voo `2` com HTTP 400 | Media | Contornado | Revisar orientacao de preenchimento e mensagem de erro para termos bloqueados |
| D2-I2 | Tela RDV ficou em `Carregando RDV...` no Playwright autenticado, apesar de APIs `controle-voos` retornarem 200 | Media | Aberto | Repetir em browser/manual no Dia 3 e investigar impacto dos endpoints globais sem baseline (`empresas_config`, `notificacoes_sistema`) |
| D2-I3 | Sem usuario real/controlado no Dia 2 | Baixa | Aberto | Agendar sessao assistida com OCC/observador para Dia 3 |
| D2-I4 | Comparacao SIGVOOS/APUS/papel nao executada | Baixa | Aberto | Separar 1-2 voos com referencia externa controlada |

Nenhum incidente tocou production, staging, SIGVOOS real, FRMS, eDB, SDRMe, MRO real ou Records Core.

## 11. Estado final do D1

Validacao read-only apos o roteiro:

| Checagem | Resultado |
|---|---:|
| Tabelas `cv_%` | 8 |
| Voos sinteticos | 8 |
| RDVs totais | 3 |
| RDVs finalizados | 3 |
| `regulated_count` | 0 |
| Tabelas 0411 | 0 |
| Escopos inesperados | 0 |

RDVs finalizados:

```text
voo_id=1 RDV-PILOT-CV-001                 horas=1.58 consumo=250
voo_id=2 RDV-20260610-PILOTCV002-DIA2     horas=1.12 consumo=440
voo_id=3 RDV-20260611-PILOTCV003-DIA2     horas=1.17 consumo=465
```

## 12. Evidencias

Evidencias geradas fora do repositorio:

| Evidencia | Local | Tamanho |
|---|---|---:|
| Resultado API inicial Dia 2 | `/tmp/airtrust-pilot-cv-n1/day2-api-flow-result-20260614T235527.json` | 4367 bytes |
| Resultado aprovado reabertura rascunho | `/tmp/airtrust-pilot-cv-n1/day2-draft-reopen-result-20260614T235628.json` | 2878 bytes |
| Validacao UI autenticada | `/tmp/airtrust-pilot-cv-n1/day2-ui-auth-validation-20260615T000152.json` | 7112 bytes |
| Evidencia UI RDV focada | `/tmp/airtrust-pilot-cv-n1/day2-ui-rdv-focused-20260615T000223.json` | 1029 bytes |
| Screenshot dashboard autenticado | `/tmp/airtrust-pilot-cv-n1/day2-ui-auth-dashboard-20260615T000147.png` | 79947 bytes |
| Screenshot RDV autenticado | `/tmp/airtrust-pilot-cv-n1/day2-ui-auth-rdv-3-20260615T000150.png` | 54368 bytes |
| Screenshot Jornadas Demo | `/tmp/airtrust-pilot-cv-n1/day2-ui-auth-jornadas-demo-20260615T000152.png` | 214575 bytes |
| Snapshot pos-Dia 2 | `/tmp/airtrust-pilot-cv-n1/pilot-cv-n1-post-dia2-20260614214604.sql` | 44559 bytes |

O snapshot pos-Dia 2 foi gerado por:

```bash
npx wrangler d1 export airtrust-db-pilot-cv-n1 \
  --config worker-airtrust/wrangler.pilot-cv-n1.toml \
  --remote \
  --output /tmp/airtrust-pilot-cv-n1/pilot-cv-n1-post-dia2-20260614214604.sql
```

Confirmado tamanho maior que zero. Nenhuma evidencia foi movida para o repo.

## 13. Pendencias para Dia 3

- Executar sessao com 1 usuario OCC ou observador real/controlado.
- Coletar aceite explicito de escopo nao regulado antes do uso real.
- Repetir o fluxo de RDV na UI, nao apenas por API, e confirmar que a tela sai de `Carregando RDV...`.
- Revisar o guard de escopo para mensagens de erro claras quando texto livre usa termo bloqueado.
- Decidir se o baseline minimo do piloto precisa tabelas globais read-only para evitar erros de layout/autenticacao fora de Controle de Voos.
- Comparar manualmente 1 ou 2 voos contra referencia SIGVOOS/APUS/papel controlada, sem integracao.
- Registrar tempos reais, duvidas, confusao regulatoria e feedback.
- Manter production/staging intocados.
- Nao aplicar 0411.

## 14. Veredito

**GO com ressalvas para o Dia 3**.

Motivos do GO:

- D1 dedicado preservado e isolado;
- baseline Dia 1 validado;
- fluxo principal de reabertura de rascunho aprovado no voo `3`;
- dashboard/API seguem marcando `nao_regulado`;
- viewer segue bloqueado para escrita;
- snapshot pos-Dia 2 gerado;
- production e staging intocados.

Ressalvas:

- nao houve usuario real/controlado;
- comparacao operacional externa nao executada;
- RDV via UI precisa ser revalidado porque a captura Playwright ficou em loading;
- guard de escopo rejeitou termo de texto livre no primeiro roteiro e precisa orientacao clara ao usuario;
- frontend autenticado encontrou erros em endpoints globais ausentes do baseline minimo, embora as APIs de Controle de Voos tenham respondido.

## 15. Sugestao de commit

Commit seletivo sugerido:

```bash
git add docs/CONTROLE_DE_VOOS_N1_DIA2_PILOT_REPORT.md
git commit -m "docs: record controle voos n1 dia2 pilot report"
```

Nao adicionar:

```text
worker-airtrust/wrangler.pilot-cv-n1.toml
/tmp/airtrust-pilot-cv-n1/*
qualquer snapshot, dump, .env, token, secret ou credencial
```

Nao usar `git add .`.
