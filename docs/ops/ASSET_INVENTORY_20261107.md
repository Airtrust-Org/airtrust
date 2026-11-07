# Inventário de assets do repositório — 07/11/2026

Snapshot da `main` em `b4b83438bcdbb213c00f5a275c616ad3b7168776`. O inventário completo, com hashes Git, caminhos e classificação de referência por arquivo, está em [`asset-inventory-main-20261107.json`](./asset-inventory-main-20261107.json). Para regenerar contra o `HEAD` atual: `node scripts/ops/repository-asset-inventory.mjs`.

| Categoria | Arquivos | Bytes rastreados |
| --- | ---: | ---: |
| Conteúdo em diretórios SCORM | 557 | 296.576.182 |
| ZIPs SCORM | 0 | 0 |
| Mídia de áudio/vídeo/legenda | 77 | 176.659.876 |
| Imagens | 429 | 104.444.164 |
| PDF | 14 | 16.679.957 |
| PowerPoint | 2 | 60.391 |
| Source maps | 0 | 0 |

Foram encontrados 4 manifests SCORM, sem referência local diretamente ausente. Um caminho citado com URL encoding tem no Git apenas a variante codificada; seu comportamento em runtime não foi verificado. A análise por hash Git encontrou 91 grupos duplicados, 213 cópias excedentes e 28.773.149 bytes lógicos repetidos. Os 288 caminhos desses grupos aparecem referenciados diretamente por manifests ou permanecem sem prova de referência runtime ausente. O JSON identifica cada grupo e seus caminhos.

Hashes são IDs SHA-1 de blobs Git: igualdade identifica blobs idênticos no repositório. A análise de referência cobre caminhos diretos em `imsmanifest.xml`; não prova ausência de referências em JavaScript/CSS, URLs, players, cursos publicados ou outros runtimes. **Nenhum arquivo foi removido; este inventário não autoriza exclusão nem alteração de ZIP/objeto R2 publicado.**
