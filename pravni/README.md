# Právní dokumenty

`dokumenty/*.md` jsou zdroj pravdy. Aplikace je čte a zobrazuje na `/obchodni-podminky`, `/ochrana-osobnich-udaju`,
`/cookies` a `/odstoupeni` (`src/lib/legal.ts`, `src/components/LegalPage.tsx`).

Nová verze dokumentu:
1. Uprav `dokumenty/<slug>.md`, zvyš „Verze X.Y“ a datum účinnosti.
2. Zkopíruj ho do `dokumenty/archiv/<slug>/<X.Y>.md` (staré verze nemaž – dokládají, co platilo pro starší smlouvy).
3. U obchodních podmínek zvyš i `TERMS_VERSION` v `src/lib/legal.ts`.
4. Podstatnou změnu obchodních podmínek oznam uživatelům e-mailem nejméně 30 dní předem (čl. 13).
