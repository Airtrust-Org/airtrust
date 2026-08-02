# AirTrust — Baseline Regulatório ANAC para Diário de Bordo Digital

> **Data:** 2026-08-02 (BRT)  
> **SHA-base:** `d27d72178a75664ff0fb8ac8f18768b88b8112ca`  
> **Natureza:** pesquisa regulatória e tradução técnica; não substitui manifestação da ANAC ou parecer jurídico  
> **Escopo:** eDB/Diário de Bordo Digital, inicialmente para operador RBAC 135

## 1. Conclusão executiva

O Controle de Voos do AirTrust contém parte relevante dos dados operacionais necessários ao eDB, mas ainda não constitui Diário de Bordo Digital oficial.

A implementação deve criar um domínio regulado separado, capaz de:

- preservar volumes, termos de abertura e encerramento;
- consolidar registros por etapa;
- guardar a situação técnica da aeronave;
- registrar discrepâncias e retorno ao serviço;
- suportar assinaturas eletrônicas e digitais conforme a Resolução nº 458;
- impedir alteração silenciosa do conteúdo assinado;
- funcionar em PED durante toda a operação, inclusive sem comunicação;
- manter os últimos 30 dias disponíveis na aeronave;
- fornecer apresentação e exportação para fiscalização;
- preservar o acervo durante toda a existência da aeronave e por 5 anos e um dia após o cancelamento da matrícula;
- permitir reconstituição controlada em caso de perda, extravio ou corrupção.

Existem dois processos regulatórios distintos e cumulativos:

1. **verificação/ateste do software**, demonstrando conformidade com a Resolução nº 458 para o escopo autorizado;
2. **autorização de uso pelo operador**, registrada em EO para operadores certificados sob o RBAC nº 119 ou em LOA para os demais casos.

Para RBAC 135, a página oficial de serviços da ANAC indica FOP 219, D-144-01, FAI e manuais revisados; se o software ainda não tiver sido atestado, também checklist da Resolução nº 458 e relatório de conformidade emitido por entidade competente. Reunião prévia é solicitada por FOP 200.

## 2. Normas e orientações oficiais

### 2.1 Resolução ANAC nº 773/2025

A Resolução nº 773 entrou em vigor em 1º de janeiro de 2026 e revogou a Resolução nº 457.

Requisitos diretamente aplicáveis ao produto:

<!-- prettier-ignore -->
| Referência | Obrigação | Consequência técnica |
|---|---|---|
| Art. 2º | Diário de Bordo é documento único e meio oficial das operações, manutenção e demais informações | Deve haver um único domínio oficial e uma identificação inequívoca do acervo da aeronave |
| Art. 2º, parágrafo único | Informações podem ser divididas em volumes com abertura e encerramento | Entidades próprias de volume e termos assinados |
| Art. 3º | Meio físico ou digital, com integridade e correções evidenciadas | Imutabilidade por revisão/addendum; histórico sempre legível |
| Art. 3º, §1º | Guarda durante toda a existência da aeronave e por 5 anos e um dia após cancelamento da matrícula | Retenção legal longa, portabilidade e plano de saída do fornecedor |
| Art. 4º | Uso e descontinuidade do meio digital devem ser submetidos à ANAC | Feature flag não equivale a autorização; cutover e rollback regulatório devem ser documentados |
| Art. 5º | Identificação de fabricante, modelo, número de série, marcas, proprietário e operador | Snapshot regulatório, sem depender apenas de cadastro mutável |
| Art. 6º | Registro por voo de tripulação, data, origem/destino, quatro horários, pousos/ciclos, tempos, combustível, POB, carga, natureza, ocorrências e discrepâncias | Modelo completo por etapa/voo e validações de consistência |
| Art. 7º | Conjunto deve ser assinado pelo PIC ao fim do voo ou da jornada | Estado de assinatura e prazo operacional; bloqueios em troca de tripulação |
| Art. 7º, §2º | Últimos 30 dias devem permanecer na aeronave, salvo determinação diversa | Cache offline cifrado e verificável no PED |
| Art. 8º | Discrepâncias devem receber providências e registro da ação corretiva ou ação retardada | Fluxo técnico integrado a manutenção/SDRMe |
| Art. 9º | PIC deve receber última intervenção, próxima intervenção e horas de célula previstas; ciência antes do voo | Aviso de inicialização e assinatura de ciência pré-voo |
| Art. 10 | Operador é responsável pela guarda, controle e adequação | Administração formal, designações, auditoria e governança |
| Art. 10, parágrafo único | Contrassinatura do operador: 15 dias para RBAC 135 | Fila de pendências e SLA monitorado |
| Arts. 11 e 12 | Perda/corrupção exige comunicação e reconstituição; pode suspender CA ou interditar aeronave | DR testado, detecção de corrupção e runbook regulatório |
| Art. 13 | Acervo deve acompanhar transferência de propriedade | Exportação completa e transferência verificável |
| Art. 14 | Na exportação, último proprietário mantém cópia dos 5 anos e um dia anteriores | Exportação legal e retenção pós-transferência |
| Art. 15 | Compartilhamento digital nos moldes regulatórios isenta Resolução nº 219/2012 | Integração externa somente após confirmação do método de cumprimento |

