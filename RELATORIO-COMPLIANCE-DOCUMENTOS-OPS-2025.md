# Relatório de Conformidade — Documentos OPS vs. Sistema AirTrust

**Data**: 03/11/2025  
**Documentos analisados**: 5 (PRG-OPS-001 excluído do escopo operacional, ver nota)  
**Escopo**: Módulos Escalas, FRMS, Qualificações, Simuladores  
**Base contratual**: Costa do Sol Táxi Aéreo — `empresa_id = 6`

---

## Sumário Executivo

| Módulo        | Documento                 | Situação geral                                            |
| ------------- | ------------------------- | --------------------------------------------------------- |
| Escalas       | PRC-OPS-009 + NOP-OPS-038 | ⚠️ 7 gaps identificados                                   |
| FRMS / Fadiga | PRC-OPS-012               | ⚠️ 2 gaps (relatório automático e denominador legal)      |
| Qualificações | PRC-OPS-010               | ⚠️ 3 gaps (workflow aprovação, alertas push, ITR-OPS-003) |
| Simuladores   | PRC-OPS-010               | ✅ Totalmente coberto (assinatura digital ≥ FORM-OPS-028) |

> **Nota PRG-OPS-001 (PTO Rev09)**: É o programa de treinamento aprovado pela ANAC (Ofício 6814/2025/GTCE), com 200+ páginas de grade curricular por aeronave (AW139, S-76A, S-76C). Não existe gap de sistema aqui — o AirTrust gerencia os **resultados** do treinamento (qualificações geradas, vencimentos), não o conteúdo pedagógico do PTO.

---

## 1. Módulo Escalas

### Referências: PRC-OPS-009 Rev05 (23/04/2024) + NOP-OPS-038 Rev00 (09/07/2024)

---

### ✅ O que o AirTrust já cobre

- **EST mensal** com alocação de PIC/SIC por aeronave e quinzena
- **Workflow de aprovação de escala**: rascunho → em_revisão → aprovada → publicada → arquivada
- **Detecção de conflitos**: sobreposição de eventos, conflitos de tripulação (mesmo trio em slots simultâneos)
- **Tabela `restricoes_tripulacao`** com tipo `nao_pode_voar_junto`
- **CMA expiry tracking** com alertas visuais em tela (≤15 dias = crítico, ≤30 dias = atenção)
- **Verificação de habilitações** antes de alocar tripulante em aeronave (modelo_operacional)
- **Notificações push** ao publicar escala

---

### ❌ GAP 1 — EVD (Escala de Voo Diária) — FORM-OPS-013

**O que o documento exige (§6.4)**:  
A Coordenação de Voo deve elaborar diariamente a **Escala de Voo Diária** (EVD), indicando por voo:

- Local e horário de apresentação
- Aeronave designada
- Função a bordo de cada piloto (PIC, SIC, 1PSS, 1PEX, IN, EC)
- Observações: local de pernoite, tipo de voo (translado, manutenção, cheque, LOSA, comitiva, VIP, MMA)

**O que o AirTrust tem**: Escalas mensais/quinzenais (EST equivalente). Não há nenhum módulo ou tela para EVD diária.

**Recomendação para o sistema**: Criar sub-módulo EVD dentro de Escalas:

- Tela de criação/edição de EVD por data
- Campos: aeronave, apresentação (datetime), PIC + função-Q, SIC + função-Q, tripulante extra (opcional)
- Campo "observações de voo" com categorias (Translado, Manutenção, Cheque, LOSA, VIP, MMA)
- Distribuição digital automática por notificação push e/ou e-mail após publicação

---

### ❌ GAP 2 — Validação de Repouso na EVD (§6.4.1.a.i)

**O que o documento exige**:  
O horário de apresentação na EVD deve ser pelo menos **12h30min após o horário do último corte de motor** registrado no Diário de Bordo.

**O que o AirTrust tem**: O FRMS registra jornadas com hora de encerramento, mas a EVD não existe como módulo e portanto não há validação automática desse intervalo antes de publicar.

**Recomendação para o sistema**: Ao criar/editar um slot na EVD, o sistema deve:

1. Buscar para cada tripulante a última jornada registrada no FRMS
2. Calcular se `hora_apresentacao_EVD ≥ hora_encerramento_ultima_jornada + 12h30`
3. Exibir alerta bloqueante se a regra for violada

---

### ❌ GAP 3 — Validação de Limite Mensal no 12º Dia de Missão (§6.4.1.a.ii)

**O que o documento exige**:  
Na elaboração da EVD do **12º dia de missão**, a Coordenação de Voo deve assegurar que nenhum tripulante consiga exceder, nos dias restantes do mês, **90h de voo** ou **176h de jornada**.

**O que o AirTrust tem**: O FRMS registra acumulados de horas de voo e jornada. Mas não há alerta automático no contexto da elaboração da EVD, nem aviso "você está no dia X de missão com Y horas acumuladas, restam Z dias que podem acrescentar W horas".

**Recomendação para o sistema**: No painel de FRMS ou em um futuro módulo EVD:

- Exibir para cada tripulante em missão, a partir do 12º dia, um banner com:
  - Horas de voo acumuladas no mês vs. limite de 90h
  - Horas de jornada acumuladas no mês vs. limite de 176h
  - Projeção: "se continuar no ritmo atual, atinge limite em DD/MM"

---

### ❌ GAP 4 — Regra de Soma de Idades (NOP-OPS-038 §1.ii)

**O que o documento exige**:  
A **soma de idade** dos dois pilotos designados na mesma aeronave em voos de transporte de passageiros **não pode exceder 129 anos**.

> A NOP-OPS-038 atualizou o MGO (subitem 4.4.5) — o antigo limite presente no PRC-OPS-009 §6.1.9c era 119 anos. O limite atual é **129 anos**.

**O que o AirTrust tem**: A tabela `restricoes_tripulacao` suporta o tipo `nao_pode_voar_junto` entre pares específicos, mas **não há validação automática de soma de idades** no momento da alocação de tripulação.

**Recomendação para o sistema**: No `ModalAdicionarTripulacao` e na API de alocação:

1. Se o slot PIC já tem designado, ao selecionar o SIC, verificar `(idade_PIC + idade_SIC) <= 129`
2. Bloquear/ alertar se a regra for violada
3. Exceção: se um dos pilotos for IN (Instrutor de Voo) ou EC (Examinador Credenciado) exercendo essa função, a restrição não se aplica

---

### ❌ GAP 5 — Restrições de CMA (NOP-OPS-038 §1.i + PRC-OPS-009 §6.1.9b)

**O que o documento exige**:

- Um piloto com **restrição ao voo solo no CMA** não pode ser escalado com outro piloto que tenha **a mesma restrição**, ou com piloto com **mais de 59 anos**
- Dois pilotos com **qualquer restrição de CMA** não podem compor tripulação juntos

**O que o AirTrust tem**: O módulo CMA rastreia validade de exame médico aeronáutico, mas **não rastreia o tipo de restrição** inscrita no CMA (restrição ao voo solo, restrição específica). Não há validação dessas combinações no momento da alocação.

**Recomendação para o sistema**:

- Adicionar campo `restricoes_cma` (JSON/TEXT) no cadastro do funcionário ou em `qualificacoes_historico` para CMA
- No wizard de tripulação, verificar as combinações proibidas:
  - `CMA_restricao_voo_solo + outro_CMA_restricao_voo_solo` → bloqueado
  - `CMA_restricao_voo_solo + piloto_idade > 59` → bloqueado
  - Dois pilotos com qualquer restrição de CMA → blocado
- Exceção: um dos pilotos exercendo função de IN ou EC

---

### ❌ GAP 6 — Regra de Experiência na Composição de Tripulação (§6.1.9a)

**O que o documento exige**:  
Não devem compor tripulação um **comandante com menos de 100h PIC no tipo** com um **copiloto com menos de 500h no tipo**.

**O que o AirTrust tem**: Habilitações por modelo são verificadas (o piloto precisa ter habilitação válida para a aeronave), mas **horas por tipo** não são validadas no momento da alocação.

**Recomendação para o sistema**:

- No wizard de alocação de tripulação, ao designar o SIC, verificar se o PIC tem ≥100h no tipo E o SIC tem ≥500h no tipo
- Caso contrário, exibir aviso (não necessariamente bloqueante — pode ser apenas alerta, pois o piloto chefe pode decidir em contrário)
- As horas por tipo já existem no módulo FRMS (horas_voo_minutos por aeronave) — usar esse dado

---

### ❌ GAP 7 — Reconhecimento de Recebimento da Escala pelos Tripulantes (§6.3.3)

**O que o documento exige**:  
Os tripulantes devem dar **ciência do recebimento** da EST por e-mail corporativo, à Coordenação de Voo.

**O que o AirTrust tem**: O sistema envia notificações push e/ou e-mail ao publicar, mas não há registro do **reconhecimento individual** de cada tripulante. Não há um campo "Ciente" ou audit trail de quem visualizou a escala.

**Recomendação para o sistema**:

- Na `MinhaEscalaPage` (App do tripulante), adicionar um botão "Confirmar ciência da escala"
- Armazenar `escala_confirmacoes (escala_id, funcionario_id, confirmado_em, ip)` com soft delete
- No painel do Piloto Chefe, exibir status de ciência por tripulante (confirmado/pendente)

---

## 2. Módulo FRMS / Fadiga Acumulada

### Referência: PRC-OPS-012 Rev00 (21/08/2025)

---

### ✅ O que o AirTrust já cobre — e **supera**

O AirTrust tem um modelo FRMS científico (tipo SAFTE-FAST) com:

- Fatorização de jornadas: fator de apresentação, duração, repouso, voo noturno (dep + arr), ciclo embarcado (offshore), base away, aclimatação
- Efetividade cognitiva calculada por biomatemática
- `dia_periodo_embarcado` rastreado por tripulante
- Alertas de fadiga integrados ao SGSO

O PRC-OPS-012 descreve um processo **muito mais simples**: uma planilha xlsx preenchida manualmente pela Assistente de Operações, com fatores agravantes/mitigantes expressos como percentual do limite legal (176h jornada / 90h voo). O modelo do AirTrust é **cientificamente superior**.

---

### ❌ GAP 8 — Relatório de Fadiga por Consumo de Limite Legal (PRC-OPS-012 §5)

**O que o documento exige**:  
A partir do **10º dia de missão offshore**, calcular diariamente o **percentual de consumo de limite legal** de cada tripulante e enviar por e-mail ao Piloto Chefe e Coordenação de Voo:

| Limite base | Cálculo                                            |
| ----------- | -------------------------------------------------- |
| Jornada     | (Horas jornada acumuladas / 176h) × 100% + fatores |
| Voo         | (Horas voo acumuladas / 90h) × 100% + fatores      |

Fatores agravantes que somam ao percentual diário:

- Apresentação antes das 06:30 → +0,2%
- Jornada > 10h → +0,1%
- Horas de voo ≥ 6h → +0,1%
- Decolagem noturna (antes das 06:00) → +0,1%
- Pouso noturno (≥18:00) → +0,1%

Fatores mitigantes:

- Sem apresentação (dia de folga) → −0,2%
- Apresentação ≥ 08:00 → −0,1%
- Jornada < 8h → −0,1%
- Repouso > 13h → −0,1%
- 0h de voo → −0,2%
- Até 4h de voo → −0,1%

Limiares de alerta: **Verde ≥80%, Amarelo ≥90%, Vermelho ≥95%**

**O que o AirTrust tem**: O FRMS calcula efetividade cognitiva (0–100%) que diminui com fadiga. Mas **não existe** uma visão de "% de consumo de limite legal" com os limiares 80/90/95% e **não existe envio automático de relatório diário por e-mail a partir do 10º dia**.

**Recomendação para o sistema** (substitui o FORM-OPS-130):

- Adicionar no módulo FRMS uma aba "Fadiga Acumulada Legal" que:
  1. Carrega, para cada tripulante em missão (dia ≥ 10 do ciclo embarcado), os acumulados reais de horas de jornada e voo do mês do FRMS
  2. Aplica os fatores agravantes/mitigantes diários conforme PRC-OPS-012
  3. Calcula o percentual composto diário
  4. Exibe gráfico de evolução com bandas de cor (verde/amarelo/vermelho)
  5. Dispara alerta automático quando cruzar 80%, 90% ou 95%
