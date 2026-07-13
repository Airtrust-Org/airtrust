# 01 — Análise por sessão: OPS-NOT-X1

Consolidação das análises independentes dos Subagentes A (Instrutor S-76), B (Arquiteto Curricular) e C (Revisor Adversarial) — ver íntegra em `/private/tmp/claude-501/-Users-filipedaumas-SAAS-Airtrust/8438f5a7-29c1-4658-b7a0-307d8692cad0/scratchpad/ops-not-x1/out/`. As 3 análises convergiram nas 3 sessões; C não encontrou refutação suficiente para reverter nenhuma das ações centrais propostas por A/B, apenas reforçou exigências de rastreabilidade e apontou 2 achados adicionais (registro órfão de `OPS-NOT-X1`; inconsistência entre `10_NOTECHS_FINAL_POR_SESSAO.csv` e `12_MATRIZ_CURRICULAR_FINAL_SONNET.csv`).

---

## S76-NOT-01 (Treinamento Noturno Onshore, modelo_id=57, PERIÓDICO)

1. **Objetivo da sessão**: progressão VFR-noturna onshore completa (preparação → decolagem → subida → circuito → ilusão perceptiva → bloco técnico elétrico/combustível/motor → OEI → aproximação/arremetida → autorrotação → pouso → encerramento).
2. **Lista atual completa (18)**: S76-CKL-01, S76-NVF-00, S76-HOV-00, S76-DNR-01, S76-SUB-01, S76-NDL-00, **OPS-NOT-X1**, 76-FALGC, 76-FALFF, 76-FLWNR, 76-MOTCZ, S76-CKL-03, S76-OEI-01, S76-APN-01, S76-ARN-01, S76-AUT-70, S76-PNO-01, S76-EST-01.
3. **Ordem atual**: posição 7 de 18.
4. **Duração**: 60min RAW → 90min já proposto pela composição Sonnet anterior (harmonização com par AW139, independente desta missão).
5. **Papel de OPS-NOT-X1**: único item de ilusão visual/CSA da sessão (`10_NOTECHS_FINAL_POR_SESSAO.csv`: "CSA muito forte... Black Hole Effect é desenho pedagógico direto para observação de CSA").
6. **Estado inicial**: circuito noturno já executado (item 6). **Estado final**: transição para bloco de emergência elétrica (item 8).
7. **Fase de voo**: emergência em voo / aproximação final (implícito).
8. **Transição anterior**: NATURAL_COM_CONFIGURACAO (pós-circuito). **Transição posterior**: NATURAL para falha de gerador.
9. **Competência coberta**: reconhecimento/correção/recuperação de ilusão visual noturna (Black Hole Effect) — mas **sem procedimento, nível, fase de voo ou referência normativa especificados** (item "casca vazia", ver achado central).
10. **Competência ausente se removido sem substituto**: perda total do único ponto de ilusão perceptiva da sessão — não há redundância a proteger.
11. **Itens redundantes**: nenhum (é único).
12. **Itens candidatos à substituição**: `S76-LOFT-33` (Black Hole Effect — Correção e Recuperação, SK76-nativo) — EQUIVALENTE_FORTE, único candidato com correspondência textual quase literal.
13. **Impacto em NOTECHS**: preservado e reforçado — CSA continua mapeado, agora com procedimento real observável.
14. **Impacto em duração**: nenhuma mudança na contagem de itens ou na duração total da sessão; nota de C — validar se `tempo_estimado` do item individual precisa de ajuste dentro da margem "reduzida" dos 90min já propostos (o texto de `S76-LOFT-33` exige briefing prévio embutido na própria execução).
15. **Impacto em progressão**: sem alteração de posição relativa; a sessão ganha especificidade sem mudar sua função na progressão onshore-periódica.
16. **Risco de remoção sem substituto**: ALTO do ponto de vista pedagógico (perda de competência), mas não é a ação recomendada.
17. **Risco de substituição**: BAIXO — modelo nunca usado (0 sessões/checks/qualificações).
18. **Decisão recomendada**: **SUBSTITUIR_EXISTENTE** (`OPS-NOT-X1` → `S76-LOFT-33`, mesma posição 7, mesmos 18 itens). Não adicionar `S76-LOFT-23` (briefing) como item formal separado — estouraria para 19 itens; entendido como pré-briefing de instrutor, fora da lista formal de 18 manobras.
19. **Ressalva registrada**: `S76-LOFT-33` descreve textualmente "aproximação final noturna **ao helideck**", enquanto a sessão é onshore. C investigou e concluiu que isso NÃO é bloqueador (o mesmo padrão textual existe no substituto AW139 nativo `LOFT-NOT-31`, aceito pela composição anterior em sessão onshore; o fenômeno é fisiologicamente superfície-agnóstico segundo a própria referência FAA-H-8083-21 citada). Recomenda-se registrar nota de adaptação de cenário no campo `observacoes` do vínculo no momento da implementação.
20. **Confiança**: ALTA (posição/contagem/não-redundância); MÉDIA (equivalência semântica exata, herdada por comparação textual, não por medição de desempenho real).

