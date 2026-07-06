---
status: ativo
tipo: guia
fonte_canonica: repo
ultimo_sha_verificado: ""
risco: medio
ultima_revisao: "2026-07-05"
tags:
  - ead
  - scorm
  - guia
---

# Guia de Edição de Conteúdo EAD/SCORM

> Baseado no playbook de cursos SCORM validado.

## Regras de ouro

1. **`config.json` é a superfície principal** — validar JSON após qualquer edição maior
2. **Preservar termos técnicos**: `PLB`, `ELT`, `ADELT`, `EPIRB`, `PIC`, `SIC`, `ATC`, `CCO`, `ANAC`
3. **Não alterar a paleta original** sem pedido explícito; manter botões/cards com destaque laranja quando já fizer parte do curso
4. **Revisar imagens quebradas**: procurar assets locais ausentes, nomes problemáticos e imagens remotas herdadas em captions HTML
5. **Padronizar tipografia** por `customCSS`, especialmente em `text-sequence`, `scrollable`, `image-gallery` e conteúdos com HTML herdado (`mso-`, fontes inline, `<span>`/`<font>`)
6. **Limpar HTML herdado excessivo** quando atrapalhar fonte, imagem ou contraste
7. **Preservar conteúdo regulatório e técnico**; melhorar didática sem simplificar termos operacionais críticos
8. **Ao finalizar, gerar pacote LMS** com `imsmanifest.xml` na raiz; preferir também versão enxuta sem `.map`

## Formatos suportados

| Formato | Player | Storage | Notas |
|---|---|---|---|
| SCORM 1.2 | `scorm-again` | R2 (zip) | `imsmanifest.xml` obrigatório |
| SCORM 2004 | `scorm-again` | R2 (zip) | Compatível com 1.2 |
| H5P | `h5p-standalone` | R2 | Pacote `.h5p` |
| PDF | `pdfjs-dist` | R2 | Single file |
| PPTX | `@jvmr/pptx-to-html` | R2 | Conversão client-side |
| Vídeo | HTML5 `<video>` | R2 | MP4 preferido |

## Segurança de assets
- Assets servidos via cookie JWT com TTL de 15 minutos
- NUNCA expor URLs públicas de R2 para assets de cursos
- SCORM player comunica progresso via endpoint dedicado

## Fluxo de upload
1. Upload do pacote → R2
2. Parse do `imsmanifest.xml` (SCORM) ou `h5p.json` (H5P)
3. Registro em `lms_cursos`
4. SSOT sync com `qualificacoes_tipos`

## Links
- [[Modulo - LMS]]
- [[Contexto - Seguranca RBAC MultiTenant]]
