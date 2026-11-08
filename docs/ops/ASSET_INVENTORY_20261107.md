# Inventário de assets do repositório — 07/11/2026

Snapshot da `main` em `5c951098b16d5ccc870b0a33caf4b041b89671f8`. O inventário completo, com hashes Git, caminhos e classificação de referência por arquivo, está em [`asset-inventory-main-20261107.json`](./asset-inventory-main-20261107.json). Para regenerar contra a `main`: `ASSET_INVENTORY_REF=origin/main node scripts/ops/repository-asset-inventory.mjs`.

| Categoria | Arquivos | Bytes rastreados |
| --- | ---: | ---: |
| Conteúdo em diretórios SCORM | 557 | 296.576.182 |
| ZIPs SCORM | 0 | 0 |
| Mídia de áudio/vídeo/legenda | 77 | 176.659.876 |
| Imagens | 429 | 104.444.164 |
| PDF | 14 | 16.679.957 |
| PowerPoint | 2 | 60.391 |
| Source maps | 0 | 0 |

O JSON contém 598 registros individuais de assets, incluindo os únicos e os duplicados. Foram encontrados 4 manifests SCORM, sem referência local diretamente ausente. Um caminho citado com URL encoding tem no Git uma variante codificada e uma com capitalização diferente; seu comportamento em runtime não foi verificado. A análise por hash Git encontrou 91 grupos duplicados, 213 cópias excedentes e 28.773.149 bytes lógicos repetidos. Entre os 304 caminhos pertencentes aos grupos, 288 estão referenciados diretamente pelos manifests, 2 são assets EAD sem referência direta comprovada e 14 estão fora de EAD sem auditoria completa de runtime. Os outros 4 assets EAD sem referência direta são os próprios manifests. O JSON preserva hash, tamanho, categoria, caminho e estado de referência para cada registro.

Hashes são IDs SHA-1 de blobs Git: igualdade identifica blobs idênticos no repositório. A análise de referência cobre caminhos diretos em `imsmanifest.xml`; não prova ausência de referências em JavaScript/CSS, URLs, players, cursos publicados ou outros runtimes. **Nenhum arquivo foi removido; este inventário não autoriza exclusão nem alteração de ZIP/objeto R2 publicado.**
