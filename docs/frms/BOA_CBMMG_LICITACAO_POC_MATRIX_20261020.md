# BOA/CBMMG — matriz de aceite FRMS e prova de conceito
**Base:** requisitos 1.5.3, 1.5.3.2 e 8.4 do Termo de Referência **conforme transcrição fornecida pelo proprietário em 20/10/2026**. O PDF integral do edital, seus anexos e eventuais retificações **ainda precisam ser confrontados**. Este documento não afirma habilitação, aptidão nem resultado de prova de conceito.

## Premissas invariantes
- Perfil **FIREFIGHTER_AVIATION**, novo tenant BOA/CBMMG separado da Costa do Sol; não herdar HELICOPTER_OFFSHORE.
- Escopo é operação **aérea** de bombeiros (tripulação, bases, aeronaves, missões e acionamentos).
- Até 130 usuários ativos iniciais: capacidade deve ser demonstrada por ensaio, não inferida da configuração `max_funcionarios`.
- A Administração pode convocar apresentação remota ou presencial; prazo específico será o fixado pelo Pregoeiro. O relato menciona referência usual de dois dias úteis, **não garantia contratual**.
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

## Cinco cenas da prova de conceito (item 8.4)
1. **Método:** tripulante sintético conclui check-in e recebe interpretação; insuficiência gera revisão, não liberação automática.
2. **Fatores:** dois cenários equivalentes com diferenças documentadas em sono/turno/acionamento e PVT-B, com fonte e explicação de risco **sem coeficiente médico inventado**.
3. **Registros/relatórios:** caso e mitigação com ciclo fechado, comparação de meses e evidência do relatório mensal exportado.
4. **Integridade/disponibilidade:** consulta auditada, trilha do responsável, política/revisão, teste negativo de alteração indevida, backup/recovery governado, saúde real de Worker/Pages/D1.
5. **LGPD:** administração só recebe dados agregados, equipe clínica/responsável técnico acessa informações identificáveis conforme RBAC, outro tenant recebe 403, células 1–4 suprimidas.

## Primeira entrega de engenharia do contrato — 20/10/2026
- Endpoint exclusivo: `GET /api/bombeiros/frms/relatorios/mensal-consolidado?mes=YYYY-MM`, com autenticação já existente do router, `requireRole('admin')`, tenant validado e equipe autorizada.
- Reutiliza exclusivamente `relatorioCompliance()` que deriva `listFrmsOperationalSnapshot()` em escopo autorizado; compara somente contagens de **eventos registrados** com mês anterior.
- Resposta **sem nome, ID de pessoa, KSS, sono, PVT ou informação médica individual**; escopos menores que cinco são negados; contagens 1–4 são suprimidas com `null` e motivo; ausência/incompletude também devolve `null`, nunca zero inventado.
- Nenhum SQL de write, migration, seed, alteração de coeficiente ou despacho. Consulta é uma **prévia técnica**, NÃO relatório gerencial homologado, assinado ou arquivado. Ainda não inclui indicador de eficácia de mitigação nem denominador validado de cobertura.
- Testes focados para supressão de grupo/células, ausência, dados incompletos e não vazamento de identificadores.

## Critérios de fechamento do produto — TODO (não presumir)
1. Conferir integralmente edital/Termo de Referência + eventuais respostas oficiais/retificações.
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
