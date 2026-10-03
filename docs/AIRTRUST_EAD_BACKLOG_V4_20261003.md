# AirTrust — Backlog EAD da Matriz V4

**Data:** 2026-10-03  
**Objetivo:** transformar as decisões da matriz V4 em cursos EAD/SCORM sem duplicar qualificações, inventar requisito ou confundir fonte documental com pacote LMS publicado.

## 1. Regra de trabalho

Um documento controlado, PPTX, certificado histórico ou modelo de qualificação **não prova** que exista um curso SCORM atual e publicado no LMS.

Antes de criar curso novo:

1. confirmar a qualificação/modelo canônico;
2. procurar curso LMS existente e pacote publicado;
3. localizar fonte controlada atual;
4. reaproveitar curso existente quando tecnicamente aproveitável;
5. criar novo pacote somente quando não houver pacote adequado;
6. preservar histórico/certificados anteriores;
7. não criar matrícula automática durante a produção do conteúdo.

## 2. Fontes online já localizadas

| Curso/tema | Fonte localizada | Estado da fonte | Ação de conteúdo |
| --- | --- | --- | --- |
| Regras de Ouro — Petrobras | `Regras de Ouro.pptx` | Apresentação extensa com conteúdo Petrobras, fala sugerida, exemplos e as regras de segurança | Converter para EAD interativo no padrão AirTrust; não publicar o PPTX bruto como curso. Preservar o conteúdo essencial e adaptar navegação/didática. |
| Cultura Justa | `PRC-SSO-008 - Cultura Justa - Rev05.pdf` | Documento controlado vigente localizado no Drive; há certificados históricos de “Cultura Justa e Stop Work” | Produzir/manter curso `JUST_CULTURE` separado e baseado no procedimento controlado. |
| Stop Work | `PRC-SSO-006 - STOP WORK - Rev03.pdf` | Documento controlado vigente localizado no Drive | Produzir/manter curso `STOP_WORK` separado. Não fundir automaticamente com Cultura Justa apenas porque certificados históricos juntavam os temas. |
| Produtos Químicos / FDS | `ITR-MNT-017 - Controlar e consultar FISPQ - Rev01.pdf`; `PRC-SGI-024 - Transporte Armazenamento e Manuseio de Produtos Químicos - Rev01.pdf` | Fontes operacionais controladas localizadas | Refazer/produzir EAD NR-26/FDS usando nomenclatura atual e foco operacional. “FISPQ” pode aparecer como nomenclatura histórica, mas o curso deve explicar a FDS atual. |
| NR-20 | materiais temporários `TEMP_NR20_*` + matriz/LAPR e documentação de produtos químicos | Há material de produção, mas arquivos `TEMP_` não são fonte normativa | Usar fontes controladas e NR aplicável como base; configurar a trilha corporativa V4 Intermediário. O pacote EAD não pode, sozinho, comprovar eventual componente prático obrigatório. |
| Código de Ética e Conduta | `MNL-GRH-001 - Código de Ética e Conduta - Rev03.pdf` | Documento controlado vigente localizado | Criar/atualizar EAD corporativo de Ética/Conduta se não houver pacote LMS atual adequado. |
| LGPD / Segurança da Informação | `PRC-GTI-002 - Plano de resposta a contingência LGPD - Rev02.pdf`; `PRC-GTI-003 - Segurança da Informação para terceiros - LGPD - Rev01.pdf`; certificados históricos de curso LGPD | Fontes internas e evidência de treinamento histórico localizadas; pacote SCORM atual ainda não comprovado nesta frente | Criar/atualizar EAD corporativo após confirmar qualificação e pacote LMS atual. Não ativar nova obrigação apenas porque existe certificado histórico. |

## 3. Prioridade de produção

### P0 — obrigação já estruturada na V4

1. **NR-20 — Intermediário**
   - 16 h inicial / 4 h recorrente / 24 meses como configuração corporativa V4;
   - separar claramente teoria EAD de prática/evidência quando aplicável;
   - contextualizar inflamáveis, combustíveis, óleos e ambiente de hangar/manutenção de helicópteros;
   - não usar os decks `TEMP_` como fonte normativa.