- Implementar um Cron Worker que, diariamente a partir do 10º dia de missão, envia e-mail/notificação ao Piloto Chefe e Coordenação de Voo com o relatório de todos os tripulantes em missão

---

### ❌ GAP 9 — Escopo do PRC-OPS-012 vs. Realidade Operacional

**Problema no documento**:  
O PRC-OPS-012 especifica que o procedimento se aplica **apenas a membros da Costa do Sol envolvidos no despacho de voo (Coordenadores de Voo, Agentes de Atendimento)**. Contudo, a fadiga acumulada em operação offshore é relevante para **todos os tripulantes de voo** (pilotos, mecânicos, comissários). A razão do escopo restrito não está explicada e parece ser um erro da revisão.

**Recomendação para o documento (PRC-OPS-012)**:  
Revisar o item `2. APLICAÇÃO` para incluir todos os tripulantes de voo em missões offshore de duração superior a 6 dias, ou justificar explicitamente a exclusão dos pilotos caso haja uma razão regulatória/contratual específica.

> ⚠️ **Sugestão de melhoria no documento**: Se a exclusão dos pilotos for intencional (ex.: pilotos já cobertos pelo PRG-SSO-004 separado), o documento deve fazer referência cruzada explícita. Caso contrário, alargar o escopo para todos os tripulantes torna o controle mais robusto e homogêneo.

---

## 3. Módulo Qualificações

### Referência: PRC-OPS-010 Rev02 (02/05/2022)

---

### ✅ O que o AirTrust já cobre

- `qualificacoes_historico` com `data_vencimento`, `status`, `qualificacao_codigo`
- Alertas de vencimento com categorização por urgência
- `qualificacoes-alertas.ts` com endpoint pull de expirações
- Tipos de qualificação (`qualificacoes_tipos`) com periodicidade
- Integração com simuladores: qualificação gerada automaticamente ao aprovar check com assinatura digital do instrutor
- CMA tracking com dias restantes e status (ok/vencendo/expirado)

---

### ❌ GAP 10 — Alerta Semanal Automático por E-mail (§6.2 PRC-OPS-009 + §4 PRC-OPS-010)

**O que o documento exige**:  
O sistema APUS (= AirTrust) deve enviar um **e-mail semanal automático** ao setor de Operações com todos os treinamentos, habilitações e qualificações **vencidas ou a vencer em menos de 90 dias**.

**O que o AirTrust tem**: O endpoint `/api/qualificacoes/alertas` retorna os dados quando consultado (pull), mas **não há disparo agendado (push/cron)** que envie o relatório semanalmente de forma autônoma.

**Recomendação para o sistema**:

- Criar um Cron Trigger no Worker (`[triggers] crons = ["0 8 * * 1"]` = toda segunda às 08:00)
- O cron deve iterar por empresa, buscar qualificações expirando em ≤90 dias, formatar e enviar e-mail para os perfis com role `admin` e `manager`
- O Cloudflare Workers Cron já está no plano pago; verificar se `wrangler.toml` tem o binding de e-mail (SendGrid ou MailChannels)

---

### ❌ GAP 11 — Workflow de Aprovação de Treinamentos (§5 PRC-OPS-010)

**O que o documento exige**:  
O planejamento de treinamento deve seguir o fluxo de aprovação:

1. Coordenação/Assistente de Operações → propõe datas/locais/instrutores/orçamento
2. Piloto Chefe → aprova o conteúdo e cronograma
3. Gerente de Operações → aprova via e-mail
4. Diretor Financeiro → aprova o orçamento via e-mail

**O que o AirTrust tem**: Não existe nenhum módulo ou tela de **planejamento/solicitação de treinamento** com workflow de aprovação multi-nível.

**Recomendação para o sistema**:

- Criar módulo "Solicitações de Treinamento" dentro de Qualificações:
  - Formulário: funcionário(s) alvo, tipo de qualificação a renovar, período sugerido, instrutor/empresa proposta, custo estimado, observações
  - Status: `rascunho → pendente_piloto_chefe → pendente_gerente_ops → pendente_financeiro → aprovada → executada → cancelada`
  - Notificação push para cada nível de aprovação; quem aprova avança o status
  - Ao marcar como `executada`, vincular automaticamente à qualificação resultado

