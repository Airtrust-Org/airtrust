# AirTrust — Alinhamento funcional do blueprint com o primeiro operador requerente

> **Data:** 2026-08-02 (BRT)  
> **Blueprint relacionado:** `EDB_FUNCTIONAL_PRODUCT_BLUEPRINT_20260802.md`  
> **Fonte integrada:** PR #718, merge `39478199fef7285861cd5b6f8708f297552a467c`  
> **Status:** alinhamento funcional canônico quanto à identificação do primeiro requerente; demais dados operacionais permanecem pendentes  
> **Natureza:** documentação; sem protocolo, shadow pilot, código, migration, ambiente ou ativação

## 1. Decisão incorporada

A Costa do Sol Táxi Aéreo S.A. foi registrada na `main` como o primeiro operador requerente planejado para o processo do Diário de Bordo Digital AirTrust.

Identificação atualmente documentada:

- razão social verificada: `COSTA DO SOL TAXI AEREO S.A.`;
- CNPJ: `11.223.764/0001-62`;
- COA publicado em 2023: `2013-05-00AO-01-04`, revisão 33;
- referência interna AirTrust: `empresa_id = 6`.

A referência de tenant é dado técnico de vinculação interna. Ela não substitui a identificação legal do operador, não deve aparecer como única identificação em registros regulados e não autoriza consulta sem validação contextual de tenant.

## 2. O que deixou de ser decisão pendente

No blueprint, o item genérico “identificação do primeiro operador” deve ser considerado resolvido para a fase de preparação do FOP 200.

Isso permite direcionar as próximas atividades de diagnóstico e preparação para a Costa do Sol, sem transformar placeholders em fatos confirmados.

## 3. O que continua pendente

Permanecem obrigatoriamente abertos:

- revisão atual do COA;
- Especificações Operativas vigentes;
- representantes legais e técnicos;
- responsáveis por Operações, Manutenção, Segurança Operacional, Treinamento, TI e Compliance;
- contatos institucionais;
- frota e matrículas candidatas;
- fabricante, modelo e números de série;
- bases e tipos de missão;
- manutenção própria e terceirizada;
- fluxo atual do Diário de Bordo em papel;
- escopo e janela do shadow pilot;
- dispositivos e conectividade;
- manuais reais e revisões vigentes;
- agenda de reunião prévia;
- confirmação da estratégia de protocolo pela ANAC.

Nenhum desses campos pode ser preenchido por inferência a partir do tenant, seeds, migrations, dados históricos ou conhecimento informal.

## 4. Impacto nas jornadas funcionais

### 4.1 Diagnóstico

O serviço deve abrir um caso de implantação específico para a Costa do Sol e executar o diagnóstico previsto no pacote da PR #710.

A abertura do caso não significa:

- adesão contratual concluída;
- autorização interna do operador;
- protocolo realizado;
- aceitação do shadow pilot;
- autorização de uso oficial.

### 4.2 Preparação do FOP 200

Os artefatos já adaptados devem ser tratados como minuta controlada. Antes do protocolo, devem ser reconfirmados os dados oficiais e preenchidos os representantes, contatos, frota, escopo pretendido e agenda.

### 4.3 Shadow pilot

A identificação do operador não inicia o piloto. O shadow pilot depende de:

- aprovação interna do protocolo;
- definição de aeronaves, bases e participantes;
- papel confirmado como fonte oficial;
- treinamento;
- critérios de interrupção;
- preparação técnica e tenant isolation;
- tratamento de dados e evidências;
- alinhamento regulatório aplicável.

### 4.4 Cutover

Nenhum estado `authorized_pending_migration` ou `official` pode ser alcançado apenas porque o operador foi identificado. O cutover continua dependente do ateste/aceitação do software, alteração aplicável das EO, manuais, treinamento, demonstrações, ato autorizativo e reconciliação por aeronave.

## 5. Impacto no produto

O produto deve suportar a implantação para um operador real sem introduzir customização irreversível ou regras codificadas por nome, CNPJ ou `empresa_id`.

Regras:

1. a Costa do Sol é a primeira aplicação planejada, não uma exceção embutida no domínio;
2. contratos, estados, RBAC e schema devem continuar reutilizáveis por outros operadores;
3. configuração deve ser por escopo regulatório, operador e aeronave;
4. snapshots oficiais futuros devem guardar identificação legal, não apenas FK ou tenant;
5. nenhuma feature flag genérica de `empresa_id = 6` pode equivaler a autorização regulatória;
6. dados reais só podem ser usados no ambiente e finalidade autorizados;
7. o pacote de implantação deve distinguir campos confirmados, placeholders e pendências.

## 6. Impacto no serviço profissional

A fase seguinte do serviço deve produzir, no mínimo:

- termo de abertura do diagnóstico;
- lista de contatos e responsáveis;
- inventário de frota e bases;
- inventário de manuais;
- mapa do processo atual em papel;
- mapa de integrações e fontes;
- inventário de dispositivos e conectividade;
- matriz de manutenção própria/terceira;
- análise inicial de gaps;
- definição proposta do escopo do primeiro shadow pilot;
- registro de decisões e pendências para o FOP 200.

Esses entregáveis pertencem ao diagnóstico do operador. Não devem ser confundidos com desenvolvimento do núcleo regulado.

## 7. Dependências com as PRs atuais

- **#710 — pacote de implantação:** fornece os templates e o método de trabalho que deverão ser instanciados para a Costa do Sol.
- **#711 — preview read-only:** poderá apoiar demonstração técnica futura, mas não deve ser ativado para dados reais sem autorização de ambiente e acesso.
- **#713 — motor de divergências:** poderá produzir métricas sanitizadas no piloto, depois da definição do protocolo específico.
- **#714 — readiness D1/R2:** orienta o futuro schema, mas não é necessário para iniciar o diagnóstico documental.
- **#715 — situação técnica shadow:** fornece linguagem e validações para cenários técnicos, ainda sem efeito oficial.
- **#717 — blueprint:** consolida jornadas, estados, responsabilidades e backlog.

## 8. Próximo gate funcional

O próximo gate não é desenvolver migration nem iniciar shadow com dados reais.

É concluir o **diagnóstico verificável da Costa do Sol**, preenchendo os dados ainda ausentes e produzindo uma proposta de escopo para a reunião prévia e para o futuro shadow pilot.

Critério de saída:

- operador e responsáveis confirmados;
- frota e bases inventariadas;
- processo em papel mapeado;
- manuais identificados;
- fontes e integrações mapeadas;
- manutenção e dispositivos avaliados;
- riscos iniciais registrados;
- perguntas do FOP 200 atualizadas;
- nenhuma capacidade não existente apresentada como pronta.

## 9. Limites preservados

Este alinhamento não:

- protocola FOP 200;
- afirma revisão vigente do COA ou EO;
- seleciona aeronave;
- inicia shadow pilot;
- autoriza dados reais;
- cria configuração de tenant;
- cria migration;
- executa D1/R2;
- altera frontend ou Worker;
- realiza deploy;
- substitui o Diário de Bordo em papel;
- afirma aprovação, ateste, aceitação ou autorização da ANAC.
