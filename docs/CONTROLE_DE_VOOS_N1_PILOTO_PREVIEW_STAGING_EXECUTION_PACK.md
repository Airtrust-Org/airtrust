# Controle de Voos N1 — Pacote de Execução do Piloto (Preview/Staging)

> **Data:** 2026-06-14
> **Classificação:** Interno — operacional não regulado — NÃO submeter à ANAC
> **Veredito atual:** pronto com ressalvas para piloto interno controlado
> **Commit de referência:** `c92ba4931905acded9517f53b4ec4d365c469eea`
> **Ambiente recomendado:** preview/staging com acesso restrito
>
> **Documentos base:**
> - `docs/CONTROLE_DE_VOOS_N1_PILOTO_INTERNO_CONTROLADO.md`
> - `docs/CONTROLE_DE_VOOS_N1_PILOTO_EXECUCAO_CHECKLIST.md`
> - `docs/CONTROLE_DE_VOOS_N1_DECISAO_AMBIENTE_PILOTO_E_EVIDENCIAS.md`
> - `docs/CONTROLE_DE_VOOS_N1_END_TO_END_READINESS.md`
> - `docs/AIRTRUST_STATUS_CONTROLE_VOOS_SIGVOOS_FRMS_ANAC.md`
> - `docs/CONTROLE_DE_VOOS_N1_SCHEMA_0411_DESIGN.md`
> - `docs/AIRTRUST_MODULE_GOVERNANCE_EVIDENCE_STANDARD.md`

---

## 1. Sumário Executivo

### Objetivo deste pacote

Este documento é o **guia único de execução** do piloto interno controlado do Controle de Voos N1. Ele consolida ambiente, checklist, roteiro de 5 dias, perfis, templates, evidências, critérios de parada e decisão GO/NO-GO em um único lugar operacional para a equipe.

Não há nada a implementar antes de ler este documento. Ele descreve o que fazer, não o que construir.

### Ambiente recomendado

**Preview/staging com acesso restrito (Opção B).**

Não usar ambiente local como piloto formal com usuários reais. Não usar produção para esta fase. A produção com feature flag fica reservada para a Fase 2, somente se o piloto em preview/staging for aprovado.

### Escopo do piloto

| Entra no piloto | Não entra no piloto |
|---|---|
| Dashboard OCC | Substituição do SIGVOOS |
| Lista de voos | Substituição do APUS |
| Detalhe do voo | Substituição do papel |
| RDV operacional (criar/editar/finalizar) | Diário de Bordo oficial |
| Resumo operacional interno | eDB |
| Dados controlados e rastreáveis | SDRMe / RAS |
| Perfis restritos de acesso | Assinatura jurídica |
| Telas conectadas à API real | Export fiscal |
| | Integração real com MRO ou FRMS |
| | Modo offline / tablet |
| | Autorização ANAC |

### O que não entra — reforço explícito

O piloto **não substitui** nenhum sistema ou documento oficial hoje em uso pelo operador. Durante toda a janela do piloto, continuam sendo as únicas referências formais para operação:

- SIGVOOS
- APUS
- Papel e demais registros operacionais vigentes
- Diário de Bordo oficial
- Quaisquer registros regulados externos ao AirTrust

### Decisão sobre a migration 0411

**A migration 0411 NÃO deve ser implementada antes do piloto.**

A 0411 foi apenas desenhada tecnicamente (`docs/CONTROLE_DE_VOOS_N1_SCHEMA_0411_DESIGN.md`). Sua implementação depende de:

1. Aprovação explícita do design pelo responsável técnico.
2. Piloto N1 concluído — o piloto valida o fluxo operacional manual que alimentará o schema.
3. Confirmação de `flight_report.id` presente em 100% dos registros reais do SIGVOOS.
4. Revisão do design pós-piloto, incorporando o que for aprendido.

Implementar a 0411 antes do piloto inverte a ordem: o schema deve seguir a operação validada, não o contrário.

---

## 2. Checklist de Prontidão do Ambiente

Todos os itens abaixo devem estar marcados antes do Dia 1. Se qualquer item estiver pendente, o Dia 0 não encerra.

### Ambiente

- [ ] Ambiente preview/staging candidato identificado e aprovado formalmente por escrito
- [ ] Ambiente confirmado como isolado de produção (nenhum dado real de produção presente sem controle)
- [ ] Migration `0410_controle_voos_n1_schema.sql` aplicada **somente** nesse ambiente
- [ ] Migration `0411` **não** aplicada em nenhum ambiente
- [ ] Tabelas `cv_*` confirmadas e acessíveis no ambiente candidato
- [ ] Seed controlado de dados `cv_*` carregado e revisado

### Acesso e usuários