> Alternativa mais simples e suficiente para o curto prazo: adicionar um campo de "solicitação de treinamento" nas fichas de sessão do simulador e uma view de "treinamentos pendentes de aprovação" no dashboard de qualificações.

---

### ❌ GAP 12 — Estrutura de Arquivo ITR-OPS-003 e Rastreabilidade do FORM-OPS-028 (§5.5/5.6 PRC-OPS-010)

**O que o documento exige**:

- Os certificados ORIGINAIS com FORM-OPS-028 (lista de presença + prova assinada pelo aluno e instrutor) devem ser arquivados na estrutura de pastas **ITR-OPS-003**: `OPERAÇÕES / TRIPULANTES / [NOME] / TREINAMENTOS / [ANO]`
- Para treinamento de voo: o certificado só é emitido com FTV (Ficha de Treinamento de Voo) e Diários de Bordo (FFS)

**O que o AirTrust tem**:

- O módulo de simuladores **já captura assinatura digital do instrutor** (timestamp + IP), o que é equivalente digital ao FORM-OPS-028 e **superior** ao papel
- Qualificações geradas automaticamente após check aprovado com assinatura
- Não há estrutura R2 de pastas em formato ITR-OPS-003

**Recomendação para o sistema**:

- Criar convenção de nome no R2 para uploads de documentos de qualificação: `empresa/{id}/qualificacoes/{funcionario_id}/{ano}/{tipo}/{arquivo}`
- Exibir na tela de qualificações do funcionário os documentos comprobatórios anexados (FTV, FFS, ficha de check assinada digitalmente)
- A assinatura digital já existente no simulador **supre integralmente o FORM-OPS-028**; mapear isso na documentação interna

---

### 💡 Sugestão de melhoria no documento PRC-OPS-010

**Item §5.5 — FORM-OPS-028 físico**:  
O documento ainda exige documento físico com assinatura manuscrita. O AirTrust já coleta **assinaturas digitais de aluno e instrutor** timestampadas e com IP, o que é juridicamente equivalente e auditável de forma superior.

> **Sugestão**: Atualizar o PRC-OPS-010 para aceitar como comprovante digital a ficha de sessão aprovada no AirTrust (com assinatura digital do instrutor e data/IP), eliminando a exigência de FORM-OPS-028 em papel para os treinamentos realizados em simulador.

---

### 💡 Sugestão de melhoria no documento PRC-OPS-009

**Seções 6.2 (sistema APUS) e 6.4.1 (acesso APUS para elaborar EVD)**:  
Essas seções contêm instruções detalhadas de navegação pelo sistema APUS (login, menus, capturas de tela) que estão **completamente obsoletas** desde que o AirTrust substituiu o APUS.

> **Sugestão**: Substituir as seções 6.2 e o passo-a-passo do §6.4.1.a.ii por referência ao AirTrust:  
> _"Acesse o sistema AirTrust em https://airtrust.online, módulo FRMS (para acumulado de horas e fadiga) ou módulo Qualificações (para alertas de vencimentos)."_

---

## 4. Módulo Simuladores

### Referência: PRC-OPS-010 Rev02 (§5.5, §5.6)

---

### ✅ Totalmente coberto — e superior ao documento

O PRC-OPS-010 exige que certificados de treinamento em solo só sejam emitidos mediante FORM-OPS-028 assinado (lista de presença + prova). O AirTrust implementa:

- Assinatura digital do **instrutor** com timestamp e IP (`assinatura_instrutor_timestamp`, `assinatura_instrutor_ip`)
- Assinatura digital do **aluno** (idem)
- Geração automática de qualificação em `qualificacoes_historico` apenas quando o check é aprovado E o instrutor assinou
- Bloqueio de emissão sem assinatura do instrutor

Isso é **equivalente digital do FORM-OPS-028** com rastreabilidade superior (imutável, com IP, timestamp, auditado).

**Nenhum gap** neste módulo.

