# AirTrust — RFP para Avaliação Independente de Conformidade do eDB

> **Data:** 2026-08-02 (BRT)  
> **SHA-base:** `d27d72178a75664ff0fb8ac8f18768b88b8112ca`  
> **Status:** minuta técnica; não seleciona nem contrata entidade  
> **Parent:** issue #695; baseline regulatório na PR #688

## 1. Objeto

Contratar, após confirmação prévia da ANAC quanto à competência exigida, uma avaliação independente do software e dos processos do Diário de Bordo Digital AirTrust para suportar o relatório de conformidade previsto no processo de aceitação/ateste do sistema.

A avaliação deverá verificar o comportamento real do produto, sua infraestrutura, seus procedimentos e suas evidências contra o escopo regulatório aplicável. Não será aceita declaração genérica baseada apenas em políticas ou certificações corporativas.

## 2. Condição suspensiva

A contratação só deverá ser concluída depois de confirmação da ANAC sobre:

- alternativa de demonstração de segurança aplicável ao art. 3º da Resolução nº 458/2017;
- qualificação esperada da entidade e dos profissionais;
- escopo mínimo do relatório;
- possibilidade de o relatório cobrir software SaaS multi-tenant;
- necessidade de ensaio, certificação, acreditação ou instituição de ensino específica;
- forma de tratamento de fornecedores de nuvem, assinatura e timestamp.

A resposta verbal deverá ser registrada no processo ou confirmada por meio institucional rastreável.

## 3. Contexto do sistema

O AirTrust é uma plataforma SaaS multi-tenant. O eDB será construído como domínio regulado separado do Controle de Voos operacional.

Componentes previstos:

- frontend/PED;
- API em Cloudflare Workers;
- banco transacional D1;
- armazenamento R2;
- Regulated Records Core;
- volumes e versões imutáveis;
- assinatura do PIC, manutenção e operador;
- situação técnica e retorno ao serviço;
- sincronização offline;
- fiscalização, impressão e exportação;
- retenção, recuperação e reconstituição.

O SIGVOOS e as tabelas `cv_*` serão fontes de rascunho. Nenhuma integração assinará em nome de pessoa física.

## 4. Normas mínimas de referência

- Resolução ANAC nº 458/2017, texto compilado;
- Resolução ANAC nº 773/2025;
- Portaria nº 3.220/SPO/SAR/2019, texto compilado até 2024, conforme enquadramento confirmado pela ANAC;
- RBAC nº 43, 91, 119 e 135, conforme aplicável;
- IS nº 119-004 vigente;
- IS nº 91-002D;
- IS nº 91.21-001A;
- IS nº 135-002 vigente;
- manuais e procedimentos do primeiro operador;
- ato e escopo definidos pela ANAC para o software.

Normas de segurança, identidade, criptografia, continuidade e desenvolvimento seguro poderão ser usadas como critérios técnicos complementares, sem substituir a demonstração artigo por artigo da regulamentação ANAC.

## 5. Qualificação eliminatória da entidade

A proposta deverá informar e comprovar:

- personalidade jurídica e independência;
- experiência em segurança da informação e sistemas críticos;
- experiência com registros eletrônicos, assinatura e não repúdio;
- experiência regulatória em aviação, quando existente;
- certificações, acreditações ou vínculo acadêmico aplicáveis;
- currículo dos avaliadores principais;
- metodologia de revisão e controle de qualidade;
- ausência de conflito de interesses;
- capacidade de emitir relatório em português;
- disponibilidade para esclarecimentos à ANAC;
- seguro profissional, quando aplicável;
- política de confidencialidade e tratamento de dados;
- localização e condições de acesso às evidências.

A entidade não poderá avaliar como independente controles que ela própria tenha projetado, implementado ou operado, salvo aceitação expressa e tratamento formal do conflito.

## 6. Escopo técnico obrigatório

### 6.1 Governança e método de cumprimento

- escopo regulatório autorizado;
- matriz artigo por artigo;
- responsabilidades do fornecedor e do operador;
- classificação das mudanças de software;
- versionamento do método de cumprimento;
- processo para mudança que exija nova aceitação;
- gestão de exceções e riscos residuais;
- evidência de aprovação interna.

### 6.2 Arquitetura e inventário

- diagramas e fluxos de dados;
- ativos e fronteiras de confiança;
- dependências e serviços externos;
- ambientes e segregação;
- localização e ciclo de vida dos dados;
- responsabilidades compartilhadas com provedores;
- single source of truth regulatória;
- isolamento entre `cv_*` e registros oficiais.

### 6.3 Identidade, acesso e multi-tenancy

- autenticação e recuperação de conta;
- RBAC e prerrogativas específicas;
- isolamento por `empresa_id`;
- troca de tenant;
- acesso de terceiros de manutenção;
- acesso de fiscal;
- sessões impersonadas;
- desativação e revogação;
- segregação de deveres;
- prevenção de acesso cross-tenant.

### 6.4 Assinaturas e criptografia