- [ ] Lista de usuários participantes definida (nomes, perfis, contatos)
- [ ] Acesso restrito apenas aos participantes listados
- [ ] Nenhum acesso amplo ou não rastreável ao módulo
- [ ] Permissões revisadas por perfil: `viewer` somente lê; `editor` escreve e finaliza
- [ ] Nenhum usuário com permissão além do necessário para o piloto

### Dados

- [ ] Conjunto de voos controlados selecionados e documentados (mínimo 5, máximo 20)
- [ ] Preferência por voos passados para exercitar RDV sem pressão operacional
- [ ] Origem de cada conjunto de dados documentada (controlado, histórico, semi-real)
- [ ] Telas demonstrativas (mock) mapeadas e comunicadas à equipe
- [ ] Nenhuma mistura silenciosa de dados mock e reais na mesma vista sem identificação

### Governança e comunicação

- [ ] Banners de uso operacional interno (N1/A1) revisados nas telas conectadas
- [ ] Comunicação pré-piloto redigida e aprovada pelo sponsor
- [ ] Comunicação enviada a todos os participantes antes do Dia 1
- [ ] Aceite formal do escopo não regulado registrado (por email ou documento)
- [ ] Aceite dos critérios de parada imediata por todos os donos
- [ ] Fluxo legado (SIGVOOS, APUS, papel) declarado como obrigatório e vigente durante o piloto

### Rollback e suporte

- [ ] Plano de rollback documentado e aprovado (7 passos, ver Seção 8)
- [ ] Suporte técnico designado e disponível durante toda a janela do piloto
- [ ] Canal de comunicação de incidentes definido (email, Slack, WhatsApp — escolher um)
- [ ] Procedimento de retirada de acesso imediata documentado e testado
- [ ] Responsável por GO/NO-GO diário definido: sponsor + responsável produto; veto técnico do admin

### Validação pós-aplicação da 0410 (antes de liberar usuários)

- [ ] Dashboard OCC carrega sem erro de API
- [ ] Lista de voos retorna registros do seed
- [ ] Detalhe de voo abre por ID sem erro
- [ ] RDV: criar rascunho funciona
- [ ] RDV: editar rascunho funciona
- [ ] RDV: finalizar preenchimento funciona
- [ ] Reabrir RDV após salvar: dados persistem corretamente
- [ ] Nenhum erro cross-tenant detectado nos testes iniciais

---

## 3. Plano de Execução de 5 Dias

| Dia | Objetivo | Atividades | Dono | Usuários | Evidência gerada | Critério de saída |
|---|---|---|---|---|---|---|
| **Dia 0** Preparação | Confirmar prontidão operacional e técnica | Aplicar 0410 no ambiente; carregar seed; criar usuários; revisar permissões; enviar comunicação; testar ambiente ponta a ponta; validar rollback | Admin técnico + Responsável produto | Sponsor, admin, suporte | Checklist desta seção 100% marcado; print do dashboard com dados do seed; registro de acesso funcional por perfil | Todos os itens do checklist marcados; nenhum erro crítico no ambiente |
| **Dia 1** Onboarding e primeiro fluxo guiado | Alinhar participantes e executar o primeiro fluxo completo com acompanhamento próximo | Briefing presencial ou remoto; reforço de limites (não regulado, não substitui sistemas); walkthrough do dashboard → lista → detalhe → RDV → finalizar; coleta de dúvidas imediatas | Responsável produto | Todos os perfis | Formulário de feedback por usuário; print do primeiro RDV finalizado; lista de dúvidas do onboarding | Pelo menos 1 fluxo completo (lista → detalhe → RDV → finalizar) concluído sem confusão regulatória material |
| **Dia 2** Uso assistido | Validar repetição do fluxo com menor orientação | Usuários executam 3 a 5 voos controlados; suporte sob demanda; registro de tempos, erros e divergências com o sistema oficial; admin monitora logs | OCC líder + suporte técnico | OCC, piloto observador, admin técnico | Planilha de tempos e erros; registro de divergências com SIGVOOS/APUS; screenshots de anomalias | Maioria dos fluxos concluída com ajuda pontual; nenhum incidente crítico; dados persistidos corretamente |
| **Dia 3** Uso com menor intervenção | Medir autonomia real do fluxo principal | Usuários executam o fluxo sem orientação contínua; observar uso espontâneo do dashboard e do resumo; registrar retrabalho e dúvidas recorrentes | Sponsor operacional + OCC líder | OCC, gestor operacional, suporte em prontidão | Feedback mais espontâneo; registro de dependência de suporte; comparação de tempos dia 2 vs dia 3 | Usuários conseguem executar o fluxo principal quase sem condução; tempos estabilizados |
| **Dia 4** Consolidação | Ajustar processo sem abrir escopo técnico novo | Revisar feedback acumulado; reforçar comunicação onde houver dúvida; corrigir instruções operacionais (não o produto); reexecutar casos com divergência classificada; preparar dados para decisão GO/NO-GO | Responsável produto | Sponsor, OCC, admin técnico | Backlog operacional do piloto consolidado; lista de ajustes de processo; classificação de reincidências | Principais dúvidas do piloto tratadas por processo; nenhum incidente crítico aberto |
| **Dia 5** Decisão GO/NO-GO | Consolidar resultado e decidir continuidade | Revisar métricas, incidentes, critérios de sucesso e critérios de parada; preencher template de decisão; registrar veredicto formal | Sponsor + Responsável produto | Todos os donos | Relatório final preliminar; template de GO/NO-GO preenchido e assinado | Decisão formal registrada com justificativa objetiva e próximos passos |

