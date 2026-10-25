# BOA/CBMMG — matriz de aceite FRMS e prova de conceito
**Base oficial conferida em 20/10/2026:** edital integral publicado no PNCP, Pregão Eletrônico 02/2026, processo 1320139 02/2026 / SEI 1400.01.0082253/2025-56, incluindo Anexo I — Termo de Referência, **36 páginas**. Fonte: https://pncp.gov.br/app/editais/18715516000188/2026/125 ; PDF de origem: https://pncp.gov.br/pncp-api/v1/orgaos/18715516000188/compras/2026/125/arquivos/1 . Os oito requisitos foram confirmados no item **1.5.3.2, I–VIII (p. 12)** e os cinco aspectos mínimos de PoC no item **8.4.2 (p. 19–20)**. **Retificações, respostas e estado atual da sessão no Portal de Compras MG ainda exigem confirmação**; ler essa versão não prova ausência de versões posteriores. Este documento não afirma habilitação, aptidão nem resultado de prova de conceito.

## Premissas invariantes
- Perfil **FIREFIGHTER_AVIATION**, novo tenant BOA/CBMMG separado da Costa do Sol; não herdar HELICOPTER_OFFSHORE.
- Escopo é operação **aérea** de bombeiros (tripulação, bases, aeronaves, missões e acionamentos).
- Até 130 usuários ativos iniciais: capacidade deve ser demonstrada por ensaio, não inferida da configuração `max_funcionarios`.
- O edital 7.15 (p. 7–8) prevê PoC **após classificação provisória em primeiro lugar**, com data/local definidos e publicados no Portal de Compras MG, podendo ser presencial ou remota (TR 8.4.4–8.4.8). Não presume prazo específico para convocação ou entrega.
- Cada requisito é cumulativo. Dados sintéticos servem para testar funcionalidade, não substituem experiência profissional prévia nem validam coeficientes científicos.
- Nunca usar resultado de KSS, PVT-B (60s adaptado) ou score interno isoladamente para declarar aptidão ou diagnosticar uma pessoa.

