"""List text blocks and drawing/image clusters with coordinates (PDF points) for a page.
usage: python blocks.py <pdf> <page>"""
import sys, fitz
d = fitz.open(sys.argv[1]); pg = d[int(sys.argv[2]) - 1]
print(f"page size {pg.rect.width:.0f}x{pg.rect.height:.0f}")
for b in pg.get_text("blocks"):
    x0, y0, x1, y1, txt = b[:5]
    print(f"TEXT [{x0:.0f},{y0:.0f},{x1:.0f},{y1:.0f}] {txt.strip()[:70]!r}")
rects = [dr["rect"] for dr in pg.get_drawings()]
# merge overlapping/nearby drawing rects into clusters
clusters = []
for r in rects:
    r = fitz.Rect(r)
    merged = False
    for i, c in enumerate(clusters):
        if (c + (-6, -6, 6, 6)).intersects(r):
            clusters[i] = c | r; merged = True; break
    if not merged:
        clusters.append(r)
changed = True
while changed:
    changed = False
    for i in range(len(clusters)):
        for j in range(i + 1, len(clusters)):
            if (clusters[i] + (-6, -6, 6, 6)).intersects(clusters[j]):
                clusters[i] |= clusters[j]; clusters.pop(j); changed = True; break
        if changed: break
for c in clusters:
    if c.width > 30 and c.height > 30:
        print(f"DRAWING [{c.x0:.0f},{c.y0:.0f},{c.x1:.0f},{c.y1:.0f}]")
for img in pg.get_image_info():
    x0, y0, x1, y1 = img["bbox"]
    print(f"IMAGE [{x0:.0f},{y0:.0f},{x1:.0f},{y1:.0f}]")