---

## 4. Roteiros de Teste por Perfil

### 4.1 Gestor operacional

**Papel no piloto:** avaliar se o painel e os resumos são úteis para decisão operacional diária, sem interferir no fluxo de OCC.

**Fluxo a executar:**

1. Acessar o Dashboard OCC e ler os indicadores de resumo.
2. Verificar se o painel apresenta status dos voos do dia de forma compreensível.
3. Navegar para a lista de voos e aplicar filtros de data e status.
4. Abrir o detalhe de pelo menos 2 voos distintos.
5. Verificar se os dados apresentados são coerentes com o que o OCC relata.
6. Consultar o resumo operacional interno, quando disponível.
7. Anotar: o que o painel mostra que o OCC não relata? O que falta?

**Perguntas de feedback:**

- O painel é claro o suficiente para tomada de decisão de turno?
- Os dados de voo no AirTrust coincidem com o SIGVOOS/APUS?
- Há algum campo que induziria uma decisão incorreta se usado como referência?
- O módulo gera risco de ser confundido com sistema oficial?

**Limites do perfil:** não pode alterar dados, não pode declarar o módulo como oficial, não pode dispensar o uso de SIGVOOS/APUS/papel.

---

### 4.2 OCC / Controle

**Papel no piloto:** executar o fluxo operacional completo de preenchimento de RDV para os voos do conjunto controlado.

**Fluxo a executar por voo:**

1. Abrir o Dashboard e confirmar leitura do estado geral.
2. Navegar para a lista de voos; localizar o voo pelo conjunto controlado.
3. Abrir o detalhe do voo; conferir: identificação, data, aeroportos, status.
4. Verificar se o status exibido é coerente com o registrado no SIGVOOS/APUS.
5. Navegar para o RDV do voo.
6. Se RDV não existir: iniciar preenchimento.
7. Preencher os campos mínimos:
   - Horário de decolagem real
   - Horário de pouso real
   - Horas voadas
   - Número de pousos
   - Ciclos
   - Combustível na decolagem
   - Combustível no pouso
   - Combustível consumido
   - POB (pessoas a bordo)
   - Carga
   - Ocorrências (campo livre)
   - Divergências observadas
8. Salvar rascunho.
9. Fechar e reabrir o RDV — confirmar que os dados persistiram.
10. Finalizar o preenchimento operacional.
11. Retornar ao dashboard e verificar se os indicadores refletiram o RDV finalizado.
12. Registrar feedback imediatamente após o fluxo: tempo gasto, campos difíceis, dados faltantes, divergências com o sistema oficial.

**Perguntas de feedback:**

- O fluxo de preenchimento é ágil ou gera retrabalho?
- Algum campo do RDV está ausente ou com nomenclatura confusa?
- Os dados do AirTrust divergiram do SIGVOOS/APUS? Em quê?
- A finalização do preenchimento foi clara? O status refletiu corretamente?
- Voltaria a usar esse fluxo em paralelo com o sistema oficial?

**Limites do perfil:** não pode usar o RDV como documento oficial, não pode substituir o registro no SIGVOOS/APUS, não pode alterar dados de voos de outros usuários além do conjunto controlado.

---

### 4.3 Piloto observador

**Papel no piloto:** validar clareza e compreensão do próprio RDV operacional, sem assumir que é um registro oficial.

**Fluxo a executar:**

1. Acessar a lista de voos — verificar se os próprios voos aparecem corretamente.
2. Abrir o detalhe de pelo menos 1 voo atribuído.
3. Conferir dados de identificação: origem, destino, data, status.
4. Abrir o RDV do voo atribuído.
5. Se autorizado: preencher os campos do RDV referentes ao próprio voo.
6. Salvar rascunho e reabrir para confirmar persistência.
7. Não finalizar sem orientação do OCC líder.
8. Registrar: o texto do RDV é claro? A finalização parece uma assinatura? Há risco de confusão com o Diário de Bordo?

