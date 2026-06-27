# AIRTRUST LMS TRIPULACAO SCORM ENGINE REWORK PLAN 2026-06-27

## 1. Objetivo

Planejar o rework técnico do engine SCORM dos cursos de Tripulação, sem implementar nesta fase.

## 2. Problema sistêmico

Achados estruturais confirmados nos pacotes de Tripulação:

1. ausência de `cmi.suspend_data`
2. uso inconsistente de `lesson_location`
3. uso de `alert()` nativo no fluxo de quiz

### 2.1 Ausência de `cmi.suspend_data`

Impacto direto:

- perde-se resume granular fora do mesmo dispositivo;
- histórico de slides visitados e estado de quiz não ficam persistidos no backend;
- retomar em outro navegador ou máquina fica fraco.

### 2.2 `lesson_location` em percentual

Problema:

- parte da nova geração de pacotes usa percentual puro;
- o backend e os guardrails trabalham melhor com `n/total`;
- isso degrada a inferência de progresso intermediário.

### 2.3 `alert()` nativo

Problema:

- bloqueia a thread do navegador;
- piora UX do quiz;
- dificulta consistência visual e de acessibilidade.

## 3. Impacto operacional

### Cross-device resume

Sem `suspend_data`, o aluno:

- retoma apenas pela posição mais bruta de `lesson_location`;
- pode perder contexto de quiz;
- sofre regressões práticas em ambiente real.

### Progresso intermediário

Com `lesson_location` em percentual puro:

- o backend não consegue inferir `progresso_pct` com a mesma robustez;
- relatórios intermediários ficam incompletos;
- diagnósticos operacionais ficam piores.

### UX no quiz

Com `alert()`:

- o fluxo de aprovação/reprovação é frágil;
- a experiência em mobile é ruim;
- há risco de bloqueio/supressão do aviso pelo navegador.

## 4. Proposta técnica

### 4.1 Gravar `suspend_data`

Implementar escrita consistente de:

- `cmi.suspend_data`
- estado mínimo de resume
- estado mínimo de quiz

Princípios:

- compactar payload;
- evitar gravar dados excessivos;
- manter compatibilidade com SCORM 1.2.

### 4.2 Padronizar `lesson_location` em `n/total`

Padronizar engine para:

- `cmi.core.lesson_location = "n/total"`

Benefícios:

- convergência com backend atual;
- melhor leitura para auditoria;
- melhor inferência de progresso.

### 4.3 Compatibilidade com histórico percentual

O backend e o engine de leitura devem manter fallback para:

- percentual puro legado;
- `n/total`;
- marcadores históricos já persistidos.

Objetivo:

- não quebrar matrículas antigas;
- permitir transição gradual.

### 4.4 Substituir `alert()` por modal/toast

Trocar `alert()` por:

- modal controlado pelo player; ou
- toast persistente com CTA explícita.

Requisitos:

- sem bloquear commit;
- acessível por teclado;
- visualmente coerente com a plataforma.

### 4.5 Garantir commit/finish

Endurecer o engine para:

- sempre disparar `LMSCommit()` em checkpoints relevantes;
- sempre disparar `LMSFinish()` na conclusão;
- agendar commit defensivo após mudança para `passed` ou `failed`.

## 5. Ordem de rework

Prioridade proposta:

1. EFB
2. CGA
3. Emergências Gerais
4. PBN
5. Aeromédico
6. Offshore
7. demais cursos de Tripulação

Justificativa:

- EFB tem caso crítico confirmado (`M12`);
- CGA, Emergências, PBN e Aeromédico têm marcações administrativas históricas;
- Offshore também tem histórico administrativo e caso com `cmi_json` vazio.

## 6. Critérios de aceite

O rework só deve ser considerado aceito quando:

1. `cmi.suspend_data` persistir de forma estável;
2. `lesson_location` sair em `n/total`;
3. retomar no mesmo dispositivo funcionar;
4. retomar em outro dispositivo funcionar de forma consistente;
5. reprovação não gerar conclusão;
6. aprovação gerar conclusão e qualificação apenas no caminho normal;
7. `LMSCommit` e `LMSFinish` ficarem auditáveis no fluxo;
8. não houver regressão nos cursos antigos.

## 7. Estratégia de validação

Validar cada curso com pelo menos:

1. avanço parcial + saída + retomada;
2. troca de dispositivo/navegador;
3. reprovação em quiz;
4. aprovação em quiz;
5. fechamento abrupto de aba;
6. reentrada posterior.

## 8. Auditoria dupla antes de upload

Antes de qualquer upload de pacote refeito:

1. auditoria estática do pacote;
2. auditoria funcional em browser real;
3. validação do backend com matrícula segura;
4. revisão dupla do artefato final;
5. registro de hash do ZIP publicado.

## 9. Restrições desta fase

Nesta fase:

- não alterar ZIP;
- não reempacotar;
- não subir R2;
- não fazer deploy.

Decisão:

- `TRIPULACAO_SCORM_ENGINE_REWORK_REQUIRED`
- `NO_MANUAL_COMPLETION_ALLOWED`
