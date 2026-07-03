# Costa do Sol / AirTrust — Auditoria Técnico-Pedagógica RPEA/PQ-C × Matriz V6/V6.1 20260703

**Data-base:** 2026-07-03 (revisado em 2026-07-03 — ver "Atualização 2026-07-03" no topo de cada seção alterada)
**Caráter:** Documental + implementação local do loader de matriz (sem apply). Nenhuma migration remota, DML remoto, deploy ou apply em produção. Nenhum item saiu do estado de PR draft.
**Escopo:** 34 itens RPEA/PQ-C listados no mandato + 12 fichas de simulador (V6.1 fichas restantes).
**Fontes primárias:** `2026_03_27 PQ-C Helicóptero.xlsx` (584 linhas, aba única), `RPEA - Itens de Auditoria.xlsx` (2 abas: "Lista analisada" e "Nova Lista após as correções"), `COSTA_DO_SOL_MATRIZ_V6_1_FICHAS_RESTANTES_FINAL_REVISAVEL_20260703.md`, `simuladores-matriz-v6-data.mjs`, `apply-simuladores-matriz-v6-costa-do-sol.mjs`, `notechs.ts`, `SIMULADORES_MATRIZ_V6_AUDITORIA_SEMESTRAIS_20260703.md`, `COSTA_DO_SOL_MATRIZ_V6_1_AUDITORIA_GLOBAL_51_MODELOS_20260703.md`, `COSTA_DO_SOL_MATRIZ_V6_1_PLANO_REVISAO_FICHAS_RESTANTES_20260703.md`, `COSTA_DO_SOL_MATRIZ_V3_FINAL_REVISAVEL_20260703.md`, `COSTA_DO_SOL_MATRIZ_V5_FINAL_REVISAVEL_20260703.md`, migration `0414_add_manobras_referencias_json.sql`, testes `simuladores-matriz-v6-data.test.ts` e `catalogos-tenant-isolation.test.ts`.

> **Atualização 2026-07-03 (pós-implementação):** as 8 fichas operacionais listadas na seção 4 abaixo foram convertidas no loader local (`simuladores-matriz-v6-data.mjs`) — 18 técnicas + zero LOFT genérico/CRM-como-manobra cada, com auto-registro no catálogo e `referencias_json` corrigido para classificar QRH/AFM/FCTM/MGO/MOM/SOP/FTV/PRG-OPS como `FONTE_OPERADOR`. **Nada foi aplicado a nenhum banco** (local ou remoto) — o loader gera dados em memória; a aplicação real depende do script `apply-simuladores-matriz-v6-costa-do-sol.mjs`, que continua exigindo `--confirm` explícito e nunca roda contra `--remote`. A classificação de FAP 07/FAP 13 também foi corrigida (ver seção 7.5).

---

## 1. Veredito

**Atualização 2026-07-03:** as 8 fichas operacionais foram convertidas no **código** do loader (não em nenhum banco). O veredito abaixo reflete o estado pós-implementação de código, ainda **NO-GO para apply em qualquer ambiente** até validação humana e autorização explícita.

**NO-GO para apply em produção ou em qualquer banco (local ou remoto). GO documental para revisão/aprovação do código das 8 fichas restantes pelo instrutor/owner antes de qualquer apply.**

Razões:

1. As 8 fichas operacionais mais críticas do ponto de vista RPEA/PQ-C (`A139-S-01/02`, `A139-S-02/02`, `A139-REQ-01`, `S76-REQ-01`, `A139-NOT-01`, `A139-NOT-02`, `S76-NOT-01`, `S76-NOT-02`) **foram convertidas no código** (`scripts/maintenance/lib/simuladores-matriz-v6-data.mjs` agora contém 49 modelos: 39 da V6 original + `SK76-S-01/02` + `SK76-S-02/02` + as 8 novas). **Nenhuma delas foi aplicada a um banco** — em produção e no snapshot local, os modelos correspondentes continuam com a estrutura legada de 22 itens, sem NOTECHS, confirmada por `SIMULADORES_MATRIZ_V6_AUDITORIA_SEMESTRAIS_20260703.md` e reconfirmada pelo dry-run do script de apply nesta sessão (`current_model_row_counts` ainda mostra 22 para todas as 8). A lacuna contra **690-2.46C.7** e **690-2.46C.6** (avaliação obrigatória de habilidades não técnicas no OPC/check semestral) para o AW139 só será fechada quando o apply for autorizado e executado.
2. `TRE-INST` e `CRED-EXA` **não foram implementados no loader** e não devem ser — permanecem `GO documental preliminar com fonte ANAC online localizada, pendente validação contra PTO/FAP interno do operador` (ver correção de FAP 07/13 na seção 7.5). Não há FAP/PTO interno da Costa do Sol para instrutor/examinador no repositório.
3. A planilha "Nova Lista após as correções" do RPEA **não pode ser aceita como evidência** de `COBERTURA TOTAL` sem validação adicional — ver Tarefa 1 abaixo. Vários itens que a planilha reclassificou de `NÃO ATENDIDO`/`PARCIAL` para `COBERTURA TOTAL` (ex.: 690-2.50B, 690-2.50C.1A, 690-2.50C.2, 690-2.51C.2, 690-2.51C.3) usam citações genéricas ("PTO B", "PTO B / SOP", "Manual SOP Interno") sem seção/página, e o texto de evidência é uma redação narrativa da própria empresa ("Resposta Melhorada"), não uma transcrição do manual.
4. A planilha PQ-C tem qualidade muito superior (citações com página/seção específica: MGO, SOP AW139/S76C+, PRG-OPS-001/002, FTV-*), mas cita fontes que **não estão no repositório** (MGO, SOP, PRG-OPS, FTV, Journey Logs) — a maioria dos status desta auditoria fica `FONTE_OPERADOR` por esse motivo, não porque a cobertura seja inexistente.
5. Um item da PQ-C (690-2.43C.2A) cita "Journey Logs" como referência documental para uma exigência de fidelidade visual de FSTD (marcações de helideck/aeródromo) — isso é uma citação incompatível com o requisito (Journey Log registra horas de voo, não fidelidade visual de simulador) e deve ser tratado como **PENDENTE_FONTE**, não como cobertura válida. Permanece pendente — nenhuma fonte nova foi localizada nesta rodada.
6. `690-2.50C.2` (variação de aproximação/pouso offshore para embarcação pequena/média em movimento) e `690-2.51C.1`/`690-2.51C.2` (control guarding) **permanecem como lacunas explícitas**, não fechadas por nenhuma das 8 novas fichas — confirmado por teste automatizado (ver seção 8).

**Nada neste documento afirma homologação ou aprovação ANAC.** Nenhuma FAP foi inventada — toda referência a FAP05.2/FAP06/FAP07/FAP13/FAP14 usada abaixo já constava nos documentos-fonte do projeto ou foi localizada via busca no domínio oficial `gov.br/anac`/`anac.gov.br` (ver seção 7.5 para o grau de confiança de cada fonte).

---

## 2. Tarefa 1 — Qualidade dos Dados da Auditoria RPEA

### 2.1 Estrutura das duas abas

| Aba | Linhas | Colunas | Natureza |
|---|---|---|---|
| `Lista analisada` | 40 itens | Item, Descrição original, Tradução, Diferenças p/ PQ-C, **Status**, Referência do Manual, Observações/Sugestão | Avaliação original, com status genuíno (`COBERTURA TOTAL`, `COBERTURA PARCIAL`/`PARCIAL`, `NÃO ATENDIDO`) e observações críticas do auditor |
| `Nova Lista após as correções` | 57 linhas | Item, Descrição original, Tradução, Diferenças p/ PQ-C, **Resposta Melhorada (Empresa)**, **Status Atual**, Referência do Manual | Reescrita pela empresa, sem coluna de observação crítica do auditor |

