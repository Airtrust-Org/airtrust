# FRMS Local Scientific Validation Protocol v0.5

## 1) Objetivo
Evoluir gradualmente de proxy de triagem para calibração local orientada por dados operacionais, sem declarar validação científica externa prematura.

## 2) Perguntas de validação
- Os thresholds atuais produzem sinal útil no contexto local?
- O índice acompanha percepção operacional de fadiga?
- Qual taxa de falsos positivos e falsos negativos?
- Há diferenças relevantes por função, base e escala?

## 3) Dados necessários
- Check-ins de fadiga.
- Sono informado.
- Hora de despertar.
- Hora de apresentação.
- Jornada/HV por janela temporal.
- Reportes/observações de fadiga.
- Avaliação da coordenação/gestão.
- Ocorrências/eventos operacionais (quando disponíveis).
- Contexto operacional relevante.

## 4) Métricas mínimas
- Sensibilidade.
- Especificidade.
- Taxa de alerta.
- Concordância com avaliação humana.
- Estabilidade intra-tripulante.
- Impacto por janela 7d/28d.
- Falsos positivos e falsos negativos.

## 5) Desenho do estudo
- Fase observacional.
- Sem decisão automática.
- Sem uso punitivo.
- Revisão humana obrigatória.
- Calibração gradual e documentada.

## 6) Amostra mínima sugerida
- Mínimo de 200-300 jornadas com diversidade de função/base/escala.
- Cobertura de casos normais e casos de atenção/alto risco.

## 7) Período mínimo sugerido
- Mínimo de 8-12 semanas de observação contínua.
- Preferência por janela >= 1 ciclo operacional completo por base/função.

## 8) Tratamento de dados ausentes
- Marcar explicitamente dados estimados vs informados.
- Não imputar agressivamente sem trilha.
- Separar análises com e sem dados estimados.

## 9) Revisão de thresholds
- Ajustar thresholds apenas após evidência quantitativa + revisão humana técnica.
- Documentar racional, impacto esperado e risco de regressão.
- Aplicar mudanças em fases com smoke/controlado antes de produção.

## 10) Documentação de mudanças
Cada ajuste deve registrar:
- hipótese,
- baseline,
- métrica alvo,
- mudança proposta,
- resultado antes/depois,
- decisão final.

## 11) Critério para chamar de “calibrado localmente”
- Métricas mínimas estáveis por período consecutivo.
- Concordância operacional aceitável com avaliação humana.
- Taxa de alerta e erro dentro de faixa acordada.
- Rastreabilidade completa de dados e decisões.

## 12) Critério para ainda não chamar de validado
- Amostra insuficiente.
- Período insuficiente.
- Métricas instáveis.
- Dependência excessiva de dados estimados sem estratificação.
- Ausência de documentação formal de calibração.

## 13) Status desta fase
`SCIENTIFIC_VALIDATION_NOT_YET_PERFORMED`
