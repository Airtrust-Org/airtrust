# AirTrust — Especificação de Produto e Arquitetura
## Controle de Voos / RDV Offline-First para Tablet

Data: 2026-09-09
Baseline revisada: main em a7b92b5276a7ed0280c85b73796238377327d3b4
Status: especificação e plano de implementação; sem deploy, sem migration aplicada e sem promoção regulatória
Escopo: Controle de Voos, RDV operacional, experiência do piloto em tablet, sincronização offline e preparação arquitetural para eDB shadow

---

## 1. Objetivo

Transformar o Controle de Voos/RDV do AirTrust em um workspace operacional do voo, pensado para uso real pelo piloto em tablet e capaz de funcionar sem comunicação durante a missão.

O piloto deve conseguir:

- receber o voo preparado antes da saída;
- confirmar que o voo está pronto para uso offline;
- abrir o voo no tablet durante toda a operação;
- consultar dados essenciais já baixados;
- preencher e revisar o RDV sem internet;
- registrar etapas, horários, combustível, POB, carga, pousos, ocorrências e abastecimentos;
- fechar e reabrir o aplicativo, inclusive após refresh, sem perder o que já foi digitado;
- manter alterações persistidas localmente até existir conexão novamente;
- reconciliar e transmitir os dados com segurança ao retornar à conectividade;
- liberar o voo para a Coordenação somente por ação deliberada do piloto;
- receber confirmação inequívoca de que a Coordenação recebeu o pacote.

O desenho deve reutilizar a arquitetura atual de Controle de Voos e a projeção eDB shadow, mas não deve declarar o RDV offline como Diário de Bordo oficial ou assinatura regulatória.

---

## 2. Premissas confirmadas na main

A baseline revisada já possui componentes importantes que devem ser preservados:

- Controle de Voos persistido e tenant-scoped;
- RDV operacional com fluxo de piloto;
- tripulantes por voo;
- múltiplas etapas em cv_voo_etapas;
- abastecimentos e anexos;
- autosave online;
- concorrência otimista por versão;
- fila da Coordenação;
- devolução, reabertura, revisão e envio;
- projeção RDV para eDB shadow;
- integração Controle de Voos / FRMS;
- dados meteorológicos via REDEMET no backend;
- manifest instalável do AirTrust;
- padrão offline simples já utilizado no SGSO;
- documentação específica para conceito PED/eDB offline.

Também foram confirmadas limitações atuais que tornam o requisito deste documento ainda não atendido:

1. O autosave do RDV atual persiste primariamente no servidor.
2. A recuperação parcial usa sessionStorage para alguns rascunhos de etapa.
3. sessionStorage não é a base adequada para sobrevivência robusta a fechamento, refresh e operação prolongada sem rede.
4. O app geral atualmente desregistra Service Workers em produção para impedir regressões históricas de cache/login.
5. O Service Worker legado não deve ser reativado como cache global.
6. Não existe hoje um vault IndexedDB dedicado ao Controle de Voos.
7. Não existe outbox durável do RDV com idempotência ponta a ponta.
8. Não existe contrato de pacote de voo offline específico para o RDV operacional.
9. Não existe experiência de readiness para o piloto comprovar antes da decolagem que o pacote está disponível offline.

Conclusão: o modo offline deve ser uma nova fundação específica e isolada. Não deve ser um pequeno ajuste no autosave atual.

---

## 3. Princípio de produto

O conceito central é:

UM VOO = UM WORKSPACE OPERACIONAL

O piloto não deve navegar por vários módulos para executar uma missão. Ao abrir um voo, ele deve encontrar em uma única experiência:

- resumo;
- planejamento;
- meteorologia;
- etapas/RDV;
- combustível;
- documentos;
- performance, quando tecnicamente homologada no produto;
- mapa/rota;
- alertas operacionais;
- estado de sincronização.

O AirTrust deve usar o vídeo de benchmark como referência conceitual, mas não copiar sua interface. O objetivo é manter a densidade operacional útil e entregar uma UX contemporânea, responsiva e segura para toque.

---

## 4. Decisão arquitetural recomendada

### 4.1 Criar um Pilot Offline App dedicado

Recomendação: criar uma superfície dedicada no mesmo repositório e no mesmo domínio, com escopo próprio, por exemplo:

/pilot/

Essa superfície terá:

- entrada própria do frontend;
- manifest próprio;
- Service Worker próprio e restrito ao escopo /pilot/;
- armazenamento IndexedDB próprio;
- shell de UI específico para piloto;
- lógica de sessão offline específica;
- integração com as mesmas APIs AirTrust quando houver rede.

O AirTrust administrativo geral permanece network-first e sem Service Worker global.

### 4.2 Por que não reutilizar o Service Worker geral

