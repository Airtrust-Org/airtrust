# AirTrust — Matriz preliminar de alterações de manuais RBAC 135 para eDB

> **Data:** 2026-08-02 (BRT)  
> **SHA-base:** `d27d72178a75664ff0fb8ac8f18768b88b8112ca`  
> **Status:** planejamento; validar com o operador e na reunião prévia  
> **Dependência:** baseline regulatório da PR #688

## 1. Objetivo

Antecipar o trabalho documental necessário para que o primeiro operador RBAC 135 incorpore o Diário de Bordo Digital em seus procedimentos reais.

A ANAC informa que os manuais revisados devem ser protocolados em processo separado e apenas referenciados no FOP 219. A IS nº 135-002 Revisão G, publicada em 16/07/2026, estabelece a estrutura atual do Manual Geral de Operações — MGO e prevê a Seção 10 — Diário de Bordo. O capítulo de Diário de Bordo é aprovado quando o modelo difere do modelo oficial ou dispositivo que o substitua. A mesma IS exige procedimentos de uso de EFB, atualização de aplicativos, backup, guarda e reporte de problemas.

Este documento não pressupõe os nomes ou a estrutura documental do operador. A matriz deverá ser adaptada ao Manual Geral de Empresa — MGE efetivamente aprovado/aceito.

## 2. Fontes oficiais

- Resolução ANAC nº 773/2025;
- Resolução ANAC nº 458/2017;
- Portaria nº 3.220/SPO/SAR compilada;
- IS nº 119-004 vigente;
- IS nº 135-002 Revisão G;
- IS nº 91-002D;
- IS nº 91.21-001A;
- página oficial “Registros de Manutenção”;
- serviço oficial de alteração de certificação/EO RBAC 135.

Referências:

- https://www.anac.gov.br/assuntos/legislacao/legislacao-1/iac-e-is/is/is-135-002
- https://www.gov.br/anac/pt-br/assuntos/regulados/programa-de-transformacao-digital/registros-de-manutencao
- https://www.gov.br/pt-br/servicos/solicitar-alteracao-de-certificado-de-operador-aereo-ou-especificacoes-operativas-de-autorizatario

## 3. Princípios de redação

- descrever o procedimento operacional, não apenas a funcionalidade do AirTrust;
- atribuir responsabilidade a funções do operador;
- separar fonte oficial, shadow mode e contingência;
- refletir exatamente os bloqueios e estados do sistema;
- não prometer capacidade ainda não implementada ou testada;
- não usar texto genérico de fornecedor como substituto do procedimento do operador;
- referenciar telas, formulários e anexos controlados somente quando sua revisão estiver sincronizada;
- tratar mudança de software que afete método de cumprimento como mudança controlada;
- preservar coerência entre MGO, manutenção, treinamento, SGSO, MEL e demais documentos.

## 4. Matriz por manual e seção

