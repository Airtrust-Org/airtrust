# AirTrust — Plano Incremental de Implementação do eDB

> **Data:** 2026-08-02  
> **Base:** `origin/main` em `d27d72178a75664ff0fb8ac8f18768b88b8112ca`  
> **Estratégia:** PRs pequenas, domínio regulado separado, shadow mode antes de qualquer uso oficial

## 1. Objetivo

Construir o Diário de Bordo Digital sem transformar um hotfix ou uma evolução do Controle de Voos em uma auditoria arquitetural indefinida.

A sequência abaixo protege:

- tenant isolation;
- integridade dos registros;
- evolução do SIGVOOS e do FRMS;
- método de cumprimento submetido à ANAC;
- reversibilidade antes do cutover;
- evidência técnica necessária ao ateste e à alteração de EO.

## 2. Restrições permanentes

- nenhuma integração assina por um usuário;
- nenhum registro oficial é editado in-place;
- nenhum dado `cv_*` assinado é lido por referência mutável: sempre snapshot;
- nenhum deploy ativa modo oficial sem ato autorizativo;
- nenhuma migration histórica é alterada;
- nenhuma tabela regulada aceita consulta sem `empresa_id`;
- nenhum acesso fiscal recebe escopo cross-tenant;
- nenhuma PR mistura assinatura, offline, situação técnica e migração de produção;
- papel permanece oficial durante shadow mode;
- produção não recebe migration ou ativação sem autorização explícita e gate do repositório.

## 3. Marcos

### Marco A — baseline e orientação

Saída:

- matriz fechada;
- FOP 200 preparado;
- arquitetura e perguntas revisadas;
- orientação da ANAC registrada.

### Marco B — núcleo regulado em shadow mode

Saída:

- registros versionados e imutáveis;
- projeção de `cv_*`;
- validação de completude;
- sem assinatura oficial;
- sem offline regulado.

### Marco C — fluxo regulatório completo em staging

Saída:

- assinatura;
- volumes;
- situação técnica;
- offline;
- fiscalização;
- DR;
- testes completos.

### Marco D — ateste e autorização

Saída:

- relatório independente;
- software atestado/aceito para o escopo;
- EO do operador alterada;
- manuais aceitos.

### Marco E — cutover controlado

Saída:

- aeronaves migradas;
- eDB como fonte oficial;
- papel encerrado no momento autorizado;
- operação assistida e validação real.

## 4. Backlog dividido em PRs

### PR 0 — Baseline regulatório e arquitetura

**Branch:** `audit/edb-anac-regulatory-baseline-20260802`

Inclui:

- pesquisa oficial;
- matriz de conformidade;
- mapa de campos;
- ADR da fronteira regulada;
- plano de submissão;
- plano de implementação.

Não inclui código, migration, deploy ou alteração de comportamento.

**Teste:** revisão de links, CSV parseável, consistência de referências e revisão independente única do delta.

### PR 1 — Contratos de domínio eDB não oficiais

**Branch sugerida:** `feat/edb-domain-contracts-shadow-20260802`

Inclui apenas:

- tipos e schemas versionados de rascunho;
- snapshots de operador, aeronave, tripulação e etapa;
- enum de estados não oficiais;
- validação de completude;
- catálogo de códigos de função conforme Portaria compilada;
- fixtures sem dados reais.

Não inclui:

- banco;
- rota;
- assinatura;
- hash escolhido como método definitivo;
- status `official` operacional.

**Testes mínimos:**

- schema válido/inválido;
- campos obrigatórios;
- funções regulatórias;
- serialização estável apenas se o algoritmo já estiver aprovado;
- ausência de PII em logs de erro.

### PR 2 — Projeção read-only Controle de Voos → rascunho eDB

**Branch sugerida:** `feat/edb-cv-draft-projection-20260802`

Inclui:

- serviço puro que recebe dados `cv_*` e produz rascunho;
- origem de cada campo;
- conflitos e campos ausentes;
- nenhuma persistência regulada;
- nenhum endpoint público inicialmente.

Regras:

- SIGVOOS é origem de dados, nunca autor;
- campos editados no AirTrust preservam procedência;
- timezone e unidade desconhecidos geram erro explícito, não suposição silenciosa;
- alteração da fonte não altera rascunho já congelado para revisão.

**Testes mínimos:**

- uma etapa;
- múltiplas etapas;
- troca de tripulação;
- tripulante não resolvido;
- origem/destino ausentes;
- unidade de combustível não confirmada;
- conflito SIGVOOS × edição manual;
- isolamento entre tenants.

### PR 3 — Schema V1 do núcleo regulado, inerte

**Branch sugerida:** `feat/edb-regulated-records-schema-v1-20260802`

Pré-requisitos:

- ADR aceito;
- orientação sobre arquitetura recebida;
- revisão de retenção e D1/R2 concluída.

Inclui migration aditiva para:

- volumes;
- termos;
- registros;
- versões;
- auditoria regulatória;
- origem do rascunho;
- estado `shadow` apenas.

