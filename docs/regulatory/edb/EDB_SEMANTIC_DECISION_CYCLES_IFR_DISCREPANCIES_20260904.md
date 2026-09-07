# eDB — decisão semântica fail-closed para ciclos, IFR e discrepâncias técnicas

Data: 2026-09-04  
Atualização de rastreabilidade: 2026-09-07  
Escopo: shadow eDB / Controle de Voos  
Status: decisão técnica de fonte; não constitui autorização/homologação ANAC.

## Fontes regulatórias

A Resolução ANAC nº 773/2025, vigente desde 01/01/2026, exige no registro de cada voo:

- totais de pousos **e ciclos** como informações distintas (art. 6º, V);
- tempo IFR **real e simulado** (art. 6º, VII);
- discrepâncias técnicas **e a pessoa que as detectou** (art. 6º, XIII);
- registro posterior das ações corretivas ou da autorização para ação corretiva retardada pelo responsável pelo retorno ao serviço (art. 8º);
- integridade do registro e correções evidenciadas sem apagar a informação anterior (art. 3º).

A mesma Resolução 773/2025 também estabelece, no art. 10, parágrafo único, que registros digitais assinados pelo piloto em comando devem ser também assinados pelo operador (ou pessoa formalmente designada) em até **15 dias para operadores RBAC 135**. Isso é requisito de lifecycle/assinatura do eDB e deve permanecer separado da semântica dos campos operacionais.

Fonte oficial:

- https://www.anac.gov.br/assuntos/legislacao/legislacao-1/resolucoes/2025/resolucao-773

A Resolução ANAC nº 458/2017 exige que registros eletrônicos preservem integridade, auditabilidade e correções identificáveis, sem permitir alteração silenciosa de conteúdo assinado.

A IS 91-015B também é relevante para a semântica de ciclos sob a ótica de manutenção. Ela registra que o Diário de Bordo é referência oficial para horas de voo e ciclos escriturados nas cadernetas de célula, motor e hélice e, de forma importante, reconhece que horas/ciclos de operação de motor ou outros componentes podem depender das definições constantes dos **manuais dos fabricantes**.

Fonte oficial:

- https://www.anac.gov.br/assuntos/legislacao/legislacao-1/iac-e-is/is/is-91-015

Essa rastreabilidade reforça que o AirTrust não deve criar um valor regulatório de ciclo por aproximação operacional quando a definição aplicável ao equipamento/componente não está explicitamente disponível.

## Decisão 1 — `cv_voo_etapas.starts` não é ciclo

A documentação canônica do schema de Controle de Voos define `starts` como **acionamentos de motor**.

Portanto:

- não projetar `starts` em `draft.legs[].cycles`;
- deixar `cycles = null` enquanto não existir uma fonte operacional que declare ciclos com essa semântica;
- quando `starts` estiver presente, emitir finding sanitizado `CYCLES_SOURCE_SEMANTICS_UNCONFIRMED`.

Uma documentação histórica que tratou `starts` como proxy de ciclos não é suficiente para promover essa equivalência para o eDB regulatório.

### Refinamento regulatório de 2026-09-07

A Resolução 773 exige que **pousos e ciclos** sejam informados separadamente; portanto a existência de um número de pousos não autoriza copiar esse valor para `cycles`. A IS 91-015B liga ciclos ao controle de manutenção e admite dependência de definição do fabricante para motor/componente. Assim, a fonte futura de `cycles` deve ser uma destas, conforme aplicabilidade real:

1. contador/campo operacional explicitamente definido pelo operador e pelo programa de manutenção como ciclo aplicável ao equipamento;
2. registro de manutenção/aircraft status cuja semântica esteja documentada;
3. regra derivada de manual do fabricante ou documentação aprovada que defina inequivocamente o evento contado como ciclo.

Sem uma dessas fontes, `cycles` permanece `null` e o AirTrust deve continuar fail-closed.

## Decisão 2 — `tempo_ifr` não identifica IFR real versus simulado

O campo atual `tempo_ifr` contém duração IFR sem classificação regulatória entre real e simulado.

Portanto:

- não projetar `tempo_ifr` em `ifrActualMinutes`;
- não inferir `ifrSimulatedMinutes = 0`;
- deixar ambos os campos regulatórios sem preenchimento até existir fonte classificada;
- quando `tempo_ifr` estiver presente, emitir finding `IFR_CLASSIFICATION_REQUIRED`.

A soma ou distribuição entre IFR real/simulado não pode ser inferida.

### Refinamento regulatório de 2026-09-07

A Resolução 773 usa expressamente a dupla **IFR real e simulado**. Ela não autoriza que um campo legado agregado seja presumido como IFR real e tampouco autoriza concluir que ausência de marcação de simulado significa zero. Logo, a captura futura deve preservar a classificação na origem, no momento do lançamento operacional ou por outra fonte estruturada com proveniência equivalente.

## Decisão 3 — `cv_rdv_operacional.divergencias` não é discrepância técnica estruturada

`cv_rdv_operacional.divergencias` é texto livre operacional. Ele não garante, por estrutura:

- autoria/detector;
- vínculo imutável à revisão final do voo;
- ação corretiva;
- autorização para ação retardada;
- aprovação para retorno ao serviço;
- trilha append-only.

Portanto:

- não projetar esse texto em `technicalDiscrepancySummary`;
- emitir finding `TECHNICAL_DISCREPANCY_STRUCTURED_SOURCE_REQUIRED` quando houver conteúdo;
- a fonte regulatória futura deve usar o modelo estruturado de discrepância/manutenção/RTS, sem apagar o registro original da tripulação.

## Postura de implementação

Enquanto as fontes estruturadas não existirem, o shadow eDB deve falhar fechado:

- `cycles = null`;
- `ifrActualMinutes = null`;
- `ifrSimulatedMinutes = null`;
- `technicalDiscrepancySummary = null`.

Os gaps devem permanecer visíveis por códigos sanitizados e pela validação de completude. Nenhuma dessas lacunas autoriza promover o shadow eDB para registro oficial.

## Consequência para a issue #91

A pesquisa normativa de 2026-09-07 reduz a ambiguidade jurídica, mas **não fecha** a issue #91:

- está confirmado que pousos, ciclos, IFR real e IFR simulado são campos regulatórios distintos;
- está confirmado que `starts` não pode ser promovido para `cycles` apenas por conveniência;
- a IS 91-015B reforça que ciclos podem depender da definição aplicável de fabricante/manutenção;
- ainda falta identificar, no conjunto real de fontes AirTrust/SIGVOOS/operador, o campo ou regra aprovada que produza o valor de ciclo para cada aeronave/equipamento;
- ainda falta uma fonte operacional que capture separadamente IFR real e IFR simulado.

Nenhuma alteração de runtime deve ser feita até essas fontes existirem.

## Dependências remanescentes

- definição e captura operacional explícita de ciclos por aeronave/equipamento;
- captura separada de IFR real e IFR simulado;
- integração da fonte estruturada de discrepância técnica/manutenção/RTS;
- contrato oficial vigente da API DBE/ANAC antes de qualquer adaptação externa;
- lifecycle de assinatura digital compatível com o prazo regulatório aplicável ao operador RBAC 135.
