"""Crop a region of a PDF page to a PNG figure.
usage: python crop.py <pdf> <page> <x0> <y0> <x1> <y1> <out.png> [dpi=200]
Coordinates are PDF points (origin top-left). Tip: use blocks.py to find text/drawing positions."""
import sys, fitz
pdf, page, x0, y0, x1, y1, out = sys.argv[1:8]
dpi = int(sys.argv[8]) if len(sys.argv) > 8 else 200
d = fitz.open(pdf)
pg = d[int(page) - 1]
clip = fitz.Rect(float(x0), float(y0), float(x1), float(y1))
pg.get_pixmap(dpi=dpi, clip=clip).save(out)
print("saved", out, clip)