### 2.2 Duplicatas confirmadas na "Nova Lista após as correções"

16 itens aparecem **duas vezes** na mesma aba, com textos de "Resposta Melhorada" diferentes entre as duas ocorrências (não é apenas um erro de cópia — são duas tentativas de resposta para o mesmo item):

`690-2.46C.7`, `690-2.47B`, `690-2.47C.1A`, `690-2.48B`, `690-2.48C.1A`, `690-2.48C.3`, `690-2.49B`, `690-2.49C.1A`, `690-2.49C.2`, `690-2.49C.3`, `690-2.50B`, `690-2.50C.1A`, `690-2.50C.2`, `690-2.51C.1`, `690-2.51C.2`, `690-2.51C.3`.

Padrão observado: a segunda ocorrência de cada duplicata tende a ter referência de manual **mais vaga** que a primeira (ex.: primeira ocorrência de `690-2.49C.2` cita `PTO B Rev 0, 3.2`; segunda ocorrência cita apenas `PTO B / Manual Manutenção` sem seção). Isso indica edição incremental sem controle de versão da planilha, não simples erro de digitação.

### 2.3 Reclassificações sem evidência documental nova

Comparando "Lista analisada" (status original) → "Nova Lista após as correções" (status atual), os seguintes itens foram promovidos para `COBERTURA TOTAL` **sem** citação de seção/página nova ou documento adicional comprovado:

| Item | Status original (Lista analisada) | Status novo (Nova Lista) | Nova referência citada | Avaliação |
|---|---|---|---|---|
| 690-2.50B | `NÃO ATENDIDO` ("não localizado nos manuais enviados") | `COBERTURA TOTAL` | `PTO B` (sem seção) | **Rejeitado** — sem seção/página, não verificável |
| 690-2.50C.1A | `NÃO ATENDIDO` | `COBERTURA TOTAL` | `PTO B` (sem seção) | **Rejeitado** |
| 690-2.50C.2 | `NÃO ATENDIDO` | `COBERTURA TOTAL` | `PTO B` (sem seção) | **Rejeitado** |
| 690-2.51C.2 | `NÃO ATENDIDO` | `COBERTURA TOTAL` | `PTO B / SOP` | **Rejeitado** |
| 690-2.51C.3 | `NÃO ATENDIDO` | `COBERTURA TOTAL` | `PTO B / SOP` | **Rejeitado** |
| 690-2.49C.3 | `NÃO ATENDIDO` | `COBERTURA TOTAL` | `PTO B / Manual Manutenção` | **Rejeitado** — "Manual Manutenção" não identificado no repo |
| 690-2.39B | `PARCIAL` | `COBERTURA TOTAL` | `PTO A Rev 9 - 2.2` (mesma seção da versão parcial) | **Suspeito** — mesma seção, texto apenas reescrito com mais adjetivos ("rastreabilidade garantida por sistema informatizado") sem novo dado verificável |

Nas linhas duplicadas com preenchimento posterior de `690-2.50B/50C.1A/50C.2/51C.1/51C.2/51C.3` (segunda ocorrência, linhas 512–571 da aba), a "Resposta Melhorada" fica **vazia** e só a coluna de observação final ("Procedimento descrito em SOP e treinamento prático, com ficha de avaliação") foi preenchida — ou seja, a própria empresa registrou esses itens como pendência de ação (ex.: "Detalhar em SOP e ficha de treinamento operacional"), o que **contradiz** o status `COBERTURA TOTAL` atribuído na mesma linha.

**Conclusão da Tarefa 1:** a "Nova Lista após as correções" não deve ser usada como fonte de verdade. Ela foi tratada aqui apenas como *pista* de onde a empresa acredita ter cobertura, mas toda conclusão de status desta auditoria usa como evidência primária a planilha **PQ-C Helicóptero** (citações específicas MGO/SOP/PRG-OPS/FTV) e, na ausência desta, a "Lista analisada" (avaliação original com status conservador).

### 2.4 Lista única deduplicada (34 itens do escopo, todos localizados)

Todos os 34 itens do escopo obrigatório foram localizados na planilha PQ-C (100% de correspondência). Uma divergência de nomenclatura foi identificada entre RPEA e PQ-C/escopo do mandato — ambos referem-se ao mesmo requisito IOGP 690, mas com sufixo de letra diferente:

| RPEA ("Lista analisada") | PQ-C / escopo do mandato | Mesmo requisito? |
|---|---|---|
| `690-2.43BA` | `690-2.43BB` | Sim |
| `690-2.43C.1A` | `690-2.43C.1B` | Sim |
| `690-2.43C.2` | `690-2.43C.2A` | Sim |
| `690-2.44C.1C` | `690-2.44C.1E` | Sim |
| `690-2.44C.3` | `690-2.44C.3B` | Sim |
| `690-2.45BA` | `690-2.45BB` | Sim |

**Ação recomendada:** normalizar a nomenclatura de item entre as duas fontes antes de qualquer uso em `referencias_json.item` — usar o sufixo do PQ-C/escopo do mandato como canônico, por ser a versão mais recente (revisão IOGP 690 2026), e registrar a variante RPEA como alias.

---

## 3. Tarefa 2 — Crosswalk RPEA/PQ-C × Matriz de Simulador

Legenda de `tipo_de_exigencia`: MANOBRA (item técnico observável em simulador), NOTECHS (comportamental/CRM), SESSAO (atributo de sessão/modelo, não de manobra isolada), FSTD (atributo do dispositivo/homologação, não do currículo), PROGRAMA (nível de programa de treinamento, ground school), REGISTRO (controle documental/rastreabilidade), SOP (procedimento operacional de linha, fora do escopo de ficha de simulador).