---

## S76-NOT-02 (Treinamento Noturno Offshore, modelo_id=78, PERIÓDICO)

1. **Objetivo da sessão**: sessão de maior exigência combinada CRM/técnica do conjunto SK76 — decolagem/pouso helideck, OEI em plataforma, ditching, evacuação.
2. **Lista atual completa (18)**: S76-CKL-01, S76-TDP-00, S76-HOV-00, S76-NVF-00, S76-PWR-01, **OPS-NOT-X1**, S76-LOFT-34 (já adicionado pela composição Sonnet), 76-MOTCZ, S76-CKL-03, S76-OEI-01, S76-XFD-20, 76-FALGC, S76-LDP-00, S76-APO-01, S76-ARO-01, 76-AUTAG, S76-DIT-71, S76-FLU-01.
3. **Ordem atual**: posição 6 de 18.
4. **Duração**: 60min RAW → 90min já proposto (harmonização, independente).
5. **Papel de OPS-NOT-X1**: único ponto de ilusão visual da sessão E primeiro evento de uma cadeia que culmina em ditching (item 17).
6. **Estado inicial**: decolagem/controle básico já executados (itens 2-5). **Estado final**: transição para `S76-LOFT-34` (falha de iluminação do helideck).
7. **Fase de voo**: emergência em voo, logo antes do bloco técnico elétrico/motor.
8. **Transição anterior/posterior**: NATURAL_COM_CONFIGURACAO em ambas.
9. **Competência coberta**: idêntica a S76-NOT-01, sem procedimento/nível/referência.
10. **Competência ausente se removido**: perda do único ponto de ilusão perceptiva; **não há redundância com `S76-LOFT-34`** (falha de infraestrutura de iluminação ≠ ilusão perceptiva do piloto — competências distintas, confirmadas por A/B/C).
11. **Itens redundantes**: nenhum.
12. **Itens candidatos à substituição**: `S76-LOFT-33` — mesmo veredito de S76-NOT-01, com o agravante positivo de que o texto do candidato ("aproximação final noturna ao helideck") é ainda mais fiel a esta sessão (que é genuinamente offshore/helideck) do que à onshore.
13. **Impacto em NOTECHS**: preservado — CSA/TMD/LID/COO continuam mapeados, com procedimento real.
14. **Impacto em duração**: sem mudança de contagem; mesma nota de C sobre `tempo_estimado` do item.
15. **Impacto em progressão**: mantém `S76-LOFT-34` intocado logo depois (par lógico "ilusão perceptiva → falha de infraestrutura", ambos culminando em decisão de arremetida).
16. **Risco de remoção sem substituto**: ALTO pedagogicamente, não recomendado.
17. **Risco de substituição**: **MÉDIO** — 6 sessões reais realizadas (2026-05-23 a 2026-06-14), 1 qualificação emitida, **0 checks formais**. C confirmou que isso não justifica bloqueio (nenhum check formal envolvido; competência avaliada permanece a mesma), mas exige nota de rastreabilidade concreta (changelog de migração, não apenas texto).
18. **Decisão recomendada**: **SUBSTITUIR_EXISTENTE** (`OPS-NOT-X1` → `S76-LOFT-33`, mesma posição 6, mesmos 18 itens, `S76-LOFT-34` intocado).
19. **Ressalva de rastreabilidade**: obrigatória, dado o histórico de uso real — a implementação deve registrar explicitamente que a manobra na posição 6 do modelo 78 mudou de `manobra_id=1003` para `manobra_id=821`, preservando a competência declarada (ilusão/black hole), para eventual auditoria da qualificação já emitida.
20. **Confiança**: ALTA (não-redundância com `S76-LOFT-34`, adequação posicional); MÉDIA (equivalência semântica exata).

