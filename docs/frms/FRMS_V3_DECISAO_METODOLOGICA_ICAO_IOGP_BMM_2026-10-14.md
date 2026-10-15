# AirTrust FRMS V3 — decisão arquitetural sobre o Índice de Margem de Alerta (IMA)

**Data:** 2026-10-14/15  
**Estado:** proposta técnica versionada, **não calibrada, não homologada e não operacional**. Relacionada à issue #1476.  
**Baseline lida:** `main` `a1378f22fcc2d3bb5f4e0fe96a18dc02dbf341d3`. Revisão efetiva por empresa/perfil/data e dados em D1 **não foram consultados**.  
**Regra:** este ADR **não modifica** cálculo vigente, decisões de despacho, limites, registros D1/R2 ou scores apresentados em produção.

## Decisão

Adotar o processo ICAO *Fatigue Management Guide for Helicopter Operators* (2020), RBAC/IS ANAC aplicáveis e IOGP 626/690 como **fontes de governança e análise de risco**, não como fornecedores de uma tabela universal de pontos. Criar **motor próprio transparente** de estimação e simulação contínua, implementado inicialmente **somente em shadow/read-only**, com caminho de comparação a SAFTE-FAST Real Time e FAID Quantum **somente mediante direito de uso e capacidade de integração confirmados**.

Uma representação intuitiva de 0–100 é desejável, mas somente **após validação**. Seu nome proposto é **IMA — Índice AirTrust de Margem de Alerta**: número **alto = margem estimada maior**. Nunca traduzir `100` como “sem fadiga”, “apto” ou “risco zero”; `0` não é diagnóstico. Nenhum intervalo de pontos é limiar de aceitação regulatória ou autorização de voo. Ausência de evidência gera `INSUFFICIENT_DATA`, jamais `100`.

**O produto é um motor de decisão em camadas, e não um semáforo regulatório inventado.** O número é secundário ao estado operacional e à providência.

## Alternativas avaliadas

| Caminho | Vantagem | Limitação/risco | Decisão |
|---|---|---|---|
| Manter soma de +10 check-in, +14 jornadas, −6 descanso | Já disponível, fácil de explicar | Mistura conformidade/biologia, dupla contagem, bonificações sem sono, pesos não calibrados | **Não** usar como ciência; manter somente como legado comparável |
| Copiar modelo ICAO/ANAC de fatores e matriz | Defensável como processo de avaliação e mitigação | Não produz previsão fisiológica contínua nem pesos universais | **Sim**, para classificação de perigos, frequência e risco residual |
| SAFTE-FAST Real Time | Predição biomatemática de efetividade/sono; API para escalas | Licença, custo, termos SaaS, dados de entrada, calibração local; não substitui operação | Benchmark comercial preferencial **se** viável |
| FAID Quantum | Comparação de padrões de escala, exposição, horário e descanso | Licença/integração, semântica própria, necessidade de adaptação offshore | Segundo benchmark de escala |
| HSE Fatigue and Risk Index | Saídas numéricas interpretáveis e comparação de escalas | Ferramenta HSE retirada do site em 2021; risco conhecido de interpretação errada; setor ferroviário | Apenas benchmark metodológico, **não** transplantar score |
| Copiar equações/coeficientes comerciais | Aparência de sofisticação | Licença e falsa validação | **Proibido** |
| Motor próprio aberto, calibrado com evidência | Transparência, auditabilidade, independência, continuidade entre quinzenas | Pesquisa, validação, amostragem e governança antes de uso | **Escolha arquitetural** |

**O manual da ICAO disponibilizado em viewer e os dois PDFs de mesmo nome no acervo recuperado não foram integralmente extraíveis neste ambiente:** o acervo devolve uma página de proteção que exige Adobe Reader; o viewer HTML não expõe o corpo. Não afirmar leitura integral. As afirmações metodológicas verificadas estão sustentadas pela página oficial ICAO e, especialmente, pelo texto integral em HTML da IS 117-004B da ANAC, Apêndices A/B. Conferir o guia original antes de fechar a matriz de requisitos em parecer técnico.

## Fontes já existentes no AirTrust — inventário de código, NÃO cobertura real em produção