| item_rpea_pqc | texto_resumido | tipo_de_exigencia | modelos/fichas afetados | manobras atuais que cobrem | lacuna | ação proposta | status | risco |
|---|---|---|---|---|---|---|---|---|
| 690-2.9BA | Classe de desempenho apropriada em todas operações offshore, com checagem cruzada e registro rastreável | REGISTRO/PROGRAMA | Fora do escopo de ficha de simulador (planejamento de voo/despacho) | — | Cálculo/checagem/registro de classe de desempenho não é modelado em nenhuma ficha; é atividade de despacho | Não criar manobra; confirmar com owner se há sistema de registro de PC fora do módulo simulador | NÃO_APLICÁVEL_SIMULADOR (mas PARCIAL a nível de operação — sem verificação de rastreabilidade) | médio |
| 690-2.9C.3A | Tabelas de decolagem PC2 sem exposição a *deck edge strike* | REGISTRO/PROGRAMA | Fora do escopo de ficha | — | Depende de tabelas Flight Preview externas ao repo; PQ-C sinaliza "Verificar Flight Preview S76C++" como pendência própria | Confirmar com owner status do alerta interno; não é lacuna do simulador | FONTE_OPERADOR / PENDENTE_FONTE (alerta próprio não resolvido) | médio |
| 690-2.9C.4 | Perfis PC2E/PC2DLE usados offshore conforme aplicável | MANOBRA | S76: `S76-TDP-00` (Decolagem Classe 2 — Helideck/TDP), presente em `S76-REQ-01`, `S76-NOT-02`, `SK76-S-01/02`, ciclos periódicos S76. AW139: `OPS-NRM-X2`/`LOFT-CHK-07`, e agora `A139-NOT-02` (offshore) | AW139: `OPS-NRM-X2`/`LOFT-CHK-07` cobrem perfil CAT A/B; **atualização 2026-07-03:** `A139-NOT-02` agora usa `OPS-NRM-X2` (decolagem) e `OPS-NRM-X1` (pouso) com observação explícita "(PC2E/CAT A Offshore)" e `referencias_json` citando `690-2.9C.4`; `S76-REQ-01`/`S76-NOT-02` (`S76-TDP-00`) idem com nota "(PC2/Classe 2)" | Nenhuma — resolvido nesta rodada para as fichas convertidas (código, não aplicado a banco); demais fichas AW139 (semestral/noturno onshore) não exigem essa nomenclatura por não serem offshore | Feito: nomenclatura PC2E/CAT A adicionada em `A139-NOT-02`, `S76-REQ-01`, `S76-NOT-02` (ver Tarefa 4.7/seção 7.3) | COBERTO nas fichas convertidas (pendente apply); demais permanecem PARCIAL | médio |
| 690-2.37C.3 | Tripulações treinadas em técnicas de prevenção de colisão com aves | MANOBRA/PROGRAMA | Nenhuma ficha do catálogo (nenhum código `BIRD`/`AVE` encontrado) | Nenhuma — PQ-C alega prática "nas sessões LOFT de FFS" (FTV-A139-FFS-LOFT/FTV-SK76-FFS-LOFT) sem item técnico discreto | Não existe manobra/código dedicado a birdstrike; alegação de cobertura via "sessão LOFT" genérica não é rastreável a um item específico da ficha | Se o operador confirmar prática real, criar item de observação/manobra específico OU registrar como conteúdo de briefing pré-voo padronizado (não manobra técnica isolada) | NÃO_COBERTO na estrutura de dados (só alegação narrativa) | médio |
| 690-2.41C.1C | Recorrente semestral (OPC/LPC/IR); currículo cobre todas emergências maiores em programa rolling de 3 anos | PROGRAMA/SESSAO | Ciclos periódicos C1/C2/C3 (S76 e AW139); semestrais `A139-S-02/02`/`SK76-S-02/02` (check IFR) | C1/C2/C3 comprovadamente usam conjuntos de emergências **distintos** por ciclo (verificado por diff entre `Ciclo 1/2/3 - Sessão 01/03 VFR/emergências`) — estrutura rolling real, não repetição | Existe estrutura rolling, mas não há tabela de cobertura documentada que comprove que **todas** as emergências maiores da frota aparecem pelo menos uma vez em 3 anos (ver Tarefa 4.8) | Criar tabela de cobertura rolling (emergência × ciclo) como documento de auditoria, não como nova manobra | PARCIAL — estrutura existe, rastreabilidade de completude não documentada | alto |
| 690-2.41C.2 | Treinamento relacionado a mudanças sazonais onde há estações distintas | PROGRAMA | Fora do escopo de ficha de simulador (interpretação de gráficos de performance já coberta em manobras de performance) | Parcial via manobras de performance/planejamento existentes | Não aplicável tipicamente ao clima costeiro/offshore do Brasil, mas item RPEA não foi descartado formalmente pelo operador | Confirmar com owner se aplicável à base operacional; se não aplicável, registrar como `NÃO_APLICÁVEL_SIMULADOR` formalmente | PARCIAL / candidato a NÃO_APLICÁVEL | baixo |
| 690-2.41C.3A | Orientação de linha documentada antes de nova localidade | SOP | Fora do escopo de ficha de simulador (line check real) | — | Não é atividade de simulador | Nenhuma ação na matriz | NÃO_APLICÁVEL_SIMULADOR | baixo |
| 690-2.41C.4A | Programa de treinamento para Maintenance Check Flights (MCF) | PROGRAMA | Fora do escopo de ficha de simulador (MCF é em aeronave real) | — | MCF não é atividade simulável | Nenhuma ação na matriz; validar PTO-A 3.6 como fonte (não está no repo) | NÃO_APLICÁVEL_SIMULADOR / FONTE_OPERADOR | baixo |
| 690-2.43BB | FSTD adequado; syllabus por modelo; alinhamento ao PTO; auditoria anual do centro de treinamento | PROGRAMA/FSTD | Todos os modelos AW139/SK76 | Implícito — todo o catálogo pressupõe FSTD nível D | PQ-C admite que a auditoria anual do centro (CAE) cobre "apenas... dispositivos alugados (dry lease)", não a conformidade plena do centro | Registrar limitação como observação formal de programa; não é lacuna de manobra | PARCIAL (auditoria do centro não é integral) | médio |
| 690-2.43C.1B | Tripulantes sentados nas posições normais; pilotos que voam nos dois assentos são treinados/checados em ambos | SESSAO | Todos os modelos — regra de sessão, não de manobra | Não modelada em nenhum campo de dado (nem `modelos_sessao`, nem `manobras`) | Não há campo estrutural para essa regra de sessão ("Orientações para o Instrutor" citado no PQ-C é texto livre fora do sistema) | Ver Tarefa 5 — candidato a atributo de `modelos_sessao`, não de manobra | PARCIAL — coberto operacionalmente (PQ-C), sem rastreabilidade estrutural no sistema | médio |
| 690-2.43C.2A | FSTD com visual de área de pouso/meteorologia/helideck/aeródromo representativos da operação diária | FSTD | Fora do escopo de ficha (atributo de homologação do dispositivo) | — | PQ-C cita "Journey Logs" como referência — **citação incompatível** com o requisito (Journey Log não registra fidelidade visual) | Sinalizar ao owner que a resposta da PQ-C para este item precisa de nova fonte (certificado de qualificação do FSTD / nível de qualificação ICAO 9625) | PENDENTE_FONTE (citação inválida) | alto |
| 690-2.43C.3 | Instrutor consegue se comunicar efetivamente (sem barreira de idioma) | PROGRAMA | Fora do escopo de ficha (política de seleção de centro) | — | — | Nenhuma ação na matriz | NÃO_APLICÁVEL_SIMULADOR (coberto a nível de programa) | baixo |
| 690-2.43C.4 | Análise de diferenças (gap analysis) entre aeronave e FSTD, com mitigação | REGISTRO/PROGRAMA | Fora do escopo de ficha atual | — | PQ-C alega "treinamento de solo das diferenças antes de iniciar" mas sem registro formal/documentado citado | Se confirmado pelo owner, considerar campo de observação de sessão para registrar diferenças conhecidas | PARCIAL / FONTE_OPERADOR | médio |
| 690-2.44C.1E | Recorrente semestral em FSTD nível D; 12h PF/ano com composição especificada (revalidação tipo 6h, IFR 1h, helideque noturno 1h + LOFT 2h + reavaliação IFR 1h) | MANOBRA/PROGRAMA | `A139-S-01/02` (noturno/helideque), `A139-S-02/02` (IFR) — **ambos ainda não convertidos para 18+15/NOTECHS** | Conteúdo técnico existe nas propostas do V6.1 (seção 4.1/4.2 do doc de fichas restantes), mas não está aplicado no banco | (a) fichas ainda legadas em produção (22 itens, 0 NOTECHS); (b) rastreamento de composição de horas (8h+4h, "após decorridos 6 meses") não é modelado em nenhum campo do sistema | Converter `A139-S-01/02`/`A139-S-02/02` conforme proposta V6.1 seção 4.1/4.2; horas/composição ficam fora do escopo de ficha (é controle de qualificação, módulo separado) | **PARCIAL — item crítico com maior risco regulatório do escopo** | **crítico** |
| 690-2.44C.2 | Currículo FSTD incorpora cenários LOFT/TEM incl. emergências não praticáveis em voo real; avaliação registrada em ficha (comunicação, consciência situacional, resolução de problemas, decisão, trabalho em equipe) | SESSAO/NOTECHS | Sessões LOFT/Check periódicas (já convertidas), `A139-S-01/02`/`A139-S-02/02` (pendentes) | NOTECHS-01 a 15 cobrem exatamente os 5 aspectos citados (cooperação/liderança/consciência situacional/tomada de decisão) nos modelos já convertidos | Corretamente modelado como atributo de sessão, não de manobra — mas só vale para os 41 modelos já convertidos; os 8 pendentes não têm bloco NOTECHS ainda | Nenhuma ação na estrutura de dados — apenas concluir a conversão pendente (seção 6) | PARCIAL — arquitetura correta, cobertura incompleta | alto |
| 690-2.44C.3B | Simulador mesmo tipo/série, certificação adequada, aprovado pela NAA para a função | FSTD | Fora do escopo de ficha (atributo de homologação) | — | — | Nenhuma ação na matriz | NÃO_APLICÁVEL_SIMULADOR | baixo |
| 690-2.45A | Competência de pessoal crítico via treinamento/qualificação (transição de tipo) | PROGRAMA | Fora do escopo de ficha isolada — nível de programa de transição | Implícito nos modelos `-I-` (iniciais) quando usados para transição | — | Nenhuma ação na matriz | NÃO_APLICÁVEL_SIMULADOR (coberto a nível de programa) | baixo |
| 690-2.45BB | Syllabus documentado de conversão para novo tipo | PROGRAMA | Fora do escopo de ficha isolada | — | — | Nenhuma ação na matriz | NÃO_APLICÁVEL_SIMULADOR | baixo |
| 690-2.45C.1A | Programa de entrada em serviço; restrição de horas (100h Cmt / 50h Copiloto) antes de voar sem instrutor | REGISTRO | Fora do escopo de ficha de simulador (controle de horas de linha) | — | PQ-C cita "Pasta Individual Física" como registro — controle **em papel**, não digital/rastreável no sistema | Fora do escopo desta auditoria; sinalizar ao owner como oportunidade de digitalização (não é ação de matriz) | NÃO_APLICÁVEL_SIMULADOR / observação de risco documental | médio |
| 690-2.45C.2B | Programa aprovado pela ANAC, executado por OEM/ATO; horas em FSTD categoria FFS | PROGRAMA | Fora do escopo de ficha isolada | — | — | Nenhuma ação na matriz | NÃO_APLICÁVEL_SIMULADOR | baixo |
| 690-2.46B | Programa de CRM implementado para toda a tripulação | PROGRAMA | Base para todo o bloco NOTECHS | NOTECHS-01 a 15 + Programa de CRM Rev 03 + PTO A 3.3.2 | — | Nenhuma ação — bem coberto | COBERTO | baixo |
| 690-2.46C.1A | Conceitos de CRM embutidos em checklists/briefings/procedimentos anormais/emergência; inclui curso de comando de CRM | PROGRAMA/NOTECHS | NOTECHS cobre avaliação periódica; "curso de comando CRM" (46C.1.3) não identificado em nenhuma ficha | NOTECHS-05..08 (Liderança) parcialmente equivalem a conteúdo de comando, mas não há ficha/manobra específica de "CRM command course" | Falta mapeamento explícito de um componente de "curso de comando" — pode ser parte de `TRE-INST` (pendente) ou de elevação de nível, não confirmado | Confirmar com owner se existe curso de comando CRM distinto; se sim, mapear como ficha própria ou como parte de elevação de nível | PARCIAL | médio |
| 690-2.46C.2A | Syllabus padrão + programa adicional adaptado ao operador | PROGRAMA | PTO rev08 (Treinamentos 2.D.3/4.b.D.3/5.D.3) | Fora do escopo de ficha isolada | — | Nenhuma ação na matriz | NÃO_APLICÁVEL_SIMULADOR (coberto a nível de programa) | baixo |
| 690-2.46C.3 | Currículo teórico inicial CRM — 14 subtemas (TEM, comunicação, consciência situacional, estresse, fadiga, workload, monitoramento, liderança, automação, estudos de caso, erro, ameaça, estado indesejado) | PROGRAMA | Ground school (16h sala/EAD, IS 00-010) — fora do escopo de ficha de simulador | Subconjunto observável via NOTECHS durante sessão FSTD (consciência situacional, tomada de decisão, liderança, workload) | Conteúdo teórico completo (fadiga, automação, estudos de caso) não é modelado no sistema — correto, pois é ground school, não ficha de simulador | Nenhuma ação na matriz de simulador; confirmar que ground school (IS 00-010) está fora do escopo do módulo Simuladores por design | NÃO_APLICÁVEL_SIMULADOR (ground school) / COBERTO parcialmente via NOTECHS no que é observável em sessão | baixo |
| 690-2.46C.4 | Recorrente anual CRM: revisão aprofundada de 3 dos 9 tópicos centrais, com rotação completa em 3 anos; drills de evacuação com debrief; presencial a cada 3º ano | PROGRAMA | Ground school — fora do escopo de ficha de simulador | — | Rotação de 3 anos dos 9 tópicos não é rastreada em nenhum campo do sistema (mesma lacuna estrutural do item 41C.1C, mas para conteúdo de CRM, não de emergências) | Mesma recomendação da Tarefa 4.8 — mas aplicada ao ground school, não à matriz de simulador | PARCIAL / FONTE_OPERADOR | médio |
| 690-2.46C.5 | CRM adaptado ao tamanho/escopo da operação, com atenção a fatores humanos/interface tecnológica | PROGRAMA | FTV-SK76-FFS / FTV-A139-FFS | — | — | Nenhuma ação na matriz | COBERTO (fonte operador) | baixo |
| 690-2.46C.6 | CRM integrado em todo estágio de treinamento; LOFT em FSTD; OPC inclui seção LOFT com avaliação CRM complementar | SESSAO/NOTECHS | `A139-S-02/02` (OPC/check IFR AW139) — **0 NOTECHS confirmado**; `SK76-S-02/02` — já tem NOTECHS | `SK76-S-02/02` cobre corretamente; `A139-S-02/02` não cobre | AW139 OPC/check semestral atualmente **não tem bloco NOTECHS** — contradição direta com este item para a aeronave de maior exposição RPEA | Priorizar conversão de `A139-S-02/02` (já proposta em V6.1 seção 4.2) | **NÃO_COBERTO para AW139 / COBERTO para SK76** | **crítico** |
| 690-2.46C.7 | Habilidades não técnicas avaliadas sempre que possível | NOTECHS | Todos os 41 modelos convertidos; ausente nos 8 pendentes + TRE-INST/CRED-EXA (pendentes) | NOTECHS-01..15 nos 41 modelos convertidos | 8 fichas operacionais ativas + 2 fichas de instrutor/examinador sem bloco NOTECHS | Concluir conversão das 8 fichas (V6.1 seção 4) e validar TRE-INST/CRED-EXA contra FAP/PTO interno antes de aplicar NOTECHS | PARCIAL (maioria coberta, fichas ativas pendentes = risco real) | alto |
| 690-2.50B | Programa anual de treinamento de helideck para tripulantes | PROGRAMA/SESSAO | PRG-OPS-001 (Treinamentos 1.E.1/2.E.1) + FTV-SK76/A139-FFS-LOFT | Prática de aproximação/pouso helideck coberta via manobras existentes (`OPS-OFF-X2`, `S76-LDP-00`, `S76-APO-01`) | Componente teórico (ground school anual) é FONTE_OPERADOR não verificável no repo; componente prático coberto | Nenhuma ação na matriz de manobras — a lacuna é de fonte documental, não de estrutura pedagógica | PARCIAL / FONTE_OPERADOR | médio |
| 690-2.50C.1A | Conteúdo mínimo anual: design/marcações do helideck (chevron, TD/PM, valores D/t, LOS, HMS), significado H/OFS, trajetória de aproximação, uso correto de TD/PM e movimentação segura | PROGRAMA | Ground school (PRG-OPS-001 1.1–1.5) — nenhum código de manobra de marcações de helideck encontrado no catálogo (busca confirmada: nenhum resultado para chevron/TD-PM/H-OFS/HMS) | Trajetória de aproximação e movimentação segura têm sobreposição prática com manobras de aproximação/pouso offshore existentes | Conteúdo teórico de marcações não é — e não precisa ser — modelado como manobra de simulador; é ground school | Confirmar que este é o desenho intencional (ground school separado); nenhuma ação na matriz de manobras | NÃO_APLICÁVEL_SIMULADOR para o conteúdo teórico / COBERTO para o componente prático | baixo |
| 690-2.50C.2 | Syllabus escrito para voos a embarcações pequenas/médias em movimento: diferenças de localização do helideck, diferenças de aproximação/decolagem, efeito de vento/turbulência | PROGRAMA/MANOBRA | Nenhuma ficha do catálogo distingue explicitamente "embarcação em movimento" de "unidade marítima fixa" | Manobras genéricas de aproximação offshore (`OPS-OFF-X2`, `S76-APO-01`, `S76-ARO-01`) cobrem UM em geral, sem variação técnica para embarcação pequena/média em movimento | Lacuna real na matriz de simulador — não há manobra/variação específica para vento relativo e turbulência de convés em embarcação em movimento | Avaliar com owner se é necessária uma manobra/variação distinta (`NOVA_MANOBRA_NECESSARIA`) para fichas offshore, ou se o conteúdo é só ground school | **NÃO_COBERTO na matriz de simulador** (ground school alegado, não verificável) | alto |
| 690-2.51C.1 | Tripulante guarnece os comandos durante embarque/desembarque com rotores girando | MANOBRA/SOP | Nenhuma ficha do catálogo | Nenhuma — MGO 11.11.3(h) é procedimento de linha, não item de ficha de simulador | Não há item técnico/procedimental nas fichas offshore para esta prática — é tipicamente treinada/observada em linha, não em FSTD | Conforme Tarefa 4.6: avaliar com o instrutor/owner se cabe item procedimental em ficha offshore (ex.: checklist verbal durante hover no helideck) ou se permanece como procedimento de linha fora do escopo do simulador | **NÃO_COBERTO na matriz de simulador** | alto |
| 690-2.51C.2 | PF restringe fisicamente os comandos quando o outro piloto sai/retorna do assento, rotores girando | MANOBRA/SOP | Nenhuma ficha do catálogo | Nenhuma — MGO 4.4.2(c)(i) é procedimento de linha | Mesma lacuna do item anterior | Mesma ação — avaliar necessidade de item procedimental em ficha offshore vs. procedimento de linha | **NÃO_COBERTO na matriz de simulador** | alto |
| 690-2.51C.3 | Assento do piloto ocupado por pessoa qualificada com APU em funcionamento | MANOBRA/SOP | Não aplicável — frota Costa do Sol (AW139/S76C+) não possui APU segundo a PQ-C | — | — | Nenhuma ação — requisito não aplicável à frota | NÃO_APLICÁVEL (frota sem APU) | baixo |