O runtime geral foi descomissionado devido a problemas anteriores de cache e entrada/login. Reativar cache no escopo raiz aumentaria o raio de risco sobre:

- login;
- refresh de sessão;
- FRMS;
- simuladores;
- páginas administrativas;
- atualizações de frontend;
- invalidação de bundles.

O Pilot Offline App deve ter cache namespaced e scope limitado.

Exemplo de famílias de cache:

- airtrust-pilot-shell-vN
- airtrust-pilot-static-vN

Ele nunca deve criar cache airtrust-vN no escopo raiz.

### 4.3 API não será cacheada pelo Service Worker

Regra de arquitetura:

Service Worker serve o shell offline.
IndexedDB armazena os dados operacionais offline.

Não usar cache HTTP do Service Worker como banco de dados de voo.

As respostas de API importantes são normalizadas pelo aplicativo e escritas explicitamente no vault offline. Isso reduz ambiguidade entre dado fresco, stale e autorizado.

---

## 5. Experiência do piloto

### 5.1 Tela Meus Voos

Cada voo deve aparecer como card operacional com:

- matrícula;
- data;
- rota;
- horário;
- função do usuário;
- aeronave;
- situação;
- última atualização;
- disponibilidade offline;
- quantidade de alterações locais pendentes.

Estados visuais recomendados:

- Preparar para voo;
- Baixando;
- Pronto offline;
- Atualização necessária;
- Offline em uso;
- Alterações pendentes;
- Pronto para transmitir;
- Transmitindo;
- Recebido pela Coordenação;
- Conflito requer revisão.

### 5.2 Preparar para voo

Antes da saída, o piloto toca em Preparar para voo.

O AirTrust deve:

1. validar autenticação online;
2. confirmar tenant ativo;
3. confirmar que o usuário integra o voo ou possui permissão explícita;
4. montar o pacote offline;
5. baixar o pacote;
6. verificar integridade;
7. testar escrita local;
8. testar leitura local;
9. verificar espaço livre;
10. confirmar versão mínima do app;
11. registrar a disponibilidade local;
12. mostrar um resultado operacional claro.

Resultado esperado:

PRONTO PARA USO OFFLINE

com:

- voo;
- aeronave;
- pacote atualizado em;
- validade local;
- documentos essenciais disponíveis;
- última meteorologia disponível;
- armazenamento local disponível;
- versão do app.

Se qualquer item bloqueante falhar, o AirTrust deve informar exatamente o que falta. Não deve mostrar readiness falso.

### 5.3 Durante o voo

A barra superior permanece compacta e persistente:

- matrícula;
- rota/etapa atual;
- ONLINE ou OFFLINE;
- Salvo no tablet;
- quantidade de itens aguardando sincronização;
- bateria/conectividade apenas quando disponível de forma confiável pelo browser.

O modo offline não deve ser tratado como erro.

Mensagem desejada:

OFFLINE — operação local ativa
Tudo o que você registrar será mantido neste tablet.

### 5.4 Navegação interna do voo

Abas principais:

1. Resumo
2. Planejamento
3. MET
4. Etapas / RDV
5. Combustível
6. Documentos
7. Performance
8. Mapa

Em tablet estreito, usar barra inferior ou tabs roláveis sem depender de hover.

---

## 6. Requisitos de UX tablet

### 6.1 Dispositivos alvo iniciais

Testar pelo menos:

- iPad em Safari;
- iPad instalado na Tela de Início;
- Android tablet em Chrome;
- Android instalado como PWA;
- orientação portrait;
- orientação landscape.

### 6.2 Regras visuais

- alvo de toque mínimo de aproximadamente 44 a 48 px;
- nenhum campo crítico dependente de hover;
- evitar tabelas horizontais extensas;
- preferir cards por etapa;
- teclado numérico para combustível, POB, carga, pousos e horas quando aplicável;
- labels sempre visíveis;
- erros próximos ao campo;
- status offline também por texto/ícone, nunca apenas cor;
- botões destrutivos separados de ações primárias;
- ação de transmissão não deve ficar próxima a remover/limpar;
- zero modal desnecessário durante operação;
- layouts legíveis sob alta luminosidade;
- modo escuro pode existir, mas não é critério para a primeira entrega.

### 6.3 Política de scroll

Uma rolagem principal por tela.

Evitar áreas internas com overflow que possam prender o gesto no tablet.

---

## 7. Persistência offline

### 7.1 IndexedDB como fonte local

Criar um vault IndexedDB versionado específico do Pilot App.

Nome conceitual:

airtrust-pilot-v1

Stores iniciais:

- meta
- offline_leases
- flight_packages
- flights
- rdv_drafts
- stage_drafts
- fuel_entries
- attachments
- outbox
- sync_receipts
- conflicts

### 7.2 Regra de durabilidade