**Perguntas de feedback:**

- A tela deixa claro que este não é o Diário de Bordo oficial?
- Os dados dos próprios voos estão corretos?
- A ação de "finalizar preenchimento" parece uma assinatura legal?
- O que faltou no RDV para representar bem o voo real?

**Limites do perfil:** não pode alterar voos de outros usuários, não pode tratar o RDV como Diário de Bordo oficial, não pode exportar ou circular capturas como evidência.

---

### 4.4 Administrador técnico

**Papel no piloto:** garantir estabilidade do ambiente, monitorar logs, executar rollback se necessário e consolidar evidências técnicas.

**Fluxo a executar:**

1. Verificar logs de acesso e erros da API após cada sessão de usuário.
2. Confirmar isolamento por tenant: nenhum usuário vê dados de empresa diferente.
3. Monitorar erros de permissão: nenhum usuário com acesso além do perfil.
4. Verificar persistência de RDVs após sessões longas ou concorrentes.
5. Capturar screenshots das telas-chave em cada dia do piloto.
6. Registrar tempo de resposta das chamadas principais: dashboard, lista de voos, detalhe, RDV.
7. Consolidar incidentes técnicos com passos de reprodução.
8. Executar rollback completo em caso de incidente crítico (ver Seção 8).

**Perguntas de feedback:**

- O ambiente manteve estabilidade durante os 5 dias?
- Houve qualquer erro de tenant ou permissão?
- A performance foi aceitável para o uso operacional combinado?
- O rollback foi exercitado? Funcionou?
- Quais ajustes de ambiente são necessários antes de qualquer fase futura?

**Limites do perfil:** não pode aplicar migration fora do ambiente autorizado, não pode conectar sistemas fora do escopo (MRO, FRMS, eDB, SDRMe), não pode declarar GO sem alinhamento com o sponsor.

---

## 5. Templates de Coleta

### 5.1 Feedback diário por usuário

Usar um formulário por usuário por sessão. Consolidar diariamente.

```text
=== FEEDBACK DIÁRIO — CONTROLE DE VOOS N1 PILOTO ===

Data:
Dia do piloto (1/2/3/4/5):
Usuário:
Perfil (gestor / OCC / piloto / admin):
Sessão (manhã / tarde / turno completo):

--- Fluxo executado ---
Voos acessados:
RDVs iniciados:
RDVs finalizados:
Tempo médio por RDV (minutos):

--- Qualidade do fluxo ---
O fluxo funcionou de ponta a ponta? (sim / parcial / não):
Onde travou ou gerou retrabalho:
Campos faltantes ou confusos:
Nomenclatura difícil:

--- Divergências ---
Houve divergência com SIGVOOS/APUS? (sim / não):
Descrição da divergência (se houver):
Campo divergente:
Impacto percebido:

--- Governança ---
O módulo foi entendido como uso operacional interno? (sim / não / dúvida):
Houve algum momento de confusão com sistema oficial? (descrever):

--- Riscos percebidos ---
Nível de risco (baixo / médio / alto / crítico):
Descrição do risco:

--- Sugestão ---
O que melhoraria mais o fluxo:
Prioridade da sugestão (baixa / média / alta / crítica):

--- Evidências ---
Screenshot ou link (se houver):
```

---

### 5.2 Template de incidente

Usar para qualquer falha técnica, operacional ou regulatória.

```text
=== INCIDENTE — CONTROLE DE VOOS N1 PILOTO ===

Título:
Data e horário:
Dia do piloto (1/2/3/4/5):
Severidade (baixa / média / alta / crítica):

--- Identificação ---
Módulo ou tela:
Endpoint ou ação:
Usuário afetado:
Perfil do usuário:

--- Descrição ---
O que aconteceu:
Passos para reproduzir:
Comportamento esperado:
Comportamento observado:

--- Impacto ---
Usuários afetados:
Dados afetados:
Risco regulatório? (sim / não):
Risco de tenant? (sim / não):
Risco de perda de dados? (sim / não):

--- Resposta imediata ---
Ação tomada:
Responsável pela ação:
Piloto interrompido? (sim / não):

--- Status ---
Aberto / Em mitigação / Encerrado:
Causa raiz identificada:
Resolução:

--- Decisão ---
Continuar o piloto / Pausar o piloto / Encerrar o piloto:
Justificativa:
```

---

### 5.3 Template de divergência com SIGVOOS / APUS

Usar quando dado do AirTrust diferir do sistema oficial de referência.

