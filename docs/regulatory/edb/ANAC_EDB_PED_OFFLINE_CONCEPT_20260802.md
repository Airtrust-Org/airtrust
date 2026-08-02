# AirTrust — Conceito de PED e Operação Offline do eDB

> **Data:** 2026-08-02 (BRT)  
> **SHA-base:** `d27d72178a75664ff0fb8ac8f18768b88b8112ca`  
> **Status:** análise arquitetural; não define plataforma final nem autoriza operação  
> **Parent:** issue #694; baseline regulatório na PR #688

## 1. Objetivo

Definir um conceito de operação para que o Diário de Bordo Digital permaneça disponível na aeronave durante toda a operação, inclusive sem comunicação, sem tratar cache web genérico como prova de conformidade.

O desenho deve satisfazer simultaneamente:

- disponibilidade integral do eDB no PED;
- últimos 30 dias de registros a bordo;
- situação técnica consolidada e atualizada;
- funcionamento stand-alone quando não houver comunicação;
- confirmação de leitura das pendências técnicas pelo PIC;
- proteção contra perda, furto, adulteração e uso indevido do dispositivo;
- sincronização idempotente sem sobrescrever registros assinados;
- procedimentos de falha e backup;
- determinação do operador de que o PED não interfere nos sistemas de navegação ou comunicação da aeronave;
- treinamento, controle de configuração e gestão dos aplicativos.

## 2. Referências regulatórias

### Diário de Bordo Digital

A Resolução ANAC nº 773/2025 e a Portaria nº 3.220/SPO/SAR compilada exigem, entre outros pontos:

- os últimos 30 dias de registros disponíveis na aeronave;
- pelo menos um PED funcional durante toda a operação;
- dados consolidados e atualizados;
- impedimento da operação quando não houver acesso integral às informações requeridas;
- funcionamento stand-alone/offline quando não houver comunicação;
- apresentação inicial do termo de abertura, discrepâncias abertas, ações corretivas imediatamente anteriores e termo de encerramento, quando aplicável;
- confirmação de leitura antes de liberar as demais funções quando houver informação técnica pendente.

### EFB e dispositivos eletrônicos portáteis

A IS nº 91-002D trata do uso de informação aeronáutica em formato digital — EFB. A IS nº 91.21-001A e o RBAC nº 135 exigem que o detentor de certificado determine que o dispositivo eletrônico portátil não causa interferência nos sistemas de navegação ou comunicação da aeronave.

A IS nº 135-002G, vigente em 2026, exige que o operador descreva procedimentos de EFB no planejamento e em cada fase do voo, atualização das aplicações, backup em caso de falha, guarda e reporte de problemas.

O processo do eDB não substitui automaticamente a avaliação e os procedimentos de EFB/PED do operador.

## 3. Estado atual e premissas

O AirTrust possui frontend web e infraestrutura de API, banco e armazenamento em nuvem. Este baseline não encontrou evidência suficiente para declarar que o frontend atual oferece:

- pacote local regulado dos últimos 30 dias;
- situação técnica offline;
- cifragem local por dispositivo;
- inventário e revogação de PED;
- fila de comandos regulados;
- assinatura offline verificável;
- detecção de corrupção local;
- sincronização com cadeia causal;
- modo de fiscalização offline.

Essas capacidades devem ser projetadas e demonstradas especificamente. PWA, Service Worker ou armazenamento local, isoladamente, não comprovam atendimento.

## 4. Alternativas de plataforma

<!-- prettier-ignore -->
| Alternativa | Descrição | Vantagens | Riscos/limitações | Uso recomendado |
|---|---|---|---|---|
| PWA instalada | Aplicação web instalável com armazenamento local e Service Worker | Reutiliza React; distribuição simples; atualizações controláveis | Limites de armazenamento e execução em segundo plano; variabilidade por SO/navegador; gestão de chaves e wipe limitada | Protótipo e shadow mode; produção somente após prova e aceitação |
| Aplicação nativa | Aplicativo iOS/Android gerenciado, com keystore/secure enclave | Melhor controle de dispositivo, armazenamento, biometria e execução offline | Novo stack, publicação, suporte e maior custo | Preferível se assinatura offline exigir chave individual protegida |
| Aplicação híbrida | Web UI empacotada em shell nativo | Reuso de frontend e acesso a APIs seguras do dispositivo | Complexidade de bridge, supply chain e atualizações | Opção intermediária a avaliar |
| Terminal dedicado | Hardware e software controlados pelo operador | Configuração homogênea e maior previsibilidade | Custo, logística, manutenção e contingência | Frota pequena ou operação crítica, se exigido pelo método |

Nenhuma alternativa deve ser congelada antes da reunião prévia com a ANAC e de uma prova técnica em dispositivos reais.

