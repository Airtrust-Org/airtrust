# Player 3 — pacote sintético para homologação técnica

**Somente ferramenta de QA. Não é treinamento real, nem autoriza deploy, matrícula ou certificação.**

O operador adiou a revisão e adaptação dos 22 treinamentos originais até que o Player 3 esteja funcional. Esta infraestrutura gera offline um HTML5 fictício com cinco unidades, quatro checkpoints de lição, uma fixação e uma avaliação de dez questões. O ZIP é descartável e independente de conteúdos RC8.1 ou de qualquer cliente.

## Executar somente em workspace seguro

Gerar offline com Python 3:

    python3 scripts/learning-factory/generate_player3_technical_zip.py       --out /tmp/player3-qa-disposable-01       --parent-origin https://staging.airtrust.pages.dev       --edition-sha256 <sha256-de-edicao-sintetica-aprovada>

Testes focados:

    python3 -m unittest scripts/learning-factory/test_generate_player3_technical_zip.py

O diretório não pode existir. O gerador cria um ZIP contendo apenas index.html e app.js; um manifesto com SHA-256; e PRIVATE-qa-profile-fragment.json (permissão 0600), que contém gabarito **somente sintético**. O fragmento privado nunca deve ser enviado ao navegador, ao R2 público, ao GitHub ou aos logs. Não comitar ZIPs gerados ou qualquer arquivo PRIVATE.

## Segurança e contrato

- O host de origem deve ser HTTPS e indicar staging/QA, nunca airtrust.online.
- O ZIP emite somente hints de navegação, respostas, retomada e fim de conteúdo. Somente o Worker autenticado pode calcular nota, persistir matrícula e autorizar conclusão, qualificação e PDF.
- A modalidade SYNTHETIC_TECHNICAL da PR #1389 exige SHA-256 da fonte sintética fixado separadamente por PLAYER3_QA_SYNTHETIC_SOURCE_SHA256, identidade de tenant e versão exata do runtime. A variável não é criada por este script.
- Gerar ZIP não executa qualquer write remoto, seed, migration, upload R2, publicação ou teste E2E.
- O gerador não prova qualidade nem equivalência de treinamento; após o motor funcionar, o operador enviará ZIPs originais para adaptações técnicas.

## Frentes e aceite

Esta PR contém somente o gerador, testes e instruções de QA, independente dos arquivos do motor na PR #1389 e de Simuladores na PR #1558. Não mesclar os três escopos numa publicação acidental.

Homologação real exige um runtime integrado com schemas governados, seis matrículas sintéticas independentes (três Chromium e três WebKit), CI oficial do SHA, Worker + Pages em staging, origem de assets isolada, D1/R2 verificáveis e execução das seis jornadas. **Playwright --list, testes unitários e geração do pacote não equivalem a homologação.**
