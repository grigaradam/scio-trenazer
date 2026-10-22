"""Render PDF pages to PNG for visual inspection.
usage: python render.py <pdf> <out_prefix> <pages e.g. 12,13 or 12-18> [dpi=110]
Prints page size in PDF points (needed for crop.py coordinates)."""
import sys, fitz
pdf, out, spec = sys.argv[1], sys.argv[2], sys.argv[3]
dpi = int(sys.argv[4]) if len(sys.argv) > 4 else 110
pages = []
for part in spec.split(','):
    if '-' in part:
        a, b = part.split('-'); pages += list(range(int(a), int(b) + 1))
    else:
        pages.append(int(part))
d = fitz.open(pdf)
for p in pages:
    page = d[p - 1]
    page.get_pixmap(dpi=dpi).save(f"{out}_p{p}.png")
    print(f"page {p}: {page.rect.width:.0f}x{page.rect.height:.0f} pt -> {out}_p{p}.png (scale {dpi/72:.3f} px/pt)")