## 5. Conteúdo mínimo no PED

O pacote local deve conter somente o necessário para a operação autorizada, mas nunca menos que:

- identidade do operador e da aeronave;
- ato autorizativo e escopo aplicável;
- volume corrente e termo de abertura;
- termo de encerramento anterior, quando aplicável;
- registros dos últimos 30 dias;
- versões e correções desses registros;
- identificação dos signatários e estado das assinaturas;
- situação técnica atual;
- última intervenção de manutenção;
- próxima intervenção e horas restantes;
- discrepâncias abertas;
- ações corretivas ou retardadas imediatamente anteriores;
- referências de retorno ao serviço;
- confirmações de leitura do PIC;
- rascunhos da jornada corrente;
- fila de operações pendentes;
- metadados de integridade, versão e sincronização;
- dados necessários ao verificador local.

O pacote não deve conter dados pessoais ou operacionais de outros tenants, aeronaves ou períodos não necessários.

## 6. Envelope do pacote offline

Contrato conceitual:

```json
{
  "package_version": "edb.offline-package.v1",
  "tenant_id": 7,
  "operator_legal_id": "snapshot",
  "aircraft_id": "uuid",
  "aircraft_registration": "snapshot",
  "device_id": "uuid",
  "authorized_scope_reference": "opaque",
  "generated_at": "RFC3339 UTC",
  "valid_until": "RFC3339 UTC",
  "last_server_sequence": 12345,
  "records_from": "YYYY-MM-DD",
  "records_to": "YYYY-MM-DD",
  "technical_status_version": 42,
  "payload_cipher": "versioned",
  "payload_hash": "algorithm:value",
  "manifest_signature": "opaque",
  "key_reference": "device-bound-reference"
}
```

O exemplo não define algoritmo, banco ou API. A implementação deverá versionar o envelope e preservar compatibilidade com pacotes antigos durante o prazo definido.

## 7. Estados do dispositivo

- `requested`: cadastro solicitado;
- `provisioning`: identidade e configuração sendo instaladas;
- `active`: permitido para o escopo atribuído;
- `degraded`: leitura disponível, escrita restrita por condição conhecida;
- `sync_required`: atualização obrigatória antes de iniciar operação;
- `revoked`: dispositivo não pode abrir novo pacote nem sincronizar comandos;
- `lost_or_stolen`: revogação imediata e resposta a incidente;
- `retired`: retirado de serviço com evidências preservadas.

Nenhum identificador fornecido pelo cliente deve, sozinho, definir a identidade do PED.

## 8. Inicialização operacional

Antes de liberar o registro de uma etapa:

1. autenticar usuário e dispositivo;
2. confirmar tenant, operador, aeronave e escopo;
3. verificar integridade e validade do pacote;
4. verificar se o período mínimo está presente;
5. exibir termo de abertura;
6. exibir discrepâncias abertas;
7. exibir ações corretivas imediatamente anteriores;
8. exibir situação técnica e retorno ao serviço;
9. exigir confirmação de leitura quando aplicável;
10. registrar a versão exata do conteúdo exibido;
11. verificar se a operação pode prosseguir offline;
12. bloquear e apresentar procedimento de contingência quando o acesso não for integral.

O sistema não deve ocultar indisponibilidade técnica atrás de fallback silencioso.

## 9. Armazenamento e proteção local

Controles mínimos:

- cifragem em repouso com chave vinculada ao dispositivo ou mecanismo equivalente;
- separação por operador e aeronave;
- proteção contra exportação indevida de chave;
- bloqueio por autenticação local e política do operador;
- proteção contra downgrade do pacote e do aplicativo;
- integridade de manifesto e payload;
- expiração e atualização obrigatória;
- limpeza segura após revogação, respeitando evidências ainda não sincronizadas;
- não armazenar token de longa duração em texto claro;
- logs locais sanitizados e limitados;
- limite de tentativas e resposta a dispositivo comprometido;
- política de backup que não replique chaves privadas sem controle.

A LGPD e a retenção regulatória devem ser tratadas separadamente: minimizar dados pessoais não autoriza apagar registros cuja guarda é obrigatória.

## 10. Modelo de sincronização

### Princípios

- cada operação recebe identificador idempotente;
- comandos carregam tenant, aeronave, registro, versão e sequência;
- o servidor valida novamente identidade e prerrogativas;
- sincronização não modifica bytes de conteúdo assinado;
- conflitos são colocados em quarentena;
- o servidor não usa “última escrita vence” em dados regulados;
- confirmação do servidor é persistida no PED;
- falha parcial pode ser retomada;
- leitura e escrita possuem checkpoints independentes.

### Estados de comando

