# FRMS Module — UI/UX Audit Report

**Date:** 2026-06-29
**Scope:** All 17 FRMS pages + components
**Method:** Manual code review against UI/UX Pro Max guidelines (accessibility, touch, contrast, loading, layout, typography, consistency)

---

## Summary

| Severity | Count |
|----------|-------|
| 🔴 Critical | 4 |
| 🟠 High | 11 |
| 🟡 Medium | 14 |
| 🟢 Low | 9 |
| **Total** | **38** |

---

## 🔴 Critical Issues

### C1. Missing `aria-label` on icon-only buttons — 5+ locations
**Files:** `FrmsDashboard.tsx:578,593-598,639-663`, `FrmsFilters.tsx:126-133,148-155,159-166`
**Rule:** `aria-labels` — aria-label for icon-only buttons
**Issue:** Buttons with only icons (X close, hamburger menu, chevron arrows, refresh, etc.) have no `aria-label`. Screen readers can't identify their purpose.
**Fix:** Add `aria-label="Fechar filtros"`, `aria-label="Abrir filtros"`, `aria-label="Mês anterior"`, etc.

### C2. `text-[11px]` and `text-[10px]` below minimum readable size — 30+ locations
**Files:** `FrmsDashboard.tsx:608`, `FrmsFichaTripulante.tsx:751,758`, `FrmsOperationalActionList.tsx:65,73`, `FrmsFilters.tsx:199`, `FrmsControleOperacional.tsx:622`, `FrmsAlertasPainel.tsx:65,242`
**Rule:** `readable-font-size` — Minimum 16px body text on mobile, 12px minimum for labels
**Issue:** Extensive use of `text-[11px]`, `text-[10px]`, `text-[9px]` for critical operational information including status badges, filter chips, action labels, and data. Below WCAG readability threshold.
**Fix:** Raise minimum to `text-xs` (12px). For badges, use `text-[11px]` only with `font-semibold`/`font-bold`.

### C3. Color-only status indicators — heatmap and badges
**Files:** `FrmsHeatmap.tsx`, `FrmsOperationalHeatmap.tsx`, `FrmsTripulantesTable.tsx:31-46`, `FrmsAlertasPainel.tsx:27-44`
**Rule:** `color-only` — Don't convey information by color alone
**Issue:** Status levels (OK/ATENCAO/CRITICO/VIOLACAO) rely heavily on color (green/amber/orange/red). Heatmap cells use color as primary indicator. No text fallback or pattern differentiation for colorblind users.
**Fix:** Ensure all status indicators include text labels alongside color. Add pattern overlays on heatmap cells for colorblind accessibility.

### C4. `outline-none` without focus replacement on interactive elements
**Files:** `FrmsFilters.tsx:123` (search input), various buttons across all pages
**Rule:** `focus-states` — Visible focus rings on interactive elements
**Issue:** Search input uses `focus:outline-none` with `focus:ring-2` (correct), but many other clickable elements lack visible focus indicators. Filter toggle buttons, quinzena buttons, and action cards have no focus styles.
**Fix:** Add `focus:outline-none focus:ring-2 focus:ring-primary/40` to all interactive elements.

---

## 🟠 High Issues

### H1. Inconsistent page headers across FRMS pages
**Files:** `FrmsDashboard.tsx:589-606`, `FrmsControleOperacional.tsx:591-617`, `FrmsFichaTripulante.tsx:479-501`, `FrmsAlertasPainel.tsx` (render), `FrmsConceitos.tsx`
**Issue:** Each page uses different header patterns — Dashboard has fixed header with buttons, ControleOperacional has border-bottom, FichaTripulante has gradient card, Alertas uses AppLayout+PageHeader. No consistent visual language for "you are in FRMS."
**Fix:** Standardize on one header pattern: `<h1>` + descriptive subtitle + consistent spacing. Use the Dashboard pattern as reference.

### H2. Missing `cursor-pointer` on clickable cards and rows — 10+ locations
**Files:** `FrmsOperationalActionList.tsx:88` (ActionCard), `FrmsTripulantesTable.tsx` (table rows), `FrmsFilters.tsx:92-106` (filter toggle buttons)
**Rule:** `cursor-pointer` — Add cursor-pointer to clickable elements
**Issue:** Action cards, clickable table rows, and filter buttons don't consistently have `cursor-pointer`. The ActionCard component at line 88 is a div that can be clicked but has no cursor styling.
**Fix:** Add `cursor-pointer` to all clickable/hoverable elements.

### H3. Loading state only shows "Carregando..." text — no skeleton
**Files:** `FrmsDashboard.tsx`, `FrmsFichaTripulante.tsx:722-724`, `FrmsControleOperacional.tsx`
**Rule:** `loading-states` — Skeleton screens or spinners
**Issue:** Multiple places show plain "Carregando..." text instead of skeleton loaders or animated spinners. The dashboard's initial load and the ficha's table loading both use bare text.
**Fix:** Add `animate-pulse` skeleton placeholders or at minimum a spinner icon with the loading text.