Toda edição operacional deve ser salva localmente antes de a UI afirmar Salvo no tablet.

Não depender de:

- estado React;
- Zustand isolado;
- React Query;
- sessionStorage;
- fechamento limpo da página.

Cada alteração relevante recebe:

- local_revision;
- local_sequence;
- updated_at_claimed;
- entity_type;
- entity_local_id;
- flight_id;
- tenant_id.

### 7.3 Refresh e crash

Após refresh sem internet:

1. o shell do Pilot App carrega pelo Service Worker;
2. o vault abre;
3. o lease local é verificado;
4. o voo ativo é restaurado;
5. o último snapshot local é mostrado;
6. a fila pendente continua intacta.

Critério de aceite fundamental:

digitar um valor, receber o status Salvo no tablet, colocar o tablet em modo avião, recarregar a página e encontrar exatamente o mesmo valor.

### 7.4 Eventos de flush adicionais

Persistir também em:

- blur do campo;
- troca de etapa;
- visibilitychange;
- pagehide;
- comando Finalizar voo.

Esses eventos são redundância. A segurança principal continua sendo a persistência contínua no IndexedDB.

---

## 8. Segurança do vault local

### 8.1 Não armazenar payload operacional sensível em claro

A recomendação para o Pilot App é cifrar o payload persistido localmente com Web Crypto.

Abordagem inicial:

- gerar chave aleatória do vault no dispositivo;
- cifrar registros com AES-GCM;
- nunca armazenar a chave do vault em texto claro;
- envolver a chave do vault com uma chave derivada de PIN offline do usuário;
- PBKDF2 ou mecanismo Web Crypto equivalente com parâmetros versionados;
- armazenar somente salt, parâmetros e chave envolvida;
- bloquear o vault após período de inatividade configurável.

O PIN offline não é a senha do AirTrust.

### 8.2 Sessão offline

O Pilot App não deve tratar um token expirado como autorização permanente.

Antes do voo, o servidor emite um lease de uso offline específico, assinado e de finalidade exclusiva.

Campos mínimos:

- lease_version;
- purpose = offline_flight_lease;
- tenant_id;
- user_id;
- funcionario_id;
- flight_ids;
- device_id;
- issued_at;
- valid_from;
- valid_until;
- app_min_version;
- allowed_local_actions;
- nonce.

O cliente verifica a assinatura localmente com chave pública embutida/versionada.

Esse lease:

- autoriza somente abrir e editar os voos já provisionados localmente;
- nunca é enviado como Bearer;
- nunca é aceito pelo backend como substituto do login;
- não autoriza troca de tenant;
- não autoriza acessar outros módulos;
- não autoriza promover o conteúdo a registro regulado.

### 8.3 Reconexão

Ao sincronizar:

- autenticação online normal volta a ser obrigatória;
- servidor revalida tenant, usuário, função e voo;
- lease local não substitui RBAC do backend;
- comando de outro tenant falha fechado.

Isso preserva o princípio AirTrust de que frontend não concede autorização.

---

## 9. Pacote offline do voo

### 9.1 Conteúdo recomendado

O pacote inicial contém somente o necessário para o piloto executar o voo provisionado.

Identificação:

- flight_id;
- número do RDV, quando existente;
- data;
- matrícula;
- modelo;
- natureza;
- status.

Tripulação:

- nomes necessários;
- função por etapa;
- referências operacionais necessárias;
- somente dados mínimos.

Etapas:

- sequência;
- origem;
- destino;
- horários planejados;
- horários reais já conhecidos;
- combustíveis;
- POB/pax;
- payload;
- pousos;
- starts;
- tempos existentes.

Planejamento:

- combustível planejado;
- autonomia quando houver fonte;
- observações da coordenação;
- rota prevista.

Helidecks/localidades:

- identificador;
- nome;
- coordenadas;
- dados necessários ao safety check;
- versão do catálogo.

MET:

- último snapshot disponível;
- timestamp de emissão/coleta;
- fonte;
- validade quando conhecida;
- aviso de stale offline.

Documentos:

- documentos essenciais marcados para uso offline;
- hash;
- tamanho;
- mime type;
- conteúdo local quando permitido.

Estado técnico:

- somente leitura e somente quando existir fonte confiável;
- snapshot com timestamp;
- nunca inferido a partir de texto livre.

### 9.2 Integridade

O pacote possui:

- package_id;
- package_version;
- generated_at;
- valid_until;
- tenant_id;
- user_id;
- flight_id;
- manifest;
- hash de cada artefato;
- hash do manifest;
- assinatura do envelope.

O Pilot App verifica o pacote antes de marcar Pronto offline.

---

## 10. RDV por etapas

A seção Etapas deve explorar melhor o que o schema atual já suporta.

Cada etapa deve permitir:

- origem;
- destino;
- partida de motores;
- decolagem;
- pouso;
- corte de motores;
- tempo total;
- tempo de navegação;
- IFR;
- noturno;
- pousos diurnos;
- pousos noturnos;
- starts;
- combustível início;
- combustível fim;
- POB/PAX;
- payload/carga;
- observação da etapa.

Campos não comprovados tecnicamente não devem ser derivados silenciosamente.

### 10.1 Ações rápidas de horário

Em vez de digitar todos os horários, oferecer ações grandes:

PARTIDA
DECOLAGEM
POUSO
CORTE

Ao tocar, o dispositivo captura:

- client_claimed_at;
- monotonic_sequence;
- last_trusted_server_time;
- clock_drift_estimate, quando possível.

O usuário pode corrigir o horário depois, mas a correção deve ser identificável no histórico operacional.

Para uso regulado futuro, a semântica temporal será governada separadamente.

---

## 11. Combustível

A tela Combustível deve consolidar:

- combustível planejado;
- combustível inicial;
- combustível por etapa;
- combustível final;
- consumo;
- abastecimentos;
- unidade;
- local;
- fornecedor;
- número do comprovante;
- foto/anexo.

Visual:

Planejado → Partida → Etapa 1 → Abastecimento → Etapa 2 → Final

Não tratar toda diferença como erro. O sistema deve distinguir:

- dado ausente;
- dado incoerente;
- diferença operacional esperada;
- alerta configurável.

---

## 12. Anexos offline

O piloto deve poder capturar anexos sem internet.

Primeira aplicação:

- comprovante de abastecimento;
- documento operacional permitido;
- fotografia vinculada a um item.

Fluxo:

1. captura no tablet;
2. blob cifrado no IndexedDB;
3. thumbnail local;
4. outbox registra upload pendente;
5. reconexão envia para R2 pelo fluxo autenticado;
6. recibo do servidor remove somente a cópia marcada como sincronizada, respeitando política local.

Antes de voo, usar navigator.storage.estimate quando disponível e alertar espaço insuficiente.

Solicitar persistent storage quando suportado, mas nunca assumir que o browser garantiu persistência só porque a API foi chamada.

---

## 13. Meteorologia offline

Meteorologia offline é snapshot, não atualização.

A interface deve mostrar:

MET armazenada no tablet
Atualizada em: data/hora
Sem conexão para atualização

Nunca ocultar a idade do dado.

O Pilot App não deve afirmar que uma informação meteorológica continua válida apenas porque está disponível localmente.

---

## 14. Helideck Safety Check

Criar uma capacidade específica de prevenção de identificação de unidade incorreta.

### 14.1 Fonte

Usar catálogo versionado e controlado de unidades/helidecks.

Cada registro pode conter:

- designador;
- nome;
- coordenadas;
- tipo;
- aliases;
- operador;
- status;
- observações operacionais autorizadas.

### 14.2 Cálculo offline

O pacote baixa os pontos relevantes.

O tablet calcula localmente:

- distância do destino planejado para unidades vizinhas;
- nomes/designadores semelhantes;
- proximidade configurável;
- possíveis ambiguidades.

### 14.3 UI

Exemplo:

ATENÇÃO — unidades próximas ao destino

Destino planejado: P-XX
P-XY: 1,6 NM
P-XZ: 4,9 NM

Confirmar coordenadas e identificação visual conforme procedimento operacional.

Não apresentar isso como navegação certificada.

### 14.4 GPS

O uso de GPS do tablet pode ser avaliado futuramente como apoio de consciência situacional, mas:

- não deve ser requisito do primeiro release;
- não deve comandar navegação;
- não substitui aviônicos certificados;
- deve ser claramente rotulado como informação auxiliar.

---

## 15. Mapa offline

### 15.1 Primeira versão

Não depender de tiles remotos durante o voo.

Entregar primeiro um Route Schematic:

- pontos;
- pernas;
- distância;
- coordenadas;
- destino;
- helidecks próximos;
- alertas.

Tudo renderizado com dados vetoriais do pacote.

### 15.2 Mapa cartográfico futuro

Tiles offline só entram após decisão sobre:

- provedor;
- licenciamento;
- volume;
- armazenamento;
- atualização;
- região;
- uso operacional permitido.

---

## 16. Documentos do voo

Criar Dossiê Digital do Voo.

Categorias possíveis:

- planejamento;
- manifesto;
- MET;
- NOTAM/documentação externa permitida;
- abastecimento;
- coordenação;
- anexos do piloto.

Cada documento apresenta:

- nome;
- categoria;
- fonte;
- atualizado em;
- disponível offline sim/não;
- tamanho;
- integridade;
- versão.

Documentos críticos não devem ser apenas links web.

---

## 17. Performance e Power Check