- Jornadas planejadas e realizadas, hora de apresentação, conclusão, duração de trabalho e escalas: `operational-snapshot.ts`, `frms-fadiga-acumulada.ts`, escala/Controle de Voos/SIGVOOS. Verificar fonte canônica e precedência; **não contar FIRA e SIGVOOS duas vezes**.
- Sono efetivamente relatado em 24h e qualidade, hora de despertar, KSS 1–9: check-in de fadiga e motores `fadiga-score.ts`, `calculos.ts`, `readiness.ts`, `fortnight-indicator.ts`. Autorreporte não é medição objetiva.
- PVT-B adaptado AirTrust `airtrust-pvtb-v2`, **60 segundos** e baseline protocolado por indivíduo: `readiness.ts`. Não reivindicar equivalência a PVT validado de 3/10 min nem usar um único teste como certificação de aptidão.
- Recuperação/standby, oportunidade de repouso, acionamento e estados: `recovery-model.ts`, `operational-policy-v2.ts`. Oportunidade **não prova sono**; recuperação não equivale automaticamente a `OFF_DUTY` ou ausência de voo.
- Fadiga acumulada atual e policy V2: `fortnight-indicator.ts`, `operational-snapshot.ts`, `operational-policy-v2.ts`, `calculos.ts`. O `score_acumulado` atual combina carga de voo, dias, KSS, falta de check-in, dados estimados, tendência, desconto de jornada/repouso: **não reutilizar esse valor como input do IMA**.
- Limites legais/contratuais e janela 168h: resolver revisão por tenant, perfil e data; `1106/2700` observado na auditoria representa **minutos**, não horas, e `2700` precisa ter origem/revisão confirmada antes de receber rótulo ANAC/IOGP.
- Sensibilidade da implementação: `meds_ult_12h`/álcool opcionais podem colapsar ausência em falso `não` no legado; não usar como input automático nem ampliar coleta sensível. Ver `docs/frms/FRMS_CHECKIN_SCIENCE_UX_CONTRACT_2026-10-14.md`.

**Dados não comprovados:** cobertura histórica contínua de sono e hora de despertar, duração correta de folgas/standby, horários de início/fim confirmados, leitura da revisão efetiva do D1, confiabilidade do PVT-B local, base de desfechos e distribuição de registros. É inválido afirmar que já há dados suficientes ou calibrar pesos sem snapshot read-only autorizado e amostra adequada.

## Contrato proposto: quatro canais independentes

### 1. Exposição/vigilância estimada — IMA 0–100, apenas após validação

Conceito: motor biomatemático explicitamente versionado e **não proprietário**, com processo homeostático (débito/recomposição durante sono real), componente circadiano, tempo desde despertar, eventual inércia e efeitos de restrição crônica. Simular cronologia contínua com janela de aquecimento suficiente, sem reset à meia-noite, na virada da quinzena ou troca de escala.

A formulação ilustrativa abaixo é **uma interface matemática e não um motor aprovado**:

```text
estado(t+dt) = atualiza_modelo_aberto(estado(t), vigília/sono confirmado,
                                   horário local, histórico, hipóteses versionadas)
alerta_bruto(t) = estima_vigilância(estado(t), ritmos, inércia)
IMA(t) = mapeamento_monotônico_calibrado(alerta_bruto(t), referência, amostra)
         [inteiro 0..100; maior = estimativa mais favorável]
```

Nunca usar `IMA = 100 - (14 dias + 10 check-in - 6 descanso)`. Não somar de novo KSS e PVT à previsão derivada de sono como se fossem fatores independentes. **KSS/PVT são evidências observadas para confrontar e corrigir as hipóteses/modelo; um conflito pode elevar a necessidade de revisão sem forçar aumento/queda de pontos.** Resultado planejado e realizado são séries separadas; simulação de uma escala nunca substitui observação individual.

Se o algoritmo ainda não estiver parametrizado/calibrado para a população, devolver `UNAVAILABLE_UNVALIDATED` mesmo que haja todos os dados. Limites do produto não são probabilidades de acidente/medidas fisiológicas absolutas.

### 2. Estado individual observado