- identidade positiva;
- intenção inequívoca;
- ação deliberada;
- associação conteúdo-assinatura;
- conteúdo canônico e versionamento;
- hashing;
- criptografia assimétrica;
- certificados e equivalência ICP-Brasil;
- gestão e proteção de chaves;
- revogação e expiração;
- trusted timestamp;
- assinatura offline;
- não repúdio;
- verificação tardia;
- correções preservando original;
- assinatura digital de páginas/exportações.

### 6.5 Registros, volumes e integridade

- abertura e encerramento de volumes;
- numeração e unicidade;
- registros por etapa;
- snapshots de operador, proprietário e aeronave;
- versionamento append-only;
- concorrência e idempotência;
- detecção de adulteração;
- trilha de auditoria regulatória;
- impossibilidade de delete funcional;
- cadeia de versões e addendum.

### 6.6 Situação técnica e manutenção

- última e próxima intervenção;
- horas restantes;
- discrepâncias;
- ações corretivas e retardadas;
- aprovação para retorno ao serviço;
- cadastro e prerrogativas do aprovador;
- manutenção terceirizada;
- ciência do PIC;
- bloqueios operacionais;
- integração e fronteira com SDRMe/MRO.

### 6.7 PED, EFB e offline

- plataforma escolhida;
- provisionamento e inventário;
- cifragem local;
- últimos 30 dias;
- situação técnica offline;
- inicialização e confirmação de leitura;
- funcionamento stand-alone;
- fila, sequência e idempotência;
- conflitos;
- perda/furto e revogação;
- atualização e downgrade;
- evidência temporal;
- dispositivo reserva e contingência;
- determinação de não interferência;
- treinamento e fatores humanos.

### 6.8 Desenvolvimento seguro e supply chain

- SDLC;
- revisão de código;
- branch protection;
- CI/CD;
- dependências e lockfile;
- Dependabot e tratamento de vulnerabilidades;
- ações de terceiros;
- secret scanning;
- SAST/DAST, quando aplicável;
- testes e segregação de ambientes;
- release manifest;
- rollback;
- controle de mudanças regulatórias.

### 6.9 Infraestrutura e operação

- configuração Cloudflare;
- D1, R2 e Workers;
- segredos e rotação;
- rede e exposição;
- observabilidade sanitizada;
- incidentes e resposta;
- disponibilidade e capacidade;
- jobs e reprocessamento;
- acesso privilegiado;
- trilhas administrativas;
- fornecedores críticos.

### 6.10 Backup, retenção e continuidade

- retenção durante a existência da aeronave e prazo posterior;
- backups e cópias independentes;
- restauração;
- RTO/RPO;
- detecção de corrupção;
- reconstituição;
- transferência de propriedade;
- exportação e portabilidade;
- migração para outro fornecedor;
- encerramento do serviço;
- indisponibilidade prolongada;
- comunicação à ANAC.

### 6.11 Fiscalização e apresentação

- pesquisa cronológica;
- identificação de signatários;
- impressão conforme modelo aplicável;
- assinatura digital do operador;
- exportação verificável;
- acesso direto ou temporário da ANAC;
- menor privilégio;
- funcionamento offline, se exigido;
- preservação de versões e correções.

### 6.12 Privacidade e confidencialidade

- inventário de dados pessoais;
- minimização;
- base e finalidade;
- acesso e compartilhamento;
- retenção legal versus eliminação;
- logs e telemetria;
- incidentes;
- exportação;
- suboperadores;
- proteção de dados em dispositivos.

## 7. Ensaios obrigatórios

A proposta deverá incluir execução independente, e não apenas revisão documental, de pelo menos:

- tentativa cross-tenant;
- adulteração de conteúdo assinado;
- replay de intenção/assinatura;
- correção preservando original;
- troca de tripulação;
- prerrogativa expirada;
- dispositivo revogado;
- pacote offline alterado;
- perda de comunicação;
- comandos duplicados e fora de ordem;
- restauração de backup;
- reconstituição simulada;
- exportação e verificação independente;
- falha do provider de assinatura;
- falha de D1/R2/Worker conforme modelo;
- downgrade de aplicação/schema;
- acesso fiscal limitado;
- ativação oficial sem ato autorizativo;
- segredo ou PII em logs;
- dependência vulnerável de impacto alto/crítico.

## 8. Evidências fornecidas pelo AirTrust

- baseline regulatório e matriz;
- ADRs aprovados;
- código e histórico de PRs;
- schemas e migrations;
- arquitetura e threat models;
- inventário de dependências;
- resultados de CI;
- testes unitários, integração e E2E;
- registros de staging;
- políticas e procedimentos;
- manuais;
- evidências de treinamento;
- relatórios de pentest;
- drills de backup/restore;
- relatório de shadow mode;
- lista de riscos aceitos;
- atos e orientações da ANAC.

Acesso a produção deve ser evitado quando evidência equivalente puder ser obtida em ambiente controlado. Qualquer acesso necessário será temporário, auditado, de menor privilégio e sem extração indiscriminada de dados pessoais.

## 9. Entregáveis da entidade

