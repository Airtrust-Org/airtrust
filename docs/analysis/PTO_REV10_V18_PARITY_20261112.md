# PTO Rev. 10 V18 — auditoria de paridade curricular (12/11/2026)

## Fonte de autoridade

- Documento recebido do proprietário: `PRG-OPS-001_PTO_Rev10_V18.docx`, SHA-256 `040a0287f966925cea3c8cafa23172673a94530cc044b4cfb33c8ccf4de06912`.
- Comparação realizada **somente** com os pacotes privados de importação `Pacote_AW139_PTO_Rev10_AirTrust_Alinhado.zip` e `Pacote_S76_PTO_Rev10_AirTrust_Alinhado.zip`, extraídos fora do repositório.
- **Não** é atestado do estado atual do D1 de produção: precisa de snapshot read-only e de validação dos guias vigentes no tenant.
- Evidência detalhada JSON mantida fora de Git em `/tmp/pto-v18-private/audit.json`.

## Resultado reproduzível

| Dimensão | PTO Rev10 V18 | Pacotes antigos |
| --- | ---: | ---: |
| Sessões de voo/simulador | 82 (37 AW139 e 45 S76) | 66 (31 AW139 e 35 S76) |
| Vínculos técnicos | 1.476 (18 por sessão) | 1.188 (18 por sessão) |
| Códigos de sessão do PTO sem correspondência exata nos pacotes | — | 49 |
| Códigos dos pacotes sem correspondência exata no PTO | — | 33 |
| Posições técnicas divergentes pelo código | — | 28 |
| Descrições técnicas divergentes | — | 27 |
| Títulos divergentes | — | 3 |
| Guias sem correspondência exata por sessão aprovada | — | 49 |
| Eventos do PTO não localizados nos guias de sessões com código correspondente | — | 28 |

**Total: 217 ocorrências documentais.** Não representam 217 defeitos independentes: ausência de sessão e ausência de guia referem-se às mesmas 49 sessões; divergência de código e divergência de guia referem-se frequentemente aos mesmos 28 eventos.

Comparações de duração distinguem horas práticas em FFS da duração global do evento de check (exame oral, briefing e debriefing). Não foram identificadas divergências inequívocas restantes na carga dos códigos de sessão coincidentes.

## Exemplos de incompatibilidades técnicas reais

- `A139-I-06/12`, posição 12: PTO `WAR-MGB-30 — Baixa pressão de óleo da MGB`; pacote `A139-EMG-008 — Falha de transmissão`.
- `A139-I-07/12`, posição 17: PTO `A139-DSP-001 — Interpretação integrada de PFD, MFD, CAS e FMA`; pacote `A139-CRM-001 — Comunicações e coordenação ATC`.
- `A139-I-10/12`, posição 13: PTO `CAU-FDT-62 — Falha do sistema de detecção de fogo`; pacote `WAR-CAB-24-FLT — Fogo ou fumaça na cabine em voo`.

A substituição por equivalência aproximada é proibida: **não tratar códigos diferentes como o mesmo exercício sem parecer técnico**.

## Ação corretiva obrigatória

1. Fazer snapshot somente-leitura das versões correntes, modelos, vínculos de manobras, rubricas NOTECHS, guias e agendamentos da empresa-alvo.
2. Reconciliar cada um dos 82 códigos com modelos correntes, históricos, transição, periódico, semestral condicional, requalificação, recência, diferenças, instrutor e examinador. Sessões de elevação de nível ou referências reutilizadas requerem análise de aplicabilidade; não excluí-las apenas porque não possuem tabela própria na seção 4.
3. Produzir pacote de matriz com as 1.476 relações na ordem, código, descrição e perna PF do PTO. Não inventar procedimentos, QRH, parâmetros de desempenho ou cenários ausentes do documento.
4. Revisar individualmente os 82 guias técnicos, com conteúdo operacional válido para cada aeronave e variante e 15 NOTECHS quando aplicáveis, e distinguir instrução de check.
5. Produzir versão nova dos modelos e guias, jamais alterar fichas históricas já assinadas; concluir dry-run, integridade referencial, RBAC/tenant, idempotência, rollback append-only, testes e gates oficiais.
6. Só liberar planejamento/uso dos modelos novos após aceite técnico do Gerente de Treinamento, homologação e validação do estado real pós-publicação.