Não inclui assinatura, offline, ativação ou backfill.

Controles de schema:

- `empresa_id` em todas as tabelas;
- FKs/trigger guards cross-tenant;
- ausência de delete funcional;
- unicidade por aeronave/volume/versão;
- snapshot completo;
- eventos append-only;
- índices por fiscalização e retenção.

**Testes mínimos:** migration local limpa, upgrade do baseline suportado, rollback lógico documentado, constraints cross-tenant, append-only e concorrência.

### PR 4 — Records Core e correções

**Branch sugerida:** `feat/edb-record-versioning-core-20260802`

Inclui:

- criação de snapshot;
- congelamento;
- versionamento;
- correção/addendum;
- invalidação lógica da assinatura substituída, ainda com provider de teste;
- verificador de cadeia de versões.

Não inclui provider produtivo de assinatura.

**Testes mínimos:**

- nenhuma edição após congelamento;
- correção conserva original;
- cadeia quebrada é detectada;
- concorrência não cria duas versões ativas;
- idempotência por comando;
- cross-tenant negado.

### PR 5 — Volumes e termos

**Branch sugerida:** `feat/edb-volumes-terms-shadow-20260802`

Inclui:

- numeração de volume;
- abertura/encerramento;
- saldos;
- mudança de marcas;
- bloqueio de registro em volume encerrado;
- shadow mode.

**Testes mínimos:** sequência, concorrência, mudança de matrícula, encerramento, reabertura proibida, snapshots de proprietário/operador.

### PR 6 — Intento de assinatura e provider abstrato

**Branch sugerida:** `feat/edb-signature-intent-provider-contract-20260802`

Pré-requisito: orientação da ANAC sobre método de assinatura.

Inclui:

- finalidade da assinatura;
- conteúdo apresentado;
- reautenticação;
- intenção não reutilizável;
- provider abstrato;
- verificação;
- envelope de evidência;
- provider somente de teste.

Não inclui segredo compartilhado, certificado real ou produção.

**Testes mínimos:** replay, conteúdo alterado, finalidade alterada, identidade trocada, intenção expirada, certificado inválido simulado, revogação simulada.

### PR 7 — Assinatura PIC e troca de tripulação

**Branch sugerida:** `feat/edb-pic-signature-shadow-20260802`

Inclui:

- revisão do conteúdo;
- assinatura ao fim de voo/jornada;
- assinatura antes da próxima etapa em troca de tripulação;
- pendências;
- bloqueios definidos no conceito de operação;
- shadow mode.

**Testes mínimos:** múltiplas etapas, troca de PIC, assinatura parcial, correção posterior, importação sem assinatura automática.

### PR 8 — Situação técnica, discrepâncias e retorno ao serviço

**Branch sugerida:** `feat/edb-technical-status-rts-shadow-20260802`

Inclui somente os elementos exigidos pelo eDB:

- última/próxima intervenção;
- horas restantes;
- discrepância;
- ação corretiva ou retardada;
- aprovador e organização;
- assinatura específica;
- ciência do PIC.

Não transforma a PR em MRO completo.

**Testes mínimos:** discrepância aberta, ação imediata, ação retardada, terceiro autorizado, licença expirada, leitura obrigatória e bloqueio.

### PR 9 — Contrassinatura do operador e SLA

**Branch sugerida:** `feat/edb-operator-countersignature-20260802`

Inclui:

- pessoas formalmente designadas;
- prazo de 15 dias para RBAC 135;
- alertas;
- assinatura digital do operador;
- trilha e relatório de pendências.

**Testes mínimos:** prazo, timezone, substituição de designado, assinatura fora do escopo e relatório completo.

### PR 10 — Fiscalização, impressão e exportação

**Branch sugerida:** `feat/edb-inspection-export-20260802`

Inclui:

- consulta cronológica;
- busca por aeronave, volume e período;
- impressão conforme Anexo III;
- assinatura digital do operador na página;
- pacote de exportação;
- verificador independente;
- acesso temporário de fiscal conforme método aceito.

**Testes mínimos:** golden PDF, verificação de hash/assinatura, tenant isolation, expiração de acesso e exportação completa.

### PR 11 — PED e cache offline read-only

**Branch sugerida:** `feat/edb-ped-offline-read-model-20260802`

Inclui:

- inventário e registro de dispositivos;
- pacote cifrado dos últimos 30 dias;
- situação técnica atual;
- verificação local;
- revogação;
- sincronização de leitura.

Começa read-only para reduzir risco.

**Testes mínimos:** sem rede, pacote expirado, dispositivo revogado, corrupção local, troca de usuário e indisponibilidade do Worker.

### PR 12 — Escrita e assinatura offline

**Branch sugerida:** `feat/edb-offline-signed-operations-20260802`

Pré-requisito absoluto: método aceito pela ANAC.

Inclui:

- fila de comandos regulados;
- identidade do dispositivo;
- anti-replay;
- ordenação e idempotência;
- envelope assinado localmente ou procedimento híbrido aceito;
- reconciliação sem sobrescrita.