```text
=== DIVERGÊNCIA COM SISTEMA OFICIAL — CONTROLE DE VOOS N1 PILOTO ===

Data:
Voo (identificador controlado):
Usuário que identificou:

--- Divergência ---
Campo divergente:
Valor no AirTrust:
Valor no SIGVOOS / APUS / papel:
Unidade ou formato:

--- Classificação ---
Tipo:
  [ ] Campo ausente no AirTrust
  [ ] Campo ausente no SIGVOOS
  [ ] Valores diferentes para o mesmo campo
  [ ] Granularidade diferente (etapa vs. voo)
  [ ] Nomenclatura diferente
  [ ] Origem desconhecida

Impacto operacional:
  [ ] Apenas informativo
  [ ] Dificulta preenchimento
  [ ] Impede reconciliação com o sistema oficial
  [ ] Poderia induzir decisão incorreta

--- Ação ---
Ação tomada no piloto:
Registrada para análise pós-piloto? (sim / não):
Prioridade para 0411 / futura modelagem:
```

---

### 5.4 Template de decisão GO/NO-GO

Preencher no Dia 5. Requer aprovação do sponsor e do responsável produto.

```text
=== DECISÃO GO/NO-GO — CONTROLE DE VOOS N1 PILOTO ===

Data da decisão:
Período do piloto:
Ambiente utilizado:
Participantes envolvidos na decisão:

--- Métricas consolidadas ---
Voos acessados no total:
RDVs iniciados:
RDVs finalizados:
Taxa de conclusão do fluxo principal (%):
Tempo médio de preenchimento de RDV (min):
Incidentes registrados:
Incidentes críticos:
Divergências com sistema oficial:
Acionamentos de suporte:

--- Checklist de decisão ---
Fluxo principal concluído repetidamente? (sim / não):
Usuários entenderam os limites não regulados? (sim / não / parcialmente):
Houve incidente crítico? (sim / não):
Houve confusão regulatória material? (sim / não):
Houve erro cross-tenant? (sim / não):
Houve perda de dados? (sim / não):
Dashboard foi considerado útil? (sim / não):
Persistência de RDV se mostrou estável? (sim / não):
Ambiente permaneceu estável? (sim / não):
Suporte necessário ficou aceitável? (sim / não):

--- Veredicto ---
[ ] GO — piloto concluído com sucesso; seguir para rollout limitado controlado
[ ] GO com ressalvas — piloto funciona, ajustes de processo antes de avançar
[ ] NO-GO — piloto revelou bloqueadores; corrigir antes de qualquer avanço

Justificativa (obrigatória):

Ressalvas (se GO com ressalvas):

Próximos passos:

--- Assinaturas ---
Sponsor / Gestor operacional:
Responsável AirTrust / Produto:
Admin técnico (veto técnico):
```

---

## 6. Evidências a Guardar

### 6.1 Evidências operacionais

O que guardar e como identificar:

| Evidência | Formato | Quando coletar | Responsável |
|---|---|---|---|
| Formulários de feedback diário por usuário | Arquivo de texto ou planilha | Ao fim de cada sessão | Responsável produto |
| Planilha de métricas do piloto | Planilha | Atualizar diariamente | Responsável produto |
| Lista de divergências com SIGVOOS/APUS | Formulário 5.3 preenchido | Quando identificada | OCC + Responsável produto |
| Screenshots do dashboard, lista, detalhe e RDV | PNG datado e nomeado | Ao longo do piloto | Admin técnico |
| Relatório final de métricas consolidadas | Documento | Dia 5 | Responsável produto |
| Veredicto GO/NO-GO preenchido | Template 5.4 | Dia 5 | Sponsor + Responsável produto |

---

### 6.2 Evidências técnicas

| Evidência | Formato | Quando coletar | Responsável |
|---|---|---|---|
| Logs de acesso e erros de API | Export de log ou arquivo | Ao fim de cada dia | Admin técnico |
| Formulários de incidente preenchidos | Template 5.2 | Quando ocorrer | Admin técnico |
| Registro de passos de reprodução de erros | Documento | Quando ocorrer | Admin técnico |
| Confirmação de isolamento por tenant (ausência de cross-tenant) | Registro de teste | Dia 0 e ao longo do piloto | Admin técnico |
| Confirmação de performance aceitável (tempos de resposta) | Planilha ou log | Diariamente | Admin técnico |
| Registro de validação pós-0410 | Checklist preenchido (Seção 2) | Dia 0 | Admin técnico |

---

### 6.3 Evidências de governança