## Reprodução

```bash
python3 scripts/operations/audit-pto-rev10-v18.py \
  --pto /caminho/PRG-OPS-001_PTO_Rev10_V18.docx \
  --aw139 /caminho/Pacote_AW139_PTO_Rev10 \
  --s76 /caminho/Pacote_S76_PTO_Rev10 \
  --out /tmp/pto-v18-audit.json

python3 scripts/operations/test-pto-rev10-v18.py
```

O auditor é **fail-closed**: código de saída não zero enquanto houver divergências. A presença de um contrato legado 51/918 ou de um pacote 66/1188 não comprova aderência ao PTO apresentado. Não publicar a matriz antiga em nome do PTO V18.

## Status

**NO-GO para afirmar conformidade de 100% ou fazer importação curricular em produção.** Auditoria documental e testes focados concluídos; corrigir os dados dos pacotes e confrontar produção ainda é trabalho aberto. Nenhuma alteração de D1, curso, ficha, guia publicado ou deploy nesta frente.

## Pacote de revisão canônica gerado nesta frente

O script `scripts/operations/build-pto-rev10-v18-review-pack.py` extrai diretamente do DOCX V18 aprovado, sem bibliotecas externas, os 82 currículos, as 1.476 relações técnicas, os 15 elementos NOTECHS e 82 **rascunhos** HTML de guias. Executado em 12/11/2026: contagens 82/1476/15/82 confirmadas. O manifesto gerado marca explicitamente `NAO_APROVADO_NAO_IMPORTAVEL_NAO_PUBLICAVEL`: não contém critérios SOP/QRH inventados e exige revisão técnica antes do uso operacional.

Exemplo (somente arquivos privados locais, não commitar artefatos do PTO):

```bash
python3 scripts/operations/build-pto-rev10-v18-review-pack.py \
  --pto /caminho/PRG-OPS-001_PTO_Rev10_V18.docx \
  --out /tmp/pto-rev10-v18-review
```

## Preflight fail-closed de importação V18 (lote seguinte)

- `worker-airtrust/scripts/lib/simuladores-pto-v18-parity.mjs`: valida o contrato curricular derivado do DOCX aprovado (SHA-256 pinado), checksum do JSON canônico, contagens **37 AW139 + 45 S76**, exatamente **18 procedimentos por sessão**, títulos, códigos, descrições, ordem e PF. Exige 15 NOTECHS na projeção; o carregador existente já exige 15 por sessão.
- `worker-airtrust/scripts/prepare-simuladores-pto-rev10-import.mjs`: agora exige `--pto-v18-contract` e `--pto-v18-manifest` e bloqueia geração de plano divergente. Nenhum dado D1 é modificado pelo preflight.
- `worker-airtrust/scripts/lib/simuladores-pto-rev10-plan.mjs`: suporta schema 2 para **88 modelos / 1.584 vínculos técnicos / 1.320 vínculos NOTECHS** (82 sessões de aeronave + 6 instrutor/examinador), com proveniência V18 e checksum do contrato. Schema 1 (72/1296/1080) permanece reconhecido para compatibilidade documental/histórica, **não equivale ao PTO V18**.
- Teste negativo com os pacotes privados antigos reais: carregador detecta 66 sessões/1.188 itens; novo preflight rejeita: `AW139: esperadas 37 sessões, recebidas 31`.
- Teste positivo do contrato recém-extraído do DOCX: **82/1476/15 PASS** com checksum do contrato `0d3fa1f4ee9bcd812b99627bd6251b6729ad5ae3d34cd53fae953dc21d560fec`.
- 9 testes Node do novo preflight + 5 testes Vitest do plano + 3 testes Python do auditor: PASS em execução local focada. Oito gates oficiais, aplicação em D1 e homologação operacional permanecem pendentes.