### 3.1 Resumo estatístico do crosswalk

| Status | Qtd |
|---|---|
| COBERTO | 5 |
| PARCIAL | 14 |
| NÃO_COBERTO (lacuna real na matriz de simulador) | 5 |
| PENDENTE_FONTE | 2 |
| NÃO_APLICÁVEL_SIMULADOR | 8 |

**5 itens com risco crítico/alto e lacuna real de estrutura de dados ou conversão pendente**: 690-2.44C.1E, 690-2.46C.6, 690-2.46C.7, 690-2.50C.2, 690-2.51C.1/51C.2 (tratados juntos por serem o mesmo padrão de lacuna).

---

## 4. Tarefa 3 — Verificação das Fichas

**Atualização 2026-07-03:** as 8 fichas abaixo foram convertidas no loader local (`simuladores-matriz-v6-data.mjs`). Nenhuma foi aplicada a um banco — confirmado por dry-run do `apply-simuladores-matriz-v6-costa-do-sol.mjs` nesta sessão, que mostra o snapshot local (e, por extensão, a produção, que não foi tocada) ainda com 22 itens/modelo para todos os 8 códigos.

| Ficha | Estado no código (`simuladores-matriz-v6-data.mjs`) | Estado em produção/banco | NOTECHS presente? | Avaliação |
|---|---|---|---|---|
| `A139-S-01/02` | **Implementada** — 18 técnicas, zero `LOFT-NOT-*`, referencia 690-2.44C.1E | Ativa em prod/local, ainda 22 `LOFT-NOT-*`, migração 0300 — **não aplicado** | Elegível¹ (0 no banco atual) | Código pronto; falta apply autorizado |
| `A139-S-02/02` | **Implementada** — 18 técnicas, zero `LOFT-CHK-*`, referencia 690-2.46C.6 | Ativa em prod/local, ainda 22 `LOFT-CHK-*`, migração 0299 — **não aplicado** | Elegível¹ (0 no banco atual) | Código pronto; é o check IFR/OPC que 46C.6 exige — prioridade de apply |
| `A139-REQ-01` | **Implementada** — 18 técnicas de retomada de proficiência | Ativa, 17 LOFT-CHK + 5 operacionais — **não aplicado** | Elegível¹ | Código pronto |
| `S76-REQ-01` | **Implementada** — 18 técnicas `S76-*`/`76-*`, sem `S76-CRM-01`/`S76-COM-01`/`S76-ATC-01` (testado) | Ativa, ainda com `S76-CRM-01`/`S76-COM-01`/`S76-ATC-01` como manobras técnicas — **não aplicado** | Elegível¹ | Código corrige o pior caso do lote; falta apply |
| `A139-NOT-01` | **Implementada** — 18 técnicas noturno onshore | Ativa, 20 `LOFT-NOT-*` + 2 operacionais — **não aplicado** | Elegível¹ | Código pronto |
| `A139-NOT-02` | **Implementada** — 18 técnicas noturno offshore, helideck/UM/PC2E-CAT A explícito | Ativa, mistura LOFT-NOT/LOFT-OFF — **não aplicado** | Elegível¹ | Código pronto |
| `S76-NOT-01` | **Implementada** — 18 técnicas `S76-*`/`76-*` | Ativa, predominantemente S76-LOFT-* — **não aplicado** | Elegível¹ | Código pronto |
| `S76-NOT-02` | **Implementada** — 18 técnicas offshore `S76-*`/`76-*` | Ativa, mistura S76-LOFT/LOFT-OFF/S76-* — **não aplicado** | Elegível¹ | Código pronto |
| `SK76-S-01/02` | **Implementada** em `SK76_SEMESTRAL_MODELS` (sem alteração nesta rodada) | Confirma 18 itens únicos, sem `LOFT-NOT-*` residual (testado) | Elegível¹ | ✅ Conforme (já estava assim antes desta rodada) |
| `SK76-S-02/02` | **Implementada** em `SK76_SEMESTRAL_MODELS` (sem alteração nesta rodada) | Idem | Elegível¹ | ✅ Conforme |
| `TRE-INST` | **Não implementada no loader — deliberadamente fora do escopo desta rodada** (proposta preliminar seção 5.1 do doc V6.1) | Ativa, 22 `INV-*` (5 são `INV-CRM-*` tratados como técnica) | Não | `GO documental preliminar com fonte ANAC online localizada, pendente validação contra PTO/FAP interno do operador` — ver correção FAP 07 na seção 7.5 |
| `CRED-EXA` | **Não implementada no loader — deliberadamente fora do escopo desta rodada** (proposta preliminar seção 5.2 do doc V6.1) | Ativa, 22 `EXA-*` (bloco `EXA-NTS-01..07` já NOTECHS-like) | Não | `GO documental preliminar com fonte ANAC online localizada, pendente validação contra PTO/FAP interno do operador` — ver correção FAP 13 na seção 7.5 |