Esta frente deve existir no produto, mas não pode ser construída com números genéricos.

Regras:

- configuração por modelo de aeronave;
- fonte técnica rastreável;
- revisão por versão do manual/dado;
- unidade explícita;
- limites versionados;
- nenhuma tabela inventada;
- nenhuma interpolação não autorizada;
- histórico da versão de dados usada no voo.

A UI pode ser preparada antes dos cálculos técnicos, mas permanecer indisponível por modelo até a fonte ser validada.

---

## 18. Fluxo offline de encerramento

O piloto deve conseguir concluir o preenchimento offline.

Estados locais propostos:

- draft_local;
- ready_to_transmit;
- transmitting;
- synced;
- handoff_pending;
- handed_to_coordination;
- conflict;
- rejected.

### 18.1 Finalizar offline

Ao tocar Finalizar voo:

- validar campos mínimos localmente;
- persistir um snapshot fechado local;
- marcar ready_to_transmit;
- não fingir que a Coordenação recebeu;
- permitir reabertura local somente por ação explícita e com nova revisão local.

### 18.2 Reconectar

Ao detectar rede:

- mostrar Conexão restaurada;
- sincronizar rascunhos permitidos em background;
- não executar handoff à Coordenação silenciosamente.

O botão principal passa a ser:

TRANSMITIR PARA COORDENAÇÃO

Depois do aceite do servidor:

RECEBIDO PELA COORDENAÇÃO
data/hora do servidor
protocolo/identificador do recebimento

---

## 19. Outbox e sincronização

### 19.1 Comando local

Toda mutação que precise chegar ao servidor possui:

- client_operation_id UUID;
- tenant_id;
- user_id;
- flight_id;
- entity_type;
- entity_id;
- operation_type;
- base_server_version;
- local_sequence;
- claimed_at;
- payload;
- payload_hash;
- created_at_local.

### 19.2 Endpoint recomendado

Criar endpoint de lote dedicado, conceitualmente:

POST /api/controle-voos/pilot/offline-sync

O endpoint recebe uma lista ordenada de comandos.

### 19.3 Resposta por comando

Estados:

- accepted;
- already_accepted;
- rejected_retriable;
- rejected_permanent;
- conflict.

Resposta inclui:

- client_operation_id;
- server_received_at;
- server_entity_version;
- canonical_entity_id quando necessário;
- error_code seguro;
- conflict metadata mínima.

### 19.4 Idempotência

O servidor precisa lembrar client_operation_id já processados.

Isso exige persistência server-side; não pode depender apenas de memória do Worker.

Tabela conceitual futura:

cv_offline_sync_receipts

Campos mínimos:

- id;
- empresa_id;
- client_operation_id;
- voo_id;
- usuario_id;
- device_id;
- command_type;
- payload_hash;
- result_status;
- entity_version;
- received_at.

Constraint de unicidade por tenant + client_operation_id.

Nenhuma migration é autorizada por esta especificação; a futura alteração deve seguir Schema V2 e o workflow governado.

---

## 20. Conflitos

Regra absoluta:

NÃO usar last-write-wins.

Exemplos de conflito:

- Coordenação altera aeronave após o pacote ser baixado;
- outra pessoa altera tripulação;
- RDV foi reaberto/fechado no servidor;
- mesma etapa mudou no servidor;
- duas tablets editaram o mesmo voo;
- voo foi cancelado;
- usuário perdeu autorização;
- tenant mudou;
- pacote expirou.

O servidor deve preservar o comando local e retornar conflito estruturado.

UX:

CONFLITO DE SINCRONIZAÇÃO
Os dados do servidor mudaram enquanto este tablet estava offline.

Mostrar:

- valor local;
- valor do servidor;
- campo/entidade;
- horário de cada versão;
- ação permitida.

Não fazer merge automático de campos críticos.

---

## 21. Dois tablets no mesmo voo

O desenho deve suportar o cenário, mesmo que inicialmente não seja incentivado.

Regras:

- cada dispositivo tem device_id;
- cada comando tem client_operation_id;
- mesma entidade usa base_server_version;
- servidor rejeita atualização baseada em versão antiga;
- conflito é explícito;
- envio para Coordenação exige estado reconciliado.

Não assumir que PIC e SIC usarão sempre o mesmo equipamento.

---

## 22. Device registry operacional

Recomendação para fase posterior do MVP offline:

cv_pilot_devices

Campos conceituais:

- id;
- empresa_id;
- user_id;
- public_device_id;
- label;
- platform;
- app_version;
- state;
- provisioned_at;
- last_seen_at;
- revoked_at.

Estados:

- active;
- degraded;
- revoked;
- lost;
- retired.

O public_device_id não é identidade forte sozinho.

A função principal é:

- inventário;
- revogação;
- suporte;
- diagnóstico;
- emissão de lease.

---

## 23. Arquitetura de frontend proposta

Novos artefatos conceituais:

- pilot.html
- public/pilot.webmanifest
- public/pilot-sw.js
- src/react-app/pilot/main.tsx
- src/react-app/pilot/PilotApp.tsx
- src/react-app/pilot/offline/db.ts
- src/react-app/pilot/offline/vault.ts
- src/react-app/pilot/offline/lease.ts
- src/react-app/pilot/offline/package.ts
- src/react-app/pilot/offline/outbox.ts
- src/react-app/pilot/offline/sync.ts
- src/react-app/pilot/offline/connectivity.ts
- src/react-app/pilot/components/OfflineStatusBar.tsx
- src/react-app/pilot/components/FlightReadinessCard.tsx
- src/react-app/pilot/pages/PilotFlightsPage.tsx
- src/react-app/pilot/pages/PilotFlightWorkspace.tsx

Reaproveitar componentes de Controle de Voos quando não criarem acoplamento com o App administrativo.

Não duplicar regras de negócio de RDV sem necessidade. Extrair funções puras compartilhadas.

---

## 24. Ajuste obrigatório no cleanup de Service Worker

O sw-manager atual remove registros existentes.

Ao introduzir o Pilot App:

- cleanup do app geral deve remover somente SW legado conhecido;
- jamais unregister do pilot-sw por varredura indiscriminada;
- testes de regressão devem provar que o root app continua sem SW controlador;
- testes devem provar que /pilot/ mantém seu SW dedicado;
- cache do piloto não pode afetar /login, /frms, /simuladores ou demais rotas.

Esse item é P0 de segurança arquitetural.

---

## 25. Backend proposto

Novas responsabilidades:

### 25.1 Offline package

Serviço monta snapshot autorizado do voo.

Rota conceitual:

GET /api/controle-voos/pilot/flights/:id/offline-package

Requisitos:

- auth;
- tenant;
- autorização ao voo;
- payload mínimo;
- manifest;
- hashes;
- lease;
- versão.

### 25.2 Sync

Rota conceitual:

POST /api/controle-voos/pilot/offline-sync

Requisitos:

- auth online;
- tenant;
- autorização atual;
- idempotência;
- concorrência otimista;
- validação Zod;
- transação por comando quando possível;
- nenhum cross-tenant;
- nenhum overwrite silencioso.

### 25.3 Handoff

A transição para Coordenação permanece ação de domínio separada.

O sync dos dados não deve equivaler automaticamente a enviar para Coordenação.

---

## 26. Integração com eDB shadow

O Pilot App alimenta o RDV operacional.

Fluxo:

Pilot Offline App
→ Controle de Voos / RDV operacional
→ projeção eDB shadow
→ divergências/gaps
→ futuro Records Core regulado

Não inverter a dependência.

Enquanto a fonte oficial RDV/eDB e o método de assinatura não estiverem decididos:

- offline do piloto é coleta operacional;
- eDB continua shadow;
- nenhuma assinatura jurídica é criada;
- nenhuma ação local é convertida retroativamente em assinatura oficial.

---

## 27. Estado técnico e manutenção

A UI pode mostrar situação técnica somente quando houver uma fonte confiável e autorizada.

Não transformar:

- divergência do RDV;
- observação do piloto;
- texto de MRO;
- status mock;

em status técnico de aeronave.

Integração regulada com SDRMe/RAS permanece separada.

---

## 28. Métricas

Métricas permitidas e úteis:

- pacotes preparados;
- porcentagem de voos preparados offline;
- tamanho médio do pacote;
- falhas de readiness;
- duração offline;
- número de comandos sincronizados;
- retries;
- conflitos;
- tempo de sincronização;
- transmissões à Coordenação;
- taxa de restauração após refresh;
- falhas de storage.

Evitar telemetria com:

- payload completo;
- token;
- PIN;
- chave;
- PII desnecessária;
- conteúdo de anexos.

---

## 29. Testes obrigatórios

### 29.1 Durabilidade

- editar cada tipo de campo;
- refresh imediato;
- fechar e reabrir;
- matar aba;
- modo avião;
- reiniciar navegador;
- alternar orientação;
- confirmar conteúdo preservado.

### 29.2 Service Worker

- /pilot/ abre offline;
- /login permanece network-only;
- root app não fica controlado pelo pilot SW;
- pilot SW não é removido pelo cleanup geral;
- versão nova do Pilot App atualiza sem destruir outbox;
- bundle incompatível bloqueia uso antes de corromper vault.

### 29.3 Sync

- conexão cai antes do POST;
- conexão cai durante o POST;
- resposta se perde depois do commit;
- retry do mesmo client_operation_id;
- lote parcialmente aceito;
- comando fora de ordem;
- servidor 409;
- servidor 401 e reautenticação;
- servidor 5xx;
- duas redes alternadas;
- outbox com centenas de itens.

