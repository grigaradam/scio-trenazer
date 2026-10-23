// Quotes from the task text inside AI explanations: [[verbatim quote]] is rendered as a link (<cite>)
// and the quoted words are underlined right in the passage/stem (elements marked data-quote-source,
// within the nearest data-task-scope). Uses the CSS Custom Highlight API, so the source DOM is untouched.

export const QUOTE_RE = /\[\[([^\]\n]+?)\]\]/g;

export function quotesIn(text: string) {
  return [...text.matchAll(QUOTE_RE)].map((m) => m[1]);
}

const QUOTE_CHARS = /[„“”"‚‘’'«»]/g;
const norm = (c: string) => (/\s/.test(c) ? " " : c.replace(QUOTE_CHARS, '"').toLowerCase());

/** Text of a source element with a map from each normalized char back to its DOM position. */
function flatten(root: Element) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    // KaTeX keeps a hidden MathML copy of every formula – skip it so formulas count once
    acceptNode: (n) => (n.parentElement?.closest(".katex-mathml") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  let text = "";
  const map: { node: Text; offset: number }[] = [];
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const v = node.data.normalize("NFC");
    for (let i = 0; i < v.length; i++) {
      const c = norm(v[i]);
      if (c === " " && (text === "" || text.endsWith(" "))) continue;
      text += c;
      map.push({ node, offset: i });
    }
    if (!text.endsWith(" ")) {
      // block boundaries (paragraphs, cells) count as a space
      text += " ";
      map.push({ node, offset: v.length });
    }
  }
  return { text, map };
}

const clean = (q: string) =>
  [...q.normalize("NFC")].map(norm).join("").replace(/ +/g, " ").trim().replace(/^[\s".,;:–-]+|[\s".,;:–-]+$/g, "");

/** Finds the quote in the scope's source text; "…" inside a quote skips over the omitted part. */
export function findQuote(scope: ParentNode, quote: string): Range | null {
  const parts = clean(quote)
    .split(/\s*(?:…|\.\.\.)\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  for (const el of scope.querySelectorAll("[data-quote-source]")) {
    const { text, map } = flatten(el);
    let start = text.indexOf(parts[0]);
    // AI sometimes changes a word or two at the end – fall back to the opening of the quote
    if (start < 0 && parts[0].length > 40) start = text.indexOf(parts[0].slice(0, 40));
    if (start < 0) continue;
    let end = start + parts[0].length;
    if (text.indexOf(parts[0], start) !== start) end = start + 40;
    for (const p of parts.slice(1)) {
      const i = text.indexOf(p, end);
      if (i < 0) break;
      end = i + p.length;
    }
    end = Math.min(end, map.length) - 1;
    const range = document.createRange();
    range.setStart(map[start].node, map[start].offset);
    range.setEnd(map[end].node, Math.min(map[end].offset + 1, map[end].node.length));
    return range;
  }
  return null;
}

const supported = () => typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight !== "undefined";

// Several explanations can be on one page (a whole test review), so all their ranges share one highlight.
const underlined = new Map<string, Range[]>();

export function setUnderlined(owner: string, ranges: Range[]) {
  if (!supported()) return;
  if (ranges.length) underlined.set(owner, ranges);
  else underlined.delete(owner);
  CSS.highlights.set("scio-quote", new Highlight(...[...underlined.values()].flat()));
}

export function setActiveQuote(range: Range | null) {
  if (!supported()) return;
  if (range) CSS.highlights.set("scio-quote-active", new Highlight(range));
  else CSS.highlights.delete("scio-quote-active");
}

/** Nearest ancestor that scrolls on its own (e.g. the test review sheet), or null for the page. */
function scrollParent(el: Element | null): HTMLElement | null {
  for (let n = el?.parentElement; n && n !== document.body; n = n.parentElement) {
    const { overflowY } = getComputedStyle(n);
    if ((overflowY === "auto" || overflowY === "scroll") && n.scrollHeight > n.clientHeight) return n;
  }
  return null;
}

/** Scrolls the quoted place into view (unless it is already comfortably visible). */
export function scrollToRange(range: Range) {
  const r = range.getBoundingClientRect();
  const start = range.startContainer;
  const box = scrollParent(start instanceof Element ? start : start.parentElement);
  // visible area of the scroller; the margins keep clear of sticky headers and bottom action bars
  const top = box ? box.getBoundingClientRect().top : 0;
  const height = box ? box.clientHeight : window.innerHeight;
  if (r.top - top > 80 && r.bottom - top < height - 160) return;
  const delta = r.top - top - height / 3;
  if (box) box.scrollBy({ top: delta, behavior: "smooth" });
  else window.scrollBy({ top: delta, behavior: "smooth" });
}
