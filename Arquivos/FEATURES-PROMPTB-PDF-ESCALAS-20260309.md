# FEATURES PROMPT B — Exportar Escala em PDF (2026-03-09)

## Resumo

Botão "Exportar PDF" no menu "Mais" da grade de escalas. Captura a grade Gantt como imagem e gera um PDF A4 landscape com cabeçalho, paginação automática e nome de arquivo inteligente.

## Arquivos

| Arquivo                                                    | Tipo                            |
| ---------------------------------------------------------- | ------------------------------- |
| `src/react-app/pages/escalas/utils/exportarEscalaPDF.ts`   | **NOVO** — utilitário de export |
| `src/react-app/pages/escalas/views/EscalasDetalheView.tsx` | Import + botão no dropdown      |

## Implementação

### `exportarEscalaPDF.ts`

- **Captura:** `html2canvas` no elemento `[data-testid="grade-gantt"]` com `scale: 2` e `windowWidth/Height` = scrollWidth/Height (captura conteúdo inteiro incluindo overflow)
- **PDF:** `jsPDF` landscape A4 (297×210mm), margem 10mm
- **Cabeçalho:** `Escala — {Mês} {Ano} ({Status})` — fonte 11pt
- **Paginação:** Automática baseada na altura da imagem vs área útil da página
- **Rodapé:** `Página X/Y — Gerado em {data}` — fonte 8pt
- **Lazy loading:** `html2canvas` e `jsPDF` carregados via `import()` dinâmico (chunks separados)
- **Filename:** `Escala_{Mês}_{Ano}_{Status}_{YYYYMMDD}.pdf`

### Integração na View

- Botão "Exportar PDF" no dropdown "Mais → Dados"
- toast.success/error após execução
- Não bloqueia UI (async)

## Chunks

- `html2canvas.esm`: 350 kB (gzip 64 kB) — lazy loaded
- `jspdf.es.min`: 598 kB (gzip 149 kB) — lazy loaded
- Ambos carregados apenas quando o usuário clica "Exportar PDF"

## Build

- ✅ `npm run build` — verde (9.34s)