<!-- prettier-ignore -->
| Documento/seção | Conteúdo a incluir ou revisar | Responsável primário | Evidência AirTrust | Aprovação/aceitação a confirmar | Gate |
|---|---|---|---|---|---|
| MGO — Seção 01 — Prefácio | Inserir eDB no sistema de manuais; vigência; controle de revisão; documentos associados; distribuição eletrônica | Diretor de Operações | release manifest; versão do método; lista de documentos | Aceitação geral; confirmar impacto do capítulo aprovado | P1 |
| MGO — Seção 02 — Estrutura e organização | Responsáveis por guarda, administração, designações, suporte, segurança, manutenção e contingência | Gestor responsável/DO | matriz de papéis; designações; RBAC | Confirmar designações formais | P0 |
| MGO — Seção 03 — Controle operacional | Uso do eDB para iniciar, continuar, desviar e terminar voo; disponibilidade de informação; coordenação em falhas | Diretor de Operações | estados, bloqueios, painel de pendências | Capítulo aprovado conforme IS 135-002G | P0 |
| MGO — Seção 04 — Tripulação | Identificação, CANAC, função por etapa, troca de PIC, revisão e assinatura ao final do voo/jornada | Diretor de Operações/Chefia de Pilotos | contratos de tripulação; assinatura PIC | Método de assinatura ANAC | P0 |
| MGO — Seção 05 — Jornada | Momento de encerramento e assinatura da jornada; contingência quando a jornada cruza data/fuso | Diretor de Operações | estados de jornada e pendências | Alinhar RBAC 117/FRMS sem integrar registros indevidos | P1 |
| MGO — Seção 09 — Combustível e fluidos | Responsável, unidade, abastecimento, consumo, divergências e fonte do dado | Diretor de Operações/Manutenção | projeção de combustível e validações | Confirmar unidades/frota | P1 |
| MGO — Seção 10 — Diário de Bordo | Procedimento completo de abertura, preenchimento, assinatura, correção, encerramento, guarda, fiscalização e contingência | Diretor de Operações | domínio eDB; volumes; records core | Capítulo de aprovação | P0 |
| MGO — Seção 11 — Procedimentos de voo/EFB | Uso do PED no planejamento e fases do voo; atualização; backup; guarda; reporte; não interferência | Diretor de Operações | inventário PED; pacote offline; versão | Aprovação/aceitação EFB/PED a confirmar | P0 |
| MGO — Seção 12 — Emergências | Indisponibilidade total, corrupção, perda/furto de PED, comunicação, reconstituição e continuidade | Diretor de Operações/GSO | runbooks; alertas; DR | Procedimento regulatório de incidente | P0 |
| Manual/Programa de manutenção | Situação técnica, discrepâncias, ação corretiva/retardada, retorno ao serviço, terceiros e registros | Diretor de Manutenção | technical status; RTS; auditoria | Aprovação/aceitação SAR/SPO a confirmar | P0 |
| MGM ou documento equivalente | Administração de dados técnicos; licenças; organizações terceiras; interface com AirTrust | Diretor de Manutenção | RBAC manutenção; provider de assinatura | Confirmar documento e autoridade analista | P0 |
| Programa de treinamento | Treinamento inicial, diferenças, recorrente e avaliação de competência de todos os perfis | Chefias de treinamento | ambiente sintético; trilha de conclusão | Aceitação conforme processo do operador | P1 |
| Manual/Plano de resposta a emergências | Perda/corrupção, indisponibilidade prolongada, boletim de ocorrência, comunicação à ANAC | GSO/gestor responsável | incident runbook; reconstitution case | Confirmar integração ao PRE/SGSO | P0 |
| SGSO | Perigos da transição, reporte, mudança, indicadores e garantia de segurança | GSO | shadow divergences; métricas sanitizadas | Processo de gestão de mudança | P1 |
| MEL/NEF/ACR, se aplicável | Relação entre PED/eDB, equipamento reserva, indisponibilidade e decisão de despacho | Manutenção/Operações | device status; contingency | Confirmar se item deve constar da MEL/NEF | P0 |
| Manual de segurança da informação | IAM, chaves, dispositivos, incidentes, terceiros, backup, retenção e change control | Segurança/TI | threat models; controles; CI/CD | Evidência do relatório Res. 458 | P0 |
| Manual do administrador eDB | Cadastro, prerrogativas, designações, revogação, frota, volume e fiscalização | Operador/TI | admin workflows | Anexo controlado; confirmar protocolo | P1 |
| Manual do usuário eDB | Fluxo por perfil, mensagens, bloqueios, assinatura, correção, offline e suporte | Operações/Treinamento | UI e procedimentos | Deve refletir build protocolado | P1 |
| Manual de fiscalização | Acesso, pesquisa, exportação, verificação e contato de suporte | Compliance/TI | inspection mode; verifier | Forma de acesso a confirmar com ANAC | P0 |
| Plano de continuidade/DR | Backup, RTO/RPO, restauração, corrupção, reconstituição, portabilidade e encerramento | TI/gestor responsável | drills e relatórios | Avaliação independente | P0 |
| Contratos com fornecedores | SLA, retenção, portabilidade, incidente, suboperadores, encerramento e evidências | Jurídico/TI | contratos Cloudflare/provider | Avaliação Res. 458/LGPD | P1 |

## 5. Conteúdo mínimo da Seção 10 — Diário de Bordo

### 5.1 Aplicabilidade e fonte oficial

- operadores, aeronaves e matrículas abrangidos;
- referência à EO ou LOA;
- data do cutover;
- distinção entre rascunho e registro oficial;
- proibição de dupla fonte oficial;
- tratamento das aeronaves não abrangidas.

### 5.2 Volumes

- numeração;
- abertura;
- saldos iniciais;
- mudança/cancelamento de marcas;
- encerramento;
- saldos finais;
- responsável e assinatura;
- volume corrente no PED.

### 5.3 Registro do voo

- identificação da aeronave e operador;
- tripulação e função;
- registro por etapa;
- quatro horários;
- tempos e pousos/ciclos;
- combustível e abastecimento;
- POB e carga;
- natureza;
- ocorrências e discrepâncias;
- validação e resolução de pendências.

### 5.4 Revisão e assinatura

- conteúdo apresentado ao PIC;
- ação deliberada;
- prazo ao fim do voo ou jornada;
- troca de tripulação;
- falha de credencial;
- assinatura da pessoa designada pelo operador em até 15 dias;
- relatório e escalonamento de pendências;
- proibição de assinatura automática por integração.

### 5.5 Correções

- quem pode iniciar;
- justificativa;
- preservação do original;
- nova versão e nova assinatura;
- identificação do registro substituído;
- exibição em fiscalização;
- correção durante indisponibilidade.

### 5.6 Situação técnica