### 29.4 Conflitos

- server_version mudou;
- voo cancelado;
- tripulação mudou;
- dois tablets;
- usuário removido do voo;
- tenant divergente;
- device revogado.

### 29.5 Segurança

- cross-tenant;
- lease adulterado;
- lease expirado;
- payload local alterado;
- vault sem PIN correto;
- tentativa de usar lease como token;
- logout;
- troca de usuário;
- perda de tablet;
- storage extraído;
- logs sem secrets.

### 29.6 Tablet real

Executar matriz em aparelhos reais representativos.

Browser em desktop não substitui validação de:

- iPadOS;
- Android;
- PWA instalada;
- background/foreground;
- low-memory;
- quota/eviction;
- rotação;
- teclado virtual.

---

## 30. Critérios de aceite do MVP offline

O MVP só pode ser considerado pronto quando todos forem verdadeiros:

1. piloto prepara o voo online;
2. sistema confirma readiness real;
3. tablet entra em modo avião;
4. piloto abre o voo;
5. piloto edita RDV;
6. cada edição recebe confirmação Salvo no tablet;
7. refresh não perde conteúdo;
8. fechamento/reabertura não perde conteúdo;
9. anexos suportados no escopo não se perdem;
10. outbox é visível;
11. reconexão não sobrescreve servidor silenciosamente;
12. retry é idempotente;
13. conflito é explícito;
14. sync pode ser retomado;
15. piloto transmite deliberadamente à Coordenação;
16. Coordenação recebe;
17. piloto recebe recibo;
18. tenant/RBAC são revalidados no servidor;
19. root AirTrust continua sem regressão de cache/login;
20. eDB continua shadow e corretamente rotulado.

---

## 31. Plano de implementação por frentes

### Fase 0 — Contratos e testes arquiteturais

Objetivo:
fixar regras antes de mexer em runtime.

Entregas:

- ADR do Pilot App;
- contrato do offline package;
- contrato do outbox;
- contrato de sync;
- estados de UI;
- testes do isolamento de Service Worker;
- testes de tenant/idempotência especificados.

Sem migration e sem deploy.

### Fase 1 — Pilot shell e vault local

Entregas:

- /pilot/;
- pilot manifest;
- pilot SW restrito;
- IndexedDB versionado;
- vault cifrado;
- PIN offline;
- lease local;
- readiness local sintético;
- página Meus Voos offline com fixtures controladas.

Critério:
refresh offline preserva dados sintéticos sem tocar o RDV real.

### Fase 2 — Offline package real read-only

Entregas:

- endpoint autenticado de pacote;
- voo real autorizado;
- etapas;
- tripulação;
- dados mínimos;
- MET snapshot;
- helidecks;
- documentos selecionados;
- package manifest;
- verificação local.

Critério:
piloto baixa um voo real autorizado e consegue consultá-lo integralmente em modo avião.

### Fase 3 — RDV offline editável

Entregas:

- formulário operacional em tablet;
- persistência imediata;
- etapas;
- horários;
- combustível;
- POB/carga;
- ocorrências;
- abastecimentos;
- anexos locais;
- validações locais;
- Finalizar voo local.

Critério:
ciclo completo de preenchimento sem rede e sem perda por refresh.

### Fase 4 — Outbox e sincronização

Entregas:

- client_operation_id;
- endpoint batch;
- recibos;
- idempotência server-side;
- concorrência otimista;
- retry;
- conflitos;
- reautenticação;
- recuperação de lote parcial.

Provável necessidade de Schema V2 para receipt/idempotência.

Critério:
modo avião → preencher → reconectar → sync confiável sem duplicação.

### Fase 5 — Handoff Coordenação

Entregas:

- ready_to_transmit;
- Transmitir para Coordenação;
- recibo;
- fila da Coordenação;
- devolução/reabertura preservando versões;
- indicador no tablet.

Critério:
piloto sabe sem ambiguidade se os dados só estão no tablet, no servidor ou já foram entregues à Coordenação.

### Fase 6 — Workspace integrado

Entregas:

- Resumo;
- Planejamento;
- MET;
- Combustível visual;
- Dossiê do Voo;
- Route Schematic;
- Helideck Safety Check.

Critério:
piloto não precisa navegar para outras áreas do AirTrust durante a missão.

### Fase 7 — Performance

Entregas por modelo somente após fonte técnica:

- peso/CG quando aplicável;
- performance;
- power check;
- versões de dados;
- evidência da fonte.

### Fase 8 — eDB shadow offline

Reusar o vault e o pacote para:

- leitura eDB shadow;
- completude;
- divergências;
- evidência de testes.