Fonte oficial: https://www.anac.gov.br/assuntos/legislacao/legislacao-1/resolucoes/2025/resolucao-773

### 2.2 Resolução ANAC nº 458/2017, texto compilado

A Resolução nº 458 disciplina sistemas informatizados usados em substituição ao papel.

#### Aceitação e escopo

O art. 3º exige:

- escopo explicitamente autorizado pela ANAC;
- demonstração de segurança por uma das alternativas admitidas no texto compilado;
- disponibilidade a qualquer momento para auditoria.

Um sistema aceito não precisa repetir o processo para o mesmo escopo quando utilizado por outra entidade. Entretanto, atualização que altere o método de cumprimento exige novo processo de aceitação.

Isso cria duas obrigações de produto:

1. versionar o **método de cumprimento**, não apenas a versão do software;
2. possuir avaliação regulatória de impacto para cada mudança em assinatura, armazenamento, auditoria, offline, exportação e retenção.

#### Segurança e assinatura

O art. 4º exige, minimamente:

- criptografia assimétrica;
- assinatura digital e eletrônica;
- hashing;
- chaves pública e privada;
- certificado digital ICP-Brasil ou equivalente;
- singularidade e controle exclusivo pelo signatário;
- notificação e declaração inequívoca da intenção de assinar;
- ação deliberada, com possibilidade de revisar o conteúdo;
- associação permanente entre assinatura e registro;
- rastreabilidade e recuperação;
- prevenção de acesso e modificação não autorizados;
- nova assinatura após alteração;
- permanência e inalterabilidade;
- identificação positiva;
- correção preservando o original e invalidando a assinatura substituída;
- arquivamento seguro;
- não repúdio.

A autenticação comum por JWT não satisfaz, sozinha, esse conjunto. O ato de assinatura precisa de um fluxo próprio, com conteúdo canônico, intenção explícita, autenticação reforçada e evidências permanentes.

#### Operação, continuidade e auditoria

A Resolução também exige:

- políticas e auditorias periódicas;
- comunicação à ANAC de mudanças no processo de assinatura;
- backup e preservação;
- treinamento e usabilidade;
- proteção de informação confidencial;
- fornecimento dos registros em formato aceitável;
- possibilidade de acesso direto da ANAC quando requerido;
- suporte a interrupções e perda de infraestrutura;
- treinamento para entrada, manutenção e recuperação dos dados;
- integridade na migração para novo sistema;
- continuidade com fornecedores de manutenção.

Fonte oficial: https://antigo.anac.gov.br/assuntos/legislacao/legislacao-1/resolucoes/2017/resolucao-no-458-20-12-2017

### 2.3 Portaria nº 3.220/SPO/SAR/2019, texto compilado até 2024

A Portaria define procedimentos mínimos e o modelo de referência do eDB. O texto ainda menciona a Resolução nº 457 em vários dispositivos; como ela foi revogada pela Resolução nº 773, o enquadramento dos dispositivos deve ser confirmado com a SPO. Até manifestação em contrário, os requisitos materiais da Portaria devem ser tratados como aplicáveis.