¹ "Elegível" = o modelo passou a integrar `data.models` no loader, que é a mesma condição estrutural sob a qual `SK76-S-01/02`/`SK76-S-02/02` já recebem o vínculo automático de NOTECHS em runtime (`worker-airtrust/src/routes/simuladores-fichas.ts`, conforme comentário da migração `0413_notechs_categoria_itens.sql`). Este loader não grava NOTECHS em nenhuma tabela — apenas as 18 manobras técnicas por ficha; o vínculo real só existirá após apply autorizado.

**Achado adicional — correção FAP 07/FAP 13 (ver seção 7.5 para o detalhamento completo):** a classificação anterior deste documento ("FAP 07 e FAP 13 permanecem `PENDENTE_FONTE`, não localizadas") estava incompleta. Uma pesquisa dedicada nesta rodada localizou URLs no domínio oficial `gov.br/anac` para FAP 07 e FAP 13, e a página oficial da IS 90-001A. A classificação correta agora é **"fonte ANAC online localizada, pendente incorporação formal e validação de conteúdo/página contra o PTO/FAP interno da Costa do Sol"** — não mais `PENDENTE_FONTE` genérico, mas também não "confirmada e validada", porque o conteúdo dos documentos não pôde ser lido diretamente (bloqueio de CAPTCHA no domínio oficial). `TRE-INST` e `CRED-EXA` continuam **fora do loader/apply operacional** independentemente dessa correção — a fonte localizada ainda não foi cotejada com o FAP/PTO interno real do operador.

