# AirTrust FRMS — Perfil de aviação dos bombeiros e coordenação orientada à ação

**Status:** contrato de escopo aprovado em 2026-10-12; implementação por etapas, não constitui conformidade do edital já demonstrada.

## Decisões de escopo

1. A atividade objeto do edital é **aviação dos bombeiros**, não combate a incêndio terrestre isoladamente.
2. **Costa do Sol / HELICOPTER_OFFSHORE** permanece funcional e com seus parâmetros, limites e integrações próprios (SIGVOOS/Controle de Voos, escala, FIRA, quinzena, RBAC etc.).
3. A nova empresa dos bombeiros será um **tenant distinto**, provisionado pelo fluxo autorizado, com perfil aeronáutico específico (nome técnico proposto: `FIREFIGHTER_AVIATION`), sem copiar a revisão `HELICOPTER_OFFSHORE` nem ativar fallback implícito.
4. Reutilizar autenticação, FRMS, avaliação diária, KSS, teste de vigilância, auditoria, casos, relatórios e motor de avaliação quando as regras forem comuns; ampliar apenas domínios e parâmetros específicos.
5. A tela principal da coordenação **sempre exibe a situação do check-in diário de cada tripulante**. Planejamento futuro é permitido; transição para `liberado_operacionalmente` exige `RECEBIDO` para todos os tripulantes do voo, além dos demais gates existentes. `AUSENTE`, `PENDENTE`, `NAO_APLICAVEL`, `INDISPONIVEL` e snapshot ausente nunca equivalem a `RECEBIDO`.
6. A fila operacional prioriza **quem**, **por quê**, **qual providência**, **quem decide** e **o que foi registrado**. Gráficos/índices/limites/explicações permanecem disponíveis sob detalhamento.
7. Recomendações são apoio determinístico e auditável, e não diagnóstico ou decisão médica automática; não alterar limiares científicos apenas por UX.

## Componentes próprios da aviação dos bombeiros

- Tripulação, função aeronáutica, aeronave, unidade/base, missão (resgate, salvamento, transporte, combate aéreo a incêndios, treinamento etc.), horários previstos e reais.
- Jornada, períodos de serviço, repouso, voo diurno/noturno, séries de missões, acionamentos fora do planejamento, interrupção de repouso e carga operacional observada.
- Regras regulatórias aplicáveis à **operação aeronáutica específica do licitante**: somente após identificação documental e aprovação de um perfil normativo próprio; não transportar automaticamente limites RBAC/IOGP offshore.
- Fatores complementares de exposição (calor, esforço, missão crítica, privação e fragmentação de sono) apenas com fontes e critérios governados; dados ausentes não são convertidos em normalidade.
- Avaliação diária e teste breve de vigilância com controle da validade, documentação da metodologia e reconhecimento das limitações científicas do protocolo local.
- Mitigações condicionadas ao risco: revisão pré-missão, repouso, reorganização de escala, redução de exposição, reforço ou substituição de tripulação e encaminhamento ao responsável competente. Decisão e eficácia ficam registradas.

## Matriz dos oito requisitos do edital (resumo fornecido pelo usuário)

| Requisito | Entrega/evidência | Condição de aceite |
| --- | --- | --- |
| 1. Metodologia estruturada | procedimento ponta a ponta: coleta, classificação, revisão humana, mitigação e monitoramento | caso demonstrado |
| 2. Fundamentação técnico-científica | registro bibliográfico, racional dos parâmetros e limites de aplicação local | revisão metodológica assinada |
| 3. Fatores fadiga/sonolência/cognição | matriz de sinais por tipo de missão e jornada, KSS e teste de vigilância | rastreabilidade de cada sinal |
| 4. Registros auditáveis | autor, momento, fonte/confiança, versão do cálculo, alterações, decisões e eventos | trilha íntegra e reprodutível |
| 5. Relatórios técnicos/gerenciais | relatório mensal aprovado com indicadores, tendências, eventos e medidas | exportação e histórico mensal |
| 6. Administração com dados consolidados | dashboard agregado sem respostas pessoais sensíveis expostas | permissão por papel/tenant |
| 7. LGPD | classificação de dados, bases legais, minimização, acesso, retenção, controles e auditoria | documentação e testes |
| 8. Experiência comprovada | atestados, relatórios operacionais e estudos de caso idôneos da licitante | conferência documental, externa ao código |

Capacidade dimensionada inicialmente para até **130 usuários ativos**, mediante teste de carga, concorrência e disponibilidade.
A prova de conceito deve cobrir os cinco eixos de funcionamento, fatores, registros/relatórios, integridade/disponibilidade/segurança e LGPD. Resultado esperado é apto/inapto em cada requisito, não mera navegação estática.

## Etapas de entrega e proteção contra regressão

**Etapa 1 — proteção e orientação do despacho:** exibir permanentemente check-in e providência junto à tripulação, bloquear ausência/não aplicável no backend e distinguir LIBERÁVEL de LIBERADO. Testes: casos RECEBIDO/PENDENTE/AUSENTE/NAO_APLICAVEL, equipe mista, dados desconhecidos e cross-tenant. Não modificar fórmula nem norma.

**Etapa 2 — decisão simples para aviação offshore:** aproveitar `frms-operational-decision.ts`, `fortnight-indicator.ts`, casos e contexto do snapshot para explicar os fatores determinantes e oferecer providências específicas com revisão humana, sem revelar dados sensíveis em painéis amplos.

**Etapa 3 — novo perfil de aviação dos bombeiros:** aprovar fundamento técnico/normativo, criar revisão de perfil independente, entidades e evidências de missão, operação, carga, repouso e recuperação, checks de tenant e smoke específico. Não considerar provisionamento de tenant/migration como autorizado por este documento.

**Etapa 4 — relatório mensal, visão consolidada e POC:** workflow de revisão/emissão, histórico, RBAC/LGPD, teste de carga ~130 usuários, dados sintéticos e casos de prova reprodutíveis; evidências documentais de experiência são obrigação da licitante.

**Gate de liberação:** testes focados → suíte afetada → 8 gates GitHub Actions → staging autorizado e validado. Nenhuma publicação em produção sem autorização atual do SHA/artefato/escopo e governança aplicável de Schema V2.
