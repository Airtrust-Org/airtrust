# 00 — Diagnóstico: OPS-NOT-X1 em sessões S-76

## Identidade da manobra (RAW_MANOBRAS.csv)

| Campo | Valor |
|---|---|
| id | 1003 |
| empresa_id | 6 |
| código | OPS-NOT-X1 |
| nome | Ilusão visual noturna / black hole effect — reconhecimento, correção e recuperação |
| descrição | idêntica ao nome |
| categoria | EMERGENCIA |
| modelo_aeronave (catálogo) | **AW139** |
| ativo | 1, sem `deleted_at` |
| created_at | 2026-07-05 19:47:46 |

## Onde é usada (RAW_MODELOS_SESSAO_MANOBRAS.csv, estado bruto pré-composição)

6 vínculos ativos, 3 em modelos AW139 e 3 em modelos SK76 — a manobra sempre foi cross-fleet desde a origem dos dados, isto não foi introduzido por nenhuma composição:

| Sessão | Aeronave do modelo | Ordem (RAW) |
|---|---|---|
| A139-NOT-01 | AW139 | 7 |
| A139-NOT-02 | AW139 | 8 |
| A139-S-01/02 | AW139 | 7 |
| S76-NOT-01 | SK76 | 7 |
| S76-NOT-02 | SK76 | 6 |
| SK76-S-01/02 | SK76 | 8 |

## O que já aconteceu na composição curricular final Sonnet (`12_MATRIZ_CURRICULAR_FINAL_SONNET.csv`)

**Lado AW139 — resolvido por migração completa de catálogo**: `A139-NOT-01`, `A139-NOT-02` e `A139-S-01/02` foram inteiramente migrados do catálogo genérico (`OPS-*`, `CAU-*`, `FLY-BAS-*`) para o catálogo dedicado `LOFT-NOT-*`/`LOFT-OFF-*` (ver `01A_DETALHE_AW139.md`, seção "Noturno e Semestral"). Nessa migração, `OPS-NOT-X1` foi **removido** das 3 fichas AW139 e substituído por `LOFT-NOT-31` ("Black Hole Effect — correção e recuperação", item AW139-nativo, mesma competência) em `A139-NOT-01`; por itens `LOFT-NOT-23/27/28` (decolagem/pouso/arremetida noturna em unidade marítima) em `A139-NOT-02`; e por `LOFT-NOT-04` (briefing de ilusões) em `A139-S-01/02`. Ou seja: **o lado AW139 já tem substituto próprio, aircraft-native, para a mesma competência.**

**Lado SK76 — tratamento inconsistente entre as 3 fichas**:

| Sessão | O que a composição final fez com `OPS-NOT-X1` | Outros itens LOFT/black-hole já adicionados na mesma sessão | Situação resultante |
|---|---|---|---|
| `S76-NOT-01` | **MANTER** (nenhuma mudança) | nenhum | `OPS-NOT-X1` é o único item de ilusão noturna da sessão — não há redundância, mas o item continua com tag AW139 |
| `S76-NOT-02` | **MANTER** (nenhuma mudança) | `S76-LOFT-34` adicionado (ordem 7) — mas cobre falha de iluminação do helideck, não ilusão/black hole propriamente dita | `OPS-NOT-X1` continua sendo o único item que cobre "reconhecimento/correção de ilusão visual" — sem redundância de competência, mas tag ainda AW139 |
| `SK76-S-01/02` | **MANTER** (ordem 8) | `S76-LOFT-23` (briefing ilusões/black hole, ordem 9), `S76-LOFT-31` (circuito noturno c/ vento, ordem 10), **`S76-LOFT-33` (Black Hole Effect — correção e recuperação, ordem 12)**, `S76-LOFT-28` (base/final referência degradada, ordem 14) | **Redundância real**: `S76-LOFT-33` cobre exatamente a mesma competência declarada por `OPS-NOT-X1` (reconhecimento/correção/recuperação de black hole), só que em versão SK76-nativa, com aviônica (Primus 701), referência normativa (FAA-H-8083-21) e nível de dificuldade (AVANÇADO) próprios. Manter os dois é duplicação de competência dentro da mesma ficha. |