#### Volumes

- volume é conjunto lógico delimitado por termos de abertura e encerramento;
- numeração no formato `NN/CC-MMM/AAAA`;
- abertura e encerramento contêm identificação da aeronave, horas, ciclos, pousos, proprietário, operador, observações e assinatura do responsável;
- mudança ou cancelamento de marcas exige encerramento e novo volume.

#### Controle de acesso e PED

- todo acesso, inclusive por integrações, deve validar identidade e prerrogativas;
- após autorização, deve existir pelo menos um PED funcional durante toda a operação;
- o PED precisa possuir dados consolidados e atualizados;
- impossibilidade de acesso integral impede a operação;
- sem funcionamento stand-alone/offline, a aeronave não pode operar na ausência de comunicação;
- uso durante voo depende das regras de EFB e fases não críticas.

#### Aviso de inicialização

Após autenticação no PED, o eDB deve apresentar:

- termo de abertura;
- discrepâncias anteriores ainda abertas;
- ações corretivas imediatamente anteriores;
- termo de encerramento, quando houver.

Quando houver informação técnica pendente, o sistema deve exigir confirmação de leitura antes de liberar outras funções.

#### Registro de voo

A Parte I deve representar cada etapa e conter, conforme aplicável:

- tripulação com código ANAC, função, apresentação e base contratual;
- identificador recuperável do registro;
- número do volume;
- marcas da aeronave;
- ciclos;
- data e horários de partida, decolagem, pouso e corte;
- origem e destino;
- tempos diurno, noturno, VFR, IFR real ou simulado;
- horas por etapa e total;
- pousos parciais e totais;
- combustível na partida dos motores;
- natureza;
- POB;
- carga;
- assinatura do PIC;
- ocorrências.

As funções de tripulante foram atualizadas em 2024 e devem ser suportadas, inclusive `P1`, `P2`, `I1`, `I2`, `O1`, `O2`, `O3`, `V1`, `V2`, `V3`, `C`, `M`, `X` e `D`.

#### Situação técnica e retorno ao serviço

O modelo exige:

- tipo da última intervenção;
- tipo da próxima intervenção;
- horas de célula até a próxima intervenção;
- discrepância e sistema/código aplicável;
- identidade e assinatura de quem registrou;
- data e descrição da ação corretiva;
- identidade e assinatura de quem aprovou o retorno ao serviço;
- ciência/assinatura do PIC.

Para manutenção terceirizada em RBAC 135/121, o cadastro do aprovador deve guardar CANAC ou licença equivalente, nome, COM/COA aplicável, data/hora e identidade de quem realizou o cadastro.

#### Apresentação, impressão e assinatura

- o PED deve permitir pesquisa cronológica e identificação dos signatários;
- páginas imprimíveis devem seguir o Anexo III;
- a página impressa deve exibir assinatura digital do operador;
- registros devem ser assinados pelo PIC pelo menos até o fim da jornada;
- troca de tripulação exige assinatura antes da próxima etapa;
- discrepância e retorno ao serviço são assinados imediatamente;
- dados automatizados ou importados continuam sujeitos à assinatura do PIC.

#### Autorização e migração

- uso em substituição ao impresso exige aprovação prévia;
- para operador certificado sob RBAC 119, a autorização fica nas EO;
- a autorização em EO contempla as aeronaves cujas matrículas constam nela;
- após autorização, o operador possui até 30 dias para migrar todas as aeronaves abrangidas;
- a ANAC pode estender, mediante justificativa, até o limite de 90 dias;
- retirada de aeronave de EO exige providenciar LOA quando aplicável; o texto veda retorno ao impresso pelo mesmo operador.

Fonte oficial e PDF compilado: https://www.anac.gov.br/assuntos/legislacao/legislacao-1/portarias/2019/portaria-no-3220-spo-sar-15-10-2019

### 2.4 Processo oficial para RBAC 135

A página oficial de serviço indica, para utilização de registros digitais:

- FOP 219;
- D-144-01;
- FAI;
- manuais revisados do operador, protocolados em processo separado e referenciados no FOP 219;
- quando o software não tiver sido verificado/atestado: checklist de conformidade da Resolução nº 458 e relatório de conformidade do sistema emitido por entidade competente;
- FOP 200 para reunião prévia, quando necessária.

A página atualmente informa TFAC código 11 C4 e valor de R$ 3.000,00. O valor deve ser reconfirmado no momento do protocolo.

Fontes:

- https://www.gov.br/anac/pt-br/assuntos/regulados/programa-de-transformacao-digital/registros-de-manutencao
- https://www.gov.br/pt-br/servicos/solicitar-alteracao-de-certificado-de-operador-aereo-ou-especificacoes-operativas-de-autorizatario
- https://www.gov.br/anac/pt-br/assuntos/regulados/empresas-aereas/modelos-e-formularios/tabela-5
- https://www.anac.gov.br/assuntos/legislacao/legislacao-1/boletim-de-pessoal/2023/bps-v-18-no-42-16-a-20-10-2023/is-119-004/visualizar_ato_normativo

## 3. Estado real do AirTrust

### 3.1 Componentes aproveitáveis

O Controle de Voos já possui ou está preparando:

- entidade de voo/relatório;
- etapas/pernas;
- tripulação;
- horários operacionais;
- pousos, ciclos, combustível, POB e carga;
- tempos de voo;
- natureza e ocorrências;
- integração SIGVOOS com rastreabilidade e idempotência;
- eventos operacionais e controle por tenant;
- frontend de RDV e fluxo de coordenação.

### 3.2 Lacunas regulatórias

Ainda não há prova de conformidade para:

- volumes oficiais;
- termos de abertura e encerramento;
- snapshots imutáveis independentes do cadastro mutável;
- assinatura eletrônica do PIC nos termos da Resolução nº 458;
- assinatura digital do operador;
- cadeia de integridade e verificação independente;
- revisão/addendum de conteúdo assinado;
- situação técnica completa;
- cadastro de aprovador de retorno ao serviço;
- funcionamento offline regulado;
- dispositivo PED gerenciado;
- fiscalização e impressão conforme Anexo III;
- retenção legal e transferência de acervo;
- reconstituição após corrupção;
- gestão de mudança do método de cumprimento;
- relatório independente de conformidade.

Os mecanismos existentes de autenticação, auditoria operacional, soft delete, PDF e Service Worker podem ser reutilizados como infraestrutura, mas não devem ser declarados conformes sem análise e evidência específica.

## 4. Regras de desenho derivadas

### 4.1 Domínio oficial separado

O eDB não deve ser apenas uma visualização das tabelas `cv_*`.

`cv_*` representa fatos e rascunhos operacionais que podem ser corrigidos e enriquecidos. O registro regulado precisa guardar um snapshot canônico, completo e independente no momento da assinatura.

Fluxo recomendado:

```text
SIGVOOS ou entrada manual
        ↓
Controle de Voos / RDV operacional (`cv_*`)
        ↓ projeção sem valor oficial
Rascunho eDB
        ↓ revisão deliberada pelo PIC
Snapshot regulado imutável
        ↓ assinatura eletrônica do PIC
Registro oficial pendente de contrassinatura
        ↓ assinatura digital do operador no prazo
Registro completo do volume
```

Nenhuma integração pode assinar em nome do PIC.

### 4.2 Estado mínimo do registro

Estados conceituais:

- `draft`;
- `ready_for_pic_review`;
- `pic_signed`;
- `operator_signature_due`;
- `fully_signed`;
- `superseded_by_correction`;
- `reconstituted`;
- `voided_with_history`.

Não devem existir estados que apaguem o original assinado.

### 4.3 Correção

Uma correção deve:

1. preservar conteúdo e assinaturas anteriores;
2. registrar motivo, autor, data e vínculo com o registro substituído;
3. invalidar formalmente a assinatura anterior para o conteúdo corrigido;
4. criar novo snapshot e novas assinaturas;
5. permanecer visível em fiscalização e exportação.

### 4.4 Conteúdo canônico e integridade

Cada versão deve possuir:

- schema version;
- identificador do registro e do volume;
- tenant e operador regulado;
- aeronave por fabricante, modelo, serial e marcas;
- payload canônico determinístico;
- hash do payload;
- hash da versão anterior, quando aplicável;
- assinatura e certificado/identidade;
- trusted timestamp ou evidência temporal definida no método de cumprimento;
- algoritmo e versão;
- validação do certificado no momento da assinatura;
- status de revogação quando aplicável.

O hash não substitui assinatura, auditoria, backup ou autorização.

### 4.5 Multi-tenancy

Cada consulta e escrita deve permanecer isolada por `empresa_id`. Entretanto, o registro regulado também deve guardar o identificador legal do operador e um snapshot de sua razão social/designação, porque o cadastro do tenant pode mudar depois da assinatura.

Acesso de fiscal deve ser explicitamente limitado ao operador, aeronaves, volumes e período autorizados. Não pode usar permissões globais que exponham outros tenants.

### 4.6 Offline

O requisito de operação sem comunicação impede que o eDB dependa exclusivamente do Worker.

A solução deve suportar:

- réplica local cifrada dos dados necessários;
- últimos 30 dias e situação técnica atual;
- fila idempotente;
- assinatura offline ou procedimento de contingência aceito pela ANAC;
- verificação de integridade local;
- resolução de conflito sem sobrescrever registro assinado;
- revogação de dispositivo e usuário;
- detecção de relógio inconsistente;
- sincronização auditável.

A decisão entre PWA, aplicação nativa ou solução híbrida é gate regulatório e de segurança. Não deve ser fechada apenas por conveniência de frontend.

## 5. Perguntas que exigem manifestação prévia

1. A Portaria nº 3.220 permanece integralmente aplicável após a Resolução nº 773, inclusive dispositivos que citam a Resolução nº 457?
2. Qual alternativa do art. 3º, II, da Resolução nº 458 será aceita para o AirTrust SaaS?
3. Qual entidade e escopo de avaliação são considerados competentes para emitir o relatório de conformidade?
4. Qual método de assinatura é esperado para PIC, manutenção, operador e páginas impressas?
5. O certificado ICP-Brasil deve ser individual em algum desses atos ou pode haver assinatura eletrônica individual combinada com assinatura digital do operador?
6. PWA instalada com armazenamento cifrado é aceitável como PED/eDB stand-alone?
7. Quais evidências de EFB/PED e contingência serão exigidas para helicópteros offshore RBAC 135?
8. Como a ANAC espera acesso de fiscalização: usuário temporário, exportação assinada ou acesso direto?
9. Há schema, API ou padrão vigente para compartilhamento digital relacionado ao art. 15 da Resolução nº 773?
10. Quais mudanças futuras do SaaS serão consideradas alteração do método de cumprimento e exigirão novo ateste?
11. O ateste pode abranger o software multi-tenant, com autorizações posteriores por operador?
12. Como tratar assinatura offline e posterior sincronização sem perder a data jurídica do ato?
13. Qual procedimento é esperado para indisponibilidade total, troca de PED e reconstituição?
14. É admitida implantação inicial em shadow mode mantendo o papel oficial para coleta de evidências?
15. A autorização em EO exigirá migração simultânea de todas as matrículas listadas ou poderá haver delimitação formal do escopo?

## 6. Decisão recomendada

Iniciar por uma frente documental e de protótipo não oficial:

1. fechar matriz artigo por artigo;
2. preparar FOP 200 e conceito de operação;
3. obter orientação sobre assinatura, offline e método de demonstração de segurança;
4. construir o Regulated Records Core em PRs isoladas e inertes;
5. construir eDB em shadow mode;
6. executar avaliação independente;
7. protocolar ateste do software e alteração de EO;
8. somente após autorização, executar migração do papel e ativar o modo oficial.

A primeira versão não deve incluir SDRMe completo, FRMS ou uma reconstrução geral do Controle de Voos. O eDB precisa integrar a situação técnica e o retorno ao serviço necessários ao Diário de Bordo, mas funcionalidades de MRO que não sejam requisito direto devem permanecer em backlog separado.
