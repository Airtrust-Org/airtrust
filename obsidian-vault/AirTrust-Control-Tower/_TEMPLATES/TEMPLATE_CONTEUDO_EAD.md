---
status: rascunho | em_producao | publicado | arquivado
tipo: conteudo-ead
formato: scorm | h5p | pdf | pptx | video
fonte_canonica: repo (R2 + D1)
ultimo_sha_verificado: "<INSERIR SHA>"
risco: baixo | medio
curso_id: "<ID>"
curso_nome: "<NOME>"
ultima_revisao: "<YYYY-MM-DD>"
cliente: "<NOME_EMPRESA>"
tags:
  - ead
  - scorm
  - "<formato>"
---

# EAD: <NOME_CURSO>

## Metadados
| Campo | Valor |
|---|---|
| ID no LMS | |
| Formato | |
| R2 Path | |
| Tabela D1 | `lms_cursos` |
| SSOT vinculado | `qualificacoes_tipos.id = ?` |

## Estrutura do pacote
```
curso/
├── imsmanifest.xml
├── index.html
├── assets/
├── scorm/
└── ...
```

## Regras de edição segura
1. `config.json` é a superfície principal — validar JSON após qualquer edição
2. Preservar termos técnicos: `PLB`, `ELT`, `ADELT`, `EPIRB`, `PIC`, `SIC`, `ATC`, `CCO`, `ANAC`
3. Não alterar paleta de cores sem pedido explícito
4. Padronizar tipografia via `customCSS` nos componentes `text-sequence`, `scrollable`, `image-gallery`
5. Limpar HTML herdado (`mso-`, fontes inline, `<font>`) apenas quando atrapalhar fonte/imagem/contraste
6. Preservar conteúdo regulatório — melhorar didática sem simplificar termos operacionais

## Assets e imagens
| Asset | Localização | Status |
|---|---|---|
| | | ✅ OK |

## Riscos específicos
- 

## PRs relacionados
- 

## Pendências
- [ ] 