Sono reportado (horas e janela), KSS, PVT-B versão e baseline, condição declarada, horário/frescura, discrepância previsão × observação. Situação: `SEM_SINAL`, `ATENCAO`, `REVISAO_IMEDIATA`, `DADOS_INSUFICIENTES`, com categorias aprovadas e explicação. Estado crítico ou autodeclaração incompatível com jornada **não é compensável por IMA alto**.

### 3. Limites regulatórios, contrato e segurança

Validação separada de horas de voo, jornada, FDP, repouso e cláusula contratual por apêndice/regime aplicável; identificar `CONFORME`, `REVISAO_OBRIGATORIA`, `VIOLACAO`, `DADOS_INSUFICIENTES`. IOGP 690 é recomendação setorial a menos que adotada em contrato; não tratar como RBAC. Nunca converter “saldo de 45h/7d” em saldo de alerta biológico. Um desconto não libera violação.

### 4. Confiança, conformidade e ação

Checklist de dados confirmados/estimados/ausentes por dimensão, data/fonte/revisão; status do check-in e de sincronização; responsável, prazo, ação, evidência de mitigação, decisão e acompanhamento. **Check-in pendente vale cobrança de conformidade, não subtração biológica**. Ausência de fonte não cria verde e tampouco inventa fadiga elevada.

## Cenários de aceitação operacional (sem pontuação inventada)

| Situação | Número/observação | Resultado e ação exigida |
|---|---|---|
| Últimas noites com sono curto e apresentações muito cedo | Projeção numérica somente se validada; senão `UNAVAILABLE_UNVALIDATED` | Comparar adiamento, substituição ou ampliação de recuperação; revisão humana |
| KSS 8 e PVT-B desfavorável ao baseline, mesmo que IMA projetado alto | Sinais conflitantes, não média favorável | Prioridade para revisão imediata e registro de medida, sem liberação automática |
| Check-in não realizado, jornada confirmada | IMA fisiológico não sofre débito “administrativo”; confiança é parcial | Solicitar check-in e tratar elegibilidade/decisão com evidência insuficiente |
| Dia sem voo, porém com standby acionável | Não conceder restauração automática; sono efetivo ainda desconhecido | Confirmar tipo de atividade, oportunidade e relato de sono |
| Violação de FDP, mesmo com sono/KSS favoráveis | IMA não compensa limite | Tratar violação/regime e decisão autorizada fora do índice |
| Mudança de apresentação 05h→08h com horas/sono idênticos | Comparação contrafactual versionada, sem reset histórico | Exibir diferença projetada e incerteza, sem reivindicar magnitude calibrada |
| Conjunto de dados incompleto | `INSUFFICIENT_DATA` e motivos, nunca 100/verde | Solicitar dados ou intervenção antes de interpretação do índice |

## Contrato operacional de uso pela Coordenação

**Ordem visual por pessoa/voo:** situação e necessidade de providência → causa → evidências e qualidade → intervenção recomendada → efeito previsto e follow-up → detalhe técnico versionado.

1. **Antes da escala:** comparar versões A/B de missão (horário de apresentação, tripulação, descanso); identificar padrão de maior exposição, sem ocultar limites.
2. **Na apresentação:** coletar apenas dados não obtidos por fonte confiável (sono real, KSS, PVT-B e declaração), identificar divergência e encaminhar revisão humana quando necessário.
3. **Em alerta:** sugerir investigar sono/escala, substituir tripulante, rever horário de apresentação, estender oportunidade de repouso, FRAT/mitigação se prevista pela política; **não** decidir aptidão automaticamente ou sugerir repouso em horário legalmente incompatível.
4. **Após ação:** registrar medida, quem aprovou e evidência; comparar trajetória observada/projetada sem declarar recuperação por mera passagem de tempo.
5. **Auditoria:** demonstrar fonte, modelo, revisão, limitações, decisão humana, efeitos e evolução dos indicadores.

## Protótipo técnico implementado neste PR (não operacional)

