# eDB — decisão semântica fail-closed para ciclos, IFR e discrepâncias técnicas

Data original: 2026-09-04  
Última atualização de rastreabilidade: 2026-09-08  
Escopo: shadow eDB / Controle de Voos  
Status: decisão técnica de fonte; não constitui autorização/homologação ANAC.

## Fontes regulatórias

A Resolução ANAC nº 773/2025, vigente desde 01/01/2026, exige no registro de cada voo, conforme aplicável:

- totais de pousos e ciclos como informações distintas (art. 6º, V);
- tempo IFR real e simulado (art. 6º, VII);
- discrepâncias técnicas e a pessoa que as detectou (art. 6º, XIII);
- registro posterior das ações corretivas ou da autorização para ação corretiva retardada pelo responsável pelo retorno ao serviço (art. 8º);
- integridade do registro e correções evidenciadas sem apagar a informação anterior (art. 3º).

A mesma Resolução 773/2025 também estabelece, no art. 10, parágrafo único, que registros digitais assinados pelo piloto em comando devem ser também assinados pelo operador, ou pessoa formalmente designada, em até 15 dias para operadores RBAC 135. Esse requisito de lifecycle/assinatura é independente da semântica dos campos operacionais.

Fonte oficial:

- https://www.anac.gov.br/assuntos/legislacao/legislacao-1/resolucoes/2025/resolucao-773

A IS 91-015B trata o Diário de Bordo como referência oficial para horas e ciclos escriturados nos registros de célula, motor e hélice e reconhece que a contagem aplicável a motor/componentes pode depender das definições dos manuais dos fabricantes.

Fonte oficial:

- https://www.anac.gov.br/assuntos/legislacao/legislacao-1/iac-e-is/is/is-91-015

## Decisão 1 — `cv_voo_etapas.starts` não é ciclo regulatório

A documentação canônica do schema de Controle de Voos define `starts` como acionamentos de motor. A Resolução 773 exige pousos e ciclos como campos distintos, e a fonte de manutenção pode definir ciclos de célula e de motor por regras diferentes.

Portanto:

- não projetar genericamente `starts` em `cycles`;
- não projetar genericamente pousos em `cycles` sem regra aprovada por aeronave/operação;
- deixar `cycles = null` quando não existir uma fonte operacional/manutenção explicitamente aprovada para o modelo;
- manter finding sanitizado enquanto a semântica aplicável não estiver comprovada.

### S-76C — fonte da Costa do Sol confirmada em 2026-09-08

A Costa do Sol publica o **PRG-MNT-001 — Programa de Manutenção Aeronave S-76C, Rev.04, 11/01/2021**. O item A.8 estabelece explicitamente:

- A.8.1: para ciclos da aeronave, **um pouso corresponde a um ciclo**;
- A.8.2: ciclos dos motores são contabilizados automaticamente pela **Digital Engine Control Unit (DECU)**;
- A.9: ciclo de motor é a operação envolvendo partida, aceleração para potência de decolagem e corte do motor.

Fonte do operador:

- https://dradd.com.br/media/98f13708210194c475687be6106a3b84/2021/01/28/PMA_COSTA_SOL_S-76C%20rev%2004.pdf

Consequência:

- a semântica de ciclo de **aeronave S-76C da Costa do Sol** está resolvida: landing count é a fonte aprovada para o contador de ciclos da aeronave;
- o ciclo de motor S-76C deve vir da DECU/registro de manutenção correspondente, nunca do `starts` legado do AirTrust;
- essa regra é **operator/model scoped** e não pode ser generalizada para AW139 ou outro tenant;
- até existir vínculo explícito e governado entre tenant/modelo e essa política de fonte no pipeline regulatório, o shadow genérico deve continuar fail-closed em vez de aplicar a regra por nome de aeronave.

### AW139 — ainda sem fonte Costa do Sol suficiente

