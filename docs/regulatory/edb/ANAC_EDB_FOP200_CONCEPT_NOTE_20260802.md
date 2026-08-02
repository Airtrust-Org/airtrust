# Nota Conceitual para Reunião Prévia — Diário de Bordo Digital AirTrust

> **Versão:** 0.1 — 2026-08-02  
> **Uso:** anexo preparatório ao FOP 200; preencher dados do operador antes do protocolo  
> **Status:** não submetido à ANAC

## 1. Solicitante

- **Operador:** `[RAZÃO SOCIAL DO OPERADOR RBAC 135]`
- **CNPJ:** `[CNPJ]`
- **COA:** `[NÚMERO]`
- **Responsável perante a ANAC:** `[NOME/CARGO]`
- **Fornecedor do software:** AirTrust
- **Responsável técnico do software:** `[NOME/CARGO]`
- **Contato:** `[E-MAIL/TELEFONE]`

## 2. Objeto da reunião

Solicitar orientação prévia para o desenvolvimento, avaliação, ateste e futura autorização de uso de um sistema de Diário de Bordo Digital — eDB, integrado ao módulo Controle de Voos do AirTrust, destinado inicialmente a operações certificadas sob o RBAC nº 135.

O projeto não pretende utilizar o AirTrust como Diário de Bordo oficial antes da conclusão dos processos aplicáveis e da emissão do ato autorizativo. Durante desenvolvimento e avaliação, o Diário de Bordo em papel permanecerá como fonte oficial.

## 3. Escopo pretendido

### Incluído

- volumes e termos de abertura/encerramento;
- identificação do operador, proprietário e aeronave;
- registros por voo e etapa;
- tripulação e funções;
- horários e tempos;
- pousos, ciclos, combustível, POB, carga e natureza;
- ocorrências;
- situação técnica exibida ao PIC;
- discrepâncias, ações corretivas ou retardadas e retorno ao serviço;
- assinatura do PIC;
- assinatura do operador ou pessoa designada;
- PED com disponibilidade dos registros;
- funcionamento stand-alone/offline;
- pesquisa, impressão, exportação e fiscalização;
- retenção, recuperação, reconstituição e transferência do acervo.

### Não incluído na primeira autorização

- substituição integral de sistema MRO/SDRMe;
- despacho operacional eletrônico além do conteúdo exigido para o eDB;
- FRMS como registro integrante do eDB;
- integração externa não exigida ou não especificada pela ANAC;
- ativação para operadores ou aeronaves não expressamente autorizados.

## 4. Sistema existente

O AirTrust é uma plataforma SaaS multi-tenant para gestão de tripulações e operações aéreas. Possui frontend web/PWA, API em Cloudflare Workers, banco Cloudflare D1 e armazenamento R2.

O módulo Controle de Voos já mantém dados operacionais de voo, etapas, tripulantes, horários, tempos, pousos, ciclos, combustível, passageiros, carga, natureza e ocorrências. Também possui integração controlada com o SIGVOOS.

Esses dados são atualmente operacionais. Não possuem assinatura regulatória, não constituem uma fonte oficial de Diário de Bordo e não serão convertidos retroativamente em registros oficiais.

## 5. Arquitetura proposta

A arquitetura separa três camadas:

1. **Controle de Voos:** dados operacionais editáveis e integrações;
2. **Rascunho eDB:** projeção validada para revisão, sem valor oficial;
3. **Regulated Records Core:** snapshot imutável, versões, assinaturas, retenção, auditoria e exportação.

Fluxo:

```text
SIGVOOS ou entrada manual
        ↓
Controle de Voos
        ↓
Rascunho eDB com procedência e divergências
        ↓ revisão deliberada
Snapshot regulado
        ↓ assinatura do PIC
Registro pendente de contrassinatura
        ↓ assinatura do operador
Registro completo no volume
```

Dados importados nunca serão assinados automaticamente. O PIC deverá revisar o conteúdo e executar ato deliberado de assinatura.

## 6. Integridade e correções

A proposta prevê:

- conteúdo canônico versionado;
- hash por versão;
- assinatura permanentemente associada ao conteúdo;
- registros append-only;
- correção por nova versão/addendum;
- conservação da versão e assinatura anteriores;
- identificação do autor, motivo e data da correção;
- verificação independente em exportações;
- trilha de auditoria regulatória separada do log operacional.

O algoritmo, a infraestrutura de chaves, o método de assinatura e a evidência temporal serão definidos após a orientação da ANAC e documentados no método de cumprimento.

## 7. Identidade e assinatura

O sistema deverá diferenciar:

- autenticação para acesso;
- intenção de assinatura;
- assinatura eletrônica individual do PIC;
- assinatura de discrepância;
- assinatura de retorno ao serviço;
- assinatura digital do operador;
- assinatura das páginas/exportações.

O ato proposto inclui revisão do conteúdo, declaração inequívoca de intenção, autenticação reforçada, ação deliberada e envelope de evidência não reutilizável.

## 8. PED e funcionamento offline

A aeronave contará com pelo menos um dispositivo provisionado para o eDB. A proposta técnica prevê:

- identificação e inventário do dispositivo;
- armazenamento local cifrado;
- registros dos últimos 30 dias;
- situação técnica atual;
- verificação local de integridade;
- operação sem comunicação;
- fila idempotente;
- sincronização auditável;
- revogação do dispositivo;
- tratamento de conflito sem sobrescrever registro assinado.

Solicita-se orientação sobre a aceitação de PWA instalada como PED e sobre o método esperado para assinatura na ausência de conectividade.

## 9. Segurança e multi-tenancy

- todas as entidades são isoladas por operador/tenant;
- o registro guarda snapshot da entidade legal e da aeronave;
- acesso de fiscal é limitado ao operador, aeronave, volume e período;
- terceiros de manutenção recebem permissão restrita ao ato aplicável;
- assinatura não pode ser transferida entre tenant, aeronave, volume ou versão;
- logs não registram credenciais, tokens, conteúdo completo ou dados pessoais desnecessários.

## 10. Continuidade, retenção e portabilidade

O pacote de conformidade deverá conter:

- política de backup;
- testes de restauração;
- verificação periódica de integridade;
- resposta a perda/corrupção;
- procedimento de reconstituição;
- retenção durante toda a existência da aeronave e pelo prazo posterior aplicável;
- transferência de acervo;
- migração para outro sistema;
- plano de descontinuidade submetido à ANAC.

## 11. Desenvolvimento e evidências

A implementação será incremental e protegida por feature flags:

- `disabled`;
- `shadow`;
- `authorized_pending_migration`;
- `official`;
- `suspended`;
- `decommissioning`.

A primeira operação será `shadow`, mantendo o papel oficial e comparando integralmente os registros.

As evidências propostas incluem:

- matriz de conformidade;
- threat model;
- testes automatizados;
- testes de penetração;
- relatório independente de conformidade;
- demonstração funcional;
- drill de restauração;
- teste offline;
- verificador de exportação;
- manuais e treinamento;
- relatório do shadow mode.

## 12. Orientações solicitadas

1. Confirmação da aplicabilidade material da Portaria nº 3.220 compilada após a Resolução nº 773.
2. Alternativa do art. 3º, II, da Resolução nº 458 mais adequada ao SaaS multi-tenant.
3. Requisitos de competência da entidade que emitirá o relatório de conformidade.
4. Método esperado para assinatura do PIC, manutenção e operador.
5. Necessidade de certificado ICP-Brasil individual ou combinação admitida de assinatura eletrônica e digital.
6. Aceitação de PWA instalada como PED.
7. Controles mínimos de dispositivo e funcionamento stand-alone.
8. Tratamento aceitável de assinatura offline e sincronização posterior.
9. Evidência temporal esperada.
10. Forma de acesso para fiscalização.
11. Formato de impressão e exportação.
12. Padrão atual para compartilhamento digital previsto no art. 15 da Resolução nº 773.
13. Critério para classificar atualização do SaaS como mudança do método de cumprimento.
14. Possibilidade de ateste do software multi-tenant com autorizações posteriores por operador.
15. Escopo dos manuais e demonstrações do operador RBAC 135.
16. Aceitação de shadow mode com papel oficial.
17. Forma de delimitar as aeronaves do primeiro cutover.
18. Tratamento de organizações de manutenção e aprovadores terceiros.
19. Procedimentos esperados para perda, corrupção, reconstituição e descontinuidade.
20. Confirmação dos formulários, TFAC e fluxo de processo aplicáveis.

## 13. Resultado esperado da reunião

- definição do caminho de ateste do software;
- definição do caminho de alteração de EO;
- concordância preliminar sobre a fronteira do escopo;
- orientação sobre assinatura e offline;
- orientação sobre entidade avaliadora;
- lista de manuais, FOPs, inspeções e demonstrações;
- registro das questões que exigem manifestação posterior.

## 14. Anexos sugeridos

1. baseline regulatório;
2. matriz de conformidade;
3. ADR arquitetural;
4. mapa de campos e lacunas;
5. plano de implementação;
6. diagrama de arquitetura;
7. roteiro preliminar de demonstração;
8. cronograma indicativo sem compromisso de data de autorização.