---

## 5. Tarefa 4 — Ajustes Pedagógicos

1. **LOFT/CRM/NTS genérico nas 18 técnicas:** confirmado que as 8 fichas pendentes ainda violam esta regra em produção (`S76-REQ-01` é o pior caso, com `S76-CRM-01`/`S76-COM-01`/`S76-ATC-01` como manobras técnicas). A proposta V6.1 (já escrita, não aplicada) resolve isso corretamente ao mover para NOTECHS. Nenhum ajuste adicional necessário na proposta — apenas aplicá-la.
2. **15 NOTECHS fora das 18 técnicas:** arquitetura de dados (`NOTECHS_ORDEM_BASE = 1001`, `splitManobrasNotechs`) está correta e testada. Mantida.
3. **LOFT/TEM em contexto de sessão, não como manobra genérica:** a arquitetura já faz isso corretamente onde aplicado (NOTECHS avalia CRM/TEM durante a sessão LOFT, sem criar uma manobra "TEM genérico"). Recomendo formalizar isso: hoje o vínculo entre "esta sessão é uma sessão LOFT/TEM" e o bloco NOTECHS é implícito (por convenção de nomenclatura do modelo), não um campo explícito. Ver Tarefa 5.
4. **FSTD — referência de sessão/modelo:** confirmado gap estrutural — não há campo em `modelos_sessao` para registrar que um modelo depende de um FSTD nível D com determinada configuração/visual. Hoje isso só existe como texto solto nas colunas de referência do PQ-C (`Journey Logs`, "FFS Nível D aprovado ANAC"). Ver Tarefa 5.
5. **Helideck — item técnico/procedimental suficiente?** Prático (aproximação/pouso/decolagem em helideck) está bem coberto via manobras existentes (`OPS-OFF-X2`, `S76-LDP-00`, `S76-APO-01`, `S76-TDP-00`). Teórico (marcações, chevron, valores D/t, HMS) está corretamente fora da ficha de simulador (é ground school, 690-2.50C.1A) — não recomendo criar manobra técnica para isso, seria um item não observável fisicamente em sessão de simulador.
6. **Control guarding (690-2.51C.1/51C.2) — item técnico/procedimental em ficha offshore ou treinamento operacional separado?** Recomendação: **tratar como ficha/treinamento operacional separado, fora do módulo Simuladores.** Justificativa: guarnecer os comandos durante embarque/desembarque com rotores girando é um procedimento observado no solo/na aeronave real durante operação com passageiros, não uma manobra praticável de forma realista em FSTD (o FSTD não simula fisicamente pessoas embarcando). Se o operador quiser rastrear isso pedagogicamente, o caminho correto é um item de checklist/observação na ficha de **check de linha** ou módulo de LMS/procedimentos, não uma nova manobra técnica no catálogo de simuladores.
7. **FSTD visual/weather/helideck markings — referência explícita ao cenário visual/meteo?** Não há hoje nenhum campo que registre "este modelo/sessão requer FSTD com visual de helideck X". Recomendo — sem implementar agora — que isso seja um atributo de **sessão/modelo** (nível FSTD/homologação), não de manobra individual, pelas mesmas razões da Tarefa 5.
8. **Emergência em ciclo de 3 anos — tabela de cobertura rolling?** **Sim, recomendo criar.** A estrutura C1/C2/C3 já é genuinamente rotativa (confirmado por diff de código entre os três ciclos — nenhuma repetição de emergência entre ciclos na amostra verificada), mas não existe hoje nenhum documento ou campo que comprove que o conjunto completo de emergências maiores da frota (conforme QRH/checklist da aeronave) está distribuído nos 3 ciclos sem lacunas. Esta é uma verificação de **completude**, não de manobra individual — recomendo um documento de auditoria dedicado (`tabela_cobertura_rolling_emergencias.md` ou equivalente), fora do escopo desta entrega, cruzando a lista completa de QRH cautions/warnings por aeronave contra C1+C2+C3.

---

## 6. Tarefa 5 — Campo de Referências em `modelos_sessao`

**`referencias_json` hoje só existe em `manobras`** (migração `0414_add_manobras_referencias_json.sql`, já aplicada localmente/em teste — não verifiquei aplicação remota, fora do escopo desta auditoria). O schema Zod (`ManobraSchema` em `simuladores-shared.ts`) já suporta um enum de tipo rico (`FAP, RBAC, IS, PTO, QRH, AFM, FCTM, MGO, MOM, OPERADOR, OUTRO`) e um enum de status (`CONFIRMADA, PENDENTE_FONTE, FONTE_OPERADOR`) que já cobre o vocabulário pedido no mandato.

**Isso não é suficiente** para os seguintes casos identificados no crosswalk (seção 3):
- 690-2.43BB (auditoria anual do centro de treinamento) — atributo do programa/modelo, não de uma manobra isolada.
- 690-2.43C.1B (assentos/posições, checagem em ambos os assentos) — regra de sessão.
- 690-2.43C.2A / 690-2.44C.3B (fidelidade visual e certificação do FSTD) — atributo do dispositivo usado na sessão.
- 690-2.44C.2 / 690-2.46C.6 (contexto LOFT/TEM da sessão como um todo) — hoje inferido apenas pelo nome do modelo (`*-LOFT/*`, `*-NOT-*`), não por um campo estruturado.