Atenção: este é um **gate de paridade curricular**, não certifica conteúdo operacional dos guias, variantes/SOP/RFM/QRH, versões do D1, histórico ou conformidade de produção. Antes de tentar plano de escrita, substituir os pacotes antigos por fontes revisadas e validar tecnicamente todos os guias.

### Argumentos obrigatórios adicionais do preparador

```bash
--pto-v18-contract /tmp/pto-v18-private/review-pack/sessoes_pto_v18.json \
--pto-v18-manifest /tmp/pto-v18-private/review-pack/manifesto_validacao.json
```

## Consulta direta da produção — D1 Costa do Sol, 12/11/2026

Consulta **exclusivamente de leitura** ao D1 `airtrust-db` em `production`, tenant 6, usando Wrangler com `SELECT` e `PRAGMA table_info`. Todas as respostas reportaram `rows_written=0` e `changed_db=false`. Os exports JSON completos foram guardados **fora do Git** em `/tmp/pto-v18-private/`.

| Dado de produção observado | Quantidade |
| --- | ---: |
| Registros de modelos ativos | 120 |
| Desses, classificados AW139 / SK76 / sem aeronave | 61 / 45 / 14 |
| Vínculos técnicos ativos dos modelos ativos | 2.052 |
| Guias ativos `html_status_validacao=VALIDO` | 51 |
| Vínculos ativos modelo→guia / modelos distintos vinculados | 51 / 51 |
| Sessões do PTO com código canônico igual a algum modelo ativo | 14/82 |
| Sessões do PTO sem correspondência canônica exata | 68/82 |
| Sessões com código correspondente e os 18 itens técnicos exatamente compatíveis em ordem, código e nome | 0/14 |
| Dentre as 14 com código correspondente, com guia ligado ao candidato de maior versão | 12 |

**Interpretação necessária:** os 68 códigos não correspondentes incluem currículos presentes sob nomenclaturas históricas (por exemplo, `SK76-I-*` comparado ao `S76-I-*` aprovado), além de mudanças de arquitetura (`/04` versus `/03`) e de programas. Não se deve criar 68 sessões automaticamente sem resolver equivalências, versões e requisitos. Os 12 modelos AW139 iniciais têm simultaneamente registros legados e versões novas ativos; o auditor seleciona primeiro a versão com maior `versao_numero` para comparação e preserva a evidência de candidatos alternativos. O resultado 0/14 se refere somente à igualdade integral **por código, nome e ordem**, não é julgamento técnico da equivalência operacional das manobras. O status `VALIDO` do HTML não atesta aderência ao V18.

### Auditor de snapshot criado

`scripts/operations/audit-pto-v18-production-snapshot.py` lê exclusivamente exports JSON de Wrangler já coletados (não conecta ao D1), falha caso não exista prova `rows_written=0` e `changed_db=false`, usa o hash aprovado do DOCX e gera o resultado por sessão e por posição, incluindo status dos guias vinculados. Os caminhos dos exports e detalhes de ambiente permanecem privados. A comparação não compreende as rubricas NOTECHS, PF armazenado em `metadados_json`, conteúdo HTML do R2, critérios SOP/RFM/QRH, autorização de treinamento e check ou evidência de histórico.

3 testes novos do auditor de produção PASS (inclusive rejeição de export com mutação e seleção de versão mais recente), totalizando 20 testes focados aprovados desta frente (9 Node + 5 Vitest + 3 Python iniciais + 3 Python do snapshot). O resultado é **NO-GO** para atualização automática de produção até que a matriz técnica e os guias V18 estejam validados e reconciliados.