- `local_pending`;
- `sealed`;
- `queued`;
- `transmitting`;
- `accepted`;
- `rejected_retriable`;
- `rejected_permanent`;
- `conflict_quarantined`;
- `revocation_hold`.

### Sequência conceitual

```text
PED                         Worker                      Records Core
 | cria comando local          |                             |
 | sela conteúdo               |                             |
 |---------------------------->| valida dispositivo/tenant   |
 |                             | valida idempotência          |
 |                             | valida versão/prerrogativa   |
 |                             |----------------------------->|
 |                             | commit atômico               |
 |<----------------------------| recibo + sequência           |
 | marca como aceito           |                             |
```

## 11. Conflitos

Conflitos que exigem bloqueio ou revisão humana:

- registro base mudou após o rascunho offline;
- duas correções concorrentes;
- troca de PIC não sincronizada;
- discrepância aberta por outro dispositivo;
- situação técnica mais nova no servidor;
- dispositivo revogado durante a operação;
- sequência local regressiva;
- relógio local incompatível;
- pacote expirado;
- ato autorizativo ou escopo alterado;
- aeronave transferida ou volume encerrado.

O sistema deve preservar ambos os lados e produzir decisão auditável. Não deve mesclar texto ou assinatura automaticamente.

## 12. Assinatura offline

A escrita offline pode seguir uma de três abordagens, sujeitas a aceitação:

1. assinatura somente online e procedimento de contingência;
2. chave individual protegida no PED, com envelope verificável;
3. assinatura eletrônica individual offline combinada com assinatura digital posterior do operador.

Não é aceitável registrar apenas um clique local e convertê-lo posteriormente em assinatura sem demonstrar identidade, intenção, conteúdo, finalidade, integridade e evidência temporal.

A arquitetura de escrita offline só deve começar depois do ADR de assinatura e da orientação da ANAC. O primeiro incremento técnico deve ser leitura offline.

## 13. Relógio e evidência temporal

O horário do PED não pode ser fonte única.

Controles candidatos:

- último horário confiável recebido do servidor;
- contador monotônico por dispositivo;
- sequência assinada do pacote;
- registro do desvio de relógio;
- trusted timestamp quando a comunicação retornar;
- marcação explícita de `claimed_at`, `sealed_at` e `accepted_at`;
- bloqueio quando o desvio exceder limite aceito;
- conservação da incerteza temporal na evidência.

A regra jurídica para o instante da assinatura offline deve ser confirmada com a ANAC.

## 14. Revogação, perda e troca do PED

Procedimento mínimo:

1. reportar perda/furto/falha;
2. revogar dispositivo e credenciais;
3. impedir novos pacotes e comandos;
4. identificar operações locais ainda não sincronizadas;
5. avaliar exposição de dados;
6. provisionar substituto;
7. restaurar pacote íntegro;
8. reconciliar a jornada;
9. registrar incidente e decisão operacional;
10. executar wipe remoto quando tecnicamente possível;
11. manter evidências necessárias à investigação.

O operador deve definir equipamento reserva ou outra contingência capaz de manter o acesso integral requerido.

## 15. Atualização e controle de configuração

O PED deve possuir:

- versão mínima obrigatória;
- lista de versões autorizadas;
- assinatura/verificação do pacote do aplicativo;
- canal de distribuição controlado;
- rollback somente para versão autorizada e compatível;
- inventário de sistema operacional e patch;
- janela de atualização;
- teste prévio em dispositivo representativo;
- bloqueio de versão incompatível com o schema do registro;
- evidência de treinamento quando a mudança afetar procedimentos;
- avaliação de impacto no método de cumprimento.

Atualização automática não pode mudar silenciosamente canonicalização, assinatura, retenção, apresentação regulatória ou comportamento offline.

## 16. Fases de voo e fatores humanos

O operador deve definir quando o PED pode ser manipulado, considerando fases críticas, carga de trabalho e instalação/suporte físico.

A interface deve:

- priorizar situação técnica e pendências;
- tornar estado offline evidente sem alarmismo;
- diferenciar rascunho, registro assinado e sincronização pendente;
- impedir toque acidental de assinatura;
- permitir revisão legível em iluminação e condições operacionais;
- não depender de cor como único indicador;
- apresentar falha e contingência em linguagem operacional;
- evitar notificações não essenciais durante fases críticas.

## 17. Determinação de não interferência

Para cada combinação de dispositivo, aeronave e instalação, o operador deve documentar a determinação requerida pelo RBAC nº 135 e procedimentos relacionados.

O pacote deve registrar:

- modelo e versão do hardware;
- sistema operacional;
- conectividade habilitada;
- fonte de alimentação e suporte;
- aeronaves/modelos avaliados;
- método e evidência da avaliação;
- limitações de uso;
- responsável e aprovação;
- data de vigência e revisão;
- procedimento após mudança de hardware, software ou instalação.