- última intervenção;
- próxima intervenção;
- horas restantes;
- discrepâncias abertas;
- ações corretivas ou retardadas;
- retorno ao serviço;
- ciência do PIC;
- bloqueio quando a informação estiver ausente ou desatualizada.

### 5.7 PED e offline

- dispositivo principal e reserva;
- provisionamento;
- atualização;
- últimos 30 dias;
- sincronização antes da operação;
- funcionamento sem rede;
- pacote expirado ou corrompido;
- perda/furto/revogação;
- fases de voo permitidas;
- determinação de não interferência.

### 5.8 Guarda e fiscalização

- retenção;
- backup e restauração;
- detecção de corrupção;
- acesso da ANAC;
- impressão/exportação;
- verificação de assinatura;
- transferência de propriedade;
- migração para outro sistema;
- descontinuidade.

### 5.9 Incidente e reconstituição

- comunicação interna imediata;
- preservação de evidências;
- comunicação policial e à ANAC quando aplicável;
- fontes admitidas para reconstituição;
- aprovação e marcação do registro reconstituído;
- avaliação da condição de aeronavegabilidade;
- retorno controlado à operação.

## 6. Procedimentos EFB/PED na Seção 11

A IS nº 135-002G requer descrição operacional do uso de EFB, e não mera descrição do sistema. Incluir:

- uso no planejamento e em cada fase;
- instalação/suporte físico;
- brilho, energia e temperatura;
- atualização de aplicações e bases;
- versão mínima;
- backup e equipamento alternativo;
- guarda e reporte de problema;
- conectividade e modo avião;
- não interferência;
- operação degradada;
- treinamento;
- proibição de manipulação em fase crítica quando aplicável.

## 7. Matriz de perfis e treinamento

<!-- prettier-ignore -->
| Perfil | Conteúdo mínimo | Avaliação | Recorrência/gatilho |
|---|---|---|---|
| PIC | revisão, situação técnica, assinatura, correção, offline, contingência | cenário prático completo | mudança material; recorrente definido pelo operador |
| SIC/outros tripulantes | funções, consulta, reporte e contingência | cenário por função | mudança material |
| Coordenação/OCC | rascunhos, conflitos, pendências, suporte e escalonamento | exercício de jornada | mudança de workflow |
| Manutenção | discrepância, ação, RTS, licença e terceiro | cenário técnico | mudança de procedimento/provider |
| Designado do operador | contrassinatura, prazo, exceções e auditoria | fila e relatório | mudança regulatória |
| Administrador | usuários, dispositivos, frota, volume, revogação e acesso fiscal | laboratório sintético | mudança administrativa |
| Suporte/TI | incidentes, restauração, segurança e evidência | drill | pelo menos após mudança crítica |
| Auditor/fiscal interno | pesquisa, exportação, cadeia de versões e verificação | amostra completa | atualização do verificador |

## 8. Gestão de mudança

Toda revisão deve avaliar se altera:

- conteúdo canônico;
- assinatura;
- provider/certificado;
- offline;
- retenção;
- fiscalização;
- bloqueios operacionais;
- papéis e designações;
- procedimento de manutenção;
- dispositivo ou plataforma;
- escopo autorizado.

Mudança com impacto potencial no método de cumprimento deve permanecer inativa no modo oficial até avaliação regulatória.

## 9. Evidências para protocolo e demonstração

- lista de páginas efetivas e histórico de revisão;
- matriz requisito → manual → sistema → teste;
- aprovação interna das áreas responsáveis;
- treinamento e material didático;
- screenshots da versão congelada;
- scripts de demonstração;
- relatório do shadow mode;
- teste de PED/offline;
- drill de contingência e restauração;
- exemplo de registro, correção e exportação;
- lista de designados e prerrogativas;
- determinação de não interferência;
- declaração de coerência entre manuais e software.

## 10. Pendências para o FOP 200

1. Confirmar quais capítulos e manuais serão aprovados ou aceitos.
2. Confirmar se a Seção 10 do MGO será o documento principal do eDB.
3. Confirmar o documento principal para situação técnica e retorno ao serviço.
4. Confirmar necessidade de revisão de MEL/NEF/ACR.
5. Confirmar conteúdo mínimo de treinamento e demonstração.
6. Confirmar se manual de administração/fiscalização será protocolado como anexo controlado.
7. Confirmar forma de referenciar versões do SaaS nos manuais.
8. Confirmar rito para mudanças não materiais e materiais do software.

## 11. Próximo passo

Depois da reunião prévia:

1. substituir esta matriz preliminar pelo inventário real do MGE do operador;
2. atribuir responsável e revisão para cada documento;
3. abrir uma PR/documento por manual ou agrupamento aprovado;
4. manter os textos alinhados à versão demonstrada do software;
5. protocolar manuais em processo separado e referenciá-los no FOP 219.