**Achado prévio já registrado (`06_INVENTARIO_CROSS_AERONAVE.csv`, `01B_DETALHE_SK76.md`)**: a composição anterior classificou `OPS-NOT-X1` como `GENERICO_CROSS_FLEET_LEGITIMO` e recomendou apenas corrigir a tag `modelo_aeronave` do catálogo para algo neutro, sem trocar o item nas 3 fichas SK76. **Esta missão reabre esse ponto especificamente** porque (a) o tratamento dado ao lado AW139 (migração completa para item nativo) contradiz a alegação de que o fenômeno é "agnóstico de aeronave" — se fosse mesmo agnóstico, não haveria motivo pedagógico para trocá-lo por um item AW139-tagged (`LOFT-NOT-31`) do lado AW139; e (b) o catálogo SK76 já possui, hoje, um substituto forte e específico (`S76-LOFT-33`) que a própria composição anterior já usou em uma das 3 fichas (`SK76-S-01/02`) sem remover o item antigo, criando redundância.

## Catálogo S76-LOFT-* completo (34 itens ativos, `modelo_aeronave=SK76`, ver `RAW_MANOBRAS.csv` ids 618-639 e 811-822)

Os 22 primeiros (`S76-LOFT-01` a `22`, criados 2026-03-24) formam um cenário LOFT genérico (performance→CRM). Os 12 seguintes (`S76-LOFT-23` a `34`, criados 2026-05-13, todos com sufixo "(SK76)" no nome e referência explícita a "RFM SK76"/"Primus 701"/"MGO") são **especificamente noturnos**, cobrindo: briefing de ilusões (23), inspeção/acionamento noturno (24), config cockpit noturno (25), decolagem UM noturna (26), downwind noturna (27), base/final degradada (28), pouso helideck c/ referência de iluminação (29), arremetida noturna (30), circuito completo c/ vento (31), autorrotação noturna (32), **Black Hole Effect — correção e recuperação (33)**, pouso sem iluminação/falha (34).

`S76-LOFT-33` é o único código de todo o catálogo SK76 cuja descrição menciona explicitamente "Black Hole Effect" com o mesmo verbo-chave de `OPS-NOT-X1` ("reconhecimento"/"correção"): *"identificação dos sintomas (ilusão de rampa alta, tendência de descida prematura abaixo do perfil), aplicação de potência corretiva e retorno ao ângulo correto ou arremetida imediata"*. `S76-LOFT-23` é o briefing que precede esse exercício prático — competência complementar, não substituta (briefing ≠ execução prática).

## Escopo desta missão

Resolver, para cada uma das 3 sessões (`S76-NOT-01`, `S76-NOT-02`, `SK76-S-01/02`), uma decisão concreta dentre: substituir por manobra S-76 existente, criar nova manobra S-76, remover e reequilibrar, migrar para outra sessão, ou bloquear pontualmente — sem reabrir a matriz canônica inteira, sem alterar banco/código/PTO, sem declarar validação humana ou aprovação ANAC.

## Pré-leitura confirmada

Lidos integralmente antes deste diagnóstico: `RAW_MANOBRAS.csv`, `RAW_MODELOS_SESSAO.csv` (linhas dos 6 modelos envolvidos), `RAW_MODELOS_SESSAO_MANOBRAS.csv` (6 vínculos de OPS-NOT-X1), `RAW_MODELOS_REFERENCIAS_HISTORICAS.csv` (modelos 57/75/78), `06_INVENTARIO_CROSS_AERONAVE.csv`, `01B_DETALHE_SK76.md` (achado registrado + composição já aplicada), `12_MATRIZ_CURRICULAR_FINAL_SONNET.csv` (linhas completas das 3 sessões + das 3 sessões AW139-irmãs), `01A_DETALHE_AW139.md` (seção "Noturno e Semestral", para entender a resolução já dada do lado AW139), `IMPLEMENTATION_SCOPE_HARDENED.csv`, `IMPLEMENTATION_OVERRIDE_20260713.md`, `FINAL_GATE_REPORT.md`, `IMPLEMENTATION_BLOCKERS.md` (worktree de implementação — confirmam que as 3 sessões alvo estavam na lista de "liberadas" da fase de implementação, sem menção específica a este conflito — ou seja, este é um achado novo desta missão pontual, não algo já registrado como bloqueio na fase de implementação).

## Risco histórico por sessão

| Sessão | modelo_id | sessões realizadas | checks | qualificações | Risco de mudança |
|---|---|---|---|---|---|
| S76-NOT-01 | 57 | 0 | 0 | 0 | BAIXO (nunca usado) |
| S76-NOT-02 | 78 | 6 | 0 | 1 | MÉDIO (uso real 2026-05-23 a 2026-06-14, sem check formal) |
| SK76-S-01/02 | 75 | 0 | 0 | 0 | BAIXO (nunca usado) |

