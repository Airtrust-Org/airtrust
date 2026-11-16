# PTO V18 — importação governada dos 88 guias curriculares

## Autoridade e objetivo

O PTO Rev.10 V18 (SHA-256 `040a0287f966925cea3c8cafa23172673a94530cc044b4cfb33c8ccf4de06912`) é
a fonte canônica do conteúdo curricular. A transcrição literal das manobras,
cargas, PF A/B e NOTECHS não exige reconciliação com catálogos antigos. Os
guias gerados são **espelhos de referência curricular**: não substituem RFM,
QRH, SOP, FTV nem acrescentam cenários ou parâmetros que não constem no PTO.

O importador usa os 88 arquivos HTML **sanitizados com o sanitizer oficial**
e seus 88 PDFs correspondentes. Não reproduzir o status dos rascunhos
anteriores `NOT_APPROVED_NON_OPERATIONAL`; o conteúdo da nova versão
provém literalmente do currículo aprovado, com hashes verificáveis.

## Construção do plano

O script `build-pto-v18-guide-import-plan.py` é **offline e read-only**.
Verifica o manifesto original, os hashes de todos os arquivos, o número e a
ordem das posições, a paridade com a matriz canônica e o snapshot D1 da
empresa 6. Ele falha se houver algum vínculo V18 antes da importação.

```sh
python3 scripts/operations/test-build-pto-v18-guide-import-plan.py
python3 scripts/operations/build-pto-v18-guide-import-plan.py \
  --guides /caminho/guias_canonicos_pto_v18 \
  --snapshot /caminho/snapshot_guias_pto_v18_producao_20261116.json \
  --output /caminho/plano_revisado
```

O JSON contém os 88 códigos, versões, modelos, metadados e R2 keys
determinísticos. O SQL gerado importa somente dados da empresa 6 e vincula
cada guia ao **modelo V18 corrente exato**, com tenant, aeronave, programa,
ciclo e sessão preservados. Nenhum guia legado é atualizado ou apagado.

O identificador do guia inclui sufixo `@PTO-REV10-V18`: evita conflitos
com os 51 guias legados ativos, mantendo o código original do PTO **dentro
do documento** e na versão do modelo `modelos_sessao_versionamento`.

## Operação governada

A importação de produção deve seguir esta sequência, **não iniciar pelo D1**:

1. Confirmar CI/PR integrado e janela de mutação D1/R2 coordenada na #776.
2. Refazer readback somente leitura de 88 modelos correntes e zero vínculos
   V18 prévios. Verificar ambiente, tenant, empresa e backup D1 Time Travel.
3. Upload privado para R2 `airtrust-storage` dos 88 PDFs e 88 HTMLs
   sanitizados; fazer readback do conteúdo e comparar SHA-256.
4. Executar somente o SQL gerado e revisado (não rodar migração genérica).
5. Postconditions: 88 guias `ATIVO` com versão curricular correta, 88 links
   válidos, um único vínculo por modelo, nenhum vínculo cruzado, zero
   documentos órfãos e integridade dos 51 legados e fichas históricas.
6. Testar endpoints e acesso à biblioteca com uma sessão real autorizada,
   quando disponível. Não gerar sessão de teste em produção.
7. Registrar SHA do SQL, bookmark, evidências e decisão nas issues
   #2232 e #776. Se qualquer preflight falhar, não publicar.

O SQL deixa todas as linhas em `VALIDACAO` até que os 88 registros e
vínculos estejam presentes. Só então atualiza os guias V18 para `ATIVO`.
O campo `revisor_tecnico` fica **NULL**: não há atribuição de identidade
ou assinatura humana. O ator `0` indica **importação técnica do sistema**
devidamente identificada no log de auditoria, não um instrutor ou RT.

A liberação de *guia curricular* como referência do PTO não equivale à
homologação de um roteiro adicional de IOS/FFS. Procedimentos operacionais
complementares devem seguir sua documentação e aceite próprios.

## Recuperação

Se o readback não confirmar 88/88 ou houver divergência, não declarar
concluído. Os registros importados podem permanecer em `VALIDACAO`
sem exposição. Caso ativados incorretamente, desativar exclusivamente os
guias da versão identificada e registrar auditoria, preservando históricos,
links legados e objetos privados imutáveis no R2.
