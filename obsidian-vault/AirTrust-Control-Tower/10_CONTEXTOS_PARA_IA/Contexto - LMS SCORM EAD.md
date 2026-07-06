---
status: ativo
tipo: contexto
fonte_canonica: repo
ultimo_sha_verificado: ""
risco: medio
ultima_revisao: "2026-07-05"
tags:
  - contexto
  - scorm
  - ead
---

# Contexto: LMS, SCORM e Conteúdo EAD

> **BLOCO DE CONTEXTO** — Use antes de qualquer tarefa envolvendo LMS, SCORM, H5P ou conteúdo EAD.

## O LMS do AirTrust
- LMS nativo multi-formato substituiu EdApp (descontinuado)
- Suporta: SCORM 1.2/2004, H5P, PDF, PPTX, Vídeo
- SSOT bidirecional com `qualificacoes_tipos`
- Assets servidos via R2 com cookie JWT (TTL 15min)
- Ciclos de matrícula com renovação automática (janela 30 dias)

## Regras para conteúdo SCORM
1. `config.json` é a superfície principal — validar JSON após edição
2. PRESERVAR termos técnicos: PLB, ELT, ADELT, EPIRB, PIC, SIC, ATC, CCO, ANAC
3. NÃO alterar paleta de cores sem pedido explícito
4. Revisar imagens quebradas (assets locais e URLs remotas)
5. Padronizar tipografia via `customCSS`
6. Limpar HTML herdado só quando atrapalhar
7. PRESERVAR conteúdo regulatório
8. Gerar pacote LMS com `imsmanifest.xml` na raiz

## O que NUNCA fazer
- ❌ Simplificar termos técnicos operacionais
- ❌ Alterar paleta de cores de curso existente
- ❌ Expor URLs públicas de R2 para assets
- ❌ Modificar lógica de progresso SCORM sem testar com pacotes reais
- ❌ Quebrar SSOT com `qualificacoes_tipos`

## Players frontend
| Formato | Biblioteca |
|---|---|
| SCORM | `scorm-again` ^3.0.3 |
| H5P | `h5p-standalone` ^3.8.2 |
| PDF | `pdfjs-dist` ^4.8.69 |
| PPTX | `@jvmr/pptx-to-html` ^1.0.1 |
| Vídeo | HTML5 `<video>` |

## Migrations relevantes
- 0335–0350: LMS base
- Ver `LMS_ARCHITECTURE.md` para detalhes