A revisão de fontes públicas e do acervo disponível localizou referências Leonardo/AMPI e PT6C-67C que demonstram que há contagens específicas de ciclo para célula, motor e componentes, mas não localizou o **PMA vigente da Costa do Sol para AW139** ou outra fonte operator/OEM aplicável que autorize um mapeamento único para o campo eDB `cycles`.

Portanto:

- não aplicar `cycles = starts`;
- não aplicar `cycles = landings`;
- não transportar a regra S-76C para AW139;
- manter AW139 `cycles` fail-closed até a fonte aprovada ser incorporada.

## Decisão 2 — IFR real versus simulado

O legado `tempo_ifr` continua sendo uma duração IFR agregada, sem classificação confiável entre real e simulado. Ele não deve ser retroativamente dividido nem presumido como IFR real.

A semântica operacional da Costa do Sol, porém, já está estabelecida no MGO `MNL-OPS-001` Rev.14, Seção 10:

- `IFR-R` = IFR real;
- `IFR-C` = IFR sob capota, correspondente ao campo regulatório de IFR simulado.

Consequência:

- a **semântica** IFR da #91 está resolvida para a Costa do Sol;
- futuras fontes estruturadas podem mapear `IFR-R -> ifrActualMinutes` e `IFR-C -> ifrSimulatedMinutes`;
- o `tempo_ifr` legado agregado permanece evidência não classificada e não satisfaz nenhum dos dois campos isoladamente;
- ausência de IFR-C não autoriza inferir automaticamente zero sem uma fonte estruturada que expresse essa ausência.

## Decisão 3 — `cv_rdv_operacional.divergencias` não é discrepância técnica estruturada

O texto livre operacional não garante, por estrutura:

- autoria/detector;
- vínculo imutável à revisão final do voo;
- ação corretiva;
- autorização para ação retardada;
- aprovação para retorno ao serviço;
- trilha append-only.

Portanto, o texto livre do RDV não deve ser promovido para o campo regulatório de discrepância técnica.

O modelo estruturado de discrepância/manutenção/RTS já existente no AirTrust permanece a fonte correta para essa evolução.

## Postura de implementação

A regra geral continua fail-closed:

- sem fonte aprovada de ciclo para o modelo/operador: `cycles = null`;
- sem fonte IFR classificada: `ifrActualMinutes = null` e `ifrSimulatedMinutes = null`;
- texto livre de RDV não vira discrepância técnica estruturada;
- nenhuma inferência silenciosa pode remover gaps regulatórios.

Uma regra específica de operador/modelo só pode preencher campo regulatório quando o vínculo de política e a proveniência estiverem explícitos e testados. A existência de uma regra documental válida para S-76C não autoriza aplicá-la por heurística de string de modelo em ambiente multi-tenant.

## Consequência para a issue #91

Após a revisão de 2026-09-08:

- `starts` está confirmado como acionamentos de motor e não como ciclo regulatório;
- IFR real/simulado está semanticamente resolvido para a Costa do Sol pelo MGO;
- S-76C está semanticamente resolvido pelo PMA da Costa do Sol: pouso = ciclo de aeronave; ciclo de motor = DECU;
- o bloqueio substantivo residual é o **AW139**: falta a fonte aprovada Costa do Sol/OEM que defina a origem/contagem aplicável de ciclo de aeronave e, quando requerido, de motor;
- o pipeline genérico deve permanecer fail-closed até que essa fonte seja incorporada de maneira tenant/model scoped.

## Dependências remanescentes relacionadas ao eDB

- fonte aprovada e vínculo estrutural de ciclos AW139;
- contrato oficial vigente da API DBE/ANAC antes de adaptação externa;
- lifecycle de assinatura digital compatível com o prazo regulatório aplicável ao operador RBAC 135;
- execução de homologação somente após contrato/credenciais oficiais.

Nenhuma conclusão deste documento autoriza transmissão à ANAC, deploy, migration ou write produtivo.
