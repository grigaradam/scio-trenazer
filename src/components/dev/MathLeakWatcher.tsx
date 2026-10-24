"use client";

import { useEffect } from "react";

// Development guard: flags TeX that reached the page as plain text (a field rendered without RichText).
const LEAK = /(?<!\\)\$[^$\s][^$]*\$|\\(?:[dt]?frac|sqrt|cdot|times|mid|text|left|right|le|ge|neq|alpha|beta|pi|infty|circ)(?![a-zA-Z])|\^\{|_\{/;
const SKIP = "script, style, code, pre, textarea, input, .katex, [data-math-leak-ok]";

export function MathLeakWatcher() {
  useEffect(() => {
    const seen = new WeakSet<Text>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const scan = () => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
        const el = n.parentElement;
        if (seen.has(n) || !el || el.closest(SKIP) || !LEAK.test(n.data)) continue;
        seen.add(n);
        el.style.outline = "2px dashed #e11d48";
        console.error(`[math] Nevykreslená matematika: «${n.data.trim().slice(0, 120)}»`, el);
      }
    };
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(scan, 300);
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    scan();
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, []);
  return null;
}