| Evidência | Formato | Quando coletar | Responsável |
|---|---|---|---|
| Comunicação pré-piloto enviada | Email ou documento com data | Antes do Dia 1 | Sponsor + Responsável produto |
| Aceite formal do escopo não regulado | Email ou assinatura | Antes do Dia 1 | Todos os participantes |
| Aceite dos critérios de parada imediata | Email ou assinatura | Antes do Dia 1 | Todos os donos |
| Confirmação de que o fluxo legado permanece vigente | Documento ou email | Antes do Dia 1 | Sponsor |
| Decisão GO/NO-GO diária | Registro escrito simples | Ao fim de cada dia | Responsável produto |
| Plano de rollback aprovado | Documento | Antes do Dia 1 | Admin técnico + Sponsor |
| Comunicações de encerramento | Email com data | Dia 5 | Responsável produto |

---

### 6.4 Evidências úteis para futura preparação ANAC

Estas evidências não são submissão ANAC. São registros de maturidade de processo que podem fundamentar conversas futuras.

| Evidência | Por que é relevante para futuro |
|---|---|
| Disciplina de escopo: nenhum participante tratou o módulo como regulado | Demonstra que o time distingue uso interno de uso regulado |
| Rollback controlado executado (se necessário) | Demonstra capacidade de desfazer sem impacto operacional |
| Rastreabilidade de divergências com SIGVOOS/APUS | Insumo para o futuro gap map SIGVOOS → Controle de Voos → FRMS |
| Governança de acesso restrita e documentada | Evidência de processo para eventual fase de registros regulados |
| Relatório consolidado de lacunas de campos e fluxos | Subsidia o design da 0411 e futuras conversas sobre eDB/Records Core |
| Evidências de processo operacional paralelo (não substitutivo) | Fundamento de que o sistema não foi usado como evidência oficial |

---

## 7. Comunicação aos Participantes

### 7.1 Mensagem pré-piloto (enviar antes do Dia 1)

Assunto: Piloto interno controlado — Controle de Voos N1 — AirTrust

> Olá,
>
> O módulo **Controle de Voos N1** do AirTrust entrará em **piloto interno controlado** a partir de [DATA DE INÍCIO], com duração de 5 dias.
>
> **O que é este piloto:**
> Uma validação operacional interna com acesso restrito, para verificar se o fluxo de dashboard, lista de voos, detalhe e RDV operacional atendem ao uso cotidiano da equipe.
>
> **O que NÃO é este piloto:**
> - Não é uso regulado.
> - Não é fiscal.
> - Não é evidência oficial para nenhum órgão.
> - Não substitui SIGVOOS, APUS, papel, Diário de Bordo, eDB, SDRMe ou qualquer sistema oficial hoje em uso.
>
> **O que esperamos de você:**
> - Executar o roteiro definido para o seu perfil.
> - Continuar operando normalmente nos sistemas oficiais em paralelo.
> - Registrar feedback, dificuldades, dados divergentes e qualquer risco percebido.
> - Acionar imediatamente o suporte do piloto se houver dúvida sobre o escopo.
>
> **Contato do suporte durante o piloto:** [CANAL DEFINIDO]
>
> Qualquer dado registrado no AirTrust durante o piloto é para uso interno de produto e NÃO possui valor regulatório ou operacional formal.
>
> Obrigado pela participação.
>
> [Nome do responsável]

---

### 7.2 Mensagem de início de cada dia (enviar no começo do dia)

> **[DIA X] — Piloto Controle de Voos N1**
>
> Lembrete antes de começar:
>
> - Este módulo é uso **operacional interno**, **não regulado** e **não fiscal**.
> - **Nenhuma informação aqui substitui o SIGVOOS, APUS, papel ou qualquer sistema oficial.**
> - Siga o roteiro do seu perfil; registre tempos, dificuldades e divergências.
> - Em caso de erro, dado inesperado ou dúvida sobre escopo, **pare o fluxo e acione o suporte imediatamente**.
>
> Suporte: [CANAL] — [NOME DO RESPONSÁVEL]
>
> Bom piloto.

---

### 7.3 Mensagem de encerramento (enviar no Dia 5 após a decisão)

> **Encerramento do Piloto — Controle de Voos N1**
>
> O piloto interno controlado do Controle de Voos N1 foi encerrado.
>
> Obrigado pelo feedback, pela execução dentro do escopo e pela disciplina em manter os sistemas oficiais como referência durante toda a janela.
>
> O resultado será consolidado em relatório formal com decisão de GO, GO com ressalvas ou NO-GO.
>
> Até nova comunicação, **o SIGVOOS, o APUS, o papel e os demais registros oficiais continuam sendo as únicas referências formais da operação**. Nenhum dado registrado no AirTrust durante o piloto possui valor operacional formal ou regulatório.
>
> [Nome do responsável]

---

## 8. Critérios de Parada Imediata (Stop Criteria)