- `worker-airtrust/src/lib/frms/ima-v3-shadow.ts`: cálculo puro de hipótese homeostática com estado inicial desconhecido propagado pelos dois extremos `S0=0` e `S0=1`, pressão de vigília/sono real, componente circadiano com offset explícito e mapeamento experimental 0–100. **Só fornece candidato numérico com `syntheticResearchFixture: true`**; qualquer chamada não sintética devolve `researchCandidateIndex: null` e `UNVALIDATED_NO_OPERATIONAL_INDEX`, mesmo que a cronologia esteja completa.
- `worker-airtrust/src/lib/frms/ima-v3-evidence-audit.ts`: inventário estatístico puro de prontidão dos dados diários sem PII e sem SQL. Separa duração do sono autodeclarada de horário real do episódio, check-ins, KSS, baseline PVT-B e lacunas; cobertura vazia não é 100%. Mesmo 100% de episódios datados **não constitui cronologia completa de vigília** ou validação operacional.
- `classifyImaDecisionCue`: sinaliza revisão humana, violação regulatória e ausência de evidências **independentemente** do número IMA; nunca gera autorização automática.
- `worker-airtrust/src/__tests__/frms/ima-v3-shadow.test.ts` e `ima-v3-evidence-audit.test.ts`: testes sintéticos, invariantes de não compensação, fonte, tempo, sono/vigília e falta de dados.

**Verificação local isolada (15/10/2026):** 32/32 testes focados aprovados em 4 arquivos, incluindo `fortnight-indicator.test.ts` e `frms-governance-readiness.test.ts`. Typecheck do Worker aprovado no SHA inicial do motor; revisão de todo o lote aguarda confirmação final do executor e GitHub Actions oficial.

**Restrição intencional:** não há endpoint operacional, UI de pontuação, consulta D1, dados privados ou interface de despacho para esse protótipo. Publicá-lo como código não equivale a habilitar o índice. O resultado 0–100 não é extrapolação do score legado, SAFTE, FAID ou HSE.

## Gates de aceitação científica antes de operar um IMA

1. Especificar uso-alvo: antecipar degradação de vigilância e comparar cenários de escala, **não** diagnosticar nem estimar probabilidade de acidente.
2. Confirmar regimes ANAC (RBAC 117/IS) e contratos efetivamente aplicáveis à Costa do Sol; aprovar matriz inicial/residual pelo responsável FRMS/GAGEF.
3. Inventariar completude real com consultas **somente leitura e escopo tenant** para 60–90 dias quando possível; aumentar horizonte/amostra se os eventos forem raros. Relatar coverage, ausências, turnos, jornadas e distribuição de KSS/PVT sem exportar PII.
4. Definir formulação **aberta**, proveniência de cada parâmetro, hipótese de sono em dias sem autorrelato e limites de aplicabilidade. Nunca presumir que descanso = sono.
5. Calibrar e testar cronologia contínua com dados **temporais separados** (treino versus holdout) e, se viável, validação prospectiva. Avaliar previsão contra KSS, PVT-B individual e reportes/FRAT/ocorrências classificados, sem supor que o PVT-B de 60s é padrão-ouro.
6. Medir sensibilidade/especificidade, alertas por tripulante/quinzena, casos relevantes não detectados, falsa tranquilização, calibração do mapeamento, estabilidade por perfil e efeitos das mitigações; documentação das limitações estatísticas.
7. Comparar **outputs sem confundir unidades** com SAFTE-FAST, FAID (caso contratado) e legado, e analisar discrepâncias. IOGP 626-2 **não recomenda um modelo único**.
8. Submeter metodologia, limites e segurança ao responsável técnico; aprovar uma versão imutável. Persistir em shadow outputs versionados **somente após governança/autorização de qualquer write**; começar com execução pura/read-only em casos sintéticos.
9. Testes de propriedades: sono real adicional sob mesmas condições não deve piorar componente homeostático; ausência não vira `100`; folga sem sono comprovado não restaura automaticamente; KSS alto nunca é sobreposto por IMA alto; violação não é anulada; falta de check-in não altera fisiologia; isolamento empresa/ciclo; ordem temporal e DST/fuso.
10. Teste focado → suíte afetada → 8 checks GitHub → staging oficial → aceite visual/operacional com papéis autorizados. **Produção apenas com autorização explícita para SHA, artefato e escopo.**

## Licenças — riscos e critério de compra