2. **NR-26 / Produtos Químicos / FDS**
   - público operacional amplo;
   - leitura de rótulos e FDS;
   - perigos, prevenção, armazenamento/manuseio, EPI/EPC, derramamento e resposta;
   - integrar os procedimentos internos controlados.

3. **Regras de Ouro — Petrobras**
   - aproveitar o PPTX fonte;
   - reorganizar em módulos curtos e operacionais;
   - manter exemplos Petrobras quando pertinentes ao critério contratual;
   - retirar dependência de “fala sugerida” do instrutor para que funcione como EAD autônomo.

### P1 — segurança operacional corporativa

4. **Cultura Justa** — curso próprio baseado em PRC-SSO-008 Rev05.
5. **Stop Work** — curso próprio baseado em PRC-SSO-006 Rev03.

Mesmo que certificados antigos tenham agrupado ambos, o catálogo V4 deve manter os dois conceitos separáveis para permitir revisão, evidência e atualização independentes.

### P2 — governança corporativa

6. **Código de Ética e Conduta** — fonte MNL-GRH-001 Rev03.
7. **LGPD / Segurança da Informação** — fontes GTI controladas + eventual política de privacidade/segurança vigente a confirmar antes do fechamento do conteúdo.

## 4. Padrão técnico mínimo do pacote

Todo pacote novo ou refeito deve:

- ser SCORM 1.2, Single SCO;
- ter `imsmanifest.xml` na raiz;
- ter layout responsivo e legível;
- usar fonte de tela >= 20 px quando aplicável ao template;
- preservar terminologia técnica e regulatória;
- ter interações úteis, sem transformar curso em sequência de cliques artificiais;
- oferecer feedback de avaliação correto/incorreto;
- implementar `lesson_status`, `lesson_location` e `suspend_data`/resume corretamente;
- manter Preview read-only;
- respeitar `requiredSlides`/`requiredInteractions` quando o template usar esses controles;
- evitar `.map` e arquivos-fonte desnecessários no pacote final;
- manter o ZIP dentro dos limites operacionais do LMS;
- não incorporar PII, certificados reais ou dados de funcionários no pacote.

## 5. Critérios de QA antes de publicar

Para cada curso:

1. conteúdo comparado com a fonte controlada vigente;
2. nenhuma afirmação normativa sem fonte;
3. nenhuma imagem repetida em excesso entre cursos;
4. imagens operacionais coerentes com helicópteros/ambiente Costa do Sol quando aplicável;
5. navegação completa;
6. resume testado;
7. avaliação e mastery testados;
8. feedback visual testado;
9. conclusão SCORM testada no player AirTrust;
10. pacote validado pelo quality gate do LMS;
11. publicação separada da definição de obrigatoriedade da matriz;
12. smoke real depois da publicação.

## 6. Itens que ainda exigem verificação live do LMS

A frente online localizou fontes documentais, mas não deve presumir publicação. Antes de criar pacote duplicado, confirmar no catálogo live:

- se `JUST_CULTURE` já possui pacote e se está publicado;
- se `STOP_WORK` já possui pacote e se está publicado;
- se `NR-20` atual é pacote antigo/iniciação ou curso reutilizável;
- se `NR-26`/Produtos Químicos já possui versão aproveitável;
- se Regras de Ouro possui pacote SCORM ou somente qualificação/histórico;
- se Ética e LGPD já possuem curso atual fora do repositório.

Essa verificação é read-only e deve ser feita pela superfície online autorizada quando disponível. Ausência de evidência no Git/Drive não equivale a ausência no R2/LMS.

## 7. Separação entre conteúdo e compliance

- **Conteúdo LMS** responde: “existe um curso que ensina e registra conclusão?”
- **Qualificação** responde: “qual competência/documento está sendo controlado?”
- **Regra de Compliance** responde: “para quem é obrigatório e por quê?”
- **Designação** responde: “quem ocupa um papel específico?”
- **Histórico/certificado** responde: “qual evidência essa pessoa já possui?”

Nenhuma dessas entidades deve ser usada como atalho para inventar as demais.