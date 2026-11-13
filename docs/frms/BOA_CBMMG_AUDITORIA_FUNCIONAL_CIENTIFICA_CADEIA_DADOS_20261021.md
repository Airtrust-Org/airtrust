# BOA/CBMMG — revisão integral da PoC, método científico e operação real do FRMS

**Data da revisão:** 21/10/2026 (Brasília). **Repositório/escopo:** Airtrust-Org/airtrust, PR #1650, branch \`feat/frms-boa-mensal-consolidado-20261020\`. **Natureza:** diagnóstico técnico e plano de aceite verificável, NÃO certificação de conformidade, autorização de uso de dados de saúde, homologação de método ou evidência de implantação real.

## 0. Decisão e constatação crítica

A URL \`https://staging.airtrust.pages.dev/qa/boa-frms-demonstracao.html\` é **um HTML estático independente** publicado pelo fluxo governado Pages no run #39605208889. Embora contenha 130 personagens inventados, 839 eventos ilustrativos e filtros de perfis **simulados no navegador**, ele **não** lê ou escreve na API \`/api/bombeiros/frms\`, não autentica usuários e **não** gera dados por check-in real. Os gráficos ali vêm do código JavaScript e **não do D1**. **É incorreto utilizá-lo como prova de funcionamento efetivo da metodologia exigida no TR 8.4.2.**

Já existem implementações reais em draft na PR: \`BombeirosCheckinPage.tsx\` + \`POST /api/bombeiros/frms/checkin\`, \`GET /checkin/status\`, fila gerencial, transições de caso e relatório mensal. Porém não há evidência de tenant BOA QA, vínculos e credenciais provisionadas, perfil científico BOA aprovado no banco, feature gate de escrita autorizado, carga fictícia governada, serviço Worker desse SHA publicado ou ensaio autenticado com D1 staging. A aplicação publicada em Pages é **somente a prévia fictícia**, e o Worker não foi publicado nesse run. **CI aprovada não equivale a PoC operacional.**

**Estratégia:** deixar a prévia estática como material exploratório claramente identificado, desenvolver/validar a cadeia operacional real e demonstrar uma **sessão autenticada contra tenant BOA sintético isolado**, com evidências rastreáveis. O aplicativo operacional não deve conter textos de propaganda do edital: deve mostrar situação, fonte, ação, responsável e auditoria.

## 1. Origem primária e natureza da licitação

**Edital:** Pregão Eletrônico 02/2026, processo 1320139 02/2026, SEI 1400.01.0082253/2025-56, PNCP \`18715516000188/2026/125\`. Em 21/10/2026 a versão PDF **1** foi baixada diretamente do endpoint do PNCP com HTTP 200, 686.406 bytes, **36 páginas**: https://pncp.gov.br/pncp-api/v1/orgaos/18715516000188/compras/2026/125/arquivos/1. Página de contratação: https://pncp.gov.br/app/editais/18715516000188/2026/125 . **A obtenção deste arquivo não comprova ausência de retificações, respostas vinculantes ou mudança de sessão no Portal de Compras MG; conferir formalmente antes da PoC.**

O objeto é **assessoria SGSO integral por 12 meses**, incluindo PRE, RELPREV, FOD, cultura justa, vistorias, treinamentos SGSO/CRM, apoio regulatório e FRMS. Não é aquisição isolada de software. Conforme **TR 1.5.3.1**, a abordagem FRMS **não está vinculada a plataforma proprietária, hardware ou método exclusivo**. É essencial demonstrar o processo técnico-científico, não apenas uma tela.

### Os oito requisitos cumulativos — TR 1.5.3.2, incisos I–VIII (p. 12)

| Inciso | Exigência efetiva | Evidência necessária na execução | Situação da PR #1650 / lacuna |
|---|---|---|---|
| I | Identificar, avaliar, monitorar e mitigar risco de fadiga | Rastreamento de ameaça e evidências → avaliação aprovada → medida → responsável → eficácia e monitoramento | **Parcial:** check-in abre caso, mitigação/encerramento existem; **não há avaliação de risco científica operacional homologada** |
| II | Método estruturado e fundamentação técnico-científica comprovada | Versão do método, fontes e limites, validação em contexto BOA, parecer técnico e rastreabilidade | **Pendente:** triagem de evidências não é modelo validado; KSS é subjetiva e teste 60 s não mede PVT |
| III | Fatores de fadiga/sonolência/degradação cognitiva ou fisiológica | Sono, atividade/repouso, jornada, sobreaviso, acionamentos, trabalho noturno, missão, KSS e teste cognitivo válido quando adotado | **Parcial:** formulário coleta autorrelatos e tipo/período; **não ingere escala/serviço reais BOA, acionamentos reais nem tempos de reação PVT** |
| IV | Registros sistemáticos, rastreáveis, auditáveis e histórico evolutivo | Identidade, tenant, ator, fonte, horário, revisão, idempotência, encadeamento, logs e negativa de adulteração | **Código implementado/testado localmente** em eventos append-only; **sem ensaio staging físico** |
| V | Relatórios técnicos/gerenciais com indicadores de risco, tendências, eventos e recomendações | Denominadores de horas de exposição/escala, tendências ajustadas, casos relevantes, ações/eficácia, emissão formal, revisor | **Parcial:** relatório preliminar conta recibos e estados, **não estima risco cientificamente**, não possui exposição oficial nem assinatura/arquivo formal |
| VI | Acesso administrativo a consolidado preservando informação sensível | Admin: agregados suprimindo células pequenas; gestor: apenas setor; tripulante: próprio recibo; teste real 200/403 | **Guards e testes sintéticos existem**, mas não foram ensaiados em 130 identidades/credenciais reais de staging |
| VII | Atendimento integral à LGPD | Finalidade, base legal, titular/controlador/operador, minimização, acesso e retenção, RIPD quando cabível, incidentes, segurança e exclusão | **Controles técnicos parciais**, aprovação documental e operacional LGPD **pendente** |
| VIII | Experiência comprovada em gestão de fadiga | Atestados, relatórios, estudos de caso ou documentos idôneos da licitante | **Externo ao software. Não suprível por código ou dataset inventado** |

### Prova de Conceito — TR 8.4.1–8.4.9 (p. 20–21)

A **primeira colocada provisória** deve demonstrar praticamente: **(1)** método funcionando; **(2)** identificação dos fatores e degradação do desempenho, quando aplicável; **(3)** produção de registros e relatórios; **(4)** rastreabilidade, integridade, disponibilidade e segurança; **(5)** proteção de dados. Resultado: **apta/inapta** pelo órgão. Eventual falha que impeça verificar os critérios pode resultar em não atendimento (8.4.8). O formato e a data são definidos pela Administração; não presumir que o HTML de staging substitui a convocação formal.

**Prazos contratuais, não automaticamente prazo pré-lances:** TR 1.5.11.3.7.1: implantação do FRMS nos primeiros 90 dias de vigência e relatório mensal com indicadores/análises/recomendações até o 10º dia útil do mês subsequente. O dimensionamento inicial do TR 1.5.3.2.2–2.5 é **até 130 usuários ativos de TODOS os perfis, não 130 tripulantes obrigatórios**. A fixture atual cria 130 tripulantes + quatro gestores + um administrador (135 referências de conta). É útil para estresse técnico, mas **não representa a composição inicial de 130 acessos totais**; criar/coordenar o ensaio de 130 identidades com papéis variados sem presumir uso total.

## 2. Ciência: fontes comprovadas versus decisão local não validada

1. **ICAO/OACI, Doc 9966 (2020, revisão 2), e Fatigue Management Guide for Helicopter Operators (2020)**: o FRMS requer identificar ameaças de maneira **preditiva** (escala planejada/ciclo sono-vigília), **proativa** (autorrelato/desempenho/tempo real) e **reativa** (eventos, incidentes e reportes). Integra avaliação do risco, medidas, eficácia, treinamento e garantia de segurança. **Aplicar princípios, não copiar coeficientes ou limiares do offshore.** Fontes: https://www.icao.int/operational-safety/fatigue-management/resources e https://www.icao.int/operational-safety/fatigue-management .
2. **ANAC RBAC 90, Emenda 04 (16/06/2026)**: trata de operações especiais de aviação pública; deve ser a primeira avaliação regulatória junto à autorização/configuração real do BOA. **RBAC 117, Emenda 01 (2024), IS 117-001C (2026)**: ciência e arcabouço de fadiga em operadores sujeitos a sua aplicabilidade. **Não assumir que todos os limites do 117 se aplicam automaticamente a bombeiros públicos** sem parecer de enquadramento. Fontes: https://www.anac.gov.br/assuntos/legislacao/legislacao-1/rbha-e-rbac/rbac e https://www.anac.gov.br/assuntos/legislacao/legislacao-1/boletim-de-pessoal/2026/bps-v-21-no-28-13-a-17-07-2026/is-117-001c/visualizar_ato_normativo .
3. **Karolinska Sleepiness Scale (KSS), Åkerstedt/Gillberg (1990)**: escala subjetiva de sonolência, útil para autopercepção quando interpretada dentro de contexto/protocolo; **não é EEG, dosagem fisiológica ou declaração isolada de aptidão**. Fonte: https://doi.org/10.3109/00207459008994241 .
4. **Basner, Mollicone & Dinges, 2011, PVT-B**: versão breve **validada de três minutos**, comparada com PVT de dez minutos, com medidas de reação/lapses. **O campo atual \`pvt_60s_completed\` apenas pergunta se um teste experimental de 60 s foi realizado; não executa teste, não captura tempos/lapses e não possui equivalência automaticamente demonstrada. Não afirmar que mede vigilância cognitiva.** Fonte: https://pubmed.ncbi.nlm.nih.gov/22025811/ . Um PVT adaptativo mais curto estudado em 2022 é um **algoritmo distinto validado**, não licença científica para qualquer teste fixo de 60 s: https://pmc.ncbi.nlm.nih.gov/articles/PMC10104405/ .
5. **Pesquisa brasileira com tripulações (Rodrigues et al., 2022)**: dados de escalas e trabalho noturno reforçam a importância da exposição circadiana e do contexto do trabalho, mas a amostra de aviação regular não é validação automática de algoritmo ou limiar para resgates aéreos BOA. Fonte: https://arxiv.org/abs/2201.05438 .

**Decisão de engenharia segura:** até revisão técnico-científica formal BOA, o sistema pode **identificar fatores declarados e lacunas de evidência**, gerar trilha, abrir/acompanhar casos e apoiar revisão humana. **Não** calcular ou exibir “índice de fadiga validado”, probabilidade, efetividade cognitiva, sinal verde, aprovação de despacho ou conformidade do indivíduo por coeficiente inventado. Um modelo biomatemático eventual deve ser parametrizado/versionado para BOA, demonstrar calibração, sensibilidade, validade externa, rastreabilidade e limites, em aceite separado.

## 3. Como o dado entra DE VERDADE — contratos e sistemas existentes

### Cadeia operacional prevista para o tenant isolado \`bombeiros\`

\`\`\`text
FUNCIONÁRIO/CONTA BOA CANÔNICA (sem cópia de empresa 6)
   │ JWT válido + empresa/role + vínculo próprio + versão BOA autorizada
   ├─ PREVISÃO/ESCALA BOA (origem ainda NÃO implementada)
   │    base, missão, turno planejado, sobreaviso, início/fim,
   │    oportunidade de descanso, fonte, timestamp e alteração
   ├─ REALIZADO (origem BOA ainda NÃO implementada)
   │    acionamentos, apresentação, pousos, missão, serviço e descanso real
   ├─ CHECK-IN AUTENTICADO DO TRIPULANTE — JÁ HÁ CÓDIGO
   │    /bombeiros/frms/checkin → POST /api/bombeiros/frms/checkin
   │    missão/período + sobreaviso/criticidade (declarados)
   │    sono efetivo em 24h (AUTORRELATO), fragmentação, KSS (SUBJETIVA)
   │    PVT 60s: CONCLUSÃO DECLARADA APENAS, SEM RESULTADO COGNITIVO
   │    declaração de impedimento, consentimento/ciência
   │
   ▼ identidade resolvida no servidor; fonte e lacunas imutáveis
frms_fadiga_evento: BOA_CHECKIN_V1 (recibo) + BOA_CASE_OPENED_V1
   │ mesmo empresa_id, funcionário, usuário e revisão
   │ sem inferência de ausência como zero, sem despacho automático
   ▼
GESTOR VINCULADO AO SETOR: GET /casos e GET /casos/:id
   │ PUT /casos/:id/tratamento → BOA_CASE_TREATMENT_V1
   │ PUT /casos/:id/resolver → BOA_CASE_CLOSED_V1
   ▼
ADMINISTRADOR: GET /relatorios/gerencial-tecnico-previa?mes=YYYY-MM
   │ SOMENTE agregados protegidos; estados, ações e recomendações
   ▼
RELATÓRIO OFICIAL MENSAL ASSINADO/ARQUIVADO — AINDA NÃO ENTREGUE
\`\`\`

**Como o dado foi produzido na prévia Pages existente:** \`docs/frms/BOA_DEMO_INTERATIVA_OFFLINE_20261021.html\` calcula **arrays locais, sem POST e sem persistência**. Os 839 eventos do gerador \`scripts/fixtures/boa/boa-demo-dataset.mjs\` foram verificados em SQLite local e **não foram carregados em staging**. O gerador não cria usuários, nem permite qualquer escrita remota. Esses artefatos não são as fontes dos endpoints reais.

### Contrato de entrada e provenance — estado atual da engenharia

| Dado | Proveniência que deve ser gravada | Uso permitido antes de validação científica |
|---|---|---|
| Identidade e função | Cadastro \`funcionarios\` + \`usuarios\` + \`usuarios_empresas\` no mesmo tenant; NÃO IDs fornecidos pelo navegador | Controle de acesso, agregação e atribuição de caso |
| Sono efetivo 24h | \`CREW_REPORTED_NOT_MEASURED\`; horário do relato, campos não preenchidos como \`null\` | Contexto de revisão; não diagnóstico e não descanso regulatório |
| KSS 1–9 | \`SUBJECTIVE_KSS_1_TO_9\` com valor e hora; ausência \`NOT_REPORTED\` | Sonolência subjetiva a ser avaliada humanamente, sem peso inventado |
| PVT 60s | \`CREW_DECLARATION_ONLY_NOT_A_PERFORMANCE_TEST\`, métricas de reação e lapsos **nulas** | Não pode sustentar conclusão de desempenho/alerta cognitivo |
| Escala planejada | \`NOT_LINKED_TO_AUTHORIZED_BOA_SOURCE\` até importação/API própria com fonte e vínculo | Sem predição validável, sem denominador de cobertura |
| Jornada/missão/acionamento reais | \`NOT_LINKED_TO_AUTHORIZED_BOA_SOURCE\` até sistema de origem BOA validado | Sem análise exposição real, sobreaviso deve ser diferenciado do repouso |
| Revisão de política | \`FIREFIGHTER_AVIATION\` + revision ID aprovado externamente | Provar o contrato vigente; não criar revisão “aprovada” artificialmente |
| Ação/eficácia | Gestor realmente vinculado ao setor, hora, justificativa, prazo, evidência, eficácia declarada | Processo de mitigação rastreável; eficácia não cientificamente demonstrada |
| Fadiga estimada | \`null\` enquanto inexistir algoritmo BOA validado | Proibido apresentar escore oficial ou aptidão |

Na PR foram acrescentadas marcas de **proveniência e ausência de medição** aos recibos BOA e corrigida a rotulagem científica do campo experimental de 60 segundos. Isso **não** cria uma medição que não ocorreu.

## 4. O que realmente falta desenvolver — ordem causal e critérios de aceite

| Ordem | Entrega necessária | Aceite mensurável e evidência |
|---|---|---|
| F0 | **Método BOA + LGPD + enquadramento** assinado por responsáveis | Norma/range aplicável à UAP, objetivos e fontes; política de coleta/retenção/privacidade, responsabilidades, limiares/decisões aprovados **ou explicitamente indisponíveis** |
| F1 | **Tenant e 130 identidades de QA governados** sem dados reais; papéis BOA distintos | Um tenant \`bombeiros\` de teste com ID diferente de 6; usuários fictícios com expiração; segregação e restauração; nunca exceder mutação autorizada |
| F2 | **Aquisição de escalas/acionamentos BOA** (manual controlada no início, conector apenas quando fonte aprovada) | Cadastro de escala planejada e serviço real com IDs do BOA, origem e timestamps, cruzados por funcionário, missão, aeronave e base; testes diferença planejado/real; nenhuma consulta cross-tenant |
| F3 | **Check-in real** no browser autenticado + gravação transacional | Tripulante fictício envia; servidor resolve identidade, grava recibo + caso atomizados, recusa duplicado/revogado; GET próprio retorna mesmo recibo; sem score ou permissão de despacho |
| F4 | **Triagem/evidência/cognição** | Sono e KSS com fonte e ausência; avaliação humana; PVT validado apenas se adotado com protocolo, calibração, estímulos, tempos e lapsos efetivamente coletados; decisão humana documentada |
| F5 | **Gestão e eficácia** | Gestor de setor recebe caso; ação datada com prazo/responsável e evidência; encerramento após mitigação, reavaliação histórica; revogação em meio à leitura falha fechado |
| F6 | **Relatórios mensais oficiais** | Recibos + casos + horas de exposição reais + taxas pertinentes + eventos + tendências + recomendações; corte temporal, assinatura e arquivamento; proteção de células pequenas |
| F7 | **PoC operacional autenticada com 5 eixos TR 8.4.2** | Sessão completa real staging de ponta a ponta com evidência de API, hash/proveniência, segregação, erro técnico, contingência; avaliada por humano |
| F8 | **Documentação de experiência da licitante e SGSO integral** | Atestados/experiência idôneos e demais serviços SGSO (fora do software), conferidos por responsável da licitação |

**Não antecipar F7 por um print, 130 linhas HTML, CI verde ou JSON sintético local.** Em especial, **F1 não autoriza fabricar validação científica F0**: aprovação científica e base legal devem ser decididas por profissionais legitimados. Dados sintéticos podem permitir QA antes do aceite pleno **somente** com segregação e autorização técnica/jurídica específica para o procedimento de teste, não para uso operacional.

## 5. Protocolo de PoC: roteiro de ações executadas pelo avaliador

1. Abrir **aplicação real autenticada**, selecionando tenant fictício \`bombeiros\`; provar URL, versão Worker/Pages, esquema D1 e política aplicável do mesmo SHA.
2. Entrar como tripulante QA, abrir \`/bombeiros/frms/checkin\`, ver situação inicial \`received=false\`, declarar fatores da missão real sintética, preencher sono e KSS (ou deixar em branco), enviar; comprovar resposta **201** com ID de recibo e caso, **sem liberação de voo**; repetir → **409**, consultar GET → recibo vinculado.
3. Explicar fonte de cada campo: relato da pessoa ≠ escala/atividade observada; dado ausente ≠ zero/normal; a checkbox “PVT 60s” ≠ medição de vigilância.
4. Entrar como gestor QA do setor autorizado, localizar **aquele ID de caso**, registrar ação com prazo/responsável/justificativa, reconsultar \`EM_TRATAMENTO\`, encerrar com avaliação textual; outro setor/conta revogada não vê o caso (403).
5. Entrar como administrador, abrir relatório do período, conferir contagem do novo check-in/caso e do histórico, privacidade de agregados e cadeia de eventos; demonstrar se o relatório ainda é **prévia não oficial**, não simular assinatura.
6. Exibir log/auditoria, integridade da trilha, recuperação/snapshot aprovado, checks físicos Worker/Pages e contrato LGPD. Negar 403 à empresa 6, a acesso sem papel e a conjunto com menos de cinco indivíduos. Repetir a sequência para validar cenários de noite/acionamento/ausência de dados sem limiar científico inventado.

A PoC somente se torna defensável quando essas ações acontecerem **no sistema real**. O avaliador não deve ser apresentado a uma navegação explicando “como o edital pede”; deve operar o FRMS e verificar suas consequências.

## 6. Governança de deploy e limites desta revisão

- **Autoridade de código:** PR #1650 + seus oito gates no HEAD exato; issue #776 como índice vivo. Uma frente = um branch/PR.
- **Ambiente atual:** o último deploy #39605208889 publicou **somente frontend Pages** e só a demo HTML. **Não** provisionou contas, tenant, JWTs ou Worker/API BOA; não houve migrations/seed/write D1/R2.
- **Qualquer D1/R2 write/tenant/política:** via fluxo oficial de staging, escopo e janela definidos, identificação do artefato/SHA, Schema V2 com plan/baseline/recuperação/postchecks quando aplicável, exclusão da empresa 6 e auditoria. Não improvisar SQL remoto nem marcar política científica como aprovada só para passar readiness.
- **Produção:** completamente fora do escopo desta revisão; autorização específica de SHA/artefatos e gates de release próprios, não herdados da autorização de staging.
- **Sem inventar conformidade:** 8/8 CI verde = código testado; não prova método, operação autenticada, atestado da licitante, PoC aprovada nem relatório oficial.
