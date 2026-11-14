# PTO Rev.10 V18 — contrato normativo canônico

**Fonte de verdade**: PRG-OPS-001_PTO_Rev10_V18.docx, SHA-256
040a0287f966925cea3c8cafa23172673a94530cc044b4cfb33c8ccf4de06912.
O AirTrust deve se conformar ao PTO aprovado, e não o contrário.

Este diretório contém as tabelas extraídas literalmente do PTO:
- sessoes_pto_v18.json: 82 sessões (37 AW139 + 45 S76), cada uma com 18
  posições técnicas em ordem (9 PF A + 9 PF B).
- funcionais_pto_v18.json: seis sessões práticas INST/EXA com 108 posições
  e 94 códigos funcionais distintos, incluindo os títulos aprovados.
- notechs_pto_v18.json: 15 competências NOTECHS oficiais, seus nomes,
  categorias e evidências observáveis.
- manifest.json: hashes, contagens e status de fonte normativa, sem status
  de guia operacional homologado.

O gate build-content-gates bloqueia alterações silenciosas dos hashes e
da estrutura curricular. Editar o manifest não constitui aprovação.

CI, sem documento fonte:
    python3 scripts/operations/check-pto-v18-canonical-contract.py
    python3 -m unittest discover -s scripts/operations -p 'test_pto_v18_canonical_contract.py' -v

Verificação adicional com o DOCX de origem autorizado:
    python3 scripts/operations/check-pto-v18-canonical-contract.py --pto /caminho/PRG-OPS-001_PTO_Rev10_V18.docx

## Separação de responsabilidades

O **PTO normativo** é aprovado. Isso não certifica automaticamente catálogo
legado, procedimento QRH/SOP/RFM/ECL, configuração FFS, versões de modelos,
cenários e guias técnicos. O pacote não contém importador nem altera D1,
fichas, guias ou produção. A publicação requer plano versionado, testes,
preservação de históricos e validação técnico-operacional específica.

Não reescrever fichas assinadas. Códigos S76/SK76 exigem evidência de
equivalência antes de qualquer reconciliação.
