# AirTrust — Briefing para Reunião com Consultor Regulatório

> **Tipo:** Briefing executivo e técnico — uso interno
> **Data:** 2026-06-13
> **Versão:** v1.0
> **Destinatário:** Consultor regulatório + equipe de produto AirTrust
> **Duração prevista:** 60–90 minutos
> **Status:** Preparatório — não submetido à ANAC
>
> **AVISO:** Nenhuma interpretação deste documento deve ser tratada como orientação jurídica ou regulatória definitiva. O objetivo desta reunião é exatamente validar as hipóteses internas com especialista habilitado.

---

## Índice

1. [Objetivo da Reunião](#1-objetivo-da-reunião)
2. [Contexto do AirTrust](#2-contexto-do-airtrust)
3. [Escopos Desejados de Aceitação/Autorização](#3-escopos-desejados-de-aceitaçãoautorização)
4. [Decisões Críticas que Bloqueiam Arquitetura](#4-decisões-críticas-que-bloqueiam-arquitetura)
5. [Perguntas para o Consultor Regulatório](#5-perguntas-para-o-consultor-regulatório)
6. [Suposições Atuais do AirTrust](#6-suposições-atuais-do-airtrust)
7. [Arquitetura Conceitual Proposta para Validação](#7-arquitetura-conceitual-proposta-para-validação)
8. [Riscos a Apresentar ao Consultor](#8-riscos-a-apresentar-ao-consultor)
9. [Artefatos que Queremos Validar com o Consultor](#9-artefatos-que-queremos-validar-com-o-consultor)
10. [Resultado Esperado da Reunião](#10-resultado-esperado-da-reunião)
11. [Recomendação de Condução da Reunião](#11-recomendação-de-condução-da-reunião)
12. [Anexos](#12-anexos)

---

## 1. Objetivo da Reunião

### 1.1 Propósito

O AirTrust é uma plataforma SaaS de gestão de tripulação e operações para a aviação civil brasileira. Estamos iniciando o desenvolvimento de módulos que tocam registros obrigatórios regulados pela ANAC — Diário de Bordo digital (eDB), registros de manutenção digital (SDRMe) e Controle de Voos integrado. Antes de escrever qualquer linha de código voltada à conformidade regulatória, precisamos validar nossas interpretações com um especialista.

**Esta reunião tem três objetivos concretos:**

1. **Validar interpretações normativas** — confirmar nossa leitura da Resolução 458/2017, Resolução 773/2025, Portaria 3.220/2019, RBAC 43, RBAC 117, RBAC 135 e IS relacionadas.
2. **Tomar decisões de arquitetura que não podemos tomar sozinhos** — o tipo de assinatura eletrônica aceita, o modelo de autorização ANAC, o comportamento offline do tablet, e o escopo inicial de implementação.
3. **Definir o caminho mínimo para o primeiro operador piloto** — qual é o menor conjunto de funcionalidades, artefatos e processos necessários para que um operador real possa solicitar ao seu POI autorização de uso do eDB ou do SDRMe.

### 1.2 O que não é objetivo desta reunião

- Obter "homologação" ou certificação genérica do software pela ANAC (sabemos que não existe esse caminho).
- Debater tecnologia — o consultor não precisa conhecer nossa stack.
- Tomar decisões de produto — essas ficam com o time AirTrust após as respostas regulatórias.

### 1.3 Compromisso de confidencialidade

Toda informação técnica compartilhada sobre o AirTrust nesta reunião é confidencial. O consultor não deve compartilhar detalhes de arquitetura ou roadmap com terceiros.

---

## 2. Contexto do AirTrust

### 2.1 O que é o AirTrust

AirTrust é uma plataforma multi-tenant SaaS para gestão de aviação civil, hospedada em Cloudflare (Workers + D1/SQLite + R2). Atende hoje operadores de táxi aéreo e transporte regional. A autenticação é por JWT com RBAC (perfis: admin, manager, instructor, editor, student, viewer). A comunicação cliente-servidor é criptografada com TLS.

### 2.2 Módulos existentes (operacionais)

| Módulo | Status | O que faz | Relevância regulatória |
|---|---|---|---|
| **Funcionários** | Produção | Cadastro completo de tripulantes: nome, CPF, CANAC, designação, contatos | Fonte de identidade regulatória dos tripulantes (CANAC) |
| **Qualificações** | Produção | Histórico de qualificações, validades, vencimentos, CMA, ASO, turmas, planejadas | Pré-condição para alocação de tripulante em voo |
| **Escalas** | Produção | Escalas mensais e EVD (Escala de Voo Diária) com alocações de tripulantes | Planejamento; fonte de jornada planejada para o FRMS |
| **FRMS** | Produção | Engine de cálculo de fadiga, check-in diário, score de risco, histórico de jornadas | Sistema de suporte ao GRF — **sem GRF aprovado ainda** |
| **SGSO** | Produção | Registro de ocorrências de segurança operacional | Complementa eDB e Controle de Voos |
| **LMS** | Produção | Cursos, catálogo, inscrições, certificados de treinamento | Qualificação de pilotos e mecânicos |

### 2.3 Protótipos navegáveis (NÃO são sistemas regulados)

| Módulo | Status | O que já existe | O que falta para uso regulado |
|---|---|---|---|
| **MRO / Manutenção** | Protótipo | OS básica, rastreamento de componentes | Campos IS 43.9-004, RAS digital, task cards, AD/SB, life-limited parts, assinatura |
| **Controle de Voos** | Protótipo | Dashboard OCC, programação de voos, RDV básico, tripulação, indisponibilidade | Release formal, localização de voo, vínculo eDB, irregularidades → MRO, integração FRMS |

> **Posição oficial:** nenhum desses protótipos está sendo usado como substituto de registros oficiais. São ferramentas de gestão interna. A transição para uso regulado exige a camada de conformidade descrita neste briefing.

### 2.4 O que o AirTrust ainda não tem

- Assinatura eletrônica com validade jurídica.
- Hash de integridade por registro.
- Audit log imutável para registros regulados.
- Módulo de DB Digital/eDB.
- Modo fiscalização.
- Exportação fiscalizatória padronizada.
- Política de retenção por tipo de registro.
- Backup com drill de restauração documentado.
- GRF aprovado para o FRMS.

---

## 3. Escopos Desejados de Aceitação/Autorização

### 3.1 Escopo A — DB Digital / eDB em tablet/PED

**Objetivo operacional:** Substituir o Diário de Bordo em papel por registro eletrônico em tablet, usado pelo PIC durante e após cada etapa de voo.

**Registro oficial envolvido:** Diário de Bordo (DB); caderneta de bordo; registro de irregularidades mecânicas.

**Normas aplicáveis:** Resolução ANAC 458/2017, Resolução 773/2025, Portaria 3.220/SPO/SAR/2019, RBAC 135, IS 135-002F, IS 91-015B.

**Impacto regulatório:** Máximo — o DB é o registro central de cada voo. Um DB inválido invalida o voo. Risco direto de AOC.

**Dor operacional que resolve:** O operador atual usa papel no tablet fotografado, o que não tem validade regulatória e cria risco de perda, ilegibilidade e adulteração.

**Principal dúvida para o consultor:**
> O processo correto de autorização passa pelo POI do operador via alteração de MGO? Existe algum processo de ateste prévio do fornecedor (AirTrust) junto à ANAC/SAR antes disso? A Resolução 773/2025 já está em vigor e é a norma aplicável, ou ainda depende de portaria/IS complementar?

---

### 3.2 Escopo B — SDRMe / Manutenção digital

**Objetivo operacional:** Substituir OS em papel, task cards físicos e RAS manuscrita por registros eletrônicos com assinatura digital de executor, inspetor e aprovador.

**Registro oficial envolvido:** Ordem de Serviço (OS); task cards; Aprovação para Retorno ao Serviço (RAS); cadernetas de componentes; AD/SB; calibração.

**Normas aplicáveis:** Resolução 458/2017, IS 43.9-004, RBAC 43 (especialmente 43.9, 43.10, 43.11, 43.12), RBAC 135, RBAC 145.

**Impacto regulatório:** Máximo — RAS inválida = aeronave tecnicamente não apta ao voo. Risco de segurança de voo e suspensão de licença da OMA.

**Dor operacional que resolve:** OS em papel com letra ilegível, sem rastreabilidade de componentes, sem alerta de vencimento de AD e sem integração com o controle de horas/ciclos da aeronave.

**Principal dúvida para o consultor:**
> A autorização de uso do SDRMe é por operador (que faz manutenção própria) ou por OMA? Se o operador tem manutenção interna aprovada sob RBAC 135, o SDRMe pode ser autorizado pelo POI via MGM, sem processo RBAC 145? Qual o nível de assinatura exigido para o RAS digital — ICP-Brasil é obrigatório ou Gov.br é aceito?

---

### 3.3 Escopo C — Controle de Voos / OCC / RDV

**Objetivo operacional:** Centralizar em uma única plataforma a programação de voos, despacho, acompanhamento operacional em tempo real (OCC), fechamento do RDV e relatórios regulatórios — eliminando o APUS RMCV legado e a dupla digitação.

**Registro oficial envolvido:** RDV (Relatório Diário de Voo); programação de voos; POB; localização de voo; irregularidades mecânicas.

**Normas aplicáveis:** Resolução 458/2017, RBAC 135, IS 135-002F.

**Impacto regulatório:** Alto — RDV inválido compromete o histórico de horas da aeronave e a cadeia de manutenção. Ausência de localização de voo é não conformidade RBAC 135.

**Dor operacional que resolve:** Dados de voo digitados no Sigvoos e redigitados no APUS RMCV — duas fontes de verdade que divergem, dificultando auditoria e aumentando risco de erro.

**Principal dúvida para o consultor:**
> O RDV digital (fechado pelo OCC) pode ser a fonte primária que alimenta o eDB para assinatura do PIC? Ou o eDB precisa ser a fonte primária independente do RDV do OCC? Qual é a hierarquia regulatória entre os dois registros?

---

### 3.4 Escopo D — FRMS / Jornada regulatória

**Objetivo operacional:** Usar o FRMS do AirTrust como sistema de suporte ao GRF (Gerenciamento de Risco de Fadiga), alimentado com jornada real (do RDV), não apenas jornada planejada.

**Registro oficial envolvido:** Registros de jornada e repouso; GRF/SGRF.

**Normas aplicáveis:** Resolução 458/2017, RBAC 117, IS 117.

**Impacto regulatório:** Alto — jornada acima do limite legal é infração grave e risco de acidente.

**Principal dúvida para o consultor:**
> O FRMS do AirTrust (que calcula score de fadiga e alerta para riscos) pode ser usado como ferramenta de suporte ao GRF prescritivo do RBAC 117 sem aprovação formal como SGRF? Qual o processo de aprovação de um FRMS pela ANAC?

---

### 3.5 Escopo E — Integração DB → MRO → FRMS → SGSO

**Objetivo operacional:** Ao fechar o RDV/eDB, as horas, ciclos e pousos atualizam o MRO automaticamente; discrepâncias do eDB geram OS no MRO; o FRMS recebe a jornada real; o SGSO registra ocorrências do eDB.

**Registro oficial envolvido:** Todos os anteriores, de forma integrada.

**Impacto regulatório:** Garante que não há divergência de dados entre DB, manutenção e FRMS — eliminando o risco de aeronave voando além de limites de manutenção por dados desatualizados.

**Principal dúvida para o consultor:**
> Este ciclo integrado precisa de autorização específica da ANAC, ou é suficiente que cada módulo individual seja autorizado separadamente?

---

## 4. Decisões Críticas que Bloqueiam Arquitetura

As decisões abaixo não podem ser tomadas unilateralmente pelo AirTrust. Cada uma delas impacta decisões de design que, se tomadas errado agora, exigirão refatoração completa após autorização.

| # | Decisão | Por que é crítica | Impacto técnico | Impacto regulatório | Quem precisa decidir | Urgência |
|---|---|---|---|---|---|---|
| **D-01** | Tipo de assinatura eletrônica aceita para eDB | Define toda a arquitetura do módulo de assinatura: ICP-Brasil (A1/A3) exige PKI própria e pode ter custo por assinatura; Gov.br é mais simples mas depende de API do governo; CANAC+senha pode não ter validade jurídica suficiente | Alta: se exige ICP-A3 (token físico), o fluxo do piloto no tablet muda completamente | Assinatura inadequada = eDB sem validade jurídica = DB inválido | Consultor + ANAC (POI) | **Crítica — bloqueia Fase 2** |
| **D-02** | Tipo de assinatura eletrônica aceita para SDRMe/RAS | O RAS é o documento mais crítico de manutenção; assinatura fraca = aeronave sem apta válida | Alta: idem D-01; RAS pode exigir nível de assinatura mais alto que eDB | RAS sem validade = aeronave sem certificação de retorno ao serviço | Consultor + ANAC (POI/OMA) | **Crítica — bloqueia Fase 4** |
| **D-03** | Assinatura offline no tablet (sem internet) | Se o PIC precisa assinar o eDB em área sem cobertura, a assinatura não pode depender de uma chamada de API ao servidor | Alta: assinatura offline exige chave privada armazenada no dispositivo (segurança do device) ou mecanismo alternativo | Timestamp offline pode ser manipulado; ANAC pode não aceitar assinatura sem carimbo de tempo rastreável | Consultor + especialista em PKI | **Crítica — bloqueia Fase 3** |
| **D-04** | Validade do timestamp offline | Um registro lançado às 14h00 no tablet que estava desconectado: o timestamp é o do device local ou do servidor ao sincronizar? | Alta: impacta toda a lógica de sincronização e detecção de conflito | Timestamp manipulado no device invalida a cadeia de custódia do registro | Consultor | **Crítica — bloqueia Fase 3** |
| **D-05** | Quantidade de registros disponíveis no PED para fiscalização | Define o tamanho do cache offline obrigatório no tablet: últimos 30 dias? Últimas 10 folhas? Toda a operação da aeronave? | Alta: impacta capacidade de armazenamento do device e custo de sincronização | Se norma exige X dias e o cache tem menos, a fiscalização a bordo não consegue acessar o histórico exigido | Consultor + ANAC | **Alta — bloqueia Fase 3** |
| **D-06** | Granularidade de autorização: por operador, frota, modelo ou prefixo | Define se a autorização do POI cobre toda a operação do cliente ou apenas aeronaves específicas | Alta: impacta o modelo de configuração multi-tenant do AirTrust | Autorização incorreta de escopo = uso não autorizado = infração | Consultor + ANAC (POI) | **Alta — bloqueia Fase 7** |
| **D-07** | SDRMe do operador (manutenção interna) vs. SDRMe da OMA (RBAC 145) | São processos diferentes: operador com manutenção interna usa RBAC 135; OMA usa RBAC 145 com requisitos adicionais | Alta: dois fluxos de assinatura, dois tipos de RAS, dois processos de autorização | Usar SDRMe de operador para cobrir necessidades RBAC 145 sem autorização específica = não conformidade | Consultor | **Alta — define escopo do MVP de SDRMe** |
| **D-08** | Retorno temporário ao papel em contingência | Se o tablet falha em voo, o PIC usa DB em papel. Esse DB em papel precisa ser digitalizado no sistema depois? Como isso funciona na prática? | Média: define o fluxo de contingência e retroalimentação do sistema | Se o papel não for integrado ao sistema, o histórico digital fica com lacuna; isso pode ser problema em fiscalização | Consultor | **Alta — define plano de contingência** |
| **D-09** | Período de operação paralela papel + digital | Quanto tempo o operador precisa manter os dois registros simultaneamente antes de poder descontinuar o papel? | Baixa: apenas define cronograma de transição | Se a ANAC exige X meses de paralelo, o planejamento do piloto muda | Consultor + ANAC (POI) | **Média** |
| **D-10** | Fonte oficial dos dados: RDV do OCC, eDB do piloto ou ambos | Quando RDV e eDB divergem (ex: piloto anotou horário diferente do que o OCC registrou), qual prevalece? | Alta: impacta toda a lógica de reconciliação entre módulos | Sem definição clara, auditoria fica impossível | Consultor + operador | **Alta — bloqueia design da integração Controle de Voos ↔ eDB** |
| **D-11** | Formato de exportação aceito pela fiscalização | PDF? XML? JSON estruturado? CSV? A ANAC tem preferência ou requisito específico? | Média: define o módulo de exportação | Exportação em formato não aceito = dado inacessível para fiscal | Consultor + ANAC | **Média** |

---

## 5. Perguntas para o Consultor Regulatório

As perguntas estão organizadas por bloco temático e priorizadas por urgência para as decisões de arquitetura.

### Bloco A — Processo ANAC / Autorização / Escopo

**A-01** *(Crítica)*
> **Pergunta:** Existe algum processo de ateste ou pré-aprovação do fornecedor de software (AirTrust) junto à ANAC/SAR, ou a autorização de uso passa exclusivamente pelo POI de cada operador/OMA de forma individual?
>
> **Por que precisamos:** Define se devemos preparar um único pacote de submissão à ANAC como fornecedor, ou um pacote personalizado para cada operador cliente.
>
> **Impacto no sistema:** Um pacote único de ateste permite escala; um processo por operador exige suporte regulatório recorrente por cliente.
>
> **Risco sem validação:** Investir em pacote de ateste centralizado que a ANAC não reconhece como válido, ou — o inverso — subestimar a necessidade de processo formal e operar sem autorização.

---

**A-02** *(Crítica)*
> **Pergunta:** A autorização de uso do eDB é por operador/CNPJ, por frota (modelo de aeronave), por prefixo individual ou por escopo de operação?
>
> **Por que precisamos:** Define a granularidade do controle de acesso e as configurações do tenant no AirTrust.
>
> **Impacto no sistema:** Se for por prefixo, o sistema precisa de um campo de "autorização regulatória" por aeronave. Se for por frota, a configuração é por modelo. Se for por operador, é mais simples.
>
> **Risco sem validação:** Autorizar o sistema para uma aeronave e operar em outra sem autorização específica, mesmo dentro do mesmo operador.

---

**A-03** *(Alta)*
> **Pergunta:** Qual a forma mais aceita/rápida de obter autorização de uso: alteração de MGO submetida ao POI, LOA (Letter of Authorization), EO (Engineering Order) ou outro instrumento?
>
> **Por que precisamos:** Define o roteiro regulatório do operador piloto.
>
> **Impacto no sistema:** O AirTrust precisa preparar a documentação no formato correto.
>
> **Risco sem validação:** Preparar documentação no formato errado e ser rejeitado pelo POI.

---

**A-04** *(Alta)*
> **Pergunta:** Existe precedente de outros sistemas informatizados de eDB ou SDRMe já autorizados pela ANAC para operadores RBAC 135? Se sim, quais foram os elementos-chave do processo?
>
> **Por que precisamos:** Aprender com o que já funcionou reduz risco de rejeição.
>
> **Impacto no sistema:** Pode revelar requisitos não documentados nas normas mas exigidos na prática.
>
> **Risco sem validação:** Repetir erros de processos anteriores que falharam.

---

### Bloco B — DB Digital / eDB

**B-01** *(Crítica)*
> **Pergunta:** A Resolução ANAC nº 773/2025 está em vigor? Existe IS complementar ou portaria específica que detalha os requisitos técnicos do eDB? A Portaria 3.220/SPO/SAR/2019 ainda está vigente?
>
> **Por que precisamos:** Nossa análise se baseia na Resolução 773/2025 e na Portaria 3.220/2019. Se uma delas não está em vigor ou foi substituída, todo o mapeamento de campos precisa ser refeito.
>
> **Impacto no sistema:** Mapeamento campo a campo do eDB depende da norma correta.
>
> **Risco sem validação:** Construir eDB com campos da norma errada; rejeição pela ANAC.

---

**B-02** *(Crítica)*
> **Pergunta:** Qual é o período mínimo de registros que devem estar disponíveis no tablet/PED para acesso da fiscalização, mesmo sem internet (offline)?
>
> **Por que precisamos:** Define o tamanho do cache obrigatório no dispositivo.
>
> **Impacto no sistema:** Impacta diretamente o design do módulo offline.
>
> **Risco sem validação:** Fiscal não consegue acessar histórico exigido; autuação.

---

**B-03** *(Alta)*
> **Pergunta:** O PIC precisa assinar cada etapa de voo individualmente, ou pode assinar ao encerrar a folha do DB? E quanto ao operador/despachante — qual é o prazo para contrassinatura?
>
> **Por que precisamos:** Define o fluxo de UX do eDB e o momento em que o registro é "selado".
>
> **Impacto no sistema:** Impacta o design de assinatura e o fluxo de addendum.
>
> **Risco sem validação:** Construir fluxo de assinatura no momento errado; DB com assinatura fora do prazo.

---

**B-04** *(Alta)*
> **Pergunta:** Em caso de falha do tablet, o retorno ao DB em papel é aceito sem necessidade de notificação prévia à ANAC, desde que documentado no MGO? E o DB em papel do dia precisa ser digitalizado retrospectivamente no sistema?
>
> **Por que precisamos:** Define o plano de contingência e o fluxo de reconciliação pós-falha.
>
> **Impacto no sistema:** Impacta o design do módulo de contingência e a política de gaps no histórico digital.
>
> **Risco sem validação:** Lacuna no histórico digital após falha de hardware; fiscal questiona período sem registro digital.

---

### Bloco C — SDRMe / Manutenção

**C-01** *(Crítica)*
> **Pergunta:** Para um operador RBAC 135 com manutenção interna aprovada, a autorização do SDRMe digital passa pelo POI via MGM, sem processo RBAC 145? Ou é necessário um processo específico junto à SAR/ANAC?
>
> **Por que precisamos:** Define o processo regulatório do SDRMe para o operador piloto.
>
> **Impacto no sistema:** Pode haver dois tipos de autorização com requisitos diferentes.
>
> **Risco sem validação:** Processo regulatório incorreto; OMA operando com SDRMe não autorizado.

---

**C-02** *(Alta)*
> **Pergunta:** O RAS digital assinado pelo aprovador tem a mesma validade jurídica do RAS em papel se usar certificado ICP-Brasil? A ANAC já aceitou RAS digital em algum precedente?
>
> **Por que precisamos:** O RAS é o documento mais crítico do SDRMe; sua validade determina a aeronavegabilidade da aeronave.
>
> **Impacto no sistema:** Valida toda a arquitetura de assinatura do SDRMe.
>
> **Risco sem validação:** RAS digital não aceito em fiscalização; aeronave considerada não apta.

---

**C-03** *(Alta)*
> **Pergunta:** Quando a manutenção é realizada por OMA terceirizada aprovada, o SDRMe do operador precisa replicar os registros completos da OMA, ou é suficiente manter referência ao documento da OMA (número de OS, data, RAS da OMA)?
>
> **Por que precisamos:** Define o escopo do módulo de manutenção terceirizada.
>
> **Impacto no sistema:** Replicação completa exige integração entre sistemas de diferentes empresas; referência é muito mais simples.
>
> **Risco sem validação:** Auditoria de manutenção terceirizada impossível; não conformidade RBAC 145.

---

### Bloco D — Assinatura Eletrônica / Digital

**D-01** *(Crítica)*
> **Pergunta:** A ANAC aceita assinatura Gov.br (que usa ICP-Brasil como backbone) para eDB e SDRMe? Ou é exigido certificado ICP-Brasil A1/A3 próprio? Existe algum nível de assinatura eletrônica simples aceito para categorias de registro menos críticas?
>
> **Por que precisamos:** É a decisão técnica mais impactante de todo o projeto. ICP-A3 exige token físico (USB ou smart card) que o piloto precisa carregar; Gov.br é por aplicativo de celular; CANAC+senha seria o mais simples mas pode não ter validade jurídica.
>
> **Impacto no sistema:** Muda completamente o design do módulo de assinatura, o UX do piloto e o custo operacional.
>
> **Risco sem validação:** Construir sistema com assinatura fraca; registros rejeitados pela fiscalização.

---

**D-02** *(Crítica)*
> **Pergunta:** Uma assinatura offline (criada no tablet sem conexão com a internet e sincronizada depois) tem validade jurídica no contexto de registros da aviação civil? Qual é a interpretação da ANAC sobre timestamps offline?
>
> **Por que precisamos:** O piloto frequentemente opera em áreas sem cobertura. Se a assinatura exige conexão, o eDB fica inoperante exatamente onde é mais necessário.
>
> **Impacto no sistema:** Determina se o eDB pode funcionar como PWA offline ou precisa ser nativo com PKI local.
>
> **Risco sem validação:** Assinatura offline considerada inválida; eDB não aceitável para uso regulado em operações em áreas remotas.

---

**D-03** *(Alta)*
> **Pergunta:** Existe orientação da ANAC ou da Resolução 458 sobre qual autoridade certificadora (AC) é aceita, além da ICP-Brasil? Por exemplo: AC de outras jurisdições (EASA, FAA) para aeronaves com registro estrangeiro?
>
> **Por que precisamos:** Alguns clientes do AirTrust podem ter aeronaves com registro estrangeiro.
>
> **Impacto no sistema:** Pode exigir suporte a múltiplas ACs no módulo de assinatura.
>
> **Risco sem validação:** Sistema incapaz de servir segmento de mercado relevante.

---

### Bloco E — Offline / PED / Tablet

**E-01** *(Crítica)*
> **Pergunta:** O PED (Personal Electronic Device) ou tablet é obrigatório, desejável ou opcional para o eDB? Existe requisito mínimo de hardware (sistema operacional, proteção física, resistência) para que um tablet seja aceito como PED para eDB?
>
> **Por que precisamos:** Define se precisamos de especificação de hardware no manual do piloto.
>
> **Impacto no sistema:** Impacta o design responsivo do eDB e o plano de contingência.
>
> **Risco sem validação:** Tablet inadequado usado como PED; rejeição pela ANAC.

---

**E-02** *(Alta)*
> **Pergunta:** O eDB pode ser implementado como PWA (Progressive Web App) instalável em browser, ou exige aplicativo nativo? Existe requisito de certificação do software do dispositivo pelo fabricante?
>
> **Por que precisamos:** PWA é nossa preferência técnica por custo de manutenção; app nativo pode ser exigido pela norma.
>
> **Impacto no sistema:** PWA vs. app nativo são arquiteturas completamente diferentes.
>
> **Risco sem validação:** Construir PWA e descobrir que norma exige app nativo; retrabalho completo.

---

**E-03** *(Alta)*
> **Pergunta:** Em caso de sincronização com conflito (o mesmo campo editado online e offline), qual é a regra que a ANAC espera? "Servidor vence" ou "device vence" ou "sempre gera addendum"?
>
> **Por que precisamos:** Define a política de resolução de conflito — decisão de design irreversível se escolhida errado.
>
> **Impacto no sistema:** Impacta a integridade do audit log e do histórico de registros.
>
> **Risco sem validação:** Conflito resolvido de forma que cria registro enganoso; auditoria comprometida.

---

### Bloco F — FRMS / RBAC 117

**F-01** *(Alta)*
> **Pergunta:** O FRMS do AirTrust (que calcula score de fadiga, alerta para riscos e registra jornada) pode ser usado como ferramenta de suporte a um GRF prescritivo (RBAC 117 sem SGRF) sem aprovação formal como sistema de gerenciamento de fadiga (SGRF)?
>
> **Por que precisamos:** Nossos clientes usam o FRMS hoje sem GRF aprovado — precisamos entender o risco regulatório dessa situação.
>
> **Impacto no sistema:** Se exige aprovação formal, o GRF precisa ser documentado e submetido antes de qualquer uso regulatório do FRMS.
>
> **Risco sem validação:** Clientes operando com FRMS sem GRF aprovado — possível infração RBAC 117.

---

**F-02** *(Alta)*
> **Pergunta:** Qual o processo de aprovação formal de um SGRF (Sistema de Gerenciamento de Risco de Fadiga) pela ANAC? Exige aprovação prévia antes do uso ou pode ser submetido e aceito em operação piloto?
>
> **Por que precisamos:** Define o roadmap regulatório do FRMS.
>
> **Impacto no sistema:** Se o processo é longo (6-12 meses), precisa começar agora em paralelo com o desenvolvimento.
>
> **Risco sem validação:** FRMS operando como SGRF sem aprovação; infração grave.

---

### Bloco G — Transição Papel → Digital

**G-01** *(Alta)*
> **Pergunta:** A ANAC exige um período mínimo de operação paralela (papel + digital) antes de autorizar a descontinuação do papel? Se sim, qual o período mínimo usual aceito pelo POI?
>
> **Por que precisamos:** Define o cronograma do piloto e a duração da Fase 6 (operação paralela).
>
> **Impacto no sistema:** Sistema precisa suportar operação paralela sem conflito de dados entre papel e digital.
>
> **Risco sem validação:** Descontinuar o papel prematuramente; POI exige retomada do papel.

---

**G-02** *(Média)*
> **Pergunta:** Registros históricos em papel precisam ser digitalizados e importados para o sistema, ou o sistema digital vale apenas a partir da data de autorização?
>
> **Por que precisamos:** Define se precisamos de módulo de importação de histórico.
>
> **Impacto no sistema:** Importação de histórico é complexa e cara; se não for obrigatória, economizamos esforço.
>
> **Risco sem validação:** Histórico exigido em fiscalização não está no sistema digital; fiscal solicita documentos em papel.

---

### Bloco H — Manutenção Terceirizada

**H-01** *(Alta)*
> **Pergunta:** Para rastreabilidade de manutenção terceirizada, o SDRMe do operador precisa ter todos os campos da IS 43.9-004 para trabalhos feitos por OMA externa, ou é suficiente manter número de OS da OMA, data, descrição resumida e número de aprovação ANAC da OMA?
>
> **Por que precisamos:** Define o esforço de desenvolvimento do módulo de terceirização.
>
> **Risco sem validação:** Módulo de terceirização com escopo incorreto; auditoria revela lacuna de documentação.

---

### Bloco I — Exportação / Fiscalização

**I-01** *(Alta)*
> **Pergunta:** A ANAC tem requisito ou preferência de formato para exportação fiscalizatória: PDF, XML estruturado, CSV, JSON? Existe um layout ou schema definido pela ANAC, ou o formato é livre desde que legível e completo?
>
> **Por que precisamos:** Define o módulo de exportação do Records Core.
>
> **Impacto no sistema:** Implementar formato estruturado (XML/JSON) é muito mais complexo que PDF.
>
> **Risco sem validação:** Exportação em formato não aceito; fiscal não consegue interpretar os dados.

---

**I-02** *(Média)*
> **Pergunta:** Durante uma fiscalização a bordo, o inspetor pode acessar o eDB diretamente no tablet do piloto (read-only), ou precisa de exportação em papel ou outro dispositivo?
>
> **Por que precisamos:** Define o design do "modo fiscalização" no tablet.
>
> **Risco sem validação:** Modo fiscalização incorreto; processo de acesso do fiscal é inadequado.

---

## 6. Suposições Atuais do AirTrust

As hipóteses abaixo orientam nossas decisões internas. Precisamos que o consultor valide, refute ou nuance cada uma antes de iniciarmos implementação regulada.

| # | Suposição | Status | Precisa de validação? |
|---|---|---|---|
| S-01 | A ANAC não homologa genericamente software — a autorização é por operador/OMA e escopo, via POI | Confiança alta (leitura da Resolução 458 e prática de mercado) | Confirmar o processo exato |
| S-02 | A Resolução 458/2017 é a norma horizontal que se aplica a qualquer sistema informatizado de registros obrigatórios, incluindo eDB e SDRMe | Confiança alta | Confirmar que não há exclusão ou exceção relevante |
| S-03 | O Records Core (hash + assinatura + audit log imutável + addendum + exportação + backup) deve ser construído antes de qualquer módulo regulado entrar em operação | Confiança alta — é a conclusão lógica da Resolução 458 | Confirmar que não há alternativa regulatória mais simples |
| S-04 | O eDB deve funcionar em tablet/PED, preferencialmente como PWA com capacidade offline | Confiança média — norma menciona PED mas não especifica tecnologia | **Validar com prioridade** |
| S-05 | O modo offline é necessário (não apenas contingência opcional) para operações em áreas remotas | Confiança média — decorre da lógica operacional, não de exigência normativa explícita | **Validar com prioridade** |
| S-06 | Assinatura com ICP-Brasil (A1 ou Gov.br) é o caminho mais seguro para validade jurídica do eDB e do RAS | Confiança alta — MP 2.200-2/2001 define ICP-Brasil como infraestrutura de assinatura com fé pública | **Validar se Gov.br é aceito pela ANAC especificamente** |
| S-07 | O RDV do Controle de Voos deve ser a fonte primária que pré-preenche o eDB para assinatura do PIC | Confiança média — é a lógica operacional mais eficiente, mas pode conflitar com a norma que define o eDB como fonte primária | **Validar hierarquia regulatória** |
| S-08 | A discrepância registrada no eDB deve gerar automaticamente um fluxo no SDRMe (OS preliminar) | Confiança alta — exigência do RBAC 135 de vínculo entre irregularidades mecânicas e manutenção | Confirmar que o vínculo pode ser digital e automático |
| S-09 | Horas, ciclos e pousos do RDV devem alimentar automaticamente o MRO para atualização de programas de manutenção | Confiança alta — decorre do RBAC 43 e da cadeia de manutenção baseada em utilização | Confirmar que atualização automática é aceita sem intervenção manual |
| S-10 | O FRMS deve consumir jornada real (do RDV fechado), não apenas jornada planejada | Confiança alta — decorre do RBAC 117; o prescritivo exige controle de jornada realizada | Confirmar que integração automática com o RDV é suficiente |
| S-11 | GRF documentado e aprovado pelo POI é obrigatório para uso regulado do FRMS | Confiança alta — leitura do RBAC 117 | Confirmar o processo de aprovação e o prazo típico |
| S-12 | O período de retenção do eDB é de pelo menos 5 anos | Confiança média — inferido da prática regulatória; norma específica a confirmar | **Validar período exato por tipo de registro** |

---

## 7. Arquitetura Conceitual Proposta para Validação

Esta seção apresenta o design conceitual do sistema para que o consultor avalie se a abordagem está alinhada com o que a ANAC espera. Não se trata de documentação técnica detalhada — apenas o fluxo e os componentes.

### 7.1 Componentes principais

```
┌─────────────────────────────────────────────────────────────────────┐
│                    AIRTRUST — VISÃO REGULATÓRIA                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                  REGULATED RECORDS CORE                          │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────┐  │ │
│  │  │ Record   │  │Assinatura│  │ Addendum │  │  Audit Log     │  │ │
│  │  │ Seal     │  │ Eletrôn. │  │(correção)│  │  (imutável)    │  │ │
│  │  │ (hash)   │  │ ICP/Gov  │  │          │  │                │  │ │
│  │  └──────────┘  └──────────┘  └──────────┘  └────────────────┘  │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────┐  │ │
│  │  │ Retenção │  │ Backup / │  │Exportação│  │     Modo       │  │ │
│  │  │ (policy) │  │Restaur.  │  │ Fiscal.  │  │  Fiscalização  │  │ │
│  │  └──────────┘  └──────────┘  └──────────┘  └────────────────┘  │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
│  ┌────────────────┐  ┌────────────────┐  ┌─────────────────────────┐ │
│  │ DB DIGITAL     │  │ CONTROLE DE    │  │  SDRMe / MRO            │ │
│  │ eDB (tablet)   │  │ VOOS / OCC     │  │  Manutenção digital     │ │
│  │                │  │                │  │                         │ │
│  │ • Campos DB    │  │ • Programação  │  │ • OS + task cards       │ │
│  │ • Etapas voo   │  │ • RDV          │  │ • RAS digital           │ │
│  │ • Assinatura   │  │ • Flight follow│  │ • Life-limited parts    │ │
│  │   PIC          │  │ • Release voo  │  │ • AD/SB tracking        │ │
│  │ • Offline/PED  │  │ • Tripulação   │  │ • Manutenção terceirizada│ │
│  │ • Modo fiscal  │  │ • Irregulares  │  │ • Assinatura executor/  │ │
│  └────────────────┘  └────────────────┘  │   inspetor/aprovador   │ │
│                                           └─────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │   MÓDULOS DE SUPORTE (existentes)                                │ │
│  │   Funcionários │ Qualificações │ FRMS │ LMS │ SGSO │ Escalas    │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.2 Fluxo operacional integrado (para validação)

O fluxo abaixo descreve o ciclo completo de um voo no AirTrust regulado. Queremos validar com o consultor se esse fluxo está alinhado com o que a norma exige e com o que a ANAC espera.

```
OCC programa o voo
        │
        ▼
CONTROLE DE VOOS valida tripulação
(qualificações + FRMS + disponibilidade)
        │
        ▼
FRMS verifica risco de fadiga do PIC/SIC
[ALERTA se acima do limite → OCC decide]
        │
        ▼
Release formal do voo
(assinatura OCC/despachante)
        │
        ▼
PIC abre eDB no TABLET
(aeronave + tripulação pré-preenchidos)
        │
        ▼
PIC preenche cada ETAPA DE VOO
(horários, POB, combustível, pousos, ocorrências)
        │
        ├──► Ocorrência/discrepância técnica?
        │         │
        │         ▼
        │    SDRMe gera OS PRELIMINAR automaticamente
        │    (vínculo ID discrepância ↔ ID OS)
        │
        ▼
PIC assina eDB (assinatura eletrônica com CANAC/ICP)
[Records Core sela o registro com hash + timestamp]
        │
        ▼
Operador contrassina (dentro do prazo definido)
        │
        ▼
RDV é fechado no CONTROLE DE VOOS pelo OCC
(confirma horários reais)
        │
        ├──► MRO atualiza contadores automaticamente
        │    (horas totais + ciclos + pousos por prefixo)
        │    [Alerta se manutenção vence em breve]
        │
        ├──► FRMS atualiza jornada REALIZADA do PIC
        │    (horas de voo reais, não planejadas)
        │
        └──► SGSO: ocorrências do eDB disponíveis para registro
             (PIC ou gerência de segurança decide escalar)
```

```
OS de manutenção (SDRMe):
        │
        ▼
Mecânico executa task cards
(check step a step + assinatura por step)
        │
        ▼
Inspetor assina (conferência de execução)
        │
        ▼
Aprovador assina RAS
[Records Core sela o RAS; aeronave = APTA]
        │
        ▼
CONTROLE DE VOOS: aeronave disponível
(status de aeronavegabilidade atualizado)
```

### 7.3 Perguntas de validação de arquitetura para o consultor

1. O fluxo de assinatura descrito (PIC assina eDB; operador contrassina) está alinhado com o que a norma espera?
2. A sequência RDV → eDB (RDV pré-preenche, PIC assina) é regulatoriamente válida, ou o eDB deve ser independente do RDV?
3. A atualização automática de contadores de MRO pelo fechamento do RDV é aceita, ou exige confirmação manual do mecânico?
4. O Records Core como camada compartilhada (um único módulo de hash, assinatura, audit log) é uma abordagem que a ANAC reconheceria como válida, ou cada módulo precisa de conformidade independente?

---

## 8. Riscos a Apresentar ao Consultor

Os riscos abaixo são os que mais nos preocupam e que queremos discutir abertamente com o consultor para obter orientação.

| # | Risco | Impacto | Pergunta ao consultor |
|---|---|---|---|
| **R-01** | Usar o termo "homologado pela ANAC" no marketing antes de autorização formal | Muito alto — responsabilidade legal do AirTrust e do operador | Como descrever corretamente a relação com a ANAC para fins comerciais? |
| **R-02** | Construir o módulo de assinatura sem validar o tipo aceito pela ANAC | Muito alto — todo o eDB e SDRMe podem ser inválidos | Qual é a menor incerteza sobre o tipo de assinatura que a ANAC aceita? |
| **R-03** | Construir modo offline com assinatura local sem validar validade jurídica do timestamp offline | Muito alto — eDB offline sem validade = DB inválido para operações remotas | Existe precedente de assinatura offline aceita pela ANAC? |
| **R-04** | Não ter fonte oficial única definida (RDV vs. eDB) antes de construir a integração | Alto — dados divergentes entre dois registros oficiais são problema grave em auditoria | Como a ANAC trata a divergência entre RDV e eDB? |
| **R-05** | Operar papel e digital simultaneamente sem definir qual é o registro oficial | Alto — dupla fonte de verdade com possível divergência | Qual é a regra regulatória durante o período de operação paralela? |
| **R-06** | Não ter audit log imutável ativado antes de usar qualquer módulo como registro oficial | Muito alto — impossibilidade de reconstruir histórico; infração grave | A Resolução 458 exige o audit log desde o primeiro registro digital? |
| **R-07** | Backup sem drill de restauração documentado | Alto — perda de dados regulados é irrecuperável | Qual frequência de backup e qual evidência de restauração a ANAC espera? |
| **R-08** | MGO/MGM/MOM não atualizados antes de operar digitalmente | Muito alto — operação digital sem respaldo no MGO é infração imediata | O MGO precisa ser atualizado ANTES ou pode ser atualizado em paralelo com o período de operação piloto? |
| **R-09** | SDRMe sem rastreabilidade de manutenção terceirizada | Alto — OMA terceirizada sem documentação no sistema = lacuna de aeronavegabilidade | Qual o nível mínimo de rastreabilidade aceitável para terceirizados? |
| **R-10** | FRMS usado informalmente como suporte ao GRF sem GRF aprovado | Alto — clientes podem estar em não conformidade agora | Há risco imediato para os clientes que usam o FRMS hoje sem GRF documentado? |

---

## 9. Artefatos que Queremos Validar com o Consultor

A lista abaixo é o conjunto de documentos que o AirTrust precisará produzir para suportar a solicitação de autorização de cada operador/OMA. Queremos confirmar com o consultor se a lista está completa, se a ordem está correta e se existem artefatos que a ANAC exige mas não mapeamos.

| # | Artefato | Objetivo | Status atual |
|---|---|---|---|
| 01 | Matriz Normativa de Conformidade (50 requisitos × evidências) | Demonstrar que o sistema atende a cada requisito regulatório | Rascunho criado (aguarda validação) |
| 02 | Relatório de Conformidade com a Resolução 458 | Declaração formal de como cada requisito da Res. 458 é atendido tecnicamente | Não iniciado |
| 03 | Política de Segurança da Informação | Criptografia, controle de acesso, incidentes, LGPD | Não iniciado (formal) |
| 04 | Política de Assinatura Eletrônica | Tipo de assinatura, AC, validade, revogação | **Bloqueada pela D-01** |
| 05 | Política de Backup e Restauração | Frequência, tecnologia, evidência de drill | Rascunho existente; falta drill documentado |
| 06 | Plano de Contingência (falha de tablet) | Procedimento de retorno ao papel, dispositivo reserva, reconstituição | Não iniciado |
| 07 | Plano de Operação Offline | Comportamento do eDB sem internet, política de sincronização, resolução de conflito | **Bloqueado pela D-03 e D-04** |
| 08 | Manual do Piloto — eDB | Como usar o eDB, offline, contingência, assinatura | Não iniciado |
| 09 | Manual do OCC — Controle de Voos | Como usar o OCC, RDV, localização de voo | Não iniciado |
| 10 | Manual da Manutenção — SDRMe | Como usar o SDRMe, OS, task cards, RAS | Não iniciado |
| 11 | Manual do Administrador | Gestão de usuários, dispositivos, auditoria, exportação fiscal | Não iniciado |
| 12 | Evidências de Testes (test report) | Casos de teste executados com resultado PASS/FAIL | Não iniciado |
| 13 | Evidências de Funcionamento Offline | Gravação ou screenshots do eDB funcionando sem internet | **Bloqueado por decisão de arquitetura** |
| 14 | Evidências de Hash / Audit Log / Assinatura | Demonstração técnica de integridade e rastreabilidade | Não iniciado |
| 15 | Evidências de Exportação Fiscalizatória | Exemplo de exportação gerada; demonstração do modo fiscalização | Não iniciado |
| 16 | Plano de Treinamento | Programa de treinamento de pilotos, mecânicos e OCC | Não iniciado |
| 17 | Plano de Transição Papel → Digital | Cronograma, período paralelo, data de descontinuação | **Bloqueado pela G-01** |
| 18 | Capítulo de MGO — registros digitais | Seção do MGO cobrindo uso de eDB e Controle de Voos | A ser produzido pelo operador piloto com suporte do AirTrust |
| 19 | Capítulo de MGM/MOM — SDRMe digital | Seção do MGM cobrindo SDRMe | A ser produzido pelo operador/OMA com suporte do AirTrust |
| 20 | Escopo de Aeronaves Autorizadas | Lista de prefixos autorizados pelo POI | A ser definida pelo operador piloto |
| 21 | Pacote de Submissão ANAC / POI | Conjunto consolidado dos artefatos acima para apresentação ao POI | **Resultado final; depende de todos os anteriores** |

---

## 10. Resultado Esperado da Reunião

Ao final desta reunião, esperamos ter resolvido os seguintes pontos. Para cada item, identificamos quem produz o resultado e qual o impacto de não ter a resposta.

### Checklist de saídas obrigatórias

- [ ] **Tipo de assinatura eletrônica definido** (ICP-A1, ICP-A3, Gov.br, outro) — bloqueia Fase 2
- [ ] **Assinatura offline: viável ou não para uso regulado** — bloqueia Fase 3 (eDB)
- [ ] **Processo de autorização confirmado** (POI + MGO, LOA, EO ou outro)
- [ ] **Granularidade de autorização** (por operador, frota, prefixo)
- [ ] **Norma vigente confirmada** (Res. 773/2025 + Portaria 3.220 ou outra)
- [ ] **Período mínimo de operação paralela** (se exigido)
- [ ] **Período de disponibilidade offline no PED** (30 dias? 10 folhas? Outra métrica)
- [ ] **Hierarquia RDV vs. eDB** (qual é a fonte primária)
- [ ] **SDRMe: processo de autorização por operador vs. OMA**
- [ ] **RAS digital: validade jurídica confirmada com tipo de assinatura**
- [ ] **FRMS sem GRF: risco imediato para clientes atuais** (sim/não)
- [ ] **Processo de aprovação do SGRF** (prazo e etapas)
- [ ] **Formato de exportação aceito pela fiscalização**
- [ ] **Lista de artefatos do pacote ANAC validada ou corrigida**

### Checklist de saídas desejáveis

- [ ] Operador piloto definido ou critérios para escolha
- [ ] Ordem de implementação validada pelo consultor (eDB → SDRMe → OCC → FRMS ou outra)
- [ ] Referência a precedentes de eDB ou SDRMe já autorizados pela ANAC no mercado brasileiro
- [ ] Indicação de IS ou orientações complementares não mapeadas

---

## 11. Recomendação de Condução da Reunião

### Roteiro sugerido (90 minutos)

| Bloco | Duração | Responsável AirTrust | Objetivo |
|---|---|---|---|
| **Abertura e NDAs** | 5 min | CEO/Product | Confirmar confidencialidade; apresentar participantes |
| **Contexto AirTrust** | 10 min | Product | Apresentar módulos existentes, protótipos, stack técnica e o que não é regulado hoje |
| **Escopos e objetivos** | 10 min | Product | Apresentar os 5 escopos (eDB, SDRMe, OCC, FRMS, integração); perguntar ao consultor se o escopo faz sentido regulatoriamente |
| **Assinatura eletrônica** | 20 min | Tech Lead + Consultor | **Bloco mais crítico:** ICP vs. Gov.br vs. CANAC; offline; timestamp; RAS; quem precisa decidir o quê |
| **DB Digital / eDB** | 15 min | Product + Consultor | Norma vigente; campos; fluxo de assinatura; disponibilidade offline; fiscalização a bordo |
| **SDRMe / Manutenção** | 15 min | Product + Consultor | Processo de autorização; RAS digital; terceirizados; escopo OMA vs. operador |
| **FRMS / Controle de Voos** | 10 min | Product + Consultor | GRF sem aprovação; hierarquia RDV vs. eDB; integração |
| **Próximos passos** | 5 min | CEO/Product | Confirmar ações derivadas; próxima reunião; contratos |

### Dicas de condução

- Compartilhar este briefing com o consultor **pelo menos 3 dias antes** da reunião para que ele chegue preparado.
- Começar pela assinatura eletrônica — é a decisão que mais impacta tudo e que mais costuma surpreender quem vem do mundo de TI.
- Não tentar resolver tudo na reunião — priorizar as 10 perguntas críticas e deixar as demais para troca por e-mail.
- Pedir ao consultor exemplos concretos de outros sistemas digitais aceitos pela ANAC em contexto similar (eDB, SDRMe).
- Gravar a reunião ou designar alguém exclusivamente para ata — muitas decisões serão verbais e precisam de registro.

---

## 12. Anexos

### Anexo A — Normas mapeadas

| Norma | Escopo | Aplicação no AirTrust |
|---|---|---|
| Resolução ANAC nº 458/2017 | Sistemas informatizados de registros regulados | Norma horizontal — aplica-se a todos os módulos regulados |
| Resolução ANAC nº 773/2025 | Diário de Bordo eletrônico | Norma específica do eDB |
| Portaria nº 3.220/SPO/SAR/2019 | Campos e layout do eDB | Referência de campos do formulário eDB |
| IS 43.9-004 (revisão vigente) | Conteúdo dos registros de manutenção | Campos obrigatórios da OS e do SDRMe |
| RBAC 43 (43.9, 43.10, 43.11, 43.12) | Registros, vida limitada, RAS, transferência | Requisitos de negócio do SDRMe |
| RBAC 135 | Controle operacional, DB, irregularidades mecânicas | Requisitos do Controle de Voos e do eDB |
| IS 135-002F | MGO, controle operacional, diário de bordo | Detalhamento dos requisitos do RBAC 135 |
| RBAC 117 | Limites de jornada e repouso, GRF/SGRF | Requisitos do FRMS |
| IS 117 | Detalhamento RBAC 117 | Cálculo de jornada, limites específicos |
| RBAC 145 | Organizações de manutenção (OMA) | Requisitos adicionais do SDRMe para OMAs |
| IS 91-015B | Reconstituição de caderneta de voo | Exportação de histórico de voos por tripulante |
| MP 2.200-2/2001 / ICP-Brasil | Infraestrutura de assinatura digital no Brasil | Base legal da assinatura eletrônica |

---

### Anexo B — Documentos internos já criados

| Documento | Localização | Conteúdo relevante |
|---|---|---|
| Documento regulatório principal | `docs/ANAC_HOMOLOGACAO_AIRTRUST_DB_DIGITAL_SDRME_CONTROLE_VOOS.md` | 15 seções; 1.420 linhas; gap analysis completo; roadmap em 9 fases; 13 epics |
| Matriz de conformidade (50 requisitos) | `docs/ANAC_MATRIZ_CONFORMIDADE_AIRTRUST.csv` | REQ-001 a REQ-050; norma × módulo × status × prioridade × fase |
| Benchmark de Controle de Voos | `docs/CONTROLE_DE_VOOS_BENCHMARK_REQUISITOS.md` | Inventário APUS RMCV; benchmark Leon/Veryon/ForeFlight; proposta de MVP |

---

### Anexo C — Resumo da Matriz de 50 Requisitos

| Categoria | Qtd. itens | Status predominante | Prioridade |
|---|---|---|---|
| Resolução 458 (base horizontal) | 12 | Inexistente (10) / Parcial (2) | Alta (12/12) |
| DB Digital / eDB | 12 | Inexistente (11) / Parcial (1) | Alta (11/12) |
| SDRMe / Manutenção (RBAC 43) | 13 | Inexistente (11) / Protótipo parcial (2) | Alta (9/13), Média (4/13) |
| Controle de Voos (RBAC 135) | 7 | Inexistente (5) / Protótipo (2) | Alta (7/7) |
| FRMS / Jornada (RBAC 117) | 3 | Parcial (2) / Inexistente (1) | Alta (3/3) |
| Assinatura / ICP-Brasil | 1 | Inexistente | Alta (1/1) |
| Offline / Contingência | 2 | Inexistente | Alta (2/2) |
| **TOTAL** | **50** | **Inexistente (39) / Parcial (7) / Protótipo (4)** | **Alta (43/50)** |

> **Conclusão da matriz:** 39 de 50 requisitos estão completamente inexistentes; 0 estão "prontos" para uso regulado. O sistema precisa da camada Records Core antes de qualquer declaração de conformidade.

---

### Anexo D — Glossário

| Termo | Significado |
|---|---|
| **AD** | Airworthiness Directive — Diretriz de Aeronavegabilidade emitida pela autoridade regulatória exigindo ação de manutenção |
| **CANAC** | Código de identificação do técnico de aviação civil, emitido pela ANAC; equivalente ao número de licença para pilotos e mecânicos |
| **DB** | Diário de Bordo — registro obrigatório de cada voo; pode ser em papel ou eletrônico (eDB) quando autorizado |
| **eDB** | Diário de Bordo Eletrônico — versão digital do DB, em tablet/PED, quando autorizado pela ANAC via POI |
| **EFB** | Electronic Flight Bag — dispositivo eletrônico usado por pilotos em substituição a documentos em papel |
| **EO** | Engineering Order — documento de engenharia que autoriza alteração em procedimento, configuração ou equipamento |
| **FRMS** | Fatigue Risk Management System — sistema de gestão do risco de fadiga; ferramenta de suporte ao GRF |
| **GRF** | Gerenciamento do Risco de Fadiga — plano obrigatório sob RBAC 117 para operadores que adotam o modelo prescritivo |
| **ICP-Brasil** | Infraestrutura de Chaves Públicas Brasileira — padrão de certificação digital com validade jurídica; instituída pela MP 2.200-2/2001 |
| **LOA** | Letter of Authorization — carta de autorização emitida pela ANAC para uso de procedimento ou equipamento específico |
| **MGM** | Manual Geral de Manutenção — documento do operador que descreve os procedimentos de manutenção aceitos pela ANAC |
| **MGO** | Manual Geral de Operações — documento do operador que descreve os procedimentos operacionais aceitos pela ANAC |
| **MOM** | Manual de Operações de Manutenção — similar ao MGM em alguns contextos RBAC 145 |
| **MRO** | Maintenance, Repair and Overhaul — controle de manutenção, reparo e revisão de aeronaves |
| **OCC** | Operations Control Center — centro de controle operacional; equipe que monitora e gerencia os voos em tempo real |
| **OMA** | Organização de Manutenção Aeronáutica — empresa aprovada pela ANAC para realizar manutenção de aeronaves (RBAC 145) |
| **OS** | Ordem de Serviço — documento de manutenção que registra o trabalho realizado, executor, inspetor e aprovador |
| **PED** | Personal Electronic Device — dispositivo eletrônico pessoal (tablet, smartphone) usado como ferramenta operacional |
| **PIC** | Pilot in Command — Piloto em Comando; responsável pela aeronave durante o voo |
| **POI** | Principal Operations Inspector — inspetor da ANAC responsável por um operador específico; autoriza alterações de MGO/MGM |
| **RAS** | Aprovação para Retorno ao Serviço (Return to Service) — documento que certifica que a aeronave está apta ao voo após manutenção |
| **RDV** | Relatório Diário de Voo — documento do OCC que registra os dados consolidados de cada voo (horários reais, POB, etc.) |
| **RELPREV** | Relatório de Prevenção — notificação obrigatória à ANAC de ocorrências de segurança operacional |
| **SB** | Service Bulletin — Boletim de Serviço emitido pelo fabricante; pode ser mandatório ou opcional |
| **SDRMe** | Sistema de Registro de Manutenção Eletrônico — registros de manutenção em formato digital com assinatura eletrônica |
| **SGRF** | Sistema de Gestão do Risco de Fadiga — programa formal de gestão de fadiga aprovado pela ANAC como alternativa ao modelo prescritivo do RBAC 117 |
| **SGSO** | Sistema de Gerenciamento de Segurança Operacional — programa formal de gestão de segurança da aviação |
| **SIC** | Second in Command — Co-piloto; segundo piloto na hierarquia do voo |

---

*Briefing preparado por AirTrust Engineering — 2026-06-13*
*Versão: v1.0 — Uso interno e para consultor regulatório*
*Documento classificado como confidencial — não distribuir sem autorização*
