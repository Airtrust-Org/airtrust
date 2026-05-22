# Relatorio de Reemissao dos Certificados - Costa do Sol

Data: 31/03/2026
Empresa: 6 - Costa do Sol Taxi Aereo
Fonte: D1 remoto de producao + validacao publica do Worker

## 1. Resultado objetivo

1. O lote de 35 historicos afetados foi reemitido em producao.
2. Todos os 35 registros ficaram com numero de certificado e arquivo vinculado.
3. A validacao tecnica final do lote retornou zero divergencias:

| Indicador                             | Resultado |
| ------------------------------------- | --------- |
| Divergencias de carga                 | 0         |
| Divergencias de vencimento            | 0         |
| Historicos do lote                    | 35        |
| Historicos com numero_certificado     | 35        |
| Historicos com certificado_arquivo_id | 35        |

## 2. Amostra homologada na validacao publica

Foram calculados os hashes publicos a partir do estado atual do D1 e cada hash abaixo foi validado no endpoint publico `/api/certificados/validar/:hash`.

| ID   | Certificado                     | Hash             | Status | Funcionario                         | Qualificacao                                  | Realizacao | Vencimento | Carga   |
| ---- | ------------------------------- | ---------------- | ------ | ----------------------------------- | --------------------------------------------- | ---------- | ---------- | ------- |
| 3211 | CERT-00000-B-20250203-71e1bf39  | BB282684BE9E89EA | OK     | Diego Bichara Bejamin               | Conhecimentos Gerais da Aeronave              | 2025-02-03 | 03/02/2026 | 2 horas |
| 3230 | CERT-00262-C-20260117-dbb6fbf0  | 9F3122CAD64ED99D | OK     | Rafael Siegmann Paradeda            | Emergencias Gerais                            | 2026-01-17 | 17/01/2027 | 2 horas |
| 3300 | CERT-00282-D2-20260116-7292f9ef | 151CE12A0B7A877C | OK     | Fernando La Rocque De Freitas Filho | SGSO                                          | 2026-01-16 | 16/01/2029 | 2 horas |
| 3896 | CERT-00264-G1-20260327-3e6f6701 | 1487FE6B7BA32A69 | OK     | Ramon Godinho Bastos                | AW139 - Curriculo de Voo                      | 2026-03-27 | 27/03/2027 | 8 horas |
| 4014 | CERT-00353-D3-20260314-a200ce7f | A7D9E26175951872 | OK     | Filipe Passaroni Daumas             | CRM - Gerenciamento de Recursos da Tripulacao | 2026-03-14 | 14/03/2027 | 8 horas |

## 3. Lote completo reemitido

