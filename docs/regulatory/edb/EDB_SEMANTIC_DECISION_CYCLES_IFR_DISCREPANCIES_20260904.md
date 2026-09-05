# eDB — decisão semântica fail-closed para ciclos, IFR e discrepâncias técnicas

Data: 2026-09-04  
Escopo: shadow eDB / Controle de Voos  
Status: decisão técnica de fonte; não constitui autorização/homologação ANAC.

## Fontes regulatórias

A Resolução ANAC nº 773/2025, vigente desde 01/01/2026, exige no registro de cada voo:

- totais de pousos **e ciclos** como informações distintas (art. 6º, V);
- tempo IFR **real e simulado** (art. 6º, VII);
- discrepâncias técnicas **e a pessoa que as detectou** (art. 6º, XIII);
- registro posterior das ações corretivas ou da autorização para ação corretiva retardada pelo responsável pelo retorno ao serviço (art. 8º);
- integridade do registro e correções evidenciadas sem apagar a informação anterior (art. 3º).

A Resolução ANAC nº 458/2017 exige que registros eletrônicos preservem integridade, auditabilidade e correções identificáveis, sem permitir alteração silenciosa de conteúdo assinado.

## Decisão 1 — `cv_voo_etapas.starts` não é ciclo

A documentação canônica do schema de Controle de Voos define `starts` como **acionamentos de motor**.

Portanto:

- não projetar `starts` em `draft.legs[].cycles`;
- deixar `cycles = null` enquanto não existir uma fonte operacional que declare ciclos com essa semântica;
- quando `starts` estiver presente, emitir finding sanitizado `CYCLES_SOURCE_SEMANTICS_UNCONFIRMED`.

Uma documentação histórica que tratou `starts` como proxy de ciclos não é suficiente para promover essa equivalência para o eDB regulatório.

## Decisão 2 — `tempo_ifr` não identifica IFR real versus simulado

O campo atual `tempo_ifr` contém duração IFR sem classificação regulatória entre real e simulado.

Portanto:

- não projetar `tempo_ifr` em `ifrActualMinutes`;
- não inferir `ifrSimulatedMinutes = 0`;
- deixar ambos os campos regulatórios sem preenchimento até existir fonte classificada;
- quando `tempo_ifr` estiver presente, emitir finding `IFR_CLASSIFICATION_REQUIRED`.

A soma ou distribuição entre IFR real/simulado não pode ser inferida.

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

## Dependências remanescentes

- definição e captura operacional explícita de ciclos;
- captura separada de IFR real e IFR simulado;
- integração da fonte estruturada de discrepância técnica/manutenção/RTS;
- contrato oficial vigente da API DBE/ANAC antes de qualquer adaptação externa.