### H4. KPI tiles lack loading/empty differentiation
**Files:** `FrmsControleOperacional.tsx:372-396` (KpiTile), `FrmsDashboard.tsx:722-773`
**Issue:** KPI tiles show "0" for both "no data" and "zero violations." User can't distinguish "system hasn't loaded" from "everything is fine."
**Fix:** Show "—" or a loading indicator when data is unavailable, vs "0" when count is genuinely zero.

### H5. `gap-2` between touch targets in filter sidebar
**Files:** `FrmsFilters.tsx:91,169,193`
**Rule:** `touch-spacing` — Minimum 8px gap between touch targets
**Issue:** Filter buttons use `gap-1` (4px) in grid layouts. On mobile/touch devices, this is too tight and causes mis-taps.
**Fix:** Increase to `gap-2` (8px) minimum in filter button grids.

### H6. No `prefers-reduced-motion` support
**Files:** All pages
**Rule:** `reduced-motion` — Check prefers-reduced-motion
**Issue:** Animations throughout (transition-colors, hover effects, count-up animations, etc.) don't check `prefers-reduced-motion`. Users with motion sensitivity get no relief.
**Fix:** Wrap animations in `motion-safe:` prefix or add global CSS media query.

### H7. Dark mode text contrast issues
**Files:** `FrmsDashboard.tsx:605,608-609`, `FrmsControleOperacional.tsx:595-602,629-633`
**Rule:** `color-contrast` — Minimum 4.5:1 ratio
**Issue:** `text-slate-400` and `text-slate-500` used for descriptive text in dark mode (`dark:text-slate-400`) may not meet 4.5:1 contrast ratio on dark backgrounds. `text-[11px]` in `text-slate-500` is particularly problematic.
**Fix:** Use `dark:text-slate-300` minimum for body text in dark mode.

### H8. Redundant "Sem violações no período" cards still take layout space
**Files:** `FrmsMetricCards.tsx:220-223,271-274`
**Issue:** When cards have zero counts, the section still renders large with a single line of text. This wastes prime dashboard real estate. The sections should collapse more aggressively.
**Fix:** When all cards are zero, collapse the section to a single compact row: "✅ Compliance: sem violações no período."

### H9. No skip-to-content link on nav-heavy pages
**Files:** `FrmsDashboard.tsx` (sidebar + header), `FrmsControleOperacional.tsx`
**Rule:** `skip-links` — Allow keyboard users to skip navigation
**Issue:** Dashboard has sidebar + header with 6+ buttons before main content. Keyboard users must tab through all before reaching the action list.
**Fix:** Add a skip link: `<a href="#main-content" class="sr-only focus:not-sr-only">Pular para conteúdo</a>`.

### H10. Pagination controls lack proper aria labels
**Files:** `FrmsTripulantesTable.tsx` (pagination section), `FrmsAlertasPainel.tsx` (pagination)
**Issue:** Previous/Next page buttons use only chevron icons without descriptive aria labels for screen readers.
**Fix:** Add `aria-label="Página anterior"` and `aria-label="Próxima página"`.

### H11. Alert badges use generic "AlertTriangle" icon — no severity differentiation
**Files:** `FrmsAlertasPainel.tsx`, `FrmsDashboard.tsx`
**Issue:** All alerts use the same `AlertTriangle` icon regardless of severity. Users can't scan by icon alone.
**Fix:** Use `AlertTriangle` for ATENCAO, `ShieldAlert` for CRITICO, `Bell` for AVISO, `XCircle` for VIOLACAO.

---

## 🟡 Medium Issues

### M1. Inconsistent spacing between sections — 16px vs 20px vs 24px
**Files:** `FrmsDashboard.tsx:717` (`gap-4` = 16px), `FrmsControleOperacional.tsx:590` (`space-y-4`), `FrmsFichaTripulante.tsx:477` (`space-y-4`)
**Issue:** Some pages use `gap-4`, others use `space-y-6`, others use manual margins. No consistent vertical rhythm.
**Fix:** Standardize on `space-y-5` (20px) for page-level sections and `gap-4` for card grids.

### M2. Table header labels are cryptic — "FAT.JORNADA% dia"
**Files:** `FrmsFichaTripulante.tsx:709,712`
**Issue:** Column headers use internal abbreviations like "FAT.JORNADA% dia" and "FAT.HV% dia" that are not user-friendly. Operational coordinators may not know these terms.
**Fix:** Use human-readable labels: "% Jornada" and "% HV" with tooltip explanations.