Parar o piloto imediatamente — sem aguardar fim do dia — se qualquer um dos eventos abaixo ocorrer:

| # | Evento | Ação imediata |
|---|---|---|
| S1 | Usuário entender que o módulo substitui Diário de Bordo, eDB, SDRMe, SIGVOOS ou APUS | Parar imediatamente; briefing corretivo com todos os participantes antes de qualquer retomada |
| S2 | Qualquer erro cross-tenant (usuário ver dados de empresa diferente) | Parar imediatamente; investigação técnica obrigatória; não retomar sem causa identificada e corrigida |
| S3 | Perda de dados lançados no piloto | Parar imediatamente; investigação técnica; rollback se necessário |
| S4 | Falha de permissão com acesso indevido a recurso ou empresa | Parar imediatamente; revogar todos os acessos; investigação técnica obrigatória |
| S5 | Uso ou tentativa de uso do módulo como evidência oficial | Parar imediatamente; comunicar a todos os participantes; registrar o ocorrido formalmente |
| S6 | Divergência operacional crítica com potencial de induzir decisão incorreta | Parar; registrar; avaliar com sponsor antes de retomar |
| S7 | Instabilidade severa do ambiente (erros recorrentes, indisponibilidade, dados inconsistentes) | Parar; investigação técnica; retomar somente após ambiente estabilizado e validado |
| S8 | Qualquer linguagem, botão ou comportamento que reintroduza ambiguidade regulatória material | Parar; corrigir comunicação e/ou tela; retomar somente após aprovação do responsável produto |

### Procedimento de parada

1. Admin técnico revoga acesso dos usuários ativos imediatamente.
2. Responsável produto comunica parada a todos os participantes no canal do piloto.
3. Nenhum novo dado é lançado no Controle de Voos até retomada aprovada.
4. Os dados lançados são preservados somente para análise interna.
5. Causa identificada e registrada no template de incidente (Seção 5.2).
6. Retomada exige aprovação explícita de sponsor + responsável produto + veto técnico do admin.

---

## 9. Decisão GO/NO-GO

### GO — Piloto bem-sucedido

Condições para marcar GO:

- Fluxo principal (lista → detalhe → RDV → finalizar) foi concluído repetidamente por usuários reais sem suporte contínuo.
- Nenhum incidente crítico ocorreu.
- Nenhuma confusão regulatória material foi registrada.
- Nenhum erro cross-tenant.
- Nenhuma perda de dados.
- Persistência de RDV se mostrou estável em todas as sessões.
- Dashboard e resumo foram considerados úteis pela operação.
- A equipe entende que vale seguir para rollout limitado controlado.

**Próxima ação se GO:** preparar implementação da migration 0411 em ambiente local/staging para revisão; definir público e condições do rollout limitado controlado.

---

### GO com ressalvas — Piloto funciona, ajustes necessários

Condições para marcar GO com ressalvas:

- Fluxo principal funciona, mas ainda depende de suporte pontual para alguns casos.
- Incidentes médios ocorreram e foram mitigados sem impacto crítico.
- Dúvidas de processo identificadas e tratáveis sem abrir escopo técnico novo.
- Percepção de valor positiva, mas com ajustes operacionais pendentes.
- Nenhuma confusão regulatória não tratada; nenhum erro cross-tenant.

**Próxima ação se GO com ressalvas:** documentar cada ressalva com critério de fechamento; corrigir processo ou produto antes de avançar para implementação da 0411 ou rollout.

---

### NO-GO — Piloto revelou bloqueadores

Condições para marcar NO-GO:

- Incidente crítico sem resolução.
- Confusão regulatória recorrente e não tratável por processo.
- Perda de dados, erro de tenant ou falha de permissão.
- Fluxo principal não foi concluído com confiança.
- Operação entende que o módulo gera mais risco do que valor no estado atual.

**Próxima ação se NO-GO:** documentar cada bloqueador com critério de fechamento; corrigir antes de qualquer nova tentativa de piloto; não implementar 0411 nem avançar para rollout.

---

## 10. Relação com 0411 e SIGVOOS

### O piloto não depende da 0411

A migration 0411 adiciona granularidade de etapa (`cv_voo_etapas`) e campos de rastreabilidade SIGVOOS ao schema. Ela é totalmente aditiva — não destrói nenhuma tabela da 0410.

O piloto valida o fluxo operacional manual com o schema da 0410. Isso é suficiente para a fase atual. A 0411 só faz sentido depois que:

1. O fluxo manual foi validado com usuários reais no piloto.
2. O design revisado pós-piloto incorpora o que foi aprendido.
3. Os riscos da 0411 (ID estável SIGVOOS, timezone, mapeamento de tripulante) foram endereçados.

