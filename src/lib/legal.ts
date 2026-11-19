import "server-only";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// Legal documents live as Markdown in pravni/dokumenty/ (the source of truth, see pravni/README.md).
// Every published version is also copied to pravni/dokumenty/archiv/<slug>/<version>.md, so the wording
// that applied to a given purchase stays reachable at /archiv/<slug>/<version>.

export const LEGAL_DOCS = {
  "obchodni-podminky": { title: "Obchodní podmínky", href: "/obchodni-podminky" },
  "ochrana-osobnich-udaju": { title: "Ochrana osobních údajů", href: "/ochrana-osobnich-udaju" },
  cookies: { title: "Cookies", href: "/cookies" },
  odstoupeni: { title: "Odstoupení od smlouvy", href: "/odstoupeni" },
} as const;

export type LegalSlug = keyof typeof LEGAL_DOCS;

/** Version of the terms a user accepts at sign-up – keep in sync with pravni/dokumenty/obchodni-podminky.md. */
export const TERMS_VERSION = "1.0";

const ROOT = path.join(process.cwd(), "pravni", "dokumenty");

export interface LegalDoc {
  title: string;
  /** "Verze 1.0 · účinné od …" line */
  meta: string;
  version: string;
  body: string;
}

function parse(md: string): LegalDoc {
  const lines = md.replace(/\r/g, "").split("\n");
  const title = (lines.find((l) => l.startsWith("# ")) ?? "# ").slice(2).trim();
  const meta = lines.find((l) => /^Verze \d/.test(l))?.trim() ?? "";
  const version = /^Verze ([\d.]+)/.exec(meta)?.[1] ?? "";
  const body = lines
    .filter((l) => !l.startsWith("# ") && l.trim() !== meta)
    .join("\n")
    .trim();
  return { title, meta, version, body };
}

export const isLegalSlug = (s: string): s is LegalSlug => s in LEGAL_DOCS;

export function readLegal(slug: LegalSlug, version?: string): LegalDoc | null {
  const file = version ? path.join(ROOT, "archiv", slug, `${version}.md`) : path.join(ROOT, `${slug}.md`);
  if (!existsSync(file)) return null;
  return parse(readFileSync(file, "utf8"));
}

/** Every archived version, newest first, per document. */
export function legalArchive(): { slug: LegalSlug; title: string; versions: { version: string; meta: string }[] }[] {
  return (Object.keys(LEGAL_DOCS) as LegalSlug[]).map((slug) => {
    const dir = path.join(ROOT, "archiv", slug);
    const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md")) : [];
    const versions = files
      .map((f) => {
        const version = f.replace(/\.md$/, "");
        return { version, meta: readLegal(slug, version)?.meta ?? version };
      })
      .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
    return { slug, title: LEGAL_DOCS[slug].title, versions };
  });
}

/** Section headings (## …) for the table of contents, with the ids LegalMarkdown gives them. */
export function legalToc(body: string) {
  return body
    .split("\n")
    .filter((l) => l.startsWith("## "))
    .map((l) => headingParts(l.slice(3)));
}

/** "1. Kdo jsme {#x}" → id "x" or "clanek-1" or a slug of the text. */
export function headingParts(raw: string) {
  const explicit = /\s*\{#([\w-]+)\}\s*$/.exec(raw);
  const text = raw.replace(/\s*\{#[\w-]+\}\s*$/, "").trim();
  const num = /^(\d+)\./.exec(text)?.[1];
  const id =
    explicit?.[1] ??
    (num
      ? `clanek-${num}`
      : text
          .normalize("NFKD")
          .replace(/[̀-ͯ]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, ""));
  return { id, text };
}