**Testes mínimos:** relógio incorreto, replay, duas redes, comandos fora de ordem, perda do dispositivo, revogação e assinatura sincronizada duas vezes.

### PR 13 — DR, retenção e reconstituição

**Branch sugerida:** `feat/edb-retention-reconstitution-20260802`

Inclui:

- política executável de retenção;
- verificação periódica de integridade;
- exportação de acervo;
- restauração;
- caso de reconstituição;
- cadeia de custódia;
- métricas sem PII.

**Testes mínimos:** drill de perda, corrupção, restauração, transferência e verificação tardia.

### PR 14 — Shadow mode com operador piloto

**Branch sugerida:** `feat/edb-operator-shadow-pilot-20260802`

Inclui:

- feature flag `shadow` por operador/aeronave;
- comparação papel × AirTrust;
- painel de divergências;
- evidências de treinamento;
- relatório de prontidão.

Não inclui modo oficial.

**Testes mínimos:** cenário ponta a ponta e conjunto de voos reais autorizado, sem alterar fonte oficial.

### PR 15 — Provider produtivo e hardening

Pré-requisitos:

- orientação formal;
- fornecedor/infra aprovados;
- threat model revisado;
- avaliação de impacto LGPD e segurança.

Inclui provider produtivo, rotação, revogação, timestamp e evidências.

**Testes mínimos:** integração em sandbox, falhas do fornecedor, expiração, rotação e verificação após longo prazo.

### PR 16 — Gate de autorização e cutover

Inclui:

- armazenamento do ato autorizativo;
- estados `authorized_pending_migration` e `official`;
- migração por aeronave;
- encerramento do papel e abertura digital;
- reconciliador de saldos;
- checklist assinado de cutover.

Esta PR não é habilitada em produção até EO/LOA e autorização operacional explícita.

## 5. Sequência paralelizável

Depois da PR 0 e da orientação inicial, podem avançar em paralelo, sem tocar os mesmos arquivos:

- contratos e projeção (`PR 1-2`);
- threat model e assinatura (`PR 6`, inicialmente documental);
- design offline/PED (`PR 11`, inicialmente documental);
- pacote de submissão e manuais;
- seleção da entidade independente.

Não paralelizar antes da decisão arquitetural:

- schema regulado;
- canonicalização criptográfica;
- provider produtivo;
- escrita offline;
- cutover.

## 6. Estratégia de testes

Para cada PR:

1. teste que reproduz o requisito ou risco principal;
2. suíte do domínio afetado;
3. typecheck/lint afetados;
4. CI completa uma única vez antes da revisão final, quando necessária.

Suítes a criar:

- `edb-domain-contracts.test.ts`;
- `edb-draft-projection.test.ts`;
- `edb-migration.test.ts`;
- `edb-record-versioning.test.ts`;
- `edb-signature-intent.test.ts`;
- `edb-technical-status.test.ts`;
- `edb-offline-sync.test.ts`;
- `edb-inspection-export.test.ts`;
- E2E `edb-shadow.spec.ts`;
- E2E `edb-authorized-cutover.spec.ts`, inicialmente desabilitado e protegido por environment.

## 7. Gates de segurança

Bloquear merge quando houver risco concreto de:

- vazamento cross-tenant;
- alteração ou deleção de registro assinado;
- assinatura por identidade errada;
- replay;
- inconsistência de volume;
- perda de cadeia de versões;
- uso oficial sem autorização;
- dados técnicos desatualizados liberando operação;
- offline sem integridade;
- migration não reversível logicamente;
- exportação incompleta;
- ausência de restauração testada.

## 8. Gestão de mudança regulatória

Cada release do eDB deve classificar o delta:

- **sem impacto no método de cumprimento:** UI não material, correção interna sem alterar conteúdo/assinatura/evidência;
- **impacto potencial:** mudança de schema, canonicalização, assinatura, provider, offline, retenção, auditoria ou exportação;
- **impacto confirmado:** exige comunicação e possível novo processo de aceitação.

A classificação deve constar na PR e no release manifest.

## 9. Critério de prontidão para submissão

- matriz sem P0 aberto sem justificativa aceita;
- testes automatizados e demonstração funcional;
- relatório independente sem achado crítico/alto pendente;
- políticas e manuais coerentes com o comportamento real;
- shadow mode concluído;
- DR e restauração demonstrados;
- PED offline demonstrado;
- assinatura verificada;
- fiscalização e exportação demonstradas;
- FOPs e anexos revisados.

## 10. Critério de encerramento do projeto

O projeto não termina no merge do código. Só se considera concluído quando:

- software aceito/atestado para o escopo aplicável;
- operador autorizado em EO/LOA;
- manuais aceitos;
- aeronaves migradas dentro do prazo aplicável;
- eDB publicado no ambiente correto;
- primeiro caso real validado;
- papel encerrado conforme o plano;
- operação assistida concluída sem divergência crítica;
- recuperação e fiscalização confirmadas.
