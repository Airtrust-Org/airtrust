# AirTrust Release Readiness — 2026-09-08

## Baseline de código

- Branch avaliada: `main`
- **Release code SHA:** `ee2b7e83ec136f13279c59bc964380202b19f8f2`
- Última integração de código: **#569 — Wrangler 4.130.0 + Cloudflare Workers Types v5**
- PRs abertas após a integração: **0**
- Produção alterada por esta consolidação: **não**
- Staging alterado por esta consolidação: **não**
- Migration remota executada por esta consolidação: **não**

Este documento é uma camada documental sobre o release code SHA acima. A eventual integração deste próprio arquivo não altera a baseline funcional avaliada e não deve iniciar uma cadeia artificial de atualização de SHA documental.

## CI final da baseline

### #569

A #569 foi integrada somente após:

- Dependency Review: PASS;
- PR Check: PASS;
- CI fast: PASS;
- CI heavy: PASS;
- `frontend-coverage`: PASS;
- `worker-tests-1`: PASS;
- `worker-tests-2`: PASS;
- `public-e2e`: PASS;
- `lms-smoke`: PASS;
- `airtrust-gcb`: PASS.

Nenhum threshold de segurança foi reduzido e nenhuma allowlist foi adicionada.

### `main` pós-merge

O SHA `ee2b7e83ec136f13279c59bc964380202b19f8f2` passou também os workflows pós-merge:

- **CI (fast gates): PASS**
- **CI (heavy gates): PASS**
- LMS smoke: PASS
- public E2E: PASS
- frontend coverage: PASS
- worker shard 1: PASS
- worker shard 2: PASS
- AirTrust GCB: PASS

## Integrações relevantes desta reta final

Além das correções anteriores já consolidadas, a baseline contém:

- #560 — compatibilidade de status em notificações;
- #561 — compatibilidade de status EVD;
- #562 — `scorm-again` 3.3.2;
- #463 — `react-pdf` 10.5.0;
- #564 — SECURITY F5-08: isolamento do runtime SCORM do bearer amplo da sessão;
- #563 — visão mensal integrada restrita ao setor Tripulação nas seis fontes;
- #568 — FRMS: enquadramento correto da interrupção de jornada fora da base e limites legais exclusivos `>3h` e `<6h`;
- #570 — FRMS: remoção das atribuições indevidas a Borbély/ICAO para o modelo empresarial de triagem;
- #569 — Wrangler 4.130.0 + Workers Types v5, com Dependency Review e CI completos.

A tentativa Wrangler 4.129.0 permaneceu rejeitada e foi substituída; nenhuma dependência HIGH foi aceita por relaxamento de gate.

## Estado técnico por frente

### Código / CI

**CODE-READY.**

- nenhuma PR corretiva aberta;
- baseline pós-merge com fast + heavy verdes;
- nenhuma regressão conhecida pendente de código no escopo das auditorias já tratadas.

### Segurança de aplicação

**CODE-READY; ADMIN ACTIONS permanecem separadas.**

- F5-08 fechado;
- SCO same-origin não recebe `Authorization: Bearer`;
- commit SCORM usa capability curta HttpOnly;
- Dependency Review permaneceu fail-closed durante a atualização de Wrangler.

A rotação administrativa R2 de #500 não foi executada e continua sendo decisão de owner/admin.

### LMS / SCORM

**CODE-READY.**

- `scorm-again` 3.3.2 integrado;
- runtime SCORM endurecido;
- smoke LMS passou no heavy da baseline e no pós-merge.

### FRMS

**CÓDIGO/RASTREABILIDADE CORRIGIDOS; resta uma decisão de governança.**

A investigação de 2026-09-08 resolveu a antiga ambiguidade 3h/6h:

- Lei 13.475/2017, art. 38, trata de **interrupção de jornada fora da base** para as categorias aplicáveis;
- os limites são exclusivos: **superior a 3h e inferior a 6h**;
- #568 corrigiu runtime, testes, terminologia e rastreabilidade.

#570 removeu afirmações de que o modelo empresarial implementava Borbély calibrado ou ICAO Doc 9966.

O único ponto residual da #455 é `CICLO_EMBARCADO_DIA_MAX=15`:

- não foi encontrada fonte RBAC/CCT/IOGP/Petrobras que estabeleça esse valor como limite universal para aeronautas de táxi aéreo offshore;
- o material sindical revisado usa outro enquadramento de missão e não valida 15 dias;
- o valor permanece **parâmetro interno configurável de triagem**, não requisito regulatório;
- falta aprovação governada do operador/model owner ou substituição por política formalmente aprovada.

Nenhuma fonte externa será inventada para fechar esse item.

### eDB — semântica