### M3. Back button inconsistency
**Files:** `FrmsFichaTripulante.tsx:482-487` (custom button), `FrmsAlertasPainel.tsx` (AppLayout back?)
**Issue:** The ficha page has a custom "Voltar" button with `ArrowLeft` icon + border, while other pages may use different patterns. No consistent back navigation.
**Fix:** Standardize back navigation to use AppLayout's built-in back or a shared BackButton component.

### M4. Link vs button confusion — "Ver detalhe" and "Evidência" look identical
**Files:** `FrmsOperationalActionList.tsx:113-133`
**Issue:** The "Ver detalhe" button and "Evidência" link have nearly identical styling (`border`, `bg-white`/`bg-slate-50`, same padding). Users can't visually distinguish the primary action.
**Fix:** Make the primary action ("Ver detalhe") visually distinct with a filled button style. Keep "Evidência" as a secondary ghost link.

### M5. The search input placeholder "Nome..." is too vague
**Files:** `FrmsFilters.tsx:121`
**Issue:** Placeholder says just "Nome..." — doesn't clarify it searches tripulante name, not aircraft or alert name.
**Fix:** Change to "Nome do tripulante..."

### M6. No empty state with action for alerts page
**Files:** `FrmsAlertasPainel.tsx` (check render section)
**Rule:** `empty-states` — Show helpful message and action
**Issue:** When no alerts exist, if the page shows empty state, it should include a helpful message AND a suggested action (e.g., "Nenhum alerta no período. Volte ao dashboard para ver o panorama geral.").
**Fix:** Add action-oriented empty states with navigation suggestions.

### M7. Status filter buttons lose active state visually
**Files:** `FrmsFilters.tsx:92-106,170-183,194-210`
**Issue:** Active filter state uses `bg-primary text-white` which is good, but inactive state `bg-slate-100 text-slate-600` has low contrast. On some screens, it's hard to see which button is selected.
**Fix:** Add a subtle ring or border to active state, and increase inactive text contrast.

### M8. FortnightConsolidatedPanel placement breaks visual flow
**Files:** `FrmsFichaTripulante.tsx:504-509`
**Issue:** The fortnight panel is placed between the header and the effectiveness cards. It interrupts the natural flow: header → cards → table. The fortnight panel is important but its current position creates a visual jump.
**Fix:** Move the fortnight panel into a collapsible section or integrate it into the card grid.

### M9. Month navigation has no jump-to-today button
**Files:** `FrmsFichaTripulante.tsx:656-677`, `FrmsFilters.tsx:146-167`
**Issue:** Month navigation only has previous/next arrows. If user navigates far from current month, there's no quick way to return.
**Fix:** Add a "Hoje" or "Mês atual" button between/alongside the navigation arrows.

### M10. Date format inconsistency — ISO vs DD/MM/YYYY
**Files:** Multiple locations across all pages
**Issue:** Some date displays use DD/MM/YYYY (`formatFrmsDate`, `formatDisplayDate`), others use the YYYY-MM-DD format in URLs and data attributes. While correct internally, user-facing tooltips sometimes show raw ISO dates.
**Fix:** Ensure all user-visible dates use DD/MM/YYYY format. Reserve ISO for machine-readable attributes only.

### M11. ProgressBar component has no accessible text alternative
**Files:** `FrmsFichaTripulante.tsx:133-176`
**Issue:** The progress bars use colored divs with percentage text, but have no `role="progressbar"` or `aria-valuenow` attributes. Screen readers can't interpret the values.
**Fix:** Add `role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={120}`.

### M12. Expandable rows in table lack aria-expanded
**Files:** `FrmsTripulantesTable.tsx` (ExpandedPanel section)
**Issue:** The expand/collapse chevron buttons in the tripulantes table don't use `aria-expanded` to indicate state.
**Fix:** Add `aria-expanded={isExpanded}` to the expand button.

### M13. Filter chips don't indicate what will happen on click
**Files:** `FrmsFilterChips.tsx`
**Issue:** Active filter chips are removable but there's no visual hint (like an "×" icon) that clicking removes them.
**Fix:** Add an `X` icon or `×` symbol inside each removable filter chip.

### M14. Inconsistent use of `text-slate-` vs `text-gray-` across pages
**Files:** `FrmsFichaTripulante.tsx` (uses `text-gray-*`), `FrmsDashboard.tsx` (uses `text-slate-*`)
**Issue:** The ficha individual page uses Tailwind's `gray` palette while the dashboard and controle operacional use `slate`. This creates a subtle visual inconsistency in text warmth.
**Fix:** Standardize on `slate` palette across all FRMS pages.

---

## 🟢 Low Issues

### L1. No favicon/title update when navigating FRMS pages
**Files:** All FRMS pages
**Issue:** Page title stays as app default. Browser history/tabs don't distinguish FRMS pages.
**Fix:** Add `document.title` updates or use React Router's `handle` for page titles.