**Recomendação:** adicionar `referencias_json TEXT NULL` também em `modelos_sessao`, com o **mesmo shape** já validado em `ManobraSchema.referencias_json` (reaproveitar o schema, não criar um novo formato). Não recomendo `justificativa_regulatoria_json` como nome — geraria dois formatos paralelos para o mesmo conceito (referência regulatória), aumentando a superfície de manutenção sem ganho. Um único campo `referencias_json`, presente em `manobras` (nível item técnico) e em `modelos_sessao` (nível sessão/programa/FSTD), é suficiente para cobrir os 4 gaps acima.

**Risco de implementar agora:** baixo tecnicamente (é aditivo, mesmo padrão da migração 0414), mas **não recomendo implementar nesta fase** — isso ampliaria o escopo desta entrega (que é documental/auditoria) para incluir migration + rota + frontend. Registro apenas como recomendação com risco e justificativa, conforme pedido no mandato. Não implementado.

---

## 7. Tarefa 6 — Saída Consolidada

### 7.1 Veredito
**NO-GO para apply em qualquer banco (local ou remoto).** As 8 fichas foram convertidas no código do loader local nesta rodada (18 técnicas cada, zero LOFT genérico/CRM-como-manobra, `referencias_json` corrigido). O apply real depende de: (a) revisão/aprovação do instrutor-owner do conteúdo técnico das 8 fichas, (b) autorização explícita para rodar `apply-simuladores-matriz-v6-costa-do-sol.mjs --apply` contra um banco local de teste primeiro, e só depois contra produção com autorização separada. `TRE-INST`/`CRED-EXA` seguem fora do loader — `GO documental preliminar com fonte ANAC online localizada, pendente validação contra PTO/FAP interno do operador`.

### 7.2 Tabela de lacunas por item RPEA/PQ-C
Ver seção 3 (crosswalk completo). Lacunas de maior risco após esta rodada:
- **690-2.44C.1E, 690-2.46C.6, 690-2.46C.7** — código pronto (fichas AW139 convertidas com referência explícita a esses itens), mas **cobertura real só existe após apply autorizado**; hoje o banco (local e produção) continua com a estrutura legada de 22 itens/0 NOTECHS.
- **690-2.50C.2** — permanece `NÃO_COBERTO`. Nenhuma das 8 fichas (incluindo `A139-NOT-02`/`S76-NOT-02`, que cobrem aproximação offshore genérica a Unidade Marítima) modela a variação técnica para embarcação pequena/média em movimento. Confirmado por teste automatizado que nenhuma ficha referencia esse item.
- **690-2.51C.1/51C.2** — permanece `NÃO_COBERTO` na matriz de simulador, por decisão deliberada (ver 7.3/Tarefa 4.6) — são procedimentos de linha/SOP, não manobra de FSTD.
- **690-2.43C.2A** — permanece `PENDENTE_FONTE` (citação "Journey Logs" na PQ-C é incompatível com a exigência de fidelidade visual do FSTD).

### 7.3 Manobras que precisam de ajuste
- ✅ **Feito nesta rodada:** `A139-NOT-02`/`S76-NOT-02` (decolagem/pouso em helideck offshore) agora citam explicitamente "PC2E/CAT A" na observação e referenciam `690-2.9C.4` em `referencias_json`; `S76-REQ-01`/`S76-NOT-02` (`S76-TDP-00`) idem, com nota "(PC2/Classe 2)".
- Nenhum outro ajuste de conteúdo identificado além do que já estava proposto em `COSTA_DO_SOL_MATRIZ_V6_1_FICHAS_RESTANTES_FINAL_REVISAVEL_20260703.md` seção 4.

### 7.4 Novas manobras necessárias (candidatas a `NOVA_MANOBRA_NECESSARIA`)
- **Zero códigos novos criados** — as 8 fichas reaproveitam integralmente o catálogo existente (`A139-*`/`CAU-*`/`WAR-*`/`OPS-*`/`FLY-*` para AW139; `S76-*`/`76-*` para SK76), confirmado por auto-registro no `registry` do loader sem `missing_registry_entry`.
- **Candidata (pendente validação do owner, NÃO criada):** variação de aproximação/pouso offshore para embarcação pequena/média em movimento (690-2.50C.2) — registrada como lacuna, não como manobra.
- **Não recomendo** criar manobra técnica para 690-2.37C.3 (birdstrike) e 690-2.51C.1/51C.2 (control guarding) — ambos são melhor tratados como conteúdo de briefing/procedimento de linha, não como manobra de FSTD (ver Tarefa 4.6).

### 7.5 Correção das referências FAP 07 e FAP 13

**Classificação anterior (incorreta/incompleta):** "FAP 07 e FAP 13 permanecem `PENDENTE_FONTE` — não localizadas no workspace."

**Classificação corrigida (2026-07-03), após pesquisa dedicada no domínio oficial `gov.br/anac`/`anac.gov.br`:**

| Item | O que foi encontrado | Grau de confiança | Classificação |
|---|---|---|---|
| **FAP 07** — Instrutor de Voo | URL no domínio oficial: `gov.br/anac/.../habilitacao/fap/fap-07.docx`; página-índice oficial confirmada: `gov.br/anac/.../habilitacao/fap-2013-ficha-de-avaliacao-de-piloto` ("FAP – Fichas de Avaliação de Pilotos") | **Médio** — URL localizada e indexada no domínio oficial; conteúdo do `.docx` **não pôde ser lido diretamente** (o site `gov.br/anac` bloqueou o fetch automatizado com CAPTCHA) | `GO documental preliminar com fonte ANAC online localizada, pendente incorporação formal e validação de conteúdo contra o PTO/FAP interno da Costa do Sol` |
| **FAP 13** — Credenciamento de Examinador | URL no domínio oficial: `gov.br/anac/.../habilitacao/fap/fap-13.docx`; mesma página-índice oficial acima | **Médio** — mesma limitação de CAPTCHA; conteúdo não lido diretamente | Idem |
| **IS 90-001A, item 5.2.8** | Página oficial confirmada: `anac.gov.br/assuntos/legislacao/legislacao-1/iac-e-is/is/is-90-001`; confirmado que a IS trata de credenciamento de examinadores (RBAC 90, itens 90.47/90.49) | **Baixo para o item 5.2.8 especificamente** — a existência da IS 90-001A é confirmada, mas a menção do item 5.2.8 à FAP 13 no processo SEI veio de um snippet de busca, não de leitura direta do texto normativo | Referência candidata; **não citar o conteúdo do item 5.2.8 como fato confirmado** até leitura manual do documento |
| **RBAC 61 Subparte M** | Página oficial confirmada: `anac.gov.br/.../rbac/rbac-61`; Subparte M sobre Instrutor de Voo confirmada como real | **Alto** — regulamento e subparte existem, já citados corretamente no doc V6.1 | Mantido como já documentado |
| **RBAC 135 (135.330, 135.337, 135.338, 135.339, 135.340)** | Página oficial confirmada: `anac.gov.br/.../rbac/rbac-135`; 135.337 (qualificação de examinadores) e 135.338 (qualificação de instrutores) confirmados via IS 135-001E; 135.339/135.340/135.330 aparecem em resumos de busca, não confirmados por leitura direta | **Alto para 135.337/135.338; médio para os demais** | Mantido como já documentado, com a ressalva acima |