- **SAFTE-FAST Real Time** anuncia API incorporável em sistemas de planejamento, inclusive web service; exemplo de integração com software aéreo. **Nenhum preço/termo SaaS/multi-tenant/sublicença, direitos de guardar resultados ou SLA foi comprovado.** Antes de qualquer aquisição, exigir proposta formal, processamento/privacidade, disponibilidade e custos por volume, compatibilidade de entradas e teste com escalas offshore.
- **FAID Quantum**: confirmar API/exportação, licenças de incorporação e sublicenciamento; não presumir direitos de reprodução dos métodos/saídas.
- **HSE FRI**: retirada pública em 2021 por plataforma obsoleta e riscos de uso indevido. Seus números não são coeficientes livres de penalidades do AirTrust.
- **Motor aberto próprio**: utilizar literatura e implementações sob licença compatível, sem copiar código ou parâmetros proprietários. Custos relevantes passam a ser calibração, governança, operação e auditoria.
- **Decisão de custo:** priorizar prova técnica transparente e abrir consulta comercial em paralelo; não criar dependência comercial antes de verificação de cobertura e ganho incremental sobre o motor aberto.

### Consulta de fornecedores atualizada em 15/10/2026

- **SAFTE-FAST Real Time:** fabricante anuncia API para integração com sistemas de escalas, incluindo plataformas de aviação; contato público `info@saftefast.com`. Não há tabela pública comprovada de preço para uso do AirTrust SaaS, limites de requisições, redistribuição ou multi-tenant. Fonte: https://www.saftefast.com/real-time
- **FAID Quantum:** o fabricante publica tabela de preços de licenças **desktop**, incluindo personal `US$ 225` e opções superiores por porte/funcionalidade. Esses valores **não são custo de integração do AirTrust**. A mesma tabela descreve **Shared Object Library para uso em software de escalas de terceiros** e **Web Service**, ambos **price on application**; licença/sublicença/uso por tenant devem ser negociados. Fonte: https://www.interdynamics.com/fatigue-risk-management-solutions/fatigue-risk-management-products/faid-price-list/
- **Teste gratuito FAID:** web gratuito limita a um roster por sete dias; desktop é temporário e permite até três semanas/três rosters, sem autorização de uso comercial. Isso é útil para avaliação manual de plausibilidade **somente com dados sintéticos** antes de contrato e termos de privacidade. Fonte: https://www.interdynamics.com/fatigue-risk-management-solutions/fatigue-risk-management-products/download-faid-quantum/
- **Conclusão de procurement:** não contratar nem introduzir dependência de API nesta etapa. Preparar amostra sintética de comparação e solicitar proposta por volume, latência, privacidade, uso multi-tenant, direitos de derivação/armazenamento de outputs, SLA e possibilidade de validação offshore.

## Fontes verificáveis

- ICAO, guia de helicópteros 2020 e Doc 9966: https://www.icao.int/operational-safety/fatigue-management/resources
- ANAC IS 117-004B (Apêndices A e B; corpo HTML): https://www.anac.gov.br/assuntos/legislacao/legislacao-1/iac-e-is/is/is-117-004
- IOGP 626: https://idms.iogp.org/Documents/849
- IOGP 626-2, explícita não preferência por BMM: https://idms.iogp.org/Documents/860
- ORR sobre benefícios, limitações e retirada do FRI: https://www.orr.gov.uk/managing-rail-staff-fatigue/13-appendix-d-benefits-and-limitations-fatigue-risk-assessment-tools
- SAFTE-FAST Real Time: https://www.saftefast.com/real-time
- Validação e aplicação do modelo de três processos em operações aéreas: https://pmc.ncbi.nlm.nih.gov/articles/PMC4203690/
- Publicação acadêmica sobre subjetividade KSS vs desempenho: https://pubmed.ncbi.nlm.nih.gov/33994837/
- Contrato e riscos reais do FRMS: `docs/frms/FRMS_CHECKIN_SCIENCE_UX_CONTRACT_2026-10-14.md`; issue #1476.

## Não executado / fora desta alteração

Nenhum score de produção alterado, nenhuma tabela/seed/migration, nenhuma requisição D1/R2 real, nenhuma aprovação regulatória, nenhuma licença contratada, nenhum benchmark calibrado, nenhuma autorização de envio a produção. Isso é um **contrato de desenvolvimento verificável**, não uma alegação de validação científica.