O AirTrust pode armazenar a referência da determinação, mas não pode emitir essa conclusão técnica em nome do operador.

## 18. Testes mínimos

### Leitura offline

- iniciar sem rede com pacote válido;
- confirmar presença dos 30 dias;
- exibir situação técnica correta;
- pacote expirado;
- manifesto adulterado;
- payload corrompido;
- armazenamento insuficiente;
- usuário de outro tenant;
- dispositivo revogado;
- versão de aplicativo incompatível.

### Sincronização

- perda de rede em cada etapa;
- retry e idempotência;
- resposta duplicada;
- comando fora de ordem;
- duas redes alternadas;
- dois PEDs na mesma aeronave;
- situação técnica atualizada durante voo;
- volume encerrado remotamente;
- fila grande e retomada por checkpoint.

### Segurança

- extração do armazenamento local;
- token roubado;
- troca de relógio;
- downgrade;
- root/jailbreak conforme política;
- perda/furto;
- revogação;
- tentativa cross-tenant;
- logs sem PII, token ou payload completo.

### Operação

- dispositivo principal falha;
- dispositivo reserva;
- ausência total de comunicação;
- troca de tripulação;
- discrepância aberta;
- retorno ao serviço;
- fiscalização em solo;
- jornada atravessando meia-noite e fuso.

## 19. Métricas operacionais permitidas

Somente dados sanitizados e agregados:

- versão do aplicativo;
- estado do dispositivo;
- idade do pacote;
- duração e resultado da sincronização;
- quantidade de comandos por estado;
- código de erro;
- divergência de sequência;
- integridade válida/inválida;
- armazenamento disponível agregado.

Não registrar em telemetria:

- token;
- chave;
- conteúdo do Diário de Bordo;
- nomes, CPF ou e-mail;
- payload SCORM ou dados de outros módulos;
- certificado privado;
- localização detalhada sem base e necessidade definidas.

## 20. Perguntas para a ANAC

1. PWA instalada pode ser aceita como PED stand-alone para eDB?
2. Quais evidências de funcionamento offline serão exigidas?
3. Os últimos 30 dias precisam estar integralmente legíveis sem autenticação online?
4. Qual procedimento é esperado quando o pacote estiver expirado ou incompleto?
5. Um segundo PED é exigido ou pode haver contingência equivalente?
6. A determinação de não interferência deve ser individual por modelo de aeronave e dispositivo?
7. Quais controles de MDM, cifragem e revogação são esperados?
8. Como deve ser tratada a assinatura offline e seu instante jurídico?
9. O modo de fiscalização precisa funcionar offline?
10. Quais mudanças de hardware, SO ou aplicação exigem nova demonstração ou atualização de manuais?
11. A operação pode prosseguir em modo degradado somente leitura?
12. Quais dados devem compor exatamente o pacote dos 30 dias?

## 21. Recomendação incremental

### Etapa 1 — protótipo read-only

- pacote sintético;
- leitura offline;
- manifesto e integridade;
- situação técnica;
- últimos 30 dias;
- revogação simulada;
- nenhum dado real e nenhuma assinatura.

### Etapa 2 — shadow mode controlado

- dados reais autorizados;
- MDM e dispositivo inventariado;
- comparação com papel;
- métricas e testes de falha;
- sem valor oficial.

### Etapa 3 — fila de rascunhos

- escrita operacional não assinada;
- idempotência;
- conflitos;
- retomada.

### Etapa 4 — assinatura offline

Somente após manifestação da ANAC, ADR de assinatura, threat model fechado e avaliação independente.

### Etapa 5 — modo oficial

Somente após ateste do software, EO/LOA, manuais, treinamento, determinação de não interferência e cutover autorizado.

## 22. Critérios de bloqueio

Não avançar para uso oficial quando houver:

- dependência de comunicação contínua;
- menos de 30 dias disponíveis;
- situação técnica ausente ou desatualizada;
- armazenamento local sem cifragem e integridade;
- dispositivo sem identidade ou revogação;
- conflito resolvido por última escrita;
- assinatura offline sem método aceito;
- relógio local como única evidência;
- ausência de contingência;
- determinação de não interferência inexistente;
- manuais e treinamento incompatíveis com o comportamento real;
- vazamento cross-tenant;
- atualização capaz de alterar método de cumprimento sem controle.

## 23. Próximo passo

Submeter as perguntas deste conceito junto ao FOP 200 da issue #690. Em paralelo, preparar um protótipo read-only com dados sintéticos e uma matriz de dispositivos candidatos, sem integrar ao runtime do AirTrust até a decisão arquitetural.
