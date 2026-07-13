# IMPLEMENTATION_BLOCKERS

## Sessoes bloqueadas temporariamente
- A139-I-03/12: composicao tecnica redesenhada (ver 12_MATRIZ e 01A/01B/04/05/08)
- A139-I-12/12: composicao tecnica redesenhada (ver 12_MATRIZ e 01A/01B/04/05/08)
- A139-P-04/04-CHECK: ajuste de nome/descricao/duracao ou pequena adicao/substituicao (ver 01A/01B)

## Sessoes preservadas sem alteracao
- A139-I-01/12: nenhuma
- A139-I-08/12: nenhuma
- A139-I-09/12: nenhuma
- A139-I-10/12: nenhuma
- A139-P-01/04-C1: nenhuma
- A139-P-01/04-C2: nenhuma
- A139-P-01/04-C3: nenhuma
- A139-P-02/04-C1: nenhuma
- A139-P-02/04-C2: nenhuma
- A139-P-02/04-C3: nenhuma
- EXA-01/02: nenhuma
- EXA-02/02: nenhuma
- SK76-I-04/12: nenhuma
- SK76-I-05/12: nenhuma
- SK76-I-06/12: nenhuma
- SK76-I-08/12: nenhuma
- SK76-I-09/12: nenhuma
- TRE-INST: nenhuma

## Escopo excluido
- PILOT-MODELO-001: nenhuma -- stub sem conteudo

## Bloqueios documentados pela matriz
- PILOT-MODELO-001: Modelo sem nenhum vinculo de manobra (0/18), duracao_estimada NULL, tenant empresa_id=8 distinto da empresa real (Costa do Sol, empresa_id=6). Nao ha conteudo curricular a analisar.
- A139-I-12/12 e A139-P-04/04-CHECK (LOFT-CHK-23): LOFT-CHK-23 ('Painel limitado / falha de instrumentos IFR') tem modelo_aeronave=SK76 no catalogo, mas e usado em 2 modelos AW139 na composicao final proposta (mantido deliberadamente por decisao do Subagente A, MANTER_JUSTIFICADO transitorio). Origem da manobra permanece ambigua -- pode ser erro de tag (deveria ser AW139) ou pode indicar que a competencia foi desenhada gener icamente e mal-catalogada.
- A139-I-03/12, A139-I-04/12: O diagnostico de sobreposicao (I-03/I-04/I-07 compartilhando itens AFCS/avionicos) e solido (ALTA confianca), mas o preenchimento das posicoes liberadas em I-03 (10 de 18) e parte de I-04 usa reaproveitamento de itens ja ativos em outros modulos (I-06/I-08/I-09/I-10/P-01-04-C3/NOT-02), com justificativa qualitativa, nao evidencia direta de adequacao.
- TRE-INST, EXA-01/02, EXA-02/02: Nenhum documento de referencia (equivalente a um 'PTO de examinador/instrutor') foi localizado no repositorio para validar se as 18 secoes de cada modelo cobrem as competencias minimas exigiveis de um examinador/instrutor, nem para calibrar tempo real por secao.
- Recorrencia periodica de autorrotacao e sistema hidraulico (todos os ciclos periodicos, ambas aeronaves): Subagente D identificou lacunas reais de recorrencia (autorrotacao ausente do eixo IFR e do check/reaquisicao em ambas aeronaves; hidraulico ausente de 1 ciclo VFR + todo o eixo IFR no SK76, e do check final no AW139), confirmadas pelo Subagente F. Recomendacoes concretas existem (adicionar FLY-BAS-17 a A139-P-01/04-C2; adicionar S76-AUT-70 a S76-P-01/04-C1/C3; adicionar item hidraulico a S76-P-01/04-C3 e a um ciclo IFR de cada aeronave) mas NAO foram incorporadas a 12_MATRIZ_CURRICULAR_FINAL_SONNET.csv nesta rodada -- exigem o mesmo nivel de escrutinio adversarial dado as correcoes de LOFT/contaminacao antes de virarem mudanca de matriz.