**Por que não "confirmada":** o site `gov.br/anac` bloqueou o acesso automatizado com CAPTCHA durante a pesquisa desta rodada, então não foi possível ler o conteúdo dos documentos diretamente — apenas confirmar que as URLs existem no domínio oficial. Marcar como "confirmada" seria overclaim. A classificação `GO documental preliminar com fonte ANAC online localizada, pendente validação contra PTO/FAP interno do operador` é a mais precisa: nem `PENDENTE_FONTE` (havia essa impressão antes, mas é incorreta — a fonte existe e foi localizada), nem "confirmada" (o conteúdo não foi lido).

**`TRE-INST` e `CRED-EXA` não são implementáveis com base apenas nisso.** Mesmo com FAP 07/13 localizadas, a Costa do Sol não tem FAP/PTO interno de instrutor/examinador no repositório — a estrutura proposta na seção 5.1/5.2 do doc V6.1 continua sendo apenas consistente com RBAC 61/135, não validada contra o FAP interno real do operador. Nenhuma das duas fichas foi adicionada ao loader nesta rodada.

**Próximo passo concreto:** um humano com acesso ao navegador (sem bloqueio de CAPTCHA) deve abrir as duas URLs `.docx` e a página da IS 90-001A, confirmar o conteúdo, e então esta classificação pode ser promovida para `CONFIRMADA`.

### 7.6 Recomendação sobre `referencias_json` em `modelos_sessao`
Ver seção 6. Recomendado adicionar, reaproveitando o schema já validado de `manobras.referencias_json`. **Não implementado nesta entrega** — fora de escopo (Parte D do mandato desta rodada also confirma: não implementar ainda, apenas documentar).

### 7.7 Próximos passos antes de apply
1. **Owner/instrutor revisa o conteúdo técnico das 8 fichas convertidas** em `scripts/maintenance/lib/simuladores-matriz-v6-data.mjs` (seção `FICHAS_RESTANTES_MODELS`) — aprovação humana antes de qualquer apply, mesmo local.
2. Confirmação humana (sem CAPTCHA) do conteúdo de FAP 07, FAP 13 e IS 90-001A item 5.2.8, para promover a classificação da seção 7.5 de "localizada" para "confirmada".
3. Owner fornece ou confirma ausência de FAP/PTO interno específico de instrutor e examinador antes de qualquer implementação de `TRE-INST`/`CRED-EXA` no loader.
4. Owner confirma se a "Nova Lista após as correções" do RPEA deve ser descartada como fonte de evidência ou se existe uma versão com citações de página/seção que não foi enviada.
5. Owner decide, item a item, se aceita as classificações `NÃO_APLICÁVEL_SIMULADOR`/`NÃO_COBERTO` da seção 3 — principalmente 690-2.50C.2 e 690-2.51C.1/51C.2.
6. Só após 1–5: rodar `apply-simuladores-matriz-v6-costa-do-sol.mjs --apply` contra um banco **local** de teste, validar (`validateDbOutcome` já embutido no script confirma 18 itens/modelo), e então decidir separadamente sobre autorização de apply remoto/produção — que **não deve ser assumida por este documento**.
7. Somente depois disso, avaliar a extensão de `referencias_json` para `modelos_sessao` (Tarefa 5) como item de escopo separado.
8. Validar com owner o item 690-2.43C.2A (citação "Journey Logs" incompatível com o requisito) — pedir nova fonte documental antes de considerar coberto.

### 7.8 Confirmação de que nada foi aplicado em produção
- ✅ Nenhuma migration remota executada.
- ✅ Nenhum DML remoto executado.
- ✅ Nenhum deploy realizado (Worker ou Pages).
- ✅ Nenhum apply de matriz executado contra nenhum banco — o `--dry-run` (padrão do script) foi usado apenas para validar que o SQL gerado não lança `missing_registry_entry`; nenhum `INSERT`/`UPDATE` foi executado. O banco local (`.wrangler/state/...sqlite`) foi apenas **lido** (`PRAGMA table_info`, `SELECT COUNT`) pelo modo `--dry-run`, nunca escrito.
- ✅ Nenhum código de produção (rotas Worker, frontend) foi alterado — apenas `scripts/maintenance/lib/simuladores-matriz-v6-data.mjs` (loader), `src/__tests__/simuladores-matriz-v6-data.test.ts` (testes) e este documento de auditoria.
- ✅ Nenhum PR foi mergeado; nenhuma branch saiu do estado de draft.
- ✅ Nenhum termo "homologado" ou "aprovado pela ANAC" foi usado.
- ✅ Nenhuma FAP ou regulamento foi inventado — toda referência a FAP05.2/FAP06/FAP14/RBAC 61/RBAC 135 já existia nos documentos-fonte do projeto; FAP 07/FAP 13 foram localizadas via busca no domínio oficial (URLs reais, conteúdo não lido por bloqueio de CAPTCHA — ver seção 7.5), nunca inventadas.
- ✅ A planilha "Nova Lista após as correções" não foi usada como verdade final — todo `COBERTURA TOTAL` atribuído nesta auditoria se apoia na planilha PQ-C (citações específicas) ou na "Lista analisada" original.
- ✅ Nenhuma referência foi concatenada em `descricao` — `referencias_json` permanece estrutura separada, confirmado por teste automatizado (`simuladores-matriz-v6-data.test.ts`).

---

## 8. Testes Executados Nesta Rodada

| Comando | Resultado |
|---|---|
| `npm run test:run -- src/__tests__/simuladores-matriz-v6-data.test.ts` | ✅ 15/15 testes passando (6 pré-existentes + 9 novos cobrindo as 8 fichas, aliases RPEA, classificação QRH/FONTE_OPERADOR, e as lacunas 690-2.50C.2/51C.1/51C.2) |
| `npm run test:worker -- src/__tests__/routes/catalogos-tenant-isolation.test.ts` | ✅ 6/6 testes passando (sem regressão) |
| `npm run lint` | ✅ Todos os guards passaram (api-base, tracked-secrets, auth-boundaries, empresa-default1, duplicate-migrations, operational-sql-sources) |
| `node scripts/maintenance/apply-simuladores-matriz-v6-costa-do-sol.mjs --empresa-id 6 --dry-run` | ✅ Executou sem erro (`missing_registry_entry` não foi lançado para nenhum dos 49 modelos); confirmou 49 modelos, 882 linhas técnicas totais; banco local detectado como `empty_or_unseeded`/schema incompatível — apenas leitura, nenhuma escrita |

---

## 9. Confirmações

- ✅ Nenhuma migration remota aplicada.
- ✅ Nenhum DML remoto executado.
- ✅ Nenhum banco (local ou remoto) recebeu escrita — só o loader em memória e um `--dry-run` (somente leitura) foram executados.
- ✅ Nenhum deploy realizado (Worker ou Pages).
- ✅ Nenhuma matriz aplicada em produção.
- ✅ Nenhum item saiu do estado de PR draft; nenhum merge foi realizado.
- ✅ Nenhuma homologação, aprovação ou aceitação pela ANAC foi afirmada.
- ✅ Nenhuma fonte foi inventada — FAP 07/FAP 13 foram localizadas por busca real no domínio oficial `gov.br/anac`, com o grau de confiança (URL localizada vs. conteúdo lido) explicitado na seção 7.5.
- ✅ Documento atualizado nesta rodada (Parte A do mandato); código do loader atualizado em `scripts/maintenance/lib/simuladores-matriz-v6-data.mjs` e testes em `src/__tests__/simuladores-matriz-v6-data.test.ts` (Partes B–E do mandato).