| ID   | Atualizado em       | Certificado atual                     | Codigo   | Funcionario                           | Hash publico     |
| ---- | ------------------- | ------------------------------------- | -------- | ------------------------------------- | ---------------- |
| 3211 | 2026-03-31 21:09:55 | CERT-00000-B-20250203-71e1bf39        | B        | Diego Bichara Bejamin                 | BB282684BE9E89EA |
| 3230 | 2026-03-31 21:18:41 | CERT-00262-C-20260117-dbb6fbf0        | C        | Rafael Siegmann Paradeda              | 9F3122CAD64ED99D |
| 3236 | 2026-03-31 21:18:54 | CERT-00000-C-20250112-b2648daa        | C        | Gabriel Ferreira Barreto              | 44CE7F004FF99ED7 |
| 3237 | 2026-03-31 21:10:04 | CERT-00000-C-20250314-71482ead        | C        | Diego Bichara Bejamin                 | 9A798D1BABB1A4BE |
| 3300 | 2026-03-31 21:19:07 | CERT-00282-D2-20260116-7292f9ef       | D2       | Fernando La Rocque De Freitas Filho   | 151CE12A0B7A877C |
| 3340 | 2026-03-31 21:19:21 | CERT-00000-D3-20250109-1f121652       | D3       | Gabriel Ferreira Barreto              | 2AD3F995618FBC60 |
| 3366 | 2026-03-31 21:19:34 | CERT-00000-D4-20240113-514e977f       | D4       | Gabriel Ferreira Barreto              | 2EC70B3900A8D139 |
| 3443 | 2026-03-31 21:10:17 | CERT-00353-E3-20230204-bd6f14bc       | E3       | Filipe Passaroni Daumas               | BF330D2726FEE7F2 |
| 3473 | 2026-03-31 21:19:52 | CERT-00262-E5-20260117-de618e74       | E5       | Rafael Siegmann Paradeda              | C58201B8654FB7D6 |
| 3505 | 2026-03-31 21:20:05 | CERT-00313-F2-20241222-fed53554       | F2       | Rubens Negreiros Silva                | 4C1C9F494CC3F8D5 |
| 3506 | 2026-03-31 21:20:22 | CERT-00221-F2-20241230-e76848bc       | F2       | Vitor De Almeida Costa                | 6A5CABD67C47F9FA |
| 3509 | 2026-03-31 21:10:29 | CERT-00000-F2-20250203-23ef7a77       | F2       | Diego Bichara Bejamin                 | 898CA3E099726379 |
| 3874 | 2026-03-31 21:20:35 | CERT-00262-B-20260117-3e7159ca        | B        | Rafael Siegmann Paradeda              | 6A0B32ABE75FD51D |
| 3896 | 2026-03-31 21:20:47 | CERT-00264-G1-20260327-3e6f6701       | G1       | Ramon Godinho Bastos                  | 1487FE6B7BA32A69 |
| 3909 | 2026-03-31 21:10:40 | CERT-00000-G2-20241230-3ec8ef17       | G2       | Gabriel Ferreira Barreto              | DB528F769BC14FA9 |
| 3931 | 2026-03-31 21:21:06 | CERT-00221-G2-20250225-2ac0dd13       | G2       | Vitor De Almeida Costa                | A92D977220B4F9F1 |
| 3987 | 2026-03-31 21:21:19 | CERT-00251-FAP14-20260829-3ede7336    | FAP14    | Jose Alfredo Gomes Marinho            | D73550A3C5E09E43 |
| 3991 | 2026-03-31 21:10:49 | CERT-00000-G2-20260301-13d65979       | G2       | Gabriel Ferreira Barreto              | D610C24B72FA0E52 |
| 3999 | 2026-03-31 21:21:31 | CERT-00221-FAP05276-20260301-ac504f6e | FAP05276 | Vitor De Almeida Costa                | B26DD726D23BC46A |
| 4000 | 2026-03-31 21:21:44 | CERT-00353-CAEBS-20260226-86be6777    | CA-EBS   | Filipe Passaroni Daumas               | CDC29F7A5C648F28 |
| 4003 | 2026-03-31 21:21:57 | CERT-00004-D3-20260314-73ab8499       | D3       | Max Monteiro Magioli                  | 2D9E0062B08E9E39 |
| 4014 | 2026-03-31 21:11:01 | CERT-00353-D3-20260314-a200ce7f       | D3       | Filipe Passaroni Daumas               | A7D9E26175951872 |
| 4015 | 2026-03-31 21:22:15 | CERT-00363-D3-20260314-00a0da7b       | D3       | Jair Cesar Da Silva                   | FFB0CC36D592DAFA |
| 4016 | 2026-03-31 21:22:28 | CERT-00001-D3-20260314-0f13be8e       | D3       | Wilson Maciel Martins Nery            | 3D1E0B8915FF7E51 |
| 4017 | 2026-03-31 21:22:41 | CERT-00264-D3-20260314-0d701b58       | D3       | Ramon Godinho Bastos                  | D474D26ACE074091 |
| 4018 | 2026-03-31 21:11:12 | CERT-00170-D3-20260314-cead3d2d       | D3       | Caio Cesar Simoes De Alcantara        | E986322E51A1E739 |
| 4019 | 2026-03-31 21:22:54 | CERT-00232-D3-20260314-a3e3213a       | D3       | Nivaldo Antonio Naressi               | 6CFF3BB9E765D7A2 |
| 4020 | 2026-03-31 21:23:08 | CERT-00300-D3-20260314-66a6d72a       | D3       | Adriana Brasil                        | F7F2DDDDA7F38D45 |
| 4021 | 2026-03-31 21:23:27 | CERT-00218-D3-20260314-a599a17a       | D3       | Carlos Jose Salgueiro Cirne De Castro | 7B093715D373C3D6 |
| 4022 | 2026-03-31 21:11:24 | CERT-00313-D3-20260314-37a7b4f0       | D3       | Rubens Negreiros Silva                | D813DDDFD48EF751 |
| 4023 | 2026-03-31 21:23:41 | CERT-00333-D3-20260314-88e2780d       | D3       | Paloma Goncalves Magioli              | 814EB320DF1785EA |
| 4024 | 2026-03-31 21:23:54 | CERT-00000-D3-20260314-05a95921       | D3       | Diego Bichara Bejamin                 | 68FC8E9F282AD8F7 |
| 4025 | 2026-03-31 21:24:09 | CERT-00282-D3-20260314-2d67a365       | D3       | Fernando La Rocque De Freitas Filho   | 35C138C243F7B65A |
| 4027 | 2026-03-31 21:11:36 | CERT-00000-D3-20260314-fc1503ee       | D3       | Gabriel Ferreira Barreto              | DB3FE44FC107F3FF |
| 4067 | 2026-03-31 21:24:23 | CERT-00264-F1-20260315-fd84af93       | F1       | Ramon Godinho Bastos                  | 31F4523BD3BC85E1 |

## 4. Observacao operacional

As reemissoes foram executadas em lotes pequenos por causa do rate limit do Cloudflare Browser Rendering. Depois do ajuste de retry no Worker e da execucao em lotes, o lote completo foi concluido sem falhas remanescentes.