1. plano de avaliação;
2. matriz de conformidade validada;
3. relatório de arquitetura e segurança;
4. relatório de testes técnicos;
5. lista de achados com severidade e evidência;
6. parecer sobre cada requisito da Resolução nº 458;
7. parecer sobre integridade do eDB frente à Resolução nº 773 e Portaria aplicável;
8. riscos residuais e condições;
9. relatório de reteste;
10. relatório final assinado por responsável qualificado;
11. sumário executivo para protocolo;
12. disponibilidade para responder exigências da ANAC.

## 10. Classificação de achados

- **Crítico:** permite falsificação, perda, alteração, exclusão ou exposição cross-tenant de registro; assinatura indevida; operação oficial sem autorização; recuperação inviável.
- **Alto:** compromete identidade, integridade, offline, retenção, situação técnica, fiscalização ou continuidade de forma relevante.
- **Médio:** controle parcial com mitigação existente, sem comprometimento imediato do registro.
- **Baixo:** melhoria de robustez, documentação ou observabilidade sem impacto material direto.
- **Observação:** recomendação não mandatória, claramente separada dos requisitos.

Nenhum achado crítico ou alto poderá permanecer aberto para emissão do relatório final favorável, salvo aceitação expressa da ANAC quanto ao tratamento alternativo.

## 11. Requisitos do relatório

O relatório final deverá:

- identificar versão, commit, ambiente e período avaliados;
- definir o escopo e exclusões;
- citar requisito e evidência exata;
- distinguir desenho, implementação e eficácia operacional;
- registrar limitações;
- descrever amostragem;
- preservar confidencialidade sem impedir auditabilidade;
- assinar digitalmente o documento;
- manter anexos técnicos verificáveis;
- permitir atualização controlada após reteste;
- não usar expressões genéricas como “conforme boas práticas” sem teste e evidência.

## 12. Critérios de avaliação das propostas

<!-- prettier-ignore -->
| Critério | Peso indicativo |
|---|---:|
| Elegibilidade aceita pela ANAC | Eliminatório |
| Independência e conflito de interesses | Eliminatório |
| Competência da equipe | 20% |
| Experiência com assinatura/registros críticos | 15% |
| Experiência regulatória aeronáutica | 10% |
| Metodologia e cobertura artigo por artigo | 20% |
| Profundidade dos testes técnicos | 15% |
| Qualidade e utilidade do relatório | 10% |
| Prazo, disponibilidade para reteste e suporte à ANAC | 5% |
| Preço e condições comerciais | 5% |

Preço não deve compensar ausência de competência, independência ou cobertura.

## 13. Perguntas obrigatórias ao proponente

1. Qual base objetiva demonstra sua competência para este relatório?
2. A ANAC já aceitou relatório emitido pela entidade em processo semelhante?
3. Quais partes serão executadas por subcontratados?
4. Como será garantida independência em relação a projeto e implementação?
5. O relatório cobrirá software, infraestrutura, PED e procedimentos do operador?
6. Como serão avaliadas assinatura e não repúdio?
7. Quais ensaios offline serão executados?
8. Como serão tratados provedores de nuvem e assinatura?
9. Como será avaliada a segurança multi-tenant?
10. Qual formato de evidência será aceito?
11. Quantos ciclos de reteste estão incluídos?
12. A equipe apoiará respostas a exigências da ANAC?
13. Como dados pessoais e segredos serão protegidos?
14. Qual é o prazo de retenção e destruição das evidências?
15. Quem assinará e assumirá responsabilidade técnica pelo relatório?

## 14. Cronograma por marcos

- **M0:** confirmação da ANAC sobre entidade e escopo;
- **M1:** plano e matriz de evidências;
- **M2:** revisão de desenho antes do provider produtivo;
- **M3:** avaliação de implementação em staging;
- **M4:** testes técnicos e shadow mode;
- **M5:** relatório preliminar;
- **M6:** correções e reteste;
- **M7:** relatório final para protocolo;
- **M8:** esclarecimentos durante análise da ANAC.

A contratação pode ocorrer antes de todo o produto estar pronto, mas o relatório final só deve ser emitido sobre uma versão congelada e demonstrável.

## 15. Critérios de aceite do serviço

- escopo contratado integralmente coberto;
- matriz artigo por artigo preenchida;
- evidências rastreáveis;
- achados reproduzíveis;
- retestes concluídos;
- ausência de crítico/alto aberto;
- relatório assinado;
- versão e commit exatos;
- parecer claro sobre limitações;
- material adequado ao protocolo;
- disponibilidade para esclarecimentos.

## 16. Proibições

- usar certificação ISO corporativa como substituto automático da avaliação do produto;
- emitir relatório antes dos testes;
- omitir achado por pressão de cronograma;
- acessar produção sem necessidade e autorização;
- copiar dados reais para ambiente não autorizado;
- aceitar segredo em código ou evidência;
- considerar login comum como assinatura sem demonstrar requisitos;
- tratar hash isolado como não repúdio;
- declarar PWA conforme sem teste offline e gestão de dispositivo;
- avaliar apenas frontend ou apenas infraestrutura.

## 17. Próximo passo

Levar esta minuta à reunião prévia da issue #690 e pedir confirmação formal dos critérios de competência e do escopo esperado. Somente depois iniciar consulta de mercado e pontuação das entidades elegíveis.
