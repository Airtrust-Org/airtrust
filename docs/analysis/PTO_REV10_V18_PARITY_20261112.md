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
