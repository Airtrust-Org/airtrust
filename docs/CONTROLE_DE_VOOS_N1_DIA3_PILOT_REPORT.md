# Controle de Voos N1 - Relatorio do Dia 3 do Piloto

Data de execucao: 2026-06-14, com evidencias UTC em 2026-06-15<br>
Ambiente: D1 dedicado `airtrust-db-pilot-cv-n1`<br>
UUID: `76ec876a-8727-44b6-aa33-b8dea53cdebb`<br>
Modo: operacional interno, controlado, nao regulado<br>
Veredito: **GO com ressalvas para consolidacao assistida; recomendacao objetiva: continuar piloto**

## 1. Sumario executivo

O Dia 3 do piloto Controle de Voos N1 foi executado exclusivamente contra o D1 dedicado `airtrust-db-pilot-cv-n1`, usando `worker-airtrust/wrangler.pilot-cv-n1.toml` e env-file temporario em `/tmp/airtrust-pilot-cv-n1/`.

O baseline pos-Dia 2 foi confirmado antes do fluxo: 8 tabelas `cv_%`, 8 voos sinteticos, 3 RDVs finalizados, `regulated_count = 0`, nenhuma tabela 0411 e nenhum escopo inesperado SIGVOOS/FRMS/eDB/SDRMe/Records Core.

O fluxo de RDV foi repetido pela UI local, nao apenas por API. A tela de RDV saiu de `Carregando RDV...`, permitiu criar/reabrir rascunho, persistiu dados no D1 dedicado apos reset da tela e finalizou preenchimento com sucesso. A validacao final read-only confirmou 4 RDVs finalizados.

O Dia 3 tambem confirmou ressalvas importantes: nao houve usuario OCC/observador real disponivel; a comparacao externa controlada nao foi executada; endpoints globais fora do baseline minimo (`empresas_config`, `notificacoes_sistema`) ainda retornam HTTP 500; e o guard de escopo bloqueou texto com termo proibido, mas a UI ficou presa em estado `Salvando...` em vez de recuperar claramente a acao do usuario.

Conclusao: o piloto pode continuar em modo assistido/controlado, mas nao deve ser encerrado como N1 sem ressalvas enquanto nao houver sessao real/controlada e tratamento melhor do erro do guard.

## 2. Participantes

| Papel | Participante | Resultado |
|---|---|---|
| Admin tecnico | Codex no workspace AirTrust | Execucao tecnica controlada |
| Usuario sintetico editor | `editor-pilot@pilot.airtrust.local` | Usado no fluxo UI |
| Usuario OCC ou observador real/controlado | Nao disponivel | Pendente |
| Aceite explicito de escopo nao regulado por usuario real | Nao coletado | Pendente |

Credenciais sinteticas permaneceram apenas em `/tmp/airtrust-pilot-cv-n1/` e nao foram copiadas para o repositorio.

## 3. Ambiente

| Item | Estado |
|---|---|
| D1 dedicado | `airtrust-db-pilot-cv-n1` |
| UUID | `76ec876a-8727-44b6-aa33-b8dea53cdebb` |
| Config temporario | `worker-airtrust/wrangler.pilot-cv-n1.toml` |
| Env-file temporario | `/tmp/airtrust-pilot-cv-n1/pilot-cv-n1.env` |
| Worker preview | `http://localhost:8791`, iniciado com config piloto |
| Frontend local | `http://localhost:3000`, proxyado para `http://localhost:8791` |
| Snapshot pos-Dia 3 | `/tmp/airtrust-pilot-cv-n1/pilot-cv-n1-post-dia3-20260614220940.sql` |

O config temporario confirmou:

```text
database_name = "airtrust-db-pilot-cv-n1"
database_id = "76ec876a-8727-44b6-aa33-b8dea53cdebb"
```

## 4. Checklist de isolamento

Confirmado nesta execucao:

- nenhum comando contra producao;
- nenhum comando contra `airtrust-db-staging`;
- nenhum comando com `--env production`;
- nenhum deploy;
- nenhuma migration aplicada;
- nenhuma criacao ou aplicacao de `0411`;
- nenhuma integracao SIGVOOS;
- nenhuma alteracao em FRMS ou `frms-source-policy.ts`;
- nenhum uso de eDB, SDRMe, MRO real ou Records Core;
- nenhum secret de producao lido, listado ou alterado;
- nenhum arquivo de `/tmp/airtrust-pilot-cv-n1/` movido para o repositorio;
- nenhum commit realizado;
- D1 dedicado preservado como baseline evolutivo do piloto.

## 5. Baseline pos-Dia 2

Validacao read-only antes do fluxo Dia 3:

| Checagem | Resultado |
|---|---:|
| Tabelas `cv_%` | 8 |
| Voos sinteticos | 8 |
| RDVs finalizados | 3 |
| `regulated_count` | 0 |
| Tabelas 0411 | 0 |
| Escopos inesperados SIGVOOS/FRMS/eDB/SDRMe/Records Core | 0 |

Tabelas `cv_%` encontradas:

```text
cv_aeroportos
cv_motivos_operacionais
cv_naturezas_voo
cv_rdv_operacional
cv_tipos_voo
cv_voo_eventos
cv_voo_tripulantes
cv_voos
```

## 6. Fluxo UI RDV

Fluxo exigido para o Dia 3:

| Etapa | Resultado |
|---|---|
| Abrir lista de voos | Executado |
| Abrir detalhe de voo | Executado |
| Abrir RDV | Executado |
| Confirmar saida de `Carregando RDV...` | Confirmado |
| Criar ou reabrir rascunho | Executado |
| Alterar campo permitido | Executado |
| Salvar | Executado apos ajuste de dados coerentes |
| Reabrir | Executado por reload/GET da tela |
| Confirmar persistencia | Confirmado no D1 dedicado |
| Finalizar preenchimento | Executado pela UI |
| Confirmar texto sem assinatura juridica | Confirmado: fluxo usa `Finalizar preenchimento` e confirmacao `Confirmar finalizacao` |

Voo efetivamente alterado:

```text
voo_id=5
prefixo=PILOT-CV-005
rdv_numero=RDV-20260611-PILOTCV004-DIA3
rdv_status=preenchimento_finalizado
horas_voadas=1.27
combustivel_consumo=490
ocorrencias=Dia 3: texto operacional neutro apos reset da tela.
finalizado_operacionalmente_em=2026-06-15 01:06:49
```

Observacao de qualidade de evidencia: o roteiro pretendia usar um voo sem RDV finalizado, mas a selecao por clique ambiguo na lista levou ao `voo_id = 5` (`PILOT-CV-005`). O numero informado no RDV ficou `RDV-20260611-PILOTCV004-DIA3`, incoerente com o prefixo do voo. Como o dado esta somente no D1 dedicado do piloto, foi preservado e registrado como incidente, sem correcao ad hoc.

## 7. Guard de escopo

O guard foi testado apenas em nivel de diagnostico/roteiro, sem afrouxamento de regra.

| Caso | Resultado |
|---|---|
| Texto operacional neutro | Aceito no fluxo final e persistido no D1 dedicado |
| Texto com termo bloqueado `validacao` | Rejeitado pelo Worker com HTTP 400 |
| Mensagem tecnica observada | `Payload contem termo fora do escopo` |
| Comportamento da UI apos rejeicao | Botao permaneceu em `Salvando...`, sem recuperacao visual clara |

Risco: o bloqueio esta funcionando, mas a UI pode deixar o usuario sem proximo passo claro quando o erro ocorre. Nao foi implementada correcao nesta execucao.

## 8. Validacao de UI e linguagem

Validacoes confirmadas em screenshots e respostas do Worker:

- dashboard e telas de Controle de Voos continuam marcadas como uso operacional interno e nao regulado;
- atalhos demonstrativos continuam exibindo `DEMO`;
- RDV nao apresentou linguagem de assinatura juridica;
- a acao observada foi `Finalizar preenchimento`, nao assinatura, homologacao, certificacao ou autorizacao;
- a tela de confirmacao usou `Confirmar finalizacao`;
- nao foi observado texto chamando o modulo de homologado, certificado ou autorizado pela ANAC.

Ressalvas:

- endpoints globais continuaram falhando com HTTP 500 por tabelas ausentes no baseline minimo: `/api/auth/empresas`, `/api/empresas/minha/sistema` e `/api/notificacoes/sistema`;
- esses erros nao impediram os endpoints `controle-voos` de responderem 200 nem bloquearam a finalizacao apos reset da tela;
- os endpoints globais devem ser tratados antes de uma sessao menos assistida, para reduzir ruido de carregamento e estado visual.

## 9. Feedback real/controlado

Nao houve usuario OCC ou observador real/controlado disponivel nesta execucao. Por isso:

| Item | Estado |
|---|---|
| Aceite explicito de escopo nao regulado | Nao executado |
| Tempo aproximado de usuario real | Nao coletado |
| Duvidas de usuario real | Nao coletadas |
| Confusao regulatoria real | Nao avaliada |
| Dificuldade de uso real | Nao avaliada |
| Valor operacional percebido | Nao validado |

Observacoes tecnicas equivalentes:

- a linguagem visual principal nao induziu uso regulado;
- o erro do guard e a regra de coerencia de combustivel exigem mensagens melhores para usuario assistido;
- o fluxo ainda depende de reset/reload quando a UI entra em estado inconsistente apos erro.

## 10. Comparacao externa

Comparacao manual contra SIGVOOS/APUS/papel: **nao executada**.

Motivo:

- nao havia dado externo controlado disponivel nesta sessao;
- nenhuma integracao, importador ou escrita fora do D1 dedicado foi executada.

Template pendente:

| Voo | Fonte externa | Campo | AirTrust | Referencia externa | Divergencia | Acao |
|---|---|---|---|---|---|---|
| pendente | SIGVOOS/APUS/papel | pendente | pendente | pendente | pendente | pendente |

## 11. Estado final do D1 dedicado

Validacao read-only apos o fluxo Dia 3:

| Checagem | Resultado |
|---|---:|
| Tabelas `cv_%` | 8 |
| Voos sinteticos | 8 |
| RDVs totais | 4 |
| RDVs finalizados | 4 |
| `regulated_count` | 0 |
| Tabelas 0411 | 0 |
| Escopos inesperados SIGVOOS/FRMS/eDB/SDRMe/Records Core | 0 |

RDVs finalizados:

```text
voo_id=1 PILOT-CV-001 RDV-PILOT-CV-001                 horas=1.58 consumo=250
voo_id=2 PILOT-CV-002 RDV-20260610-PILOTCV002-DIA2     horas=1.12 consumo=440
voo_id=3 PILOT-CV-003 RDV-20260611-PILOTCV003-DIA2     horas=1.17 consumo=465
voo_id=5 PILOT-CV-005 RDV-20260611-PILOTCV004-DIA3     horas=1.27 consumo=490
```

O `voo_id = 4` permanece sem RDV.

## 12. Incidentes

| ID | Incidente | Severidade | Status | Acao recomendada |
|---|---|---|---|---|
| D3-I1 | Usuario OCC/observador real nao disponivel | Media | Aberto | Executar sessao real/controlada antes de encerramento sem ressalvas |
| D3-I2 | Endpoints globais sem baseline (`empresas_config`, `notificacoes_sistema`) retornaram HTTP 500 | Media | Aberto | Decidir baseline minimo read-only para shell autenticado ou isolar carregamento de Controle de Voos |
| D3-I3 | Texto com termo bloqueado `validacao` retornou `Payload contem termo fora do escopo` | Baixa | Confirmado | Manter guard; melhorar orientacao/mensagem de usuario antes de ampliar piloto |
| D3-I4 | UI ficou em `Salvando...` apos erro do guard | Media | Aberto | Corrigir recuperacao de estado de erro antes de uso menos assistido |
| D3-I5 | Primeira tentativa de atualizacao usou combustivel incoerente e retornou `Combustivel incoerente` | Baixa | Contornado | Exibir regra de coerencia ao usuario antes ou durante preenchimento |
| D3-I6 | Clique ambiguo levou ao `voo_id = 5` enquanto o numero do RDV indicava `PILOTCV004` | Media | Aberto | Usar seletores/identificacao explicita de voo no roteiro e validar numero de RDV contra prefixo |
| D3-I7 | Comparacao externa SIGVOOS/APUS/papel nao executada | Baixa | Aberto | Separar 1 ou 2 voos com referencia externa controlada |