**Reduzido a um blocker material de AW139 + dependência externa ANAC.**

Resolvido:

- `starts` = acionamentos de motor; não é ciclo regulatório;
- IFR real/simulado para Costa do Sol: MGO Rev.14 diferencia `IFR-R` e `IFR-C`;
- S-76C: o PMA Costa do Sol PRG-MNT-001 Rev.04 estabelece **1 pouso = 1 ciclo de aeronave** e ciclos de motor via **DECU**;
- discrepância técnica estruturada, ledger e fail-closed já existem.

Ainda aberto na #91:

- fonte aprovada Costa do Sol/OEM para a semântica/origem de ciclos do **AW139**;
- a regra S-76C não pode ser generalizada por heurística para outro modelo ou tenant.

Ainda aberto na #93:

- contrato/OpenAPI oficial vigente da ANAC;
- ambiente de homologação e credenciais/escopos oficiais.

Até essas fontes existirem, os campos afetados continuam fail-closed.

### MRO / Controle de Voos / Escalas

**CODE-READY no escopo das correções integradas.**

A visão mensal integrada mantém o filtro de Tripulação em todas as seis fontes. Os achados residuais de layout que exigem prova visual autenticada pertencem à #496, não a código conhecido pendente.

### Health / observabilidade

**INSTRUMENTAÇÃO INTERNA PRESENTE; PROVA EXTERNA PENDENTE.**

#493 continua exigindo evidência provider-side/runtime de:

- monitor independente ativo;
- destino de alerta;
- entrega efetiva do alerta.

Documentação de configuração desejada não é tratada como prova operacional.

### Dados históricos / integridade

**#414 permanece fail-closed.**

Os snapshots versionados disponíveis são anteriores ao incidente 0435 e não identificam com segurança as 18 linhas afetadas. Nenhum repair heurístico deve ser executado.

## Pendências realmente externas / governadas

### #500 — R2 / credenciais

**ADMIN-BLOCKED.**  
Exige rotação/revogação no provedor, atualização de segredos e decisão sobre tratamento de histórico. Não executar automaticamente.

### #496 — staging UX autenticado

**STAGING-PROOF-PENDING.**  
Faltam provas autenticadas residuais no mesmo SHA de release. Os workflows relevantes são governados por `workflow_dispatch`; o conector GitHub disponível nesta execução não expõe criação de dispatch. Reexecutar run antigo validaria SHA antigo e produziria evidência inválida.

### #493 — monitor externo

**OPS-PROOF-PENDING / ADMIN-BLOCKED.**  
Requer prova real no provedor/canal externo.

### #455 — FRMS 15 dias

**GOVERNANCE-PENDING.**  
O valor é hoje política interna do modelo de triagem e precisa de aprovação formal do responsável pela política/modelo ou nova revisão governada.

### #414 — incidente 0435

**AUTHORITATIVE-DATA-PENDING.**  
Requer fonte histórica autoritativa capaz de identificar as 18 linhas exatas.

### #265 — FOLGA Costa do Sol

**PRODUCTION-WRITE-PENDING.**  
Código e testes existem. A configuração efetiva do tenant é write autenticado de produção e requer autorização operacional específica, seguido de readback e pós-condições.

### #93 — ANAC eDB

**EXTERNAL-CONTRACT-PENDING.**  
Requer OpenAPI/contrato vigente, homologação e credenciais oficiais.

### #91 — ciclos AW139

**AUTHORITATIVE-MAINTENANCE-SOURCE-PENDING.**  
IFR e S-76C foram resolvidos; falta a fonte aprovada aplicável ao AW139.

## Decisão técnica atual

**CODE-READY / CI-GREEN / OPERATIONALLY BLOCKED FOR UNCONDITIONAL RELEASE**

A baseline funcional `ee2b7e83ec136f13279c59bc964380202b19f8f2` está sem PR corretiva aberta conhecida e passou fast + heavy antes e depois da última integração.

Isso não equivale a autorização para executar indiscriminadamente ações administrativas ou writes de produção.

Antes de um release real, devem ser satisfeitos ou formalmente aceitos, conforme o escopo do release:

1. staging smoke autenticado no **mesmo release code SHA**;
2. confirmação de backup/recovery point e critérios de rollback;
3. resolução ou aceitação formal dos bloqueios operacionais pertinentes;
4. autorização explícita para qualquer write de produção, migration, rotação de segredo ou mudança administrativa.

Os itens #91/#93 só bloqueiam a promoção do eDB para integração regulatória oficial; eles não devem ser artificialmente tratados como regressão de módulos não-eDB já code-ready.

Nenhum blocker deve ser transformado em PASS por inferência, reutilização de evidência de SHA anterior ou relaxamento de gate.