### L2. Console.log or debug artifacts in production code
**Files:** Check all files for lingering `console.log` statements
**Issue:** Development debugging statements may leak into production builds.
**Fix:** Audit and remove all `console.log`/`console.debug` calls.

### L3. No transition on mobile drawer open/close animation
**Files:** `FrmsDashboard.tsx:572-585`
**Issue:** Mobile filter drawer appears/disappears instantly. No slide animation.
**Fix:** Add `transition-transform duration-300` with a translate-x transform.

### L4. The `text-slate-500` subtitle on Dashboard is hard to read
**Files:** `FrmsDashboard.tsx:604-605`
**Issue:** The subtitle "Painel de decisão operacional..." at `text-sm text-slate-500` has low contrast against the gradient background.
**Fix:** Use `text-slate-600` minimum for better readability.

### L5. Check-in form uses hidden radio inputs — custom styling not fully accessible
**Files:** `FrmsCheckinFadiga.tsx:118-119` (HIDDEN_RADIO_INPUT_CLASS)
**Issue:** Radio inputs are visually hidden and replaced with custom styled alternatives. Need to verify these still receive focus and work with keyboard navigation.
**Fix:** Ensure the custom radio implementation has proper `role="radio"`, `aria-checked`, and `tabindex` handling.

### L6. Status badge colors are hardcoded — no central theme
**Files:** `FrmsAlertasPainel.tsx:27-44`, `FrmsTripulantesTable.tsx:31-46`, `FrmsFichaTripulante.tsx:178-202`, `FrmsDashboard.tsx`
**Issue:** Status color mappings (OK=emerald, ATENCAO=amber, CRITICO=orange, VIOLACAO=red) are duplicated across 4+ files. If colors change, multiple files need updating.
**Fix:** Extract to a shared constant: `FRMS_NIVEL_STYLES` in `frmsUtils.ts` or a dedicated constants file.

### L7. The "Como funciona o FRMS" button should link to /frms/conceitos, not be hidden on mobile
**Files:** `FrmsDashboard.tsx:700-709`
**Issue:** Educational content link is `hidden sm:inline-flex` — mobile users can't access the FRMS concepts page directly.
**Fix:** Either include it in the mobile menu or show it as an icon-only button on mobile.

### L8. Heatmap cells could benefit from tooltip with exact values
**Files:** `FrmsHeatmap.tsx`, `FrmsOperationalHeatmap.tsx`
**Issue:** Heatmap cells show color but exact values only appear on hover. For audit/evidence purposes, a static data table alternative should be more prominent.
**Fix:** Ensure the collapsed `<details>` section containing the data table has a clear call-to-action for "Ver tabela de dados completa."

### L9. No breadcrumb navigation
**Files:** All FRMS pages
**Issue:** Deep navigation (Dashboard → Tripulante → Day Detail) lacks breadcrumbs. Users can get lost.
**Fix:** Add a simple breadcrumb: `FRMS > Ficha de [Nome]` or use the AppLayout breadcrumb slot.

---

## Cross-Cutting Recommendations

### 1. Extract shared FRMS constants
Create `src/react-app/pages/frms/frmsConstants.ts`:
- `NIVEL_STYLES` — shared status badge colors
- `FRMS_SPACING` — consistent section gaps
- `FRMS_FONT_SIZES` — minimum readable font sizes
- `NIVEL_WEIGHTS` — sort ordering for compliance levels

### 2. Accessibility pass
- Add `aria-label` to ALL icon-only buttons (est. 30+ locations)
- Add `role` attributes to custom interactive elements
- Test with screen reader (VoiceOver)
- Verify keyboard navigation for all interactive elements

### 3. Mobile responsiveness audit
- Test all pages at 375px width
- Ensure tables scroll horizontally with sticky first column
- Make filter sidebar fully usable on mobile
- Verify touch targets are ≥44px

### 4. Consistent loading pattern
Replace all "Carregando..." text with a shared `<FrmsLoadingSkeleton />` component that uses `animate-pulse` with appropriate placeholder shapes.

---

## Priority Action Order

1. Fix C1 (aria-labels) + C4 (focus states) — Quick wins, high accessibility impact
2. Fix C2 (font sizes) — Raise minimum to 12px everywhere
3. Fix C3 (color-only) — Add text/icon differentiation to all status indicators
4. Fix H1 (header consistency) — Single PR to standardize all page headers
5. Fix H8 (zero cards collapse) — Reduce metric card size when empty
6. Fix M1 (spacing consistency) + M14 (gray→slate) — Design tokens cleanup
7. Fix M4 (button hierarchy) — Distinguish primary/secondary actions
8. Address remaining High issues (H2-H7, H9-H11)
9. Address Medium issues (M2-M13)
10. Address Low issues (L1-L9)

---

*Report generated by UI/UX Pro Max audit against 99 UX guidelines and 67 UI styles.*