## Matriz exigência → teste observável → evidência → bloqueio
| # | Item 1.5.3 | Teste prático a apresentar | Evidência objetiva | Bloqueio até aceite |
|---|---|---|---|---|
| 1 | Identificar, avaliar, monitorar e mitigar | Registrar dados → identificar risco → abrir caso → determinar responsável/medida → reavaliar eficácia | ID de caso, fonte, versão e trilha com datas | Procedimento operacional BOA assinado e fluxo integral demonstrado |
| 2 | Método técnica/cientificamente fundamentado | Explicar escala KSS, sono, jornadas e adaptação PVT-B; abrir referência e limites de cada cálculo | Parecer técnico, bibliografia e política/revisão imutável | Pesos internos/limiares ainda não validados localmente (#1476) |
| 3 | Fatores de fadiga/sonolência/cognição/fisiologia | Cenários com privação de sono, jornada noturna, sobreaviso acionado, missão crítica e sinais cognitivos | Matriz fator→fonte→resultado→decisão | Campos de missão e evidências específicas BOA ainda não homologados |
| 4 | Registros auditáveis/histórico | Localizar evento original, alteração, decisão e revisão; reproduzir o relatório por período | IDs, autor, timestamp, source SHA, trilha e teste de integridade | Demonstração integral em staging isolado |
| 5 | Relatórios mensais e recomendações | Consultar mês, comparar outro mês, emitir relatório técnico e evidenciar providência/eficácia | Relatório emitido, versão, janela, fonte, assinante, histórico | Endpoint agregado inicial não equivale a relatório assinado/persistido |
| 6 | Administração vê consolidado sem dados sensíveis | Perfil BOA consulta visão mensal; perfil sem direito, outro tenant e grupo pequeno não recebem dados | Testes 200/403/cross-tenant; payload sem PII; supressão de células pequenas | Teste RBAC físico e definição de papéis BOA |
| 7 | LGPD | Mostrar inventário de dados, finalidade, base legal, operadores, retenção, segurança e atendimento a direitos | RIPD/avaliação necessária, matriz de acesso, logs sem conteúdo sensível, contratos aplicáveis | Revisão jurídica/LGPD e testes sobre dados sintéticos |
| 8 | Experiência comprovada | Conferir atestados, histórico de implantação/assessoramento, relatórios ou estudo de caso idôneo | Documentos emitidos por terceiro, escopo, duração, responsável e autenticidade | Obrigação externa da licitante; software e certificado de curso não suprem |

## Cinco cenas internas de demonstração correspondentes aos cinco critérios mínimos do item 8.4.2

As cinco **cenas abaixo são roteiro técnico interno do AirTrust**, não cenários prescritos literalmente pelo edital. O texto oficial exige demonstrar: I metodologia efetiva, II fatores de fadiga/sonolência/cognição quando aplicáveis, III registros e relatórios, IV rastreabilidade/integridade/disponibilidade/segurança e V proteção de dados. Uma POC somente será considerada apta após avaliação formal do BOA (8.4.3).
1. **Método:** tripulante sintético conclui check-in e recebe interpretação; insuficiência gera revisão, não liberação automática.
2. **Fatores:** dois cenários equivalentes com diferenças documentadas em sono/turno/acionamento e PVT-B, com fonte e explicação de risco **sem coeficiente médico inventado**.
3. **Registros/relatórios:** caso e mitigação com ciclo fechado, comparação de meses e evidência do relatório mensal exportado.
4. **Integridade/disponibilidade:** consulta auditada, trilha do responsável, política/revisão, teste negativo de alteração indevida, backup/recovery governado, saúde real de Worker/Pages/D1.
5. **LGPD:** administração só recebe dados agregados, equipe clínica/responsável técnico acessa informações identificáveis conforme RBAC, outro tenant recebe 403, células 1–4 suprimidas.

## Verificação do edital e escopo global da contratação (20/10/2026)

**Aviso crítico:** o objeto deste pregão é uma **assessoria continuada SGSO/Safety** de 12 meses, com PRE, RELPREV, FOD, Cultura Justa, vistorias, treinamentos CRM, documentos e conformidade ANAC/ICAO/CENIPA; o FRMS constitui **uma das parcelas do objeto**, não o objeto inteiro (Edital 2.1; Anexo I 1.1 e 1.5.2–1.5.9). O software AirTrust não substitui o corpo técnico, serviços presenciais ou documentação de habilitação da empresa licitante.

- **Data original:** sessão pública 21/10/2026 às 09h Brasília, Portal de Compras MG (capa, p. 1). Valor global estimado **R$ 489.160,80** (capa); menor preço global. Consultar retificações e hora efetiva na origem antes de agir.
- **A tecnologia não é compulsória:** TR 1.5.3.1 diz expressamente que o FRMS não depende de software proprietário, equipamento específico ou metodologia exclusiva. KSS e PVT adaptado são **opções técnicas a justificar cientificamente**, não imposições nominais do edital.
- **130 usuários é parâmetro estimativo:** TR 1.5.3.2.2–1.5.3.2.5 prevê *até* 130 usuários ativos para dimensionamento/preço, sem garantia de uso integral. Ensaio local com 130 sintéticos é prudência de engenharia, não teste obrigatório de 130 conexões simultâneas descrito no documento.
- **PoC formal:** edital 7.15 e TR 8.4: convocação do primeiro colocado provisório, cinco critérios mínimos, resultado **apta/inapta**, modalidade presencial ou remota determinada pela Administração. A UI sintética do AirTrust não é a prova de conceito exigida.
- **FRMS contratado:** implantação até 90 dias após início do contrato; monitoramento contínuo e **relatórios mensais até o 10º dia útil do mês subsequente** (TR 1.5.11.3.7.1, p. 14–15). Não são necessariamente exigências de entrega até o dia da sessão de lances.
- **Entregas transversais adicionais:** planejamento anual na primeira quinzena, diagnóstico SGSO até 90 dias, GASO/CSO, seis vistorias anuais, treinamento SGSO/CRM e aprovação formal pelo fiscal/gestor para cada produto técnico (TR 1.5.5, 1.5.10 e 1.5.11).
- **Habilitação real:** atestados técnicos com emitente, assinatura/contato, período e quantidade, conforme TR 9.1.4; o órgão pode verificar legitimidade. Atestado não se gera por código.

**Estado verdadeiro:** fontes oficiais documentais agora conferidas para essa versão; aprovação científica, política de proteção de dados, tenant, prévia assinada, QA real e experiência da licitante permanecem sem comprovação. Nunca confundir análise do edital com habilitação da licitante ou autorização de staging/produção.

## Primeira entrega de engenharia do contrato — 20/10/2026
- Endpoint exclusivo: `GET /api/bombeiros/frms/relatorios/mensal-consolidado?mes=YYYY-MM`, com autenticação já existente do router, `requireRole('admin')`, tenant validado e equipe autorizada.
- **Retificação de engenharia, 20/10:** a dependência de `relatorioCompliance()`/`listFrmsOperationalSnapshot()` foi removida do endpoint BOA: o snapshot genérico ainda contém decisões/limites da operação offshore e NÃO pode comprovar o edital dos Bombeiros. A consulta agora lê somente recibos enviados em `frms_fadiga_checkin`, com join no cadastro `funcionarios` e dois filtros `empresa_id` parametrizados; compara somente quantidade de recibos por pessoa/dia com mês anterior.
- Resposta **sem nome, ID de pessoa, KSS, sono, PVT ou informação médica individual**. Escopos menores que cinco são negados; se apenas 1–4 pessoas enviaram check-in, os números **por pessoa/dia** também são suprimidos mesmo quando ultrapassam quatro. Zero só significa nenhum recibo efetivamente identificado. Não há denominador de escalas e NÃO há declaração de conclusão ou conformidade.
- Nenhum SQL de write, migration, seed, alteração de coeficiente ou despacho. Consulta é uma **prévia técnica**, NÃO relatório gerencial homologado, assinado ou arquivado. Ainda não inclui indicador de eficácia de mitigação nem denominador validado de cobertura.
- Testes focados para bloqueio do tenant 6, dupla cláusula de tenant no join, supressão de grupo e participação pequena, ausência, dados agregados incoerentes e não vazamento de identificadores.

## Critérios de fechamento do produto — TODO (não presumir)
1. **Edital e Termo de Referência publicados no PNCP conferidos em 20/10/2026 (36 páginas).** Antes da licitação e PoC, conferir **retificações posteriores, respostas oficiais vinculantes e estado da sessão** no Portal de Compras MG; não presumir que a versão analisada é a última.
2. Aprovar perfil específico BOA, operador/regime aeronáutico aplicável, fonte de limites e versão de política; não copiar offshore.
3. Preparar tenant QA separado, 130 **pessoas totalmente fictícias** com dados de missão, sono, check-ins e decisões, inseridas por procedimento governado de staging com backup/rollback; nenhum dado Costa do Sol.
4. Implementar relatório técnico mensal formal: exposição, cobertura real, distribuição por missão/base somente acima do limiar de privacidade, tendência ajustada pela exposição, eventos relevantes, mitigação e eficácia, revisor/assinatura, versão e armazenamento imutável autorizado.
5. Definir perfis segregados do BOA (comando/admin consolidado, coordenação operacional, responsável FRMS/saúde, tripulante, auditor autorizado) e testar mínimo privilégio, supressão e cross-tenant.
6. Implementar evidência de retenção, tratamento LGPD, classificação de dados, export audit, integridade e disponibilidade; aprovar política com controlador/operador.
7. Executar ensaio mensurável de 130 usuários (latência percentis, concorrência, erros, auditoria de consulta sem vazamento); registrar infraestrutura e resultados reais.
8. Executar roteiro de POC **com software verdadeiro em staging**: logs e telas reais, casos e relatório reproduzíveis, 5 eixos todos comprovados, canais de contingência da apresentação remota.
9. Obter evidência de experiência prática idônea da licitante; não fabricar atestados nem declarar experiência do AirTrust como experiência da empresa sem documentação.
10. Testes focados → suíte afetada → oito gates → staging via workflow → aceite humano. Produção somente com autorização específica do SHA/artefatos/escopo.

## Referências técnicas para revisão do parecer
- ICAO, Fatigue Management Guide for Helicopter Operators (2020): consultar versão integral e a aplicabilidade à operação.
- ANAC RBAC 117 e instruções suplementares vigentes: enquadrar a operação aérea concreta; não assumir limites offshore.
- KSS, escala de sonolência subjetiva (não fisiologia objetiva).
- Literatura de PVT: protocolo local AirTrust de 60 segundos é **adaptação**, não equivalência psicométrica automática com PVT 3/10 minutos.
- `docs/frms/FRMS_V3_DECISAO_METODOLOGICA_ICAO_IOGP_BMM_2026-10-14.md`, `docs/frms/FRMS_CHECKIN_SCIENCE_UX_CONTRACT_2026-10-14.md` e issue #1476 documentam as limitações de método.

**Portão final:** declarar "APTA" apenas depois de evidências efetivamente observadas e parecer técnico/administrativo, sem tratar esta matriz como certificação.


## Decisão obrigatória do proprietário — isolamento da empresa 6 (20/10/2026)

**Reaproveitar infraestrutura, NÃO reaproveitar os dados nem a operação.** O BOA será uma empresa autônoma no SaaS AirTrust. Seu único cadastro de funcionários é `funcionarios` e os vínculos de identidade/permissão canônicos da plataforma, mas todas as consultas, inserções, históricos, índices, relatórios, check-ins, sessões e arquivos operacionais deverão estar vinculados ao **empresa_id exclusivo dos Bombeiros**. Nunca criar cadastro paralelo de colaboradores. Nunca migrar/copiar pessoas, check-ins, jornadas, documentos, casos ou relatórios da Costa do Sol (`empresa_id=6` na produção).

### Fronteiras verificáveis
1. **Identidade da empresa:** novo `empresa_id` gerado por cadastro governado, **diferente de 6**, código único `bombeiros` e vínculo do usuário efetivo no tenant. A atribuição `FIREFIGHTER_AVIATION` deve ser única, vigente, documentada, e apontar ao mesmo `empresa_id`. Na ausência de qualquer componente, nenhuma avaliação BOA.
2. **Segurança de acesso:** autenticação e `tenantMiddleware` comuns, `requireRole('admin')` e checagem explícita de `tenantContext.role`, `empresaCodigo === bombeiros` e `empresaId !== 6`. Plataforma admin só opera quando seleciona conscientemente o tenant BOA; não recebe dados do BOA a partir da empresa plataforma. Não confiar em `empresa_id` de query/body/header fornecido pelo navegador.
3. **API própria:** `GET /api/bombeiros/frms/relatorios/mensal-consolidado?mes=YYYY-MM`. Este endpoint **não existe** sob `/api/frms/relatorios/mensal-consolidado`. O escopo da consulta vem exclusivamente da identidade autenticada, e a leitura de funcionários é filtrada por empresa e escopo funcional antes de agregar.
4. **UI própria:** `/bombeiros/frms`, com barreira pelo tenant selecionado. Nenhuma inserção de componente/atalho BOA em `/frms/relatorios` da Costa do Sol. A ação *Cadastro de funcionários da empresa* abre o módulo canônico `/funcionarios` **no tenant atual**, sem copiar dados.
5. **Configuração própria:** perfil, política, limites, classificação, fontes, missões, relatórios e gates de despacho BOA não assumem baseline offshore. Uso de funções comuns de cálculo/FRMS é permitido somente se os inputs, revisão e fontes são especificamente do tenant BOA e a regra foi homologada para sua operação.
6. **Persistência e backups:** qualquer tabela operacional com identidade individual precisa de delimitação tenant verificável por coluna `empresa_id` ou junção provada com `funcionarios.empresa_id`, incluindo anexos R2, índices e exports. Dados de QA serão 100% fictícios, provisionados via procedimento governado de staging e nunca por clonagem da empresa 6.
7. **Testes negativos:** empresa 6 não faz sequer consulta D1 pela API BOA; outro tenant é negado; role insuficiente é negada; ausência de revisão aprovada retorna 503 antes de ler funcionários; tentativa de passar `empresa_id=6` por query é ignorada. UI BOA não carrega o consumidor de API sob empresa 6; testar alternância de tenant/cache, sessão e R2 antes do aceite integral.
8. **Paridade / não regressão:** não alterar telas, formulários, limitações, scores, rotas públicas, schemas ou relatórios da Costa do Sol para cumprir o edital; mudanças no motor compartilhado exigem testes das duas empresas, revisão de regressão e aprovação separada.

### Estado desta PR
Apenas o namespace BOA, barreiras de autorização, prévia mensal consolidada, portal exclusivo e testes negativos foram codificados. **Não** comprova ainda todas as rotas operacionais de check-in, missão, mitigação, R2, offline e relatórios; elas exigem aceitação cross-tenant própria. **Nenhum tenant BOA foi provisionado** e nenhuma escrita D1/R2 executada.


## Continuidade da implementação — leitura de funcionários e bloqueio de rotas offshore (20/10/2026)

**Novo contrato de leitura, sem D1/R2 writes:**
- `GET /api/bombeiros/frms/equipe?cursor=0&limit=50` retorna uma projeção mínima de `funcionarios`: identificador interno, nome/nome de guerra, cargo, função e classificação descritiva FRMS.
- A identidade da empresa **não** vem do navegador: `tenantContext` validado pelo auth/tenant global, role admin, código `bombeiros`, `empresa_id` não igual a 6, perfil `FIREFIGHTER_AVIATION` vigente e independente, e escopo de equipe do servidor.
- A consulta SQL impõe `f.empresa_id = ?`, `deleted_at IS NULL`, funcionário ativo, setor autorizado e cursor parametrizado. O resultado confirma novamente `empresa_id` de cada linha (fail-closed em qualquer incoerência).
- `other`/função não classificada **não** vira piloto ou tripulante habilitado; `flight` é apenas classificação funcional e nunca decisão de aptidão, despacho ou validade de treinamento.
- Paginação por cursor e teto de 130 registros por solicitação (não confundir com teste de capacidade de 130 usuários concorrentes).
- A UI do BOA contém painel próprio da equipe e link para `/funcionarios` — cadastro corporativo normal no tenant autenticado. Não há tabela de colaboradores duplicada.
- **Barreira adicional:** quando o tenant ativo é `bombeiros`, rotas frontend `/frms` e `/frms/*` redirecionam ao portal `/bombeiros/frms`; as APIs genéricas `/api/frms` e `/api/frms/*` respondem `403 BOMBEIROS_LEGACY_FRMS_DISABLED`. A API exclusiva `/api/bombeiros/frms/*` permanece separada. Para `costadosol` e outros tenants nenhuma lógica de redirecionamento/bloqueio adicional é acionada.
- Esses guards são adicionais ao RBAC/tenant backend, não substitutos.

**Evidência técnica:** testes negativos de empresa 6, outro tenant, identidade com código errado, gestor sem autorização, perfil não aprovado, query `empresa_id` maliciosa, linha de origem cross-tenant em fixture, campos desnecessários não retornados, cursor, e rotas offshore. Worker typecheck/testes e gates GitHub Actions são pré-condições para merge.

**Limites de entrega:** esta PR ainda **não implementa** workflow operacional completo de missões, check-in BOA, PVT BOA, ações mitigadoras persistidas, relatório mensal oficial assinado, políticas finais de LGPD, carga de 130 usuários, tenant real provisionado ou POC homologada. Os acessos genéricos são negados até existirem os endpoints BOA necessários; nunca liberar o genérico para mascarar ausência de implementação.


## Checkpoint — método BOA independente e limites de aceitação (20/10/2026)

1. O endpoint BOA mensal entrega **apenas recibos de check-in submetidos**, com total de pessoas participantes, pares únicos pessoa/dia e delta do mês anterior. **Não utiliza** fórmula, inferência de aptidão, conformidade regulatória, cálculo de fadiga acumulada, IOGP/offshore ou snapshot Costa do Sol. A tabela canônica continua compartilhada fisicamente, mas SQL restringe os dois lados da associação ao tenant BOA e à equipe autorizada.
2. O resumo atual **não é o relatório mensal exigido pela licitação** nem demonstra disponibilidade, cobertura de escala, dados cognitivos/PVT, risco, mitigação, avaliação de eficácia, assinatura ou emissão auditada. Trata-se somente de evidência mínima para a futura metodologia BOA.
3. O check-in operacional dos Bombeiros **ainda não tem fluxo BOA de escrita liberado**: o bloqueio da API genérica preserva fail-closed até implementação, aprovação de perfil/regras e testes de autorização por tripulante. Não afirmar que uma pessoa do BOA consegue responder check-in neste momento.
4. Nenhum perfil `FIREFIGHTER_AVIATION` ativo foi confirmado em D1, nenhum usuário/tenant BOA foi provisionado e nenhum arquivo D1/R2 foi escrito. A PR é de desenvolvimento, não homologação de ambiente.
5. Testes locais no SHA `3654fb5c64473ed94476c5a78e40298bb22b48d1` confirmaram **21 testes frontend + 43 Worker**, worker-typecheck, route-ownership e typescript-delta aprovados. Esses resultados precisam ser revalidados se o código avançar; os oito gates da CI devem ser conferidos no último HEAD para integração.


## Etapa de demonstração metodológica interativa — contrato técnico 20/10/2026

Foi implementado **somente no código da PR em draft**, ainda sem publicação em staging ou tenant BOA, um fluxo de comparação entre dois cenários **totalmente sintéticos**, independente das fórmulas offshore.

- **UI** `src/react-app/pages/bombeiros/BombeirosMethodologyDemo.tsx`, exposta exclusivamente dentro do portal `/bombeiros/frms`: A = resgate diurno com observações disponíveis; B = resgate noturno, acionamento, sono fragmentado, PVT-B não realizado e declaração fictícia de impedimento.
- **API** `POST /api/bombeiros/frms/simulacao/metodologia`, negada em produção (somente `ENVIRONMENT=staging|development`), requer administrador autenticado do tenant `bombeiros` (`empresa_id != 6`), perfil `FIREFIGHTER_AVIATION` vigente e dados `mode=SYNTHETIC` de esquema estrito sem nome/CPF/IDs ou textos livres. Nunca persiste resposta, nunca cria caso, nunca libera missão.
- **Motor puro** `worker-airtrust/src/lib/frms/bombeiros-scenario-method.ts`: lista nove classes de fator com presença/ausência e proveniência `SYNTHETIC_SCENARIO` (missão, período do serviço, sobreaviso, criticidade, sono 24h, fragmentação, KSS subjetiva, PVT de 60 segundos *adaptado*, declaração de impedimento). Lacunas permanecem lacunas; declaração de impedimento exige escalonamento; período noturno, interrupção e carga contextual geram orientação de revisão de missão, descanso e mitigação. **Nenhum coeficiente, classificação de aptidão, threshold clínico ou regra offshore foi importado.**
- **Resultado** `INCOMPLETE_EVIDENCE` ou `HUMAN_REVIEW_REQUIRED`, sempre `dispatch_permission=NOT_GRANTED` e `persisted=false`, com ações, limitações científicas, referência à KSS/PVT e versão `BOA_SYNTHETIC_EVIDENCE_TRIAGE_V1`. Esse método é um **exercício de triagem de evidências**, não um modelo científico de risco validado e não substitui parecer técnico.

| Item da licitação | Demonstração oferecida pelo fluxo sintético | Evidência ainda obrigatória para aceite |
| --- | --- | --- |
| 1. Identificação, avaliação, monitoramento e mitigação | Identifica fatores disponíveis/ausentes e determina revisão humana, sem liberar missão | Fluxo real com casos persistidos, responsável, intervenção, acompanhamento e eficácia |
| 2. Fundamentação científica | Explica o caráter subjetivo da KSS e as limitações da adaptação PVT de 60 segundos, sem score inventado | Parecer assinado, bibliografia examinada, política específica aprovada e validação local |
| 3. Fadiga/sono/cognição/fisiologia | Dois cenários mostram sono/fragmentação, período de serviço, missão, sonolência e presença/ausência do PVT | Avaliação e fontes reais, protocolo cognitivo e indicadores fisiológicos definidos por especialistas |
| 4. Auditabilidade | Versão do método e fatores determinísticos exibidos; execução explicitamente sem persistência | Log imutável tenant-scoped com autor, eventos, policy hash, timestamps, retificação e reprodução |
| 5. Relatório mensal | Mantido módulo de recibos mensal segregado, sem diagnóstico | Relatório gerencial + técnico formal, tendências, medidas, eficácia, emissão e assinatura |
| 6. Administração agregada | API de recibos já possui supressão de coorte/participação pequena | Definição de papéis, aceite com 130 sintéticos, QA autenticada cross-tenant |
| 7. LGPD | Cenários fixos, sem nomes/IDs, POST bloqueado em produção, resposta sem saúde individual e sem storage | Mapeamento de tratamento, retenção, acessos, RIPD se cabível, testes e validação jurídica |
| 8. Experiência prática | Não é demonstrável somente pelo software | Atestados e outros documentos autênticos da licitante sobre implantações ou acompanhamento FRMS real |

**Regras de apresentação:** nunca exibir esta simulação como POC homologada; não dizer que fatores foram medidos no mundo real nem inferir comportamento de 130 usuários dos cenários fixos. A prova de conceito editalícia exigirá fluxo real completo com registros audíveis (e não apenas uma simulação), plus validação de segurança, availability e conformidade LGPD.

### Testes de aceitação acrescentados

1. Mesmo quando todas as observações parecem normais, o sistema exige decisão humana e não emite aptidão.
2. KSS, sono, período e teste de vigilância ausentes permanecem `MISSING`, sem preenchimento por valores padrão.
3. Declaração explícita de impedimento gera escalonamento prioritário, sem liberação.
4. Campos arbitrários `empresa_id`, `funcionario_id`, informações pessoais e modo real são rejeitados pelo esquema.
5. API recusada para Costa do Sol antes de consultar banco, e desativada em produção; staging exige perfil aprovado, sem consultar funcionários no cenário sintético.
6. Frontend envia apenas os dois exemplos estáticos sem informações pessoais e não pode abrir no tenant errado.

**Lacunas impeditivas:** fluxos de coleta operacional real e gravação governada de check-in, ciência/casos e mitigação, validação científica, ensaio de 130 usuários, relatório formal, documentação de LGPD e experiência profissional permanecem sem comprovação. Nenhuma migration, tenant ou dados foram provisionados por esta PR.


## Etapa de ocorrências e mitigação BOA — implementação na PR (20/10/2026)

### Separação de papéis e superfícies
- **Administração BOA**: portal `/bombeiros/frms` e relatórios **agregados**, sem informações individuais de saúde.
- **Gestor operacional com setor explicitamente autorizado**: portal distinto `/bombeiros/frms/casos`, com `ProtectedRoute requiredRole=GESTOR`. Redirecionamento de atalhos genéricos `/frms/*` considera o papel ativo: gestores para casos BOA e administradores para área agregada; Costa do Sol mantém suas rotas existentes.
- **Backend de casos separado**: `GET /api/bombeiros/frms/casos/:id`, `PUT .../:id/tratamento`, `PUT .../:id/resolver`. Exige manager autenticado do tenant exato `bombeiros`, `empresa_id != 6`, revisão `FIREFIGHTER_AVIATION` vigente, setor autorizado vinculado à identidade e ocorrência existente `frms_alerta.tipo_limite` de prefixo **literal** `BOA_`. IDs enviados pelo cliente não concedem autorização.
- **Proteção de dados**: GET retorna apenas código do caso, datas e estado; nunca nome de funcionário, identificador do tripulante, KSS, sono, prontuário ou texto de tratamento. A área administrativa não pode chamar as rotas individuais do gestor.
- **Cadastro e auditoria reaproveitados**: registros são `frms_alerta` e `funcionarios` canônicos, com filtros obrigatórios tenant+setor. Escritas delegadas aos serviços canônicos `registrarTratamentoAlerta`/`marcarAlertaResolvido`, que reaplicam o filtro de empresa no `UPDATE` e chamam `logAuditoria`. Nenhuma tabela paralela de funcionários foi criada.

### Máquina de estados
```
[ABERTO]
   -- registrar responsável + prazo + mitigação + justificativa -->
[EM_TRATAMENTO]
   -- eficácia documentada e validada, com gestor identificado -->
[RESOLVIDO]
```

- Sem tratamento anterior, nenhuma resolução. Sem justificativa/medida (mínimo contratual) ou eficácia documentada, recusa 400/409. Alerta já encerrado ou fora do escopo não pode ser alterado.
- Notas antigas/não reconhecidas não podem ser silenciosamente convertidas nem sobrescritas. Ações de casos antigos só serão possíveis com migração semântica governada separada.
- **Não há criação automática de casos BOA a partir de check-in** nesta etapa, nem ocorrência BOA real provisionada. Logo o fluxo é código funcional e testado em fixtures, mas **ainda não é teste de ciclo completo em staging**.
- O serviço de casos existente usa auditoria padrão. A evidência imutável e a recuperação em runtime, inclusive concorrência de edições, exigem testes end-to-end sob D1 governado antes de afirmar integridade de ponta a ponta.

### Testes e limites de aceite
- Testes de propriedade e autorização: negam empresa 6, outro tenant, administração sem papel operacional, gestor sem setor, evento sem prefixo BOA, ID inconsistente e caso não encontrado.
- Testes de ciclo de vida em backend: registra tratamento com autor, responsável e prazo sem encerrar; impede sobrescrita de tratamento registrado; exige eficácia antes de fechar; só devolve estado sem dados médicos.
- Testes de interface: administrador não vê os casos; gestor da empresa 6 não vê painel BOA; gestor BOA envia medida e eficácia somente para a API isolada.
- **Faltam** emissão de casos BOA, assessoramento formal/parecer técnico, revisão de eficácia por competência aprovada, assinaturas/proveniência imutável, tratamentos sob concorrência, relatórios mensais assinados com tendências e comprovação externa de experiência profissional. Política final de papéis específicos do BOA deve ser aprovada com o órgão antes da produção.

**Nota de segurança:** criar essa API na PR não constitui execução de escrita de dados remotos. Nenhum D1/R2 real foi alterado. O fluxo permanecerá inoperante em ambiente real enquanto não houver tenant próprio, configuração aprovada, eventos BOA legítimos e integração governada.


## Correção estrutural e ciclo de check-in BOA — última implementação (20/10/2026)

> **Este contrato substitui os trechos históricos acima que apontavam para `frms_alerta` ou `frms_fadiga_checkin` como persistência das ocorrências BOA.** A migration 0212 impõe `CHECK(tipo_limite IN ('FDP_DIARIO','HV_DIARIA','HV_7D','HV_MES','HV_365D','REPOUSO'))` na tabela `frms_alerta`: tipos `BOA_*` não são válidos. A migration 0287 de `frms_fadiga_checkin` exige colunas de score e nível offshore; popular valores inventados seria tecnicamente e cientificamente incorreto. A implementação foi corrigida antes de staging, sem alterar tabelas ou registros da Costa do Sol.

### Modelo vigente na PR

- **Storage canônico reaproveitado, eventos isolados por `empresa_id`:** `frms_fadiga_evento` (migration 0287). Essa tabela permite evento append-only, `checkin_id`, `tipo`, timestamp, `empresa_id` e payload versionado sem forçar notas clínicas em campos offshore. Nenhum novo schema/SQL remoto ou tabela paralela de funcionários foi criado.
- **Tipos exclusivos BOA:** `BOA_CHECKIN_V1` (recibo da tripulação), `BOA_CASE_OPENED_V1` (revisão humana vinculada ao recibo), `BOA_CASE_TREATMENT_V1` (responsável, prazo, medida, justificativa, ator e momento), `BOA_CASE_CLOSED_V1` (eficácia verificada, ator e momento). Nunca usar `frms_alerta.tipo_limite=BOA_*` e nunca chamar o motor de classificação offshore.
- **Tripulante:** formulário próprio `/bombeiros/frms/checkin` e `POST /api/bombeiros/frms/checkin`. A rota exige sessão autenticada, tenant `bombeiros` diferente da empresa 6, papel de tripulante admitido, perfil regulatório BOA vigente, usuário vinculado pelo registro canônico `usuarios.funcionario_id` + `usuarios_empresas` + `funcionarios.empresa_id`, funcionário ativo com cargo/função de aviação. **Não** recebe `empresa_id`, `funcionario_id`, data arbitrária ou autorização de voo do cliente. O dia de referência vem do servidor.
- **Coleta:** missão, período, acionamento, criticidade declarada, horas/fragmentação de sono autorrelatados, KSS 1–9, presença autorrelatada de realização do PVT de 60s e declaração de impedimento. Valores ausentes ficam `null`; a afirmação de PVT realizado não é prova psicométrica. Consentimento jurídico/LGPD não se confunde com a confirmação de ciência de confidencialidade da interface.
- **Operação:** duas inserções numa mesma transação `D1.batch`: recibo e abertura de revisão humana. Idempotência diária por empresa/funcionário/data é verificada em SQL e nenhum segundo caso é criado quando o recibo já existe. Todo check-in exige revisão humana, inclusive quando os valores parecem favoráveis. **NUNCA** registrar `APTO`, score BOA não validado ou liberação de missão.
- **Gestão de ocorrências:** `/bombeiros/frms/casos`, `GET /api/bombeiros/frms/casos` (fila paginada e minimizada), `GET /casos/:id`, `PUT /casos/:id/tratamento`, `PUT /casos/:id/resolver`. Exigem role `manager`, setor explicitamente autorizado, mesmo tenant/pessoa no SQL e política BOA. O gestor tem acesso à identificação da ocorrência e à situação; dados clínicos pessoais não são transmitidos na fila/consulta. Tratamento e fechamento são novos eventos append-only; a cláusula `NOT EXISTS` protege também contra reexecução concorrente da mesma transição.
- **Relatório administrativo:** o consolidado mensal BOA agora consulta **somente eventos** `BOA_CHECKIN_V1`, sem contabilizar nenhum `frms_fadiga_checkin` offshore. Associação a funcionário e dupla checagem do tenant, participação mínima, suppressão de células pequenas, sem scores ou dados individuais.
- **Segurança de ativação:** as operações POST/PUT de check-in, cenários sintéticos e casos estão restritas no código a `staging`/`development` e dependem de política `FIREFIGHTER_AVIATION` própria aprovada. Nenhuma leitura ou escrita real de produção foi realizada. Essa restrição só poderá ser alterada em PR posterior, após homologação científica, privacy assessment, workflow governado e autorização para SHA/artefato exatos.

### Evidência para a licitação e limitações explícitas

O ciclo **código** agora cobre coleta BOA → recibo versionado → caso para revisão → registro de mitigação → avaliação de eficácia → emissão de contagem mensal de recibos, usando infraestrutura AirTrust e isolando tenant. **Os testes de unidade e API usam mocks e cenários sintéticos, sem demonstrar ainda uma execução end-to-end autenticada em D1 staging nem o comportamento de 130 usuários.**

Ainda faltam: aprovação científica/normativa (incluindo aplicação real de KSS/PVT), emissão mensal gerencial/técnica assinada e reprodutível com indicadores de risco sem falsa precisão, registro de turno/escala/missão planejada/real e denominadores confiáveis, configuração dos papéis BOA com perfis clínicos e operacionais, LGPD/retention/R2/offline, teste transacional/concorrrência em D1 real de staging, carga de 130 contas sintéticas e documentação externa autêntica da experiência da licitante.

**Não chamar de POC apta** enquanto não houver as evidências efetivamente verificadas dos oito requisitos e cinco eixos da licitação. Qualquer afirmação anterior sobre uso da tabela `frms_alerta` para ocorrências BOA deve ser lida como **superseded** por este contrato.