### A 0411 deve usar o feedback do piloto antes de ser implementada

O piloto gerará evidências sobre:

- Campos faltantes no RDV operacional.
- Divergências com SIGVOOS/APUS.
- Campos que existem no SIGVOOS mas não estão no schema 0410.
- Campos que estão no schema 0410 mas não fazem sentido operacional real.

Esse mapa de divergências é o insumo principal para revisar o design da 0411 antes de qualquer implementação.

### SIGVOOS continua sendo a fonte atual do FRMS

Durante e após o piloto:

- O SIGVOOS permanece como origem externa ativa para o caminho atual do FRMS.
- O Controle de Voos N1 **não alimenta o FRMS** nesta fase.
- Não há dupla canonicidade simultânea — o FRMS tem uma fonte, e ela é o SIGVOOS.

A virada canônica do FRMS para o Controle de Voos só pode ocorrer depois que:

1. Equivalência operacional for demonstrada e aprovada (shadow mode).
2. ID estável de voo/trecho do SIGVOOS estiver confirmado e mapeado.
3. Reconciliação de jornada real vs. jornada derivada for consistente.
4. Campos críticos tiverem mapeamento confiável.

### Controle de Voos ainda não alimenta o FRMS

Nenhuma rota, integração ou campo do Controle de Voos alimenta o FRMS operacional nesta fase. O piloto não altera isso. Qualquer narrativa de "o AirTrust vai substituir o SIGVOOS no FRMS" está fora do escopo do piloto e deve ser bloqueada imediatamente se emergir.

---

## 11. Próximo Passo Após o Piloto

### Se GO

1. Preparar implementação da migration 0411 em local e staging.
2. Revisar o design da 0411 com o feedback do piloto incorporado.
3. Definir público e condições do rollout limitado controlado (número máximo de usuários, voos, janela).
4. Estabelecer critérios formais do shadow mode SIGVOOS × Controle de Voos para o FRMS.
5. Documentar decisão de GO e os próximos passos no relatório final do piloto.

### Se GO com ressalvas

1. Documentar cada ressalva com critério claro de fechamento (o que precisa mudar, quem decide, até quando).
2. Corrigir o processo operacional e/ou o produto nos pontos identificados.
3. Executar rodada adicional de validação restrita antes de avançar para implementação da 0411.
4. Não abrir rollout até as ressalvas estarem fechadas.

### Se NO-GO

1. Documentar cada bloqueador com descrição técnica e operacional precisa.
2. Não implementar a migration 0411.
3. Não avançar para rollout em nenhum ambiente.
4. Corrigir o fluxo N1 nos pontos bloqueadores.
5. Repetir o piloto em ambiente controlado somente após os bloqueadores fechados.
6. Manter o módulo em uso restrito ou somente demonstrativo, conforme severidade dos bloqueadores.

---

## Apêndice A — Métricas a Consolidar Diariamente

Manter esta planilha atualizada ao longo dos 5 dias:

| Métrica | Dia 1 | Dia 2 | Dia 3 | Dia 4 | Dia 5 (total) |
|---|---|---|---|---|---|
| Voos acessados | | | | | |
| RDVs iniciados | | | | | |
| RDVs finalizados | | | | | |
| Taxa de conclusão (%) | | | | | |
| Tempo médio de preenchimento (min) | | | | | |
| Incidentes registrados | | | | | |
| Incidentes críticos | | | | | |
| Divergências com sistema oficial | | | | | |
| Acionamentos de suporte | | | | | |
| Dúvidas regulatórias percebidas | | | | | |

---

## Apêndice B — Resumo Rápido para Operação

**Veredito:** pronto com ressalvas para piloto interno controlado.

**Ambiente:** preview/staging com acesso restrito (Opção B).

**Duração:** 5 dias (Dia 0 preparação → Dia 5 GO/NO-GO).

**Participantes:** 1 gestor operacional, 1–2 OCC/controle, 1 piloto observador, 1 admin técnico, 1 responsável produto, 1 suporte técnico.

**Principal risco:** usuário interpretar o RDV operacional como registro oficial ou substituto do Diário de Bordo.

**Principal critério de parada:** qualquer uso ou interpretação como evidência oficial.

**O que NÃO fazer durante o piloto:**
- Não tratar o módulo como oficial.
- Não dispensar SIGVOOS, APUS ou papel.
- Não implementar 0411.
- Não integrar FRMS, MRO, eDB ou SDRMe.
- Não aplicar a migration 0410 em produção.
- Não enviar capturas ou exports como evidência regulatória.
- Não expandir o escopo do piloto sem aprovação formal.

**Sugestão de commit após o piloto:** `docs(controle-voos): add N1 pilot preview/staging execution pack`