---

## 5. Resumo de Ações Recomendadas

### Prioridade Alta (conformidade legal direta)

| #   | Ação                                                                    | Módulo       | Documento          |
| --- | ----------------------------------------------------------------------- | ------------ | ------------------ |
| 1   | Criar módulo EVD (Escala de Voo Diária)                                 | Escalas      | PRC-OPS-009 §6.4   |
| 2   | Validação de repouso ≥12h30 antes de apresentação na EVD                | Escalas/FRMS | PRC-OPS-009 §6.4.1 |
| 3   | Validação de soma de idades ≤129 anos na alocação                       | Escalas      | NOP-OPS-038 §1.ii  |
| 4   | Validação de restrições CMA na composição de tripulação                 | Escalas      | NOP-OPS-038 §1.i   |
| 5   | Dashboard Fadiga Acumulada Legal (% de 176h/90h) com limiares 80/90/95% | FRMS         | PRC-OPS-012        |

### Prioridade Média (melhoria de processo)

| #   | Ação                                                                             | Módulo        | Documento                 |
| --- | -------------------------------------------------------------------------------- | ------------- | ------------------------- |
| 6   | Alerta semanal automático por e-mail (qualificações expirando ≤90 dias)          | Qualificações | PRC-OPS-010 + PRC-OPS-009 |
| 7   | Cron de relatório diário de fadiga acumulada (a partir do dia 10 de missão)      | FRMS          | PRC-OPS-012               |
| 8   | Botão "Confirmar ciência da escala" para tripulantes na MinhaEscalaPage          | Escalas       | PRC-OPS-009 §6.3.3        |
| 9   | Alerta de experiência insuficiente na alocação (PIC <100h tipo + SIC <500h tipo) | Escalas       | PRC-OPS-009 §6.1.9a       |

### Prioridade Baixa (alinhamento de processo)

| #   | Ação                                                                   | Módulo        | Documento               |
| --- | ---------------------------------------------------------------------- | ------------- | ----------------------- |
| 10  | Workflow de solicitação e aprovação de treinamentos                    | Qualificações | PRC-OPS-010             |
| 11  | Estrutura de arquivo R2 por ITR-OPS-003 para documentos comprobatórios | Qualificações | PRC-OPS-010             |
| 12  | Validação de limite mensal no 12º dia (projeção de horas restantes)    | FRMS          | PRC-OPS-009 §6.4.1.a.ii |

---

## 6. Sugestões de Revisão nos Documentos

> **Nos casos abaixo, o AirTrust já implementa algo melhor do que o especificado. Recomenda-se atualizar o documento, não o sistema.**

| Documento   | Seção                            | Problema                                                                     | Sugestão                                                                                                  |
| ----------- | -------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| PRC-OPS-009 | §6.2 (Sistema APUS)              | Instruções de navegação pelo APUS obsoletas                                  | Substituir pelo caminho equivalente no AirTrust                                                           |
| PRC-OPS-009 | §6.4.1.a.ii (passo-a-passo APUS) | Idem — capturas de tela de sistema legado                                    | Substituir por referência ao módulo FRMS do AirTrust                                                      |
| PRC-OPS-010 | §5 refs "sistema APUS"           | Citação ao APUS para arquivamento e alertas                                  | Substituir por "sistema AirTrust"                                                                         |
| PRC-OPS-010 | §5.5 FORM-OPS-028 físico         | Exige papel; AirTrust já faz isso digitalmente com assinatura timestampada   | Aceitar ficha digital do AirTrust como equivalente                                                        |
| PRC-OPS-012 | §2 Aplicação                     | Escopo restrito a Coordenadores/Agentes (exclui pilotos da fadiga acumulada) | Revisar: incluir todos os tripulantes de voo OU justificar explicitamente por que pilotos estão excluídos |
| PRC-OPS-012 | §5 FORM-OPS-130                  | Planilha xlsx manual substituída pelo FRMS do AirTrust                       | Substituir referência ao xlsx pelo módulo FRMS/Fadiga Acumulada do AirTrust                               |

---

_Relatório gerado em 03/11/2025. Nenhuma modificação de código foi realizada — este documento é apenas analítico._
