# PTO Rev.10 V18 — contrato normativo canônico

**Fonte de verdade**: PRG-OPS-001_PTO_Rev10_V18.docx, SHA-256
`040a0287f966925cea3c8cafa23172673a94530cc044b4cfb33c8ccf4de06912`.

**O AirTrust deve se conformar ao PTO aprovado, e não o contrário.** A transcrição
literal de uma sessão/manobra aprovada **não** exige nova aprovação técnica da
manobra. A matriz deve reproduzir o PTO em código, nome, ordem, perna PF,
duração e regras de avaliação.

O diretório contém as tabelas extraídas literalmente do PTO:
- `sessoes_pto_v18.json`: 82 sessões (37 AW139 + 45 S76), cada uma com 18
  posições técnicas em ordem (9 PF A + 9 PF B).
- `funcionais_pto_v18.json`: seis sessões práticas INST/EXA com 108 posições
  e 94 códigos distintos, incluindo os títulos aprovados.
- `notechs_pto_v18.json`: 15 competências NOTECHS oficiais, nomes,
  categorias e evidências observáveis.
- `manifest.json`: hashes, contagens e referência normativa.

O gate `build-content-gates` bloqueia alterações silenciosas dos hashes e
da estrutura curricular. Editar o manifest não constitui aprovação.

## Conferir o PTO original

```sh
python3 scripts/operations/check-pto-v18-canonical-contract.py
python3 -m unittest discover -s scripts/operations -p 'test_pto_v18_canonical_contract.py' -v
python3 scripts/operations/check-pto-v18-canonical-contract.py --pto /caminho/PRG-OPS-001_PTO_Rev10_V18.docx
```

## Gerar os 88 guias como espelho fiel do currículo aprovado

```sh
python3 scripts/operations/build-pto-v18-canonical-instructor-guides.py \
  --pto /caminho/PRG-OPS-001_PTO_Rev10_V18.docx \
  --out /diretorio/guia-v18
python3 scripts/operations/test-build-pto-v18-canonical-instructor-guides.py
```

O gerador entrega 88 HTMLs e um manifesto de SHA-256, totalizando 1.584
posições, além dos 15 NOTECHS em cada guia. **Não depende de catálogos
legados nem da correspondência de frases com RFM/QRH/SOP.** A ausência de
cenário legado não configura, por si, inconformidade do PTO.

Os campos antigos `PENDENTE_DE_VALIDACAO_TECNICA` existentes nos JSONs
canônicos descrevem pendências do fluxo legado de enriquecimento/implantação;
**não invalidam a aprovação normativa do conteúdo extraído**. O gerador
não apresenta esses flags como se fossem reprovação do PTO.

## Limites e publicação

O espelho curricular reproduz o documento aprovado. Se a empresa optar por
**acrescentar** procedimentos, ações de QRH, roteiros IOS, parâmetros de
FSTD, padrões operacionais ou dados não especificados no PTO, esses acréscimos
devem se apoiar nas respectivas fontes controladas. Não inventar conteúdo.

Gerar HTML e manifesto não escreve em D1/R2, não cria vínculos nem altera
registros assinados. Publicação em produção exige o fluxo governado do
AirTrust: tenant, RBAC, modelo e versão corretos, testes, auditoria e
comprovação da ativação. Não conferir aceites de RT ou testes de FFS que
não ocorreram. Não reaproveitar guias AW139 em S76 por semelhança de títulos.

A revisão técnica adicional e a evidência de FFS devem ser exigidas quando
necessárias ao conteúdo complementar/operacional efetivamente acrescentado,
**não como condição genérica para copiar fielmente a tabela do PTO aprovado**.