Nenhum incidente tocou producao, staging, SIGVOOS real, FRMS, eDB, SDRMe, MRO real ou Records Core.

## 13. Evidencias

Evidencias geradas fora do repositorio:

| Evidencia | Local | Tamanho |
|---|---|---:|
| Lista de voos UI | `/tmp/airtrust-pilot-cv-n1/day3-ui-voos-list-20260615T005335.png` | 11309 bytes |
| Detalhe de voo UI | `/tmp/airtrust-pilot-cv-n1/day3-ui-voo-4-detail-20260615T005339.png` | 56116 bytes |
| RDV inicial UI | `/tmp/airtrust-pilot-cv-n1/day3-ui-rdv-4-initial-20260615T005340.png` | 132731 bytes |
| RDV rascunho criado | `/tmp/airtrust-pilot-cv-n1/day3-ui-rdv-4-draft-created-20260615T005346.png` | 187797 bytes |
| RDV com termo bloqueado | `/tmp/airtrust-pilot-cv-n1/day3-ui-rdv-4-guard-blocked-20260615T010439.png` | 186973 bytes |
| Fluxo final JSON | `/tmp/airtrust-pilot-cv-n1/day3-ui-finalize-flow-20260615T010653.json` | 3496 bytes |
| RDV salvo apos reset | `/tmp/airtrust-pilot-cv-n1/day3-ui-finalize-saved-coherent-20260615T010643.png` | 187667 bytes |
| RDV finalizado | `/tmp/airtrust-pilot-cv-n1/day3-ui-finalize-finalized-20260615T010653.png` | 169581 bytes |
| Snapshot pos-Dia 3 | `/tmp/airtrust-pilot-cv-n1/pilot-cv-n1-post-dia3-20260614220940.sql` | 50595 bytes |

Snapshot gerado por:

```bash
npx wrangler d1 export airtrust-db-pilot-cv-n1 \
  --config worker-airtrust/wrangler.pilot-cv-n1.toml \
  --remote \
  --output /tmp/airtrust-pilot-cv-n1/pilot-cv-n1-post-dia3-20260614220940.sql
```

Confirmado tamanho maior que zero. Nenhuma evidencia foi movida para o repositorio.

## 14. Veredito e recomendacao

Veredito: **GO com ressalvas para consolidacao assistida**.

Recomendacao objetiva: **continuar piloto**, ainda nao encerrar como N1 sem ressalvas.

Motivos:

- isolamento tecnico do D1 dedicado segue valido;
- UI RDV conseguiu sair de loading, persistir e finalizar preenchimento;
- baseline final permanece nao regulado, sem 0411 e sem escopos externos;
- ainda faltam usuario real/controlado, comparacao externa controlada e tratamento melhor de erro do guard;
- ha um incidente de consistencia de evidencia no numero do RDV do Dia 3 que deve ser preservado e considerado antes de consolidacao final.

## 15. Sugestao de commit seletivo

Nao commitar arquivos temporarios, snapshots, dumps, env-file, credenciais ou `worker-airtrust/wrangler.pilot-cv-n1.toml`.

Commit sugerido, se aprovado:

```bash
git add docs/CONTROLE_DE_VOOS_N1_DIA3_PILOT_REPORT.md
git commit -m "docs: record controle voos n1 dia3 pilot report"
```

Nao usar `git add .`.