## Adendo — achado histórico adicional (descoberto após o fan-out dos 3 subagentes, via inspeção direta de `deleted_at`/`created_at` em `RAW_MODELOS_SESSAO_MANOBRAS.csv`, não visto por A/B/C)

Reconstituindo a linha do tempo exata dos vínculos (campos `created_at`/`updated_at`/`deleted_at`, não apenas o estado final):

| Data/hora | Evento |
|---|---|
| 2026-05-13 17:55:05 | Catálogo `S76-LOFT-23` a `34` (12 itens noturnos SK76-nativos) é criado em `RAW_MANOBRAS.csv`. |
| 2026-06-16 20:41:16 | `S76-LOFT-23/24/25/28/31/32/33` são vinculados a `S76-NOT-01` (7 itens) e `S76-LOFT-26/27/28/29/30/34` a `S76-NOT-02` (6 itens) — uma tentativa de redesenho usando o catálogo nativo noturno. As ordens chegam a 17 (`S76-NOT-01`) e 20 (`S76-NOT-02`), **ultrapassando 18** — sinal de que a tentativa foi parcial/incompleta (itens novos adicionados sem remoção correspondente dos antigos, não uma reformulação disciplinada de 18 itens). |
| 2026-07-04 13:55:06 | **Todos esses vínculos são revertidos** (`deleted_at` preenchido em bloco, mesmo timestamp para todos — operação única). |
| 2026-07-05 19:47:46 | **No mesmo dia seguinte à reversão**, a manobra `OPS-NOT-X1` é criada (`RAW_MANOBRAS.csv`, `created_at` idêntico) e imediatamente vinculada às 6 fichas (3 AW139 + 3 SK76) com este mesmo timestamp de criação. |
| 2026-07-06 20:53:03 | Vínculos de `OPS-NOT-X1` recebem `updated_at` (provavelmente ajuste de ordem, fora do escopo desta reconstituição). |

**Interpretação**: `OPS-NOT-X1` não é um item genérico desenhado deliberadamente para ser aircraft-agnostic — é um **placeholder criado no dia seguinte à reversão de uma tentativa mais ambiciosa e inacabada** de usar o catálogo `S76-LOFT-*` nativo em `S76-NOT-01`/`S76-NOT-02`. Isso é consistente com (e reforça fortemente) o achado do Subagente A de que `OPS-NOT-X1` é um item "casca vazia" (sem procedimento, nível, fase de voo ou referência): ele foi inserido como solução temporária de continuidade de dado (para as 6 fichas não ficarem sem nenhuma menção a Black Hole) enquanto o redesenho de fato ficava pendente — exatamente o redesenho que esta missão agora completa, desta vez de forma disciplinada (18 itens, sem órfãos, com reconciliação explícita).

Isso também explica por que `S76-LOFT-33` estava "órfão" (0 vínculos ativos) até a composição Sonnet o reintroduzir em `SK76-S-01/02`: ele não foi rejeitado por conteúdo — ficou sem vínculo porque toda a tentativa de 2026-06-16 foi revertida em bloco por algum motivo não documentado nestes arquivos (possivelmente relacionado ao esforço mais amplo "Matriz V6.2" em curso na mesma janela de tempo, mencionado em auditorias anteriores do projeto), não por uma avaliação pedagógica específica contra os itens `S76-LOFT-23..34` em si.

**Efeito nesta missão**: não muda nenhuma recomendação de A/B/C — reforça a classificação de `OPS-NOT-X1` como placeholder temporário e aumenta a confiança de que reintroduzir os itens `S76-LOFT-*` nativos (já usados uma vez, ainda que revertidos por motivo não relacionado a conteúdo) é completar um redesenho interrompido, não inventar um novo. Registrado como confiança adicional MÉDIA (não ALTA, porque o motivo exato da reversão de 2026-07-04 não está documentado nestes arquivos e não foi possível confirmá-lo).

## Próximo passo

Fan-out de 3 subagentes independentes (Instrutor S-76, Arquiteto Curricular, Revisor Adversarial) para produzir os artefatos `01`–`08` conforme especificação do prompt. [Concluído — ver análises completas em `/private/tmp/claude-501/.../scratchpad/ops-not-x1/out/` e consolidação nos artefatos `01`–`08` deste diretório.]