---

## SK76-S-01/02 (Semestral 01/02: LOFT e Operação Noturna, modelo_id=75, SEMESTRAL)

1. **Objetivo da sessão**: cenário LOFT noturno SK76-nativo mais completo/íntegro da família semestral, análogo à lógica aplicada pela composição Sonnet ao par AW139 `A139-S-01/02`.
2. **Lista atual completa (18, já pós-composição Sonnet)**: S76-CKL-01, S76-NVF-00, S76-HOV-00, S76-DNR-01, S76-SUB-01, S76-PWR-01, S76-NDL-00, **OPS-NOT-X1**, S76-LOFT-23 (ADICIONADO), S76-LOFT-31 (ADICIONADO), 76-MOTCZ, **S76-LOFT-33** (ADICIONADO), S76-OEI-01, S76-LOFT-28 (ADICIONADO), S76-ARN-01, S76-APN-01, S76-PNO-01, S76-EST-01. (4 itens técnicos removidos para caber os 4 adicionados: `76-FALGC`, `76-FALFF`, `S76-XFD-20`, `S76-ILS-00`.)
3. **Ordem atual**: `OPS-NOT-X1` na posição 8; `S76-LOFT-23` (briefing) na posição 9 — **depois**, não antes, da execução antiga; `S76-LOFT-33` (execução nova) na posição 12.
4. **Duração**: 120min, mantida desde a composição anterior (nunca esteve na leva de harmonização 60→90; já tratada como sessão mais substancial).
5. **Papel de OPS-NOT-X1**: **redundante** — a mesma competência (reconhecimento/correção/recuperação de Black Hole) já está coberta, de forma mais completa e correta, por `S76-LOFT-23` (briefing) + `S76-LOFT-33` (execução).
6. **Estado inicial/final**: irrelevante para a decisão — o item está simplesmente sobrando dentro de uma sequência que já resolve a competência sem ele.
7. **Fase de voo**: `OPS-NOT-X1` está em categoria EMERGENCIA (execução), não PRE (briefing) — não é, e nunca foi tecnicamente, um briefing, apesar de a intenção documental original (`01B_DETALHE_SK76.md`) tê-lo tratado informalmente como tal.
8. **Transição anterior/posterior**: a posição 8 antecede o briefing formal (posição 9) — **inversão pedagógica** (a ficha pede a competência antes de prepará-la formalmente).
9. **Competência coberta**: duplicada com `S76-LOFT-33`.
10. **Competência ausente se removido**: **nenhuma** — `S76-LOFT-23`/`31`/`33`/`28` já cobrem integralmente (e com mais detalhe) o que `OPS-NOT-X1` tentava cobrir.
11. **Itens redundantes**: `OPS-NOT-X1` é o item redundante a remover (não `S76-LOFT-33`, que tem o procedimento completo).
12. **Itens candidatos à substituição**: nenhum — a decisão correta aqui não é substituir, é remover.
13. **Impacto em NOTECHS**: preservado (CSA/TMD já documentados sobre os itens `S76-LOFT-*`); nota de achado adicional de C — `10_NOTECHS_FINAL_POR_SESSAO.csv` linha desta sessão está **desatualizada** em relação a `12_MATRIZ_CURRICULAR_FINAL_SONNET.csv` (ainda descreve uma composição intermediária com `S76-ILS-00` presente e sem os 4 itens LOFT) — registrado como achado de manutenção documental, fora do escopo direto de `OPS-NOT-X1`.
14. **Impacto em duração**: nenhum — mantém 120min, mantém 18 itens líquidos.
15. **Impacto em progressão**: correção pedagógica pura (elimina inversão briefing-depois-da-execução).
16. **Risco de remoção**: BAIXO — modelo nunca usado (0 sessões/checks/qualificações).
17. **Risco de reintrodução de item**: MÉDIO na escolha específica (ver Seção 4 do artefato do Subagente C — não há constraint de schema para exigir 18, mas a consistência com as outras 24 fichas do universo AW139/SK76 recomenda preservar 18).
18. **Decisão recomendada**: **REMOVER_E_REORDENAR**: remover `OPS-NOT-X1` (posição 8); reintroduzir `S76-ILS-00` (aproximação IFR, previamente removido) para preservar 18 itens e devolver a única competência de aproximação instrumental que a sessão havia perdido; reordenar o bloco 8-17 para fechar a lacuna deixada, posicionando `S76-ILS-00` imediatamente antes do encerramento e mantendo a ordem relativa briefing(`S76-LOFT-23`)→circuito(`S76-LOFT-31`)→motor(`76-MOTCZ`)→execução(`S76-LOFT-33`) intacta (ver ordem final completa no artefato `05`).
19. **Nuance registrada por C**: a intenção documental original (`01B_DETALHE_SK76.md`) tratava `OPS-NOT-X1` e `S76-LOFT-33` como complementares (briefing conceitual vs. execução prática) — essa intenção não se sustenta tecnicamente porque `OPS-NOT-X1` é categoria EMERGENCIA, não PRE, e não contém texto de briefing. A redundância é real apesar da intenção original ser outra.
20. **Confiança**: ALTA (existência da redundância, evidência textual direta e cruzada com `13_MAPA_ANTIGO_NOVO_SONNET.csv`, que mostra `S76-LOFT-33` como puro ADICIONAR sem REMOVER correspondente de `OPS-NOT-X1` — padrão diferente do aplicado nas 3 fichas-irmãs AW139); MÉDIA (escolha específica de `S76-ILS-00` como item a devolver, vs. alternativa `76-FALGC`).

---

## Achados transversais (não específicos de uma sessão)

- **`OPS-NOT-X1` é um placeholder histórico, não um item genérico deliberado** (ver adendo em `00_DIAGNOSTICO_OPS_NOT_X1.md`): criado 2026-07-05, um dia após a reversão em bloco (2026-07-04) de uma tentativa incompleta de vincular `S76-LOFT-23..34` a `S76-NOT-01`/`S76-NOT-02`.
- Após a implementação das 3 decisões desta missão, o registro de catálogo `OPS-NOT-X1` (id=1003) ficará **sem nenhum vínculo ativo em nenhuma das 25 fichas AW139/SK76** (as 3 fichas AW139-irmãs já foram migradas para `LOFT-NOT-*` pela composição Sonnet anterior). Isso não bloqueia esta missão, mas é uma ação de fechamento de dado recomendada para o futuro (mesmo tratamento dado a `LOFT-CHK-23` em `14_BLOQUEIOS_PONTUAIS_SONNET.csv`): decidir, sob validação humana, entre desativar (`deleted_at`) o registro ou corrigir sua tag para neutro, caso volte a ser necessário no futuro.