Não introduzir assinatura jurídica.

### Fase 9 — eDB regulado

Fora do escopo de autorização desta especificação.

Depende de:

- método aceito;
- PED;
- assinatura;
- integridade;
- retenção;
- fiscalização;
- manuais;
- treinamento;
- ateste;
- autorização operacional.

---

## 32. Estratégia de PRs

Evitar uma PR gigante.

Sequência sugerida:

PR 1 — arquitetura e contratos
PR 2 — isolamento Service Worker / pilot shell
PR 3 — IndexedDB vault + testes de durabilidade
PR 4 — offline package read-only
PR 5 — RDV offline editável
PR 6 — sync/idempotência
PR 7 — handoff Coordenação
PR 8 — workspace/UX
PR 9 — Helideck Safety Check
PR 10 — documentos/anexos
PRs específicas por modelo para performance/power check

Mudanças de schema ficam em PR governada própria quando necessárias.

---

## 33. Gates e validação

Cada PR segue:

reprodução/contrato
→ teste focado
→ suíte afetada
→ checks locais aplicáveis
→ GitHub Actions

Antes de merge:

- HEAD;
- base main;
- mergeabilidade;
- oito gates quando aplicáveis ao contrato de release;
- nenhum blocker;
- revisão do delta.

Staging do Pilot App deve incluir validação real em tablet antes de produção.

Produção exige autorização específica do SHA exato e segue o workflow oficial.

---

## 34. Riscos principais

### R1 — Reintroduzir bug de Service Worker no AirTrust geral

Mitigação:
scope dedicado, cleanup seletivo, testes arquiteturais.

### R2 — Browser remover armazenamento local

Mitigação:
PWA instalada, storage persistente quando suportado, readiness, quota checks, testes de dispositivo e política de pacote.

Se o risco operacional continuar alto nos tablets alvo, avaliar shell híbrido/nativo.

### R3 — Tablet perdido

Mitigação:
vault cifrado, PIN offline, TTL, device registry, revogação na próxima conexão, minimização de dados.

### R4 — Dois dispositivos

Mitigação:
base version + idempotência + conflito explícito.

### R5 — Dados meteorológicos desatualizados

Mitigação:
timestamp sempre visível; snapshot nunca se apresenta como atualizado sem rede.

### R6 — Usuário confundir sync com entrega

Mitigação:
estados separados: Salvo no tablet, Sincronizado com AirTrust e Recebido pela Coordenação.

### R7 — Escopo virar eDB regulado prematuramente

Mitigação:
labels, contratos e arquitetura separados.

---

## 35. PWA versus nativo

Decisão recomendada para o primeiro incremento:

PWA dedicada e isolada.

Motivos:

- reaproveita React/TypeScript;
- menor custo de entrega;
- mesma origem e backend;
- atende o objetivo operacional de coleta offline;
- permite provar UX e sincronização.

Entretanto, deve existir um gate explícito após testes reais.

Migrar para shell híbrido ou app nativo se ocorrer qualquer um destes cenários:

- storage/eviction do navegador não for suficientemente previsível;
- política do operador exigir MDM/keystore forte;
- assinatura offline futura exigir chave hardware-backed;
- background sync do SO for necessário de forma confiável;
- requisito regulatório não aceitar PWA;
- acesso a dispositivo precisar de capacidades não disponíveis na web.

A arquitetura de outbox, pacote e sync deve ser independente da UI para permitir essa migração sem reescrever o backend.

---

## 36. Resultado desejado

Antes da missão:

Coordenação prepara
→ piloto baixa
→ AirTrust confirma Pronto offline

Durante a missão:

tablet sem rede
→ piloto consulta pacote
→ registra etapas
→ salva localmente
→ refresh não perde
→ finaliza localmente

Após a missão:

rede retorna
→ AirTrust sincroniza
→ conflitos, se houver, são tratados
→ piloto toca Transmitir para Coordenação
→ Coordenação recebe
→ piloto recebe comprovante

Dados então alimentam o fluxo operacional atual e a projeção eDB shadow, sem redigitação e sem promoção regulatória indevida.

---

## 37. Decisão final

A prioridade de implementação deve ser:

1. durabilidade offline;
2. isolamento seguro do Pilot App;
3. pacote real read-only;
4. RDV editável offline;
5. sincronização idempotente;
6. handoff Coordenação;
7. workspace integrado;
8. helideck safety;
9. documentos;
10. performance por modelo;
11. evolução eDB.

O requisito mais importante não é o mapa ou o visual.

É este:

O piloto deve poder perder completamente a internet, continuar trabalhando, fechar ou recarregar o aplicativo e continuar exatamente de onde parou, sem risco de perder o registro operacional.

Esse comportamento deve ser tratado como invariante arquitetural do Pilot App.
